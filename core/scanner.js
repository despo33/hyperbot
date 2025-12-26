/**
 * Scanner Multi-Crypto
 * Analyse plusieurs paires simultanément et identifie les meilleures opportunités
 */

import priceFetcher from './priceFetcher.js';
import signalDetector from './signalDetector.js';
import smcSignalDetector from './smcSignalDetector.js';
import ichimoku from './ichimoku.js';

// Top 20 cryptos par market cap disponibles sur Hyperliquid
const TOP_CRYPTOS = [
    'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 
    'DOT', 'MATIC', 'UNI', 'ATOM', 'LTC', 'BCH', 'APT', 'ARB', 
    'OP', 'INJ', 'SUI', 'SEI'
];

/**
 * Classe Scanner pour analyse multi-crypto
 */
class CryptoScanner {
    constructor() {
        this.results = new Map();
        this.lastScanTime = null;
        this.isScanning = false;
        this.scanInterval = null;
    }

    /**
     * Analyse une seule crypto
     * @param {string} symbol 
     * @param {string} timeframe 
     * @param {Object} options - Options incluant la stratégie
     * @returns {Promise<Object>}
     */
    async analyzeSymbol(symbol, timeframe = '1h', options = {}) {
        const strategy = options.strategy || 'ichimoku';
        
        try {
            // Récupère les candles
            const candles = await priceFetcher.getCandles(symbol, timeframe, 100);
            
            if (!candles || candles.length < 60) {
                return {
                    symbol,
                    success: false,
                    error: 'Données insuffisantes'
                };
            }

            const currentPrice = candles[candles.length - 1].close;
            
            // Analyse selon la stratégie choisie
            let analysis;
            if (strategy === 'smc') {
                analysis = this.analyzeSMC(candles, timeframe);
            } else if (strategy === 'bollinger') {
                analysis = this.analyzeBollinger(candles, timeframe);
            } else {
                // Ichimoku par défaut
                analysis = signalDetector.analyze(candles);
            }
            
            // Calcul du changement 24h
            const change24h = candles.length >= 24 
                ? ((currentPrice - candles[candles.length - 24].close) / candles[candles.length - 24].close) * 100
                : 0;

            // Calcul de la probabilité de gain
            const score = analysis.ichimokuScore?.score || 0;
            const winProbability = this.calculateWinProbability(score, analysis.finalSignal?.confidence);

            return {
                symbol,
                success: true,
                price: currentPrice,
                change24h: change24h.toFixed(2),
                timeframe,
                timestamp: Date.now(),
                ichimoku: analysis.ichimoku,
                score: score,
                maxScore: analysis.ichimokuScore?.maxScore || 7,
                normalizedScore: analysis.ichimokuScore?.normalizedScore || 0,
                direction: analysis.ichimokuScore?.direction || 'neutral',
                signal: analysis.finalSignal,
                winProbability: winProbability,
                winProbabilityPercent: (winProbability * 100).toFixed(1) + '%',
                recommendation: analysis.recommendation,
                detectedSignals: analysis.detectedSignals || [],
                levels: analysis.levels,
                tradeable: this.isTradeable(analysis, winProbability)
            };
        } catch (error) {
            return {
                symbol,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Calcule la probabilité de gain basée sur le score Ichimoku
     * Synchronisé avec tradeEngine.calculateWinProbability
     * @param {number} score 
     * @param {string} confidence 
     * @returns {number}
     */
    calculateWinProbability(score, confidence) {
        // ===== SYNCHRONISÉ AVEC tradeEngine - OPTIMISÉ SCALPING =====
        const absScore = Math.abs(score);
        let baseProbability;
        
        if (absScore >= 7) baseProbability = 0.75;      // Score parfait 7/7
        else if (absScore >= 6) baseProbability = 0.72; // Score excellent 6/7
        else if (absScore >= 5) baseProbability = 0.68; // Score très bon 5/7
        else if (absScore >= 4) baseProbability = 0.64; // Score bon 4/7
        else if (absScore >= 3) baseProbability = 0.58; // Score moyen 3/7
        else if (absScore >= 2) baseProbability = 0.52; // Score faible mais tradeable
        else baseProbability = 0.45;                    // Score très faible
        
        // Bonus confiance (assoupli pour scalping)
        const confidenceBonus = {
            'high': 0.10,
            'medium': 0.06,
            'low': 0.02
        }[confidence] || 0.02;
        
        // Bonus score progressif
        let scoreBonus = 0;
        if (absScore >= 7) scoreBonus = 0.06;       // +6% pour 7/7
        else if (absScore >= 6) scoreBonus = 0.04; // +4% pour 6/7
        else if (absScore >= 5) scoreBonus = 0.03; // +3% pour 5/7
        else if (absScore >= 4) scoreBonus = 0.02; // +2% pour 4/7
        
        return Math.min(0.92, baseProbability + confidenceBonus + scoreBonus);
    }

    /**
     * Détermine si une crypto est tradeable
     * @param {Object} analysis 
     * @param {number} winProbability 
     * @returns {boolean}
     */
    isTradeable(analysis, winProbability = 0) {
        const score = analysis.ichimokuScore?.score || 0;
        const absScore = Math.abs(score);
        
        // Critères assouplis:
        // 1. Score >= 3 OU signal détecté
        // 2. Probabilité de gain >= 55% (seuil bas pour afficher plus d'opportunités)
        const hasStrongScore = absScore >= 3;
        const hasSignal = analysis.finalSignal?.action === 'BUY' || analysis.finalSignal?.action === 'SELL';
        const hasGoodProbability = winProbability >= 0.55;

        return (hasStrongScore || hasSignal) && hasGoodProbability;
    }

    /**
     * Analyse avec la stratégie SMC (Smart Money Concepts)
     * @param {Array} candles 
     * @param {string} timeframe 
     * @returns {Object}
     */
    analyzeSMC(candles, timeframe) {
        const smcAnalysis = smcSignalDetector.analyze(candles, {}, timeframe);
        
        // Convertit le format SMC vers le format standard du scanner
        const score = smcAnalysis.signal?.score || 0;
        const direction = smcAnalysis.signal?.direction || 'neutral';
        
        return {
            ichimokuScore: {
                score: direction === 'long' ? Math.abs(score) : -Math.abs(score),
                maxScore: 10,
                normalizedScore: score / 10,
                direction: direction === 'long' ? 'bullish' : direction === 'short' ? 'bearish' : 'neutral'
            },
            finalSignal: smcAnalysis.signal ? {
                action: direction === 'long' ? 'BUY' : direction === 'short' ? 'SELL' : null,
                confidence: smcAnalysis.signal.confidence > 0.7 ? 'high' : smcAnalysis.signal.confidence > 0.5 ? 'medium' : 'low'
            } : null,
            recommendation: {
                action: direction === 'long' ? 'BUY' : direction === 'short' ? 'SELL' : 'NEUTRAL',
                reason: smcAnalysis.signal?.reasons?.join(', ') || 'Analyse SMC'
            },
            detectedSignals: smcAnalysis.signal?.reasons || [],
            levels: null,
            strategy: 'smc'
        };
    }

    /**
     * Analyse avec la stratégie Bollinger Squeeze
     * @param {Array} candles 
     * @param {string} timeframe 
     * @returns {Object}
     */
    analyzeBollinger(candles, timeframe) {
        const bbAnalysis = signalDetector.analyzeBollingerSqueeze(candles, timeframe, {});
        
        if (!bbAnalysis || !bbAnalysis.success) {
            return {
                ichimokuScore: { score: 0, maxScore: 7, normalizedScore: 0, direction: 'neutral' },
                finalSignal: null,
                recommendation: { action: 'NEUTRAL', reason: 'Pas de signal Bollinger' },
                detectedSignals: [],
                levels: null,
                strategy: 'bollinger'
            };
        }
        
        const signal = bbAnalysis.signal;
        const score = signal?.score || 0;
        const direction = signal?.direction || 'neutral';
        
        return {
            ichimokuScore: {
                score: direction === 'bullish' ? Math.abs(score) : -Math.abs(score),
                maxScore: 7,
                normalizedScore: score / 7,
                direction: direction
            },
            finalSignal: signal ? {
                action: signal.action,
                confidence: signal.strength > 0.7 ? 'high' : signal.strength > 0.5 ? 'medium' : 'low'
            } : null,
            recommendation: {
                action: signal?.action || 'NEUTRAL',
                reason: signal?.description || 'Analyse Bollinger Squeeze'
            },
            detectedSignals: [signal?.description].filter(Boolean),
            levels: bbAnalysis.levels,
            strategy: 'bollinger',
            squeeze: bbAnalysis.squeeze,
            momentum: bbAnalysis.momentum
        };
    }

    /**
     * Scanne toutes les cryptos de la liste
     * @param {Array<string>} symbols - Liste des symboles à analyser
     * @param {string} timeframe 
     * @param {Object} options - Options incluant la stratégie
     * @returns {Promise<Array>}
     */
    async scanAll(symbols = TOP_CRYPTOS, timeframe = '1h', options = {}) {
        if (this.isScanning) {
            console.log('[SCANNER] Scan déjà en cours...');
            return Array.from(this.results.values());
        }

        const strategy = options.strategy || 'ichimoku';
        this.isScanning = true;
        console.log(`[SCANNER] Démarrage scan de ${symbols.length} cryptos (${strategy})...`);

        const results = [];
        
        // Analyse par batch de 5 pour éviter de surcharger l'API
        const batchSize = 5;
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            
            const batchResults = await Promise.all(
                batch.map(symbol => this.analyzeSymbol(symbol, timeframe, { strategy }))
            );
            
            results.push(...batchResults);
            
            // Petite pause entre les batches
            if (i + batchSize < symbols.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Stocke les résultats
        results.forEach(r => {
            if (r.success) {
                this.results.set(r.symbol, r);
            }
        });

        this.lastScanTime = Date.now();
        this.isScanning = false;

        console.log(`[SCANNER] Scan terminé. ${results.filter(r => r.success).length}/${symbols.length} analysés`);

        return results;
    }

    /**
     * Retourne les meilleures opportunités de trading
     * @param {number} limit 
     * @returns {Array}
     */
    getBestOpportunities(limit = 5) {
        const results = Array.from(this.results.values());
        
        // Filtre les cryptos avec des signaux forts
        const opportunities = results
            .filter(r => r.success && r.tradeable)
            .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
            .slice(0, limit);

        return opportunities;
    }

    /**
     * Retourne les cryptos bullish (signaux haussiers)
     * @returns {Array}
     */
    getBullishCryptos() {
        return Array.from(this.results.values())
            .filter(r => r.success && r.direction === 'bullish' && r.score >= 3)
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Retourne les cryptos bearish (signaux baissiers)
     * @returns {Array}
     */
    getBearishCryptos() {
        return Array.from(this.results.values())
            .filter(r => r.success && r.direction === 'bearish' && r.score <= -3)
            .sort((a, b) => a.score - b.score);
    }

    /**
     * Retourne un résumé du scan
     * @returns {Object}
     */
    getSummary() {
        const results = Array.from(this.results.values()).filter(r => r.success);
        
        const bullish = results.filter(r => r.score >= 3).length;
        const bearish = results.filter(r => r.score <= -3).length;
        const neutral = results.filter(r => r.score > -3 && r.score < 3).length;
        const tradeable = results.filter(r => r.tradeable).length;

        return {
            total: results.length,
            bullish,
            bearish,
            neutral,
            tradeable,
            lastScanTime: this.lastScanTime,
            isScanning: this.isScanning
        };
    }

    /**
     * Retourne tous les résultats triés par score
     * @param {string} sortBy - 'score', 'change24h', 'symbol'
     * @param {string} order - 'asc', 'desc'
     * @returns {Array}
     */
    getAllResults(sortBy = 'score', order = 'desc') {
        let results = Array.from(this.results.values()).filter(r => r.success);

        switch (sortBy) {
            case 'score':
                results.sort((a, b) => order === 'desc' ? b.score - a.score : a.score - b.score);
                break;
            case 'change24h':
                results.sort((a, b) => order === 'desc' 
                    ? parseFloat(b.change24h) - parseFloat(a.change24h) 
                    : parseFloat(a.change24h) - parseFloat(b.change24h));
                break;
            case 'symbol':
                results.sort((a, b) => order === 'desc' 
                    ? b.symbol.localeCompare(a.symbol) 
                    : a.symbol.localeCompare(b.symbol));
                break;
        }

        return results;
    }

    /**
     * Retourne le résultat d'un symbole spécifique
     * @param {string} symbol 
     * @returns {Object|null}
     */
    getResult(symbol) {
        return this.results.get(symbol) || null;
    }

    /**
     * Démarre le scan automatique
     * @param {number} intervalMs 
     * @param {Array<string>} symbols 
     * @param {string} timeframe 
     */
    startAutoScan(intervalMs = 300000, symbols = TOP_CRYPTOS, timeframe = '1h') {
        if (this.scanInterval) {
            this.stopAutoScan();
        }

        console.log(`[SCANNER] Démarrage scan automatique (${intervalMs / 1000}s)`);
        
        // Scan immédiat
        this.scanAll(symbols, timeframe);

        // Puis périodique
        this.scanInterval = setInterval(() => {
            this.scanAll(symbols, timeframe);
        }, intervalMs);
    }

    /**
     * Arrête le scan automatique
     */
    stopAutoScan() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
            console.log('[SCANNER] Scan automatique arrêté');
        }
    }

    /**
     * Retourne la liste des cryptos supportées
     * @returns {Array<string>}
     */
    static getSupportedCryptos() {
        return [...TOP_CRYPTOS];
    }
}

// Export singleton
const scanner = new CryptoScanner();
export default scanner;
export { TOP_CRYPTOS };
