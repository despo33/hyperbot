/**
 * Module de récupération des prix en temps réel
 * Gère le cache et les mises à jour des données de marché
 */

import api from '../services/hyperliquidApi.js';

/**
 * Classe de gestion des prix et données de marché
 */
class PriceFetcher {
    constructor() {
        // Cache des prix
        this.priceCache = new Map();
        this.candleCache = new Map();
        
        // Configuration
        this.config = {
            priceCacheDuration: 5000,     // 5 secondes
            candleCacheDuration: 60000,   // 1 minute
            defaultSymbol: 'BTC',
            supportedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d']
        };

        // Callbacks pour les mises à jour
        this.priceCallbacks = [];
        
        // Intervalle de mise à jour
        this.updateInterval = null;
    }

    /**
     * Démarre la mise à jour automatique des prix
     * @param {string} symbol 
     * @param {number} intervalMs 
     */
    startAutoUpdate(symbol, intervalMs = 5000) {
        if (this.updateInterval) {
            this.stopAutoUpdate();
        }

        console.log(`[PRICE] Démarrage mise à jour automatique pour ${symbol} (${intervalMs}ms)`);
        
        // Mise à jour immédiate
        this.updatePrice(symbol);

        this.updateInterval = setInterval(() => {
            this.updatePrice(symbol);
        }, intervalMs);
    }

    /**
     * Arrête la mise à jour automatique
     */
    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[PRICE] Mise à jour automatique arrêtée');
        }
    }

    /**
     * Met à jour le prix et notifie les callbacks
     * @param {string} symbol 
     */
    async updatePrice(symbol) {
        try {
            const price = await this.getPrice(symbol, true);
            
            // Notifie les callbacks
            this.priceCallbacks.forEach(callback => {
                try {
                    callback(symbol, price);
                } catch (e) {
                    console.error('[PRICE] Erreur callback:', e.message);
                }
            });
        } catch (error) {
            console.error(`[PRICE] Erreur mise à jour ${symbol}:`, error.message);
        }
    }

    /**
     * Enregistre un callback pour les mises à jour de prix
     * @param {Function} callback 
     * @returns {Function} Fonction pour désinscrire le callback
     */
    onPriceUpdate(callback) {
        this.priceCallbacks.push(callback);
        return () => {
            const index = this.priceCallbacks.indexOf(callback);
            if (index > -1) {
                this.priceCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * Récupère le prix actuel d'un symbole
     * @param {string} symbol 
     * @param {boolean} forceRefresh 
     * @returns {Promise<number>}
     */
    async getPrice(symbol, forceRefresh = false) {
        const cacheKey = symbol;
        const cached = this.priceCache.get(cacheKey);

        // Retourne le cache si valide
        if (!forceRefresh && cached && Date.now() - cached.timestamp < this.config.priceCacheDuration) {
            return cached.price;
        }

        try {
            const price = await api.getPrice(symbol);
            
            // Met en cache
            this.priceCache.set(cacheKey, {
                price,
                timestamp: Date.now()
            });

            return price;
        } catch (error) {
            // Si erreur mais cache disponible, retourne le cache
            if (cached) {
                console.warn(`[PRICE] Utilisation du cache pour ${symbol} (erreur: ${error.message})`);
                return cached.price;
            }
            throw error;
        }
    }

    /**
     * Récupère tous les prix mid
     * @returns {Promise<Object>}
     */
    async getAllPrices() {
        try {
            return await api.getAllMids();
        } catch (error) {
            console.error('[PRICE] Erreur getAllPrices:', error.message);
            throw error;
        }
    }

    /**
     * Récupère les candles (données OHLCV)
     * @param {string} symbol 
     * @param {string} timeframe - '1m', '5m', '15m', '1h', '4h', '1d'
     * @param {number} limit - Nombre de candles à récupérer
     * @param {boolean} forceRefresh 
     * @returns {Promise<Array>}
     */
    async getCandles(symbol, timeframe = '1h', limit = 100, forceRefresh = false) {
        // L'API Hyperliquid attend juste le symbole (BTC, ETH, etc.) sans -PERP
        const cleanSymbol = symbol.replace('-PERP', '');
        const cacheKey = `${cleanSymbol}_${timeframe}`;
        const cached = this.candleCache.get(cacheKey);

        // Retourne le cache si valide et suffisant
        if (!forceRefresh && cached && 
            Date.now() - cached.timestamp < this.config.candleCacheDuration &&
            cached.candles.length >= limit) {
            return cached.candles.slice(-limit);
        }

        try {
            // Calcul de la période
            const intervalMs = this.timeframeToMs(timeframe);
            const endTime = Date.now();
            const startTime = endTime - (intervalMs * (limit + 10)); // +10 pour la marge

            const candles = await api.getCandles(cleanSymbol, timeframe, startTime, endTime);

            // Met en cache
            this.candleCache.set(cacheKey, {
                candles,
                timestamp: Date.now()
            });

            return candles.slice(-limit);
        } catch (error) {
            console.error(`[PRICE] Erreur getCandles ${cleanSymbol} ${timeframe}:`, error.message);
            
            // Retourne le cache si disponible
            if (cached) {
                return cached.candles.slice(-limit);
            }
            throw error;
        }
    }

    /**
     * Convertit un timeframe en millisecondes
     * @param {string} timeframe 
     * @returns {number}
     */
    timeframeToMs(timeframe) {
        const multipliers = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        };
        return multipliers[timeframe] || multipliers['1h'];
    }

    /**
     * Récupère les données pour plusieurs timeframes
     * @param {string} symbol 
     * @param {Array<string>} timeframes 
     * @param {number} limit 
     * @returns {Promise<Object>}
     */
    async getMultiTimeframeData(symbol, timeframes = ['1h', '4h'], limit = 100) {
        const results = {};
        
        await Promise.all(
            timeframes.map(async (tf) => {
                try {
                    results[tf] = await this.getCandles(symbol, tf, limit);
                } catch (error) {
                    console.error(`[PRICE] Erreur ${tf}:`, error.message);
                    results[tf] = null;
                }
            })
        );

        return results;
    }

    /**
     * Récupère les dernières statistiques de prix
     * @param {string} symbol 
     * @returns {Promise<Object>}
     */
    async getPriceStats(symbol) {
        try {
            const candles = await this.getCandles(symbol, '1d', 30);
            const current = await this.getPrice(symbol);

            if (candles.length === 0) {
                return { current, change24h: 0, high24h: current, low24h: current };
            }

            const today = candles[candles.length - 1];
            const yesterday = candles[candles.length - 2];

            // Calcul des stats 24h
            const change24h = yesterday 
                ? ((current - yesterday.close) / yesterday.close) * 100 
                : 0;

            // High/Low sur 24h
            const last24h = candles.slice(-2);
            const high24h = Math.max(...last24h.map(c => c.high), current);
            const low24h = Math.min(...last24h.map(c => c.low), current);

            // Volatilité (écart-type des rendements journaliers)
            const returns = [];
            for (let i = 1; i < candles.length; i++) {
                returns.push((candles[i].close - candles[i-1].close) / candles[i-1].close);
            }
            const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
            const volatility = Math.sqrt(variance) * 100;

            return {
                current,
                change24h: change24h.toFixed(2),
                high24h,
                low24h,
                volatility: volatility.toFixed(2),
                volume24h: today?.volume || 0
            };
        } catch (error) {
            console.error('[PRICE] Erreur getPriceStats:', error.message);
            throw error;
        }
    }

    /**
     * Vide le cache
     */
    clearCache() {
        this.priceCache.clear();
        this.candleCache.clear();
        console.log('[PRICE] Cache vidé');
    }

    /**
     * Retourne l'état du cache
     * @returns {Object}
     */
    getCacheStatus() {
        return {
            prices: this.priceCache.size,
            candles: this.candleCache.size,
            autoUpdateActive: this.updateInterval !== null
        };
    }
}

// Export singleton
const priceFetcher = new PriceFetcher();
export default priceFetcher;
