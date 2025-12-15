/**
 * Instance de Bot par Utilisateur
 * Chaque utilisateur a sa propre instance avec ses paramètres et son état
 */

import api from '../services/hyperliquidApi.js';
import { HyperliquidAuth } from '../services/hyperliquidAuth.js';
import priceFetcher from './priceFetcher.js';
import signalDetector from './signalDetector.js';
import { decryptSecret } from '../utils/crypto.js';
import { TIMEFRAME_TPSL, TIMEFRAME_PRESETS, DEFAULT_BOT_CONFIG, ANTI_OVERTRADING_CONFIG } from './config.js';

/**
 * Instance de bot pour un utilisateur spécifique
 */
class UserBotInstance {
    constructor(userId, userConfig = {}) {
        this.userId = userId;
        this.auth = new HyperliquidAuth();
        
        // Utilise les constantes centralisées depuis config.js
        this.TIMEFRAME_TPSL = TIMEFRAME_TPSL;
        this.TIMEFRAME_PRESETS = TIMEFRAME_PRESETS;

        // Configuration par défaut (peut être surchargée par userConfig)
        this.config = {
            ...DEFAULT_BOT_CONFIG,
            ...userConfig
        };

        // État du bot
        this.state = {
            isRunning: false,
            lastAnalysis: null,
            lastSignal: null,
            currentPosition: null,
            pendingOrders: [],
            analysisCount: 0,
            multiAnalysis: new Map(),
            activePositions: new Map(),
            opportunities: [],
            tradingLocks: new Set(),
            isProcessingTrades: false,
            lastTradeTime: new Map(),
            consecutiveShorts: 0,
            consecutiveLongs: 0,
            lastTradeDirection: null
        };

        // Anti-overtrading (utilise config centralisée)
        this.antiOvertradingConfig = ANTI_OVERTRADING_CONFIG;
        this.lastGlobalTradeTime = 0;

        // Intervalle d'analyse
        this.analysisInterval = null;

        // Logs
        this.logs = [];
        this.maxLogs = 200;

        // Callbacks
        this.eventCallbacks = {
            onLog: [],
            onSignal: [],
            onTrade: [],
            onAnalysis: []
        };

        // Wallet actif
        this.activeWallet = null;
    }

    /**
     * Initialise le bot avec le wallet de l'utilisateur
     */
    async initializeWithWallet(wallet) {
        if (!wallet || !wallet.secretPhrase) {
            throw new Error('Wallet invalide ou sans clé secrète');
        }

        try {
            const secret = decryptSecret(wallet.secretPhrase);
            await this.auth.initialize(secret);
            
            if (wallet.tradingAddress) {
                this.auth.setTradingAddress(wallet.tradingAddress);
            }
            
            this.activeWallet = wallet;
            this.log(`Wallet initialisé: ${wallet.address.substring(0, 10)}...`, 'info');
            return true;
        } catch (error) {
            this.log(`Erreur initialisation wallet: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Démarre le bot
     */
    async start() {
        if (this.state.isRunning) {
            this.log('Bot déjà en cours d\'exécution', 'warning');
            return false;
        }

        if (!this.auth.isReady()) {
            throw new Error('Wallet non initialisé. Configurez votre wallet d\'abord.');
        }

        this.state.isRunning = true;
        this.log(`🚀 Bot démarré pour l'utilisateur ${this.userId}`, 'success');
        this.log(`Mode: ${this.config.mode.toUpperCase()}`, 'info');
        this.log(`Symboles: ${this.config.symbols.join(', ')}`, 'info');
        this.log(`Timeframe: ${this.config.timeframes.join(', ')}`, 'info');

        // Applique le preset du timeframe
        this.applyTimeframePreset(this.config.timeframes[0]);

        // Démarre la boucle d'analyse
        this.startAnalysisLoop();

        return true;
    }

    /**
     * Arrête le bot
     */
    stop() {
        if (!this.state.isRunning) {
            return false;
        }

        this.state.isRunning = false;
        
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }

        this.log(`🛑 Bot arrêté pour l'utilisateur ${this.userId}`, 'info');
        return true;
    }

    /**
     * Applique le preset du timeframe
     */
    applyTimeframePreset(timeframe) {
        const preset = this.TIMEFRAME_PRESETS[timeframe];
        if (preset) {
            this.config.minScore = preset.minScore;
            this.config.minWinProbability = preset.minWinProbability;
            this.config.analysisInterval = preset.analysisInterval;
            this.log(`Preset ${preset.name} appliqué pour ${timeframe}`, 'info');
        }
    }

    /**
     * Démarre la boucle d'analyse
     */
    startAnalysisLoop() {
        // Première analyse immédiate
        this.runAnalysis();

        // Puis à intervalle régulier
        this.analysisInterval = setInterval(() => {
            if (this.state.isRunning) {
                this.runAnalysis();
            }
        }, this.config.analysisInterval);
    }

    /**
     * Exécute une analyse
     */
    async runAnalysis() {
        if (!this.state.isRunning) return;

        try {
            this.state.analysisCount++;
            this.log(`🔍 Analyse #${this.state.analysisCount} - ${this.config.symbols.length} symboles sur ${this.config.timeframes.join(', ')}`, 'info');
            const opportunities = [];

            for (const symbol of this.config.symbols) {
                for (const timeframe of this.config.timeframes) {
                    try {
                        const result = await this.analyzeSymbol(symbol, timeframe);
                        if (result && result.signal) {
                            opportunities.push(result);
                        }
                    } catch (error) {
                        this.log(`Erreur analyse ${symbol} ${timeframe}: ${error.message}`, 'error');
                    }
                }
            }

            this.state.opportunities = opportunities;
            this.state.lastAnalysis = new Date();
            
            this.log(`✅ Analyse terminée: ${opportunities.length} opportunités trouvées`, 'info');

            // Émet l'événement d'analyse
            this.emit('onAnalysis', {
                count: this.state.analysisCount,
                opportunities: opportunities.length,
                timestamp: this.state.lastAnalysis
            });

            // En mode auto, exécute les trades
            if (this.config.mode === 'auto' && opportunities.length > 0) {
                this.log(`🎯 Mode AUTO: traitement de ${opportunities.length} opportunités`, 'info');
                await this.processOpportunities(opportunities);
            }

        } catch (error) {
            this.log(`Erreur boucle d'analyse: ${error.message}`, 'error');
        }
    }

    /**
     * Analyse un symbole sur un timeframe
     */
    async analyzeSymbol(symbol, timeframe) {
        // L'API Hyperliquid attend juste le symbole (BTC, ETH, etc.) sans -PERP
        const cleanSymbol = symbol.replace('-PERP', '');
        
        // Récupère les candles
        const candles = await priceFetcher.getCandles(cleanSymbol, timeframe, 200);
        if (!candles || candles.length < 60) {
            return null;
        }

        // Utilise signalDetector.analyze() qui fait tout le travail
        const analysis = signalDetector.analyze(candles, {}, timeframe);
        
        if (!analysis.success || !analysis.finalSignal || !analysis.finalSignal.action) {
            return null;
        }

        const finalSignal = analysis.finalSignal;
        const signalScore = finalSignal.score || finalSignal.normalizedScore || 0;
        
        // Vérifie les filtres de score
        if (signalScore < this.config.minScore) return null;

        // Convertit direction bullish/bearish en LONG/SHORT
        const direction = finalSignal.action === 'BUY' ? 'LONG' : 'SHORT';

        // Filtre RSI si activé
        if (this.config.useRSIFilter && analysis.indicators?.rsi) {
            const rsiValue = analysis.indicators.rsi?.value || analysis.indicators.rsi || 50;
            if (direction === 'LONG' && rsiValue > this.config.rsiOverbought) {
                return null;
            }
            if (direction === 'SHORT' && rsiValue < this.config.rsiOversold) {
                return null;
            }
        }

        const result = {
            symbol: cleanSymbol,
            timeframe,
            signal: { ...finalSignal, direction, score: signalScore },
            price: candles[candles.length - 1].close,
            ichimoku: analysis.ichimokuScore,
            indicators: analysis.indicators,
            timestamp: new Date()
        };

        this.state.lastSignal = result;
        this.log(`📊 Signal ${direction} sur ${symbol} (score: ${signalScore.toFixed(1)})`, 'signal');
        this.emit('onSignal', result);

        return result;
    }

    /**
     * Traite les opportunités en mode auto
     */
    async processOpportunities(opportunities) {
        // Trie par score décroissant
        const sorted = opportunities.sort((a, b) => b.signal.score - a.signal.score);

        for (const opp of sorted) {
            if (this.state.activePositions.size >= this.config.maxConcurrentTrades) {
                break;
            }

            // Vérifie le cooldown
            const lastTrade = this.state.lastTradeTime.get(opp.symbol);
            if (lastTrade && Date.now() - lastTrade < this.antiOvertradingConfig.symbolCooldownMs) {
                continue;
            }

            try {
                await this.executeTrade(opp);
            } catch (error) {
                this.log(`Erreur exécution trade ${opp.symbol}: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Exécute un trade
     */
    async executeTrade(opportunity) {
        const { symbol, signal, price } = opportunity;

        // Calcule TP/SL
        const tpsl = this.calculateTPSL(opportunity);

        this.log(`🎯 Exécution ${signal.direction} sur ${symbol} @ ${price}`, 'trade');
        this.log(`   TP: ${tpsl.tp.toFixed(2)} | SL: ${tpsl.sl.toFixed(2)}`, 'trade');

        try {
            // Calcule la taille de la position basée sur le solde et le risque
            const balance = await this.getBalance();
            if (!balance || balance.totalEquity <= 0) {
                this.log(`❌ Solde insuffisant pour trader`, 'error');
                return;
            }

            // Risque par trade (2% du capital par défaut)
            const riskPercent = this.config.riskPerTrade || 2;
            const riskAmount = balance.totalEquity * (riskPercent / 100);
            
            // Calcule la taille basée sur le SL
            const slDistance = Math.abs(price - tpsl.sl);
            const slPercent = (slDistance / price) * 100;
            
            // Taille = (Risque en $) / (Distance SL en %)
            let positionSize = riskAmount / slDistance;
            
            // Applique le levier
            const leverage = this.config.leverage || 10;
            positionSize = positionSize * leverage / price;
            
            // Minimum 10$ de position
            const minNotional = 10;
            const notionalValue = positionSize * price;
            if (notionalValue < minNotional) {
                positionSize = minNotional / price;
            }

            this.log(`📊 Taille position: ${positionSize.toFixed(4)} ${symbol} (${(positionSize * price).toFixed(2)} USD)`, 'info');

            // Exécute l'ordre via l'API
            const isBuy = signal.direction === 'LONG';
            
            const result = await api.placeOrderWithTPSL({
                symbol: symbol,
                isBuy: isBuy,
                size: positionSize,
                price: price,
                takeProfit: tpsl.tp,
                stopLoss: tpsl.sl,
                leverage: leverage,
                reduceOnly: false
            });

            this.log(`✅ Ordre exécuté: ${JSON.stringify(result)}`, 'trade');
            
            // Met à jour l'état
            this.state.lastTradeTime.set(symbol, Date.now());
            this.lastGlobalTradeTime = Date.now();
            this.state.activePositions.set(symbol, {
                direction: signal.direction,
                entryPrice: price,
                size: positionSize,
                tp: tpsl.tp,
                sl: tpsl.sl,
                timestamp: new Date()
            });

            this.emit('onTrade', {
                symbol,
                direction: signal.direction,
                price,
                size: positionSize,
                tp: tpsl.tp,
                sl: tpsl.sl,
                result: result,
                timestamp: new Date()
            });

        } catch (error) {
            this.log(`❌ Erreur exécution ordre ${symbol}: ${error.message}`, 'error');
        }
    }
    
    /**
     * Récupère le solde du compte
     */
    async getBalance() {
        try {
            const tradingAddress = this.auth.tradingAddress || this.auth.getAddress();
            return await api.getAccountBalance(tradingAddress);
        } catch (error) {
            this.log(`Erreur récupération solde: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Calcule TP/SL selon le mode configuré
     */
    calculateTPSL(opportunity) {
        const { price, timeframe } = opportunity;
        const preset = this.TIMEFRAME_TPSL[timeframe] || { tp: 2, sl: 1 };

        let tp, sl;

        switch (this.config.tpslMode) {
            case 'percent':
                tp = price * (1 + this.config.defaultTP / 100);
                sl = price * (1 - this.config.defaultSL / 100);
                break;
            case 'auto':
            default:
                tp = price * (1 + preset.tp / 100);
                sl = price * (1 - preset.sl / 100);
                break;
        }

        return { tp, sl };
    }

    /**
     * Met à jour la configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.timeframes && newConfig.timeframes.length > 0) {
            this.applyTimeframePreset(newConfig.timeframes[0]);
        }

        this.log('Configuration mise à jour', 'info');
    }

    /**
     * Retourne le statut du bot
     */
    getStatus() {
        return {
            userId: this.userId,
            isRunning: this.state.isRunning,
            config: this.config,
            analysisCount: this.state.analysisCount,
            lastAnalysis: this.state.lastAnalysis,
            lastSignal: this.state.lastSignal,
            opportunities: this.state.opportunities,
            activePositions: Array.from(this.state.activePositions.entries()),
            wallet: this.activeWallet ? {
                address: this.activeWallet.address,
                name: this.activeWallet.name
            } : null
        };
    }

    /**
     * Retourne les logs
     */
    getLogs(limit = 50) {
        return this.logs.slice(-limit);
    }

    /**
     * Ajoute un log
     */
    log(message, type = 'info') {
        const entry = {
            timestamp: new Date(),
            message,
            type,
            userId: this.userId
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.emit('onLog', entry);
        console.log(`[BOT-${this.userId.toString().substring(0, 8)}] [${type.toUpperCase()}] ${message}`);
    }

    /**
     * Émet un événement
     */
    emit(event, data) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Erreur callback ${event}:`, e);
                }
            });
        }
    }

    /**
     * Enregistre un callback
     */
    on(event, callback) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].push(callback);
        }
    }

    /**
     * Supprime un callback
     */
    off(event, callback) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event] = this.eventCallbacks[event].filter(cb => cb !== callback);
        }
    }

    /**
     * Nettoie l'instance
     */
    destroy() {
        this.stop();
        this.eventCallbacks = {
            onLog: [],
            onSignal: [],
            onTrade: [],
            onAnalysis: []
        };
        this.logs = [];
    }
}

export default UserBotInstance;
