/**
 * Moteur de Trading Principal
 * Orchestre tous les composants: analyse, signaux, risk management et exécution
 */

import api from '../services/hyperliquidApi.js';
import auth from '../services/hyperliquidAuth.js';
import priceFetcher from './priceFetcher.js';
import signalDetector from './signalDetector.js';
import smcSignalDetector from './smcSignalDetector.js';
import riskManager from './riskManager.js';
import ichimoku from './ichimoku.js';
import indicators from './indicators.js';
import positionManager from './positionManager.js';
import correlationManager from './correlationManager.js';
import rateLimiter from '../services/rateLimiter.js';
import connectionManager from '../services/connectionManager.js';
import multiTimeframe from './multiTimeframe.js';
import { TIMEFRAME_TPSL, TIMEFRAME_PRESETS, DEFAULT_BOT_CONFIG } from './config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Classe principale du moteur de trading
 */
class TradeEngine {
    constructor() {
        // Utilise les constantes centralisées depuis config.js
        this.TIMEFRAME_TPSL = TIMEFRAME_TPSL;
        this.TIMEFRAME_PRESETS = TIMEFRAME_PRESETS;
        
        // Configuration
        this.config = {
            symbols: ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'LINK', 'DOT', 'MATIC', 'UNI', 'ATOM', 'LTC', 'BCH', 'APT', 'ARB', 'OP', 'INJ', 'SUI', 'SEI'],
            timeframes: ['15m'],          // Timeframe principal d'analyse
            analysisInterval: 60000,      // Intervalle d'analyse en ms (1 min)
            mode: 'auto',                 // 'auto' ou 'manual'
            leverage: 5,
            multiCryptoMode: true,        // Toujours en mode multi-crypto
            maxConcurrentTrades: 3,       // Nombre max de trades simultanés
            minWinProbability: 0.65,      // Probabilité minimum de gain (65%)
            minScore: 3,                  // Score minimum pour trader (sur 7)
            defaultTP: 2.0,               // TP par défaut (%)
            defaultSL: 1.0,               // SL par défaut (%)
            // Mode TP/SL: 'auto' (Ichimoku), 'atr', 'percent', 'manual'
            tpslMode: 'auto',
            atrMultiplierSL: 1.5,         // Multiplicateur ATR pour SL
            atrMultiplierTP: 2.5,         // Multiplicateur ATR pour TP
            enabledSignals: {
                tkCross: true,
                kumoBreakout: true,
                kumoTwist: true,
                kijunBounce: true
            },
            // Filtres avancés
            useRSIFilter: true,           // Activer le filtre RSI
            rsiOverbought: 70,            // Seuil de surachat (pas de LONG au-dessus)
            rsiOversold: 30,              // Seuil de survente (pas de SHORT en-dessous)
            // ===== MODE MULTI-TIMEFRAME =====
            useMTF: true,                 // Activer l'analyse multi-timeframe
            mtfPrimary: '15m',            // Timeframe principal
            mtfHigher: '4h',              // Timeframe supérieur pour confirmer la tendance
            mtfConfirmations: 2,          // Minimum de confirmations requises
            mtfWeights: {                 // Poids de chaque timeframe
                '1m': 0.15,
                '5m': 0.25,
                '15m': 0.30,
                '1h': 0.20,
                '4h': 0.10
            },
            // ===== INDICATEURS AVANCÉS =====
            useSupertrend: true,          // Filtre Supertrend (ne trade que dans le sens de la tendance)
            useFibonacci: true,           // Utilise Fibonacci pour TP/SL dynamiques
            useChikouAdvanced: true,      // Confirmation Chikou Span avancée
            useKumoTwist: true,           // Détection Kumo Twist
            // ===== STRATÉGIE =====
            strategy: 'ichimoku'          // 'ichimoku' ou 'smc' (Smart Money Concepts)
        };

        // État
        this.state = {
            isRunning: false,
            lastAnalysis: null,
            lastSignal: null,
            currentPosition: null,
            pendingOrders: [],
            analysisCount: 0,
            // Multi-crypto state
            multiAnalysis: new Map(),     // Analyses par symbole
            activePositions: new Map(),   // Positions actives par symbole
            opportunities: [],            // Opportunités détectées
            // SÉCURITÉ: Verrous pour éviter les trades en double
            tradingLocks: new Set(),      // Symboles en cours de trade
            isProcessingTrades: false,    // Flag global de traitement
            // ===== ANTI-OVERTRADING =====
            lastTradeTime: new Map(),     // Dernier trade par symbole (timestamp)
            consecutiveShorts: 0,         // Compteur de shorts consécutifs
            consecutiveLongs: 0,          // Compteur de longs consécutifs
            lastTradeDirection: null      // Dernière direction de trade
        };
        
        // ===== CONFIGURATION ANTI-OVERTRADING =====
        this.antiOvertradingConfig = {
            symbolCooldownMs: 10 * 60 * 1000,  // 10 minutes entre trades sur même symbole (AUGMENTÉ)
            maxConsecutiveSameDirection: 4,    // Max 4 trades consécutifs dans la même direction
            globalCooldownMs: 2 * 60 * 1000,   // 2 minutes minimum entre tous les trades (AUGMENTÉ)
            maxConsecutiveLosses: 3,           // NOUVEAU: arrête après 3 pertes consécutives
            pauseAfterLossesMs: 30 * 60 * 1000 // NOUVEAU: pause 30 min après pertes consécutives
        };
        this.lastGlobalTradeTime = 0;
        this.consecutiveLosses = 0;            // Compteur de pertes consécutives
        this.pausedUntil = 0;                  // Timestamp jusqu'auquel le bot est en pause

        // Intervalle d'analyse
        this.analysisInterval = null;

        // Logs en mémoire pour le dashboard (limité pour éviter fuite mémoire)
        this.logs = [];
        this.maxLogs = 200; // Réduit de 500 à 200 pour économiser la mémoire

        // Callbacks pour les événements
        this.eventCallbacks = {
            onLog: [],
            onSignal: [],
            onTrade: [],
            onAnalysis: []
        };

        // Note: La config est maintenant gérée via MongoDB (user.botConfig)
        // Plus de stockage local - tout passe par l'authentification utilisateur
    }

    /**
     * Charge la configuration (no-op, config vient de MongoDB via user.botConfig)
     * @deprecated Utiliser updateConfig() avec les données de l'utilisateur
     */
    loadConfig() {
        // No-op - la config est chargée depuis MongoDB via les routes API
        this.log('Configuration initialisée (valeurs par défaut)', 'info');
    }

    /**
     * Sauvegarde la configuration (no-op, config sauvée dans MongoDB)
     * @deprecated La sauvegarde se fait via POST /api/config/trading
     */
    saveConfig() {
        // No-op - la config est sauvegardée dans MongoDB via les routes API
        // Cette méthode est gardée pour compatibilité mais ne fait plus rien
    }

    /**
     * Retourne les presets pour un timeframe donné
     * @param {string} timeframe 
     * @returns {Object}
     */
    getTimeframePreset(timeframe) {
        return this.TIMEFRAME_PRESETS[timeframe] || this.TIMEFRAME_PRESETS['15m'];
    }
    
    /**
     * Applique les presets automatiques du timeframe
     * @param {string} timeframe 
     */
    applyTimeframePreset(timeframe) {
        const preset = this.getTimeframePreset(timeframe);
        const tpsl = this.TIMEFRAME_TPSL[timeframe] || { tp: 2.0, sl: 1.0 };
        
        // Applique les réglages du preset
        this.config.minScore = preset.minScore;
        this.config.minWinProbability = preset.minWinProbability;
        this.config.analysisInterval = preset.analysisInterval;
        this.config.defaultTP = tpsl.tp;
        this.config.defaultSL = tpsl.sl;
        
        // Stocke les paramètres RSI et ADX du preset pour utilisation dans analyzeSymbol
        this.config.presetRsiLongMax = preset.rsiLongMax;
        this.config.presetRsiShortMin = preset.rsiShortMin;
        this.config.presetAdxMin = preset.adxMin;
        this.config.presetMinConfluence = preset.minConfluence;
        
        // Applique le RRR minimum du preset au riskManager
        if (riskManager && preset.minRRR !== undefined) {
            riskManager.config.minRiskRewardRatio = preset.minRRR;
        }
        
        return preset;
    }
    
    /**
     * Met à jour la configuration
     * @param {Object} newConfig 
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // ===== APPLIQUE LES PRESETS DU TIMEFRAME =====
        if (newConfig.timeframes && newConfig.timeframes[0]) {
            const tf = newConfig.timeframes[0];
            const preset = this.applyTimeframePreset(tf);
            
            // Si l'utilisateur n'a pas spécifié de valeurs custom, utilise le preset
            if (newConfig.minScore === undefined) {
                this.config.minScore = preset.minScore;
            }
            if (newConfig.minWinProbability === undefined) {
                this.config.minWinProbability = preset.minWinProbability;
            }
        }
        
        // Détermine les TP/SL à utiliser selon le mode
        let tpPercent, slPercent;
        const tpslMode = newConfig.tpslMode || 'auto';
        
        if (tpslMode === 'percent' && newConfig.defaultTP !== undefined && newConfig.defaultSL !== undefined) {
            // Mode pourcentage manuel
            tpPercent = newConfig.defaultTP;
            slPercent = newConfig.defaultSL;
            this.log(`TP/SL manuels: TP=${tpPercent}%, SL=${slPercent}%`, 'info');
        } else if (tpslMode === 'atr') {
            // Mode ATR - les valeurs seront calculées dynamiquement
            tpPercent = newConfig.defaultTP;
            slPercent = newConfig.defaultSL;
            this.log(`TP/SL mode ATR: multiplicateurs SL=${newConfig.atrMultiplierSL || 1.5}x, TP=${newConfig.atrMultiplierTP || 2.5}x`, 'info');
        } else if (tpslMode === 'ichimoku_pure') {
            // Mode Ichimoku pur - TP/SL basés sur les niveaux Ichimoku
            tpPercent = newConfig.defaultTP;
            slPercent = newConfig.defaultSL;
            this.log(`TP/SL mode Ichimoku: niveaux dynamiques basés sur Kumo/Kijun`, 'info');
        } else {
            // Mode auto - utilise les valeurs du timeframe
            const tf = newConfig.timeframes?.[0] || '15m';
            const tpsl = this.TIMEFRAME_TPSL[tf] || { tp: 2.0, sl: 1.0 };
            tpPercent = newConfig.defaultTP !== undefined ? newConfig.defaultTP : tpsl.tp;
            slPercent = newConfig.defaultSL !== undefined ? newConfig.defaultSL : tpsl.sl;
            this.log(`TP/SL auto (${tf}): TP=${tpPercent}%, SL=${slPercent}%`, 'info');
        }
        
        // Met à jour la config du tradeEngine
        if (tpPercent !== undefined && slPercent !== undefined) {
            this.config.defaultTP = tpPercent;
            this.config.defaultSL = slPercent;
            
            // IMPORTANT: Met à jour aussi le riskManager pour qu'il utilise les mêmes valeurs
            riskManager.updateConfig({
                defaultTPPercent: tpPercent,
                defaultSLPercent: slPercent
            });
        }
        
        // Synchronise le mode TP/SL et les paramètres ATR
        if (newConfig.tpslMode) {
            this.config.tpslMode = newConfig.tpslMode;
            this.log(`Mode TP/SL: ${newConfig.tpslMode}`, 'info');
        }
        if (newConfig.atrMultiplierSL !== undefined) {
            this.config.atrMultiplierSL = newConfig.atrMultiplierSL;
        }
        if (newConfig.atrMultiplierTP !== undefined) {
            this.config.atrMultiplierTP = newConfig.atrMultiplierTP;
        }
        
        // Configure le détecteur de signaux
        signalDetector.configure({
            enabledSignals: this.config.enabledSignals
        });

        this.saveConfig();
    }
    
    /**
     * Obtient les TP/SL pour le timeframe actuel
     * @returns {Object} { tp, sl }
     */
    getTPSLForTimeframe() {
        const tf = this.config.timeframes[0] || '15m';
        const defaults = this.TIMEFRAME_TPSL[tf] || { tp: 2.0, sl: 1.0 };
        
        return {
            tp: this.config.defaultTP || defaults.tp,
            sl: this.config.defaultSL || defaults.sl
        };
    }

    /**
     * Ajoute un log
     * @param {string} message 
     * @param {string} level - 'info', 'warn', 'error', 'success', 'trade'
     */
    log(message, level = 'info') {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message
        };

        this.logs.push(logEntry);
        
        // Limite la taille des logs
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Console log
        const prefix = {
            info: '[INFO]',
            warn: '[WARN]',
            error: '[ERROR]',
            success: '[SUCCESS]',
            trade: '[TRADE]',
            signal: '[SIGNAL]'
        }[level] || '[LOG]';

        console.log(`${prefix} ${message}`);

        // Notifie les callbacks
        this.emit('onLog', logEntry);

        // Sauvegarde dans le fichier de logs
        this.appendToLogFile(logEntry);
    }

    /**
     * Ajoute au fichier de logs
     * @param {Object} logEntry 
     */
    appendToLogFile(logEntry) {
        try {
            const logPath = path.join(__dirname, '..', 'storage', 'logs.log');
            const line = `[${logEntry.timestamp}] ${logEntry.level.toUpperCase()}: ${logEntry.message}\n`;
            fs.appendFileSync(logPath, line);
        } catch (e) {
            // Ignore les erreurs de log fichier
        }
    }

    /**
     * Émet un événement
     * @param {string} event 
     * @param {*} data 
     */
    emit(event, data) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].forEach(cb => {
                try { cb(data); } catch (e) { console.error('Callback error:', e); }
            });
        }
    }

    /**
     * Enregistre un callback pour un événement
     * @param {string} event 
     * @param {Function} callback 
     */
    on(event, callback) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].push(callback);
        }
    }

    /**
     * Démarre le moteur de trading
     */
    async start() {
        if (this.state.isRunning) {
            this.log('Le moteur est déjà en cours d\'exécution', 'warn');
            return false;
        }

        this.log('===== DÉMARRAGE DU MOTEUR DE TRADING =====', 'info');

        // Vérifie l'authentification
        if (!auth.isReady()) {
            this.log('Authentification non configurée. Configurez vos clés API.', 'error');
            return false;
        }

        // Test de connexion
        const connectionTest = await auth.testConnection();
        if (!connectionTest.success) {
            this.log(`Échec connexion Hyperliquid: ${connectionTest.error}`, 'error');
            return false;
        }

        this.log(`Connecté à Hyperliquid: ${auth.getAddress()}`, 'success');

        // Récupère le solde initial (utilise l'adresse de trading)
        try {
            const balanceAddress = auth.getBalanceAddress();
            const balance = await api.getAccountBalance(balanceAddress);
            riskManager.initializeDayBalance(balance.totalEquity);
            this.log(`Solde: ${balance.totalEquity.toFixed(2)} USD (${balanceAddress?.slice(0,10)}...)`, 'info');
        } catch (e) {
            this.log(`Erreur récupération solde: ${e.message}`, 'error');
        }

        // Démarre l'analyse périodique
        this.state.isRunning = true;
        
        // ===== LOG DÉTAILLÉ DES RÉGLAGES =====
        this.log(`═══════════════════════════════════════`, 'info');
        this.log(`📊 CONFIGURATION ACTIVE DU BOT`, 'info');
        this.log(`═══════════════════════════════════════`, 'info');
        this.log(`Mode: ${this.config.mode.toUpperCase()}`, 'info');
        
        // Mode multi-crypto ou single
        if (this.config.multiCryptoMode && this.config.symbols?.length > 0) {
            this.log(`🪙 Multi-Crypto: ${this.config.symbols.length} paires`, 'info');
            this.log(`   Symboles: ${this.config.symbols.join(', ')}`, 'info');
        } else {
            this.log(`🪙 Symbole: ${this.config.symbol}`, 'info');
        }
        
        // Timeframes
        if (this.config.multiTimeframeMode && this.config.mtfTimeframes?.length > 0) {
            this.log(`⏱️ Mode Multi-Timeframe ACTIF`, 'info');
            this.log(`   Timeframes: ${this.config.mtfTimeframes.join(', ')}`, 'info');
            this.log(`   Confirmation min: ${this.config.mtfMinConfirmation || 2} TF`, 'info');
        } else {
            this.log(`⏱️ Timeframe: ${this.config.timeframes.join(', ')}`, 'info');
        }
        
        // Preset actif
        const activePreset = this.getTimeframePreset(this.config.timeframes[0]);
        this.log(`📋 Preset: ${activePreset.name}`, 'info');
        
        // Filtres et seuils
        this.log(`🎯 Filtres actifs:`, 'info');
        this.log(`   Score min: ${this.config.minScore || activePreset.minScore}`, 'info');
        this.log(`   Win Prob min: ${((this.config.minWinProbability || activePreset.minWinProbability) * 100).toFixed(0)}%`, 'info');
        this.log(`   RSI LONG max: ${this.config.presetRsiLongMax || activePreset.rsiLongMax}`, 'info');
        this.log(`   RSI SHORT min: ${this.config.presetRsiShortMin || activePreset.rsiShortMin}`, 'info');
        this.log(`   ADX min: ${this.config.presetAdxMin || activePreset.adxMin}`, 'info');
        this.log(`   RRR min: ${activePreset.minRRR}`, 'info');
        
        // TP/SL
        const tpsl = this.getTPSLForTimeframe();
        this.log(`💰 TP/SL:`, 'info');
        this.log(`   Mode: ${this.config.tpslMode || 'auto'}`, 'info');
        this.log(`   TP: ${tpsl.tp}% | SL: ${tpsl.sl}%`, 'info');
        
        // Autres paramètres
        this.log(`⚙️ Paramètres:`, 'info');
        this.log(`   Intervalle: ${this.config.analysisInterval / 1000}s`, 'info');
        this.log(`   Levier: ${this.config.leverage}x`, 'info');
        this.log(`   Max positions: ${this.config.maxConcurrentTrades}`, 'info');
        
        // Risk Management
        const riskConfig = riskManager.config;
        this.log(`🛡️ Risk Management:`, 'info');
        this.log(`   Risk/trade: ${riskConfig.riskPerTrade}%`, 'info');
        this.log(`   RRR min: ${riskConfig.minRiskRewardRatio === 0 ? 'OFF' : riskConfig.minRiskRewardRatio}`, 'info');
        this.log(`   Daily loss limit: ${riskConfig.dailyLossLimit}%`, 'info');
        this.log(`═══════════════════════════════════════`, 'info');

        // IMPORTANT: Synchronise avec les positions existantes sur l'exchange
        // Cela évite d'ouvrir des trades sur des symboles où on a déjà une position
        const syncResult = await this.syncPositionsWithExchange();
        if (syncResult) {
            this.log(`Positions actuelles sur l'exchange: ${syncResult.realCount}`, 'info');
        }

        // Démarre le Position Manager (surveillance des fermetures)
        positionManager.start();
        
        // Configure le callback pour gérer les pertes consécutives
        positionManager.setOnPositionClosed((symbol, pnl, exitReason) => {
            this.handlePositionClosed(symbol, pnl, exitReason);
        });
        
        // Configure le Connection Manager
        connectionManager.setCallbacks({
            apiHealthCheck: () => api.getAccountBalance(auth.getBalanceAddress()),
            wsReconnect: () => Promise.resolve() // WebSocket géré par le serveur
        });
        connectionManager.start();

        // Analyse immédiate
        await this.runMultiAnalysis();

        // Démarre l'intervalle
        this.analysisInterval = setInterval(() => {
            this.runMultiAnalysis();
        }, this.config.analysisInterval);

        this.log('Moteur de trading démarré', 'success');
        return true;
    }

    /**
     * Arrête le moteur de trading
     */
    stop() {
        if (!this.state.isRunning) {
            return false;
        }

        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }

        // Arrête les managers
        positionManager.stop();
        connectionManager.stop();

        this.state.isRunning = false;
        this.log('===== MOTEUR DE TRADING ARRÊTÉ =====', 'info');
        return true;
    }

    /**
     * Exécute une analyse multi-crypto
     */
    async runMultiAnalysis() {
        try {
            this.state.analysisCount++;
            const startTime = Date.now();
            
            // Détermine les symboles à analyser
            const symbols = this.config.multiCryptoMode && this.config.symbols?.length > 0
                ? this.config.symbols
                : [this.config.symbol];
            
            // Détermine les timeframes à analyser
            // En mode MTF, on analyse tous les TF sélectionnés indépendamment
            const timeframesToAnalyze = this.config.multiTimeframeMode && this.config.mtfTimeframes?.length > 0
                ? this.config.mtfTimeframes
                : this.config.timeframes;
            
            const opportunities = [];
            
            // Analyse chaque symbole sur chaque timeframe
            for (const symbol of symbols) {
                for (const timeframe of timeframesToAnalyze) {
                    try {
                        const analysis = await this.analyzeSymbolOnTimeframe(symbol, timeframe);
                        
                        if (analysis.success) {
                            // Stocke l'analyse avec clé symbol_timeframe
                            const key = `${symbol}_${timeframe}`;
                            this.state.multiAnalysis.set(key, analysis);
                            
                            // Si opportunité détectée
                            if (analysis.tradeable) {
                                opportunities.push(analysis);
                            }
                        }
                    } catch (e) {
                        // Continue avec les autres symboles/timeframes
                    }
                }
            }
            
            // Trie les opportunités par qualité du signal (meilleur en premier)
            opportunities.sort((a, b) => {
                // Priorité 1: Grade de qualité (A > B > C > D)
                const gradeOrder = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
                const gradeA = gradeOrder[a.signalQuality?.grade] || 0;
                const gradeB = gradeOrder[b.signalQuality?.grade] || 0;
                if (gradeA !== gradeB) return gradeB - gradeA;
                
                // Priorité 2: Score de qualité
                const qualityA = a.signalQuality?.score || 0;
                const qualityB = b.signalQuality?.score || 0;
                if (Math.abs(qualityB - qualityA) > 5) return qualityB - qualityA;
                
                // Priorité 3: Probabilité de gain
                const probDiff = (b.winProbability || 0) - (a.winProbability || 0);
                if (Math.abs(probDiff) > 0.01) return probDiff;
                
                // Priorité 4: Confluence
                const confDiff = (b.confluence || 0) - (a.confluence || 0);
                if (confDiff !== 0) return confDiff;
                
                // Priorité 5: Score Ichimoku absolu
                return Math.abs(b.score) - Math.abs(a.score);
            });
            this.state.opportunities = opportunities;
            
            // Log résumé
            const duration = Date.now() - startTime;
            const tfCount = timeframesToAnalyze.length;
            const totalAnalyses = symbols.length * tfCount;
            this.log(`Analyse #${this.state.analysisCount} - ${symbols.length} cryptos x ${tfCount} TF (${totalAnalyses} analyses, ${duration}ms) - ${opportunities.length} opportunités`, 'signal');
            
            // Émet l'événement
            this.emit('onAnalysis', {
                timestamp: Date.now(),
                symbols: symbols.length,
                opportunities: opportunities.length,
                results: Array.from(this.state.multiAnalysis.values())
            });
            
            // En mode auto, traite les meilleures opportunités
            if (this.config.mode === 'auto' && opportunities.length > 0) {
                await this.processMultiOpportunities(opportunities);
            }
            
        } catch (error) {
            this.log(`Erreur analyse multi: ${error.message}`, 'error');
        }
    }
    
    /**
     * Analyse un symbole sur un timeframe spécifique (pour mode MTF indépendant)
     * @param {string} symbol 
     * @param {string} timeframe 
     * @returns {Promise<Object>}
     */
    async analyzeSymbolOnTimeframe(symbol, timeframe) {
        // Récupère le preset pour ce timeframe
        const preset = this.getTimeframePreset(timeframe);
        const tpsl = this.TIMEFRAME_TPSL[timeframe] || { tp: 2.0, sl: 1.0 };
        
        const candles = await priceFetcher.getCandles(symbol, timeframe, 250);
        
        if (!candles || candles.length < 60) {
            return { success: false, symbol, timeframe, error: 'Données insuffisantes' };
        }
        
        const currentPrice = candles[candles.length - 1].close;
        const strategy = this.config.strategy || 'ichimoku';
        
        // ===== STRATÉGIE SMC (Smart Money Concepts) =====
        if (strategy === 'smc') {
            return this.analyzeWithSMC(symbol, timeframe, candles, currentPrice, preset, tpsl);
        }
        
        // ===== STRATÉGIE BOLLINGER SQUEEZE =====
        if (strategy === 'bollinger') {
            return this.analyzeWithBollinger(symbol, timeframe, candles, currentPrice, preset, tpsl);
        }
        
        // ===== STRATÉGIE ICHIMOKU (par défaut) =====
        // Analyse avec signalDetector
        const analysis = signalDetector.analyze(candles, {}, timeframe);
        
        if (!analysis || !analysis.ichimokuScore) {
            return { success: false, symbol, timeframe, error: 'Analyse échouée' };
        }
        
        const ichimokuScore = analysis.ichimokuScore.score || 0;
        const absIchimokuScore = Math.abs(ichimokuScore);
        const signalDirection = ichimokuScore > 0 ? 'long' : ichimokuScore < 0 ? 'short' : null;
        
        // Indicateurs
        const rsi = analysis.indicators?.rsi?.value || 50;
        const macd = analysis.indicators?.macd || {};
        const adx = analysis.indicators?.adx || {};
        const vwap = analysis.indicators?.vwap || {};
        const cvd = analysis.indicators?.cvd || {};
        
        // Confluence
        let confluence = 0;
        if (analysis.indicators?.rsi?.signal) confluence++;
        if (analysis.indicators?.macd?.signal) confluence++;
        if (analysis.indicators?.adx?.trending) confluence++;
        if (analysis.indicators?.vwap?.signal) confluence++;
        if (analysis.indicators?.cvd?.signal) confluence++;
        
        // ===== FILTRE TENDANCE EMA200 (ASSOUPLI) =====
        // Filtre informatif mais ne bloque plus les trades
        // Les corrections en bull market sont normales et tradables
        const ema200 = analysis.indicators?.ema200;
        let trendOK = true; // Toujours true - ne bloque plus
        let trendDirection = 'neutral';
        
        if (ema200 && ema200.value) {
            const priceAboveEMA = currentPrice > ema200.value;
            const priceBelowEMA = currentPrice < ema200.value;
            const emaDistance = Math.abs((currentPrice - ema200.value) / ema200.value * 100);
            
            // Détermine la tendance (informatif seulement)
            if (priceAboveEMA && emaDistance > 0.5) {
                trendDirection = 'bullish';
            } else if (priceBelowEMA && emaDistance > 0.5) {
                trendDirection = 'bearish';
            }
            
            // NOTE: On ne bloque plus les trades basés sur EMA200
            // Les corrections en tendance haussière sont normales
            // Le score Ichimoku et les autres filtres suffisent
            // ANCIEN CODE BLOQUANT RETIRÉ:
            // if (signalDirection === 'long' && priceBelowEMA && emaDistance > 1.0) trendOK = false;
            // if (signalDirection === 'short' && priceAboveEMA && emaDistance > 1.0) trendOK = false;
        }
        
        // ===== FILTRE MACD TENDANCE (ASSOUPLI) =====
        // Le MACD est utilisé comme indicateur de confirmation, pas comme bloqueur strict
        let macdTrendOK = true;
        if (macd && macd.histogram !== undefined) {
            // MACD doit confirmer la direction - seuils assouplis pour crypto volatile
            // Seuil augmenté de 0.5 à 2.0 pour éviter de bloquer les corrections normales
            if (signalDirection === 'long' && macd.histogram < -2.0) {
                macdTrendOK = false; // MACD très négatif = pas de LONG
            } else if (signalDirection === 'short' && macd.histogram > 2.0) {
                macdTrendOK = false; // MACD très positif = pas de SHORT
            }
        }
        
        // ===== FILTRE SUPERTREND (ASSOUPLI) =====
        // Le Supertrend a un biais haussier, on l'utilise comme bonus, pas comme bloqueur
        let supertrendOK = true; // Toujours true - ne bloque plus
        const supertrend = analysis.indicators?.supertrend;
        // NOTE: Le Supertrend est maintenant utilisé comme bonus de confluence
        // et non comme filtre bloquant car il a un biais haussier
        // qui empêche les SHORT même lors de corrections légitimes
        // ANCIEN CODE BLOQUANT RETIRÉ:
        // if (this.config.useSupertrend && supertrend && supertrend.direction !== 'neutral') {
        //     if (signalDirection === 'long' && supertrend.direction !== 'bullish') supertrendOK = false;
        //     if (signalDirection === 'short' && supertrend.direction !== 'bearish') supertrendOK = false;
        // }
        
        // ===== FILTRE CHIKOU AVANCÉ (ASSOUPLI) =====
        // Le Chikou est utilisé comme bonus de confirmation, pas comme bloqueur
        // Car il a aussi un biais vers la tendance dominante
        let chikouOK = true; // Toujours true - ne bloque plus
        const chikouAdvanced = analysis.indicators?.chikouAdvanced;
        // NOTE: Le Chikou est maintenant utilisé comme indicateur informatif
        // et non comme filtre bloquant car il suit la tendance dominante
        // ANCIEN CODE BLOQUANT RETIRÉ:
        // if (this.config.useChikouAdvanced && chikouAdvanced && chikouAdvanced.confirmed) {
        //     if (signalDirection === 'long' && chikouAdvanced.direction !== 'bullish') chikouOK = false;
        //     if (signalDirection === 'short' && chikouAdvanced.direction !== 'bearish') chikouOK = false;
        // }
        
        // Vérifie les filtres avec les presets du timeframe
        const hasStrongScore = absIchimokuScore >= preset.minScore;
        const hasMinConfluence = confluence >= preset.minConfluence;
        
        // Filtre RSI selon le preset - ASSOUPLI POUR SHORT
        let rsiOK = true;
        if (signalDirection === 'long') {
            rsiOK = rsi <= preset.rsiLongMax && rsi > 25; // Pas de LONG si RSI trop bas (survente extrême)
        } else if (signalDirection === 'short') {
            // SHORT: RSI entre 20 et 85 accepté
            // On peut shorter en surachat (RSI élevé) = c'est même idéal!
            rsiOK = rsi >= 20 && rsi <= 85;
        }
        
        // Filtre ADX - RENFORCÉ
        const adxValue = adx.value || 0;
        const adxOK = adxValue === 0 || adxValue >= preset.adxMin;
        
        // ===== FILTRE QUALITÉ SIGNAL MINIMUM =====
        // Exige un grade minimum de C pour trader
        const minGradeRequired = 'C';
        
        // Calcul probabilité de gain
        const winProbability = this.calculateWinProbability(analysis, confluence, 0);
        const meetsWinProb = winProbability >= preset.minWinProbability;
        
        // Signal tradeable ? - FILTRES RENFORCÉS (incluant Supertrend et Chikou)
        const tradeable = signalDirection && hasStrongScore && hasMinConfluence && rsiOK && adxOK && meetsWinProb && trendOK && macdTrendOK && supertrendOK && chikouOK;
        
        // Qualité du signal
        let signalQuality = { score: 0, grade: 'D' };
        if (tradeable) {
            let qualityScore = 0;
            if (absIchimokuScore >= 6) qualityScore += 30;
            else if (absIchimokuScore >= 5) qualityScore += 20;
            else if (absIchimokuScore >= 4) qualityScore += 10;
            if (confluence >= 4) qualityScore += 25;
            else if (confluence >= 3) qualityScore += 15;
            else if (confluence >= 2) qualityScore += 5;
            if (winProbability >= 0.80) qualityScore += 20;
            else if (winProbability >= 0.70) qualityScore += 10;
            
            signalQuality.score = qualityScore;
            signalQuality.grade = qualityScore >= 60 ? 'A' : qualityScore >= 40 ? 'B' : qualityScore >= 20 ? 'C' : 'D';
        }
        
        return {
            success: true,
            symbol,
            timeframe,
            price: currentPrice,
            score: ichimokuScore,
            direction: signalDirection,
            signal: signalDirection === 'long' ? 'BUY' : signalDirection === 'short' ? 'SELL' : null,
            tradeable,
            winProbability,
            confluence,
            signalQuality,
            indicators: {
                rsi: { value: rsi, ok: rsiOK },
                adx: { value: adxValue, ok: adxOK },
                macd,
                vwap,
                cvd
            },
            preset: preset.name,
            tpsl: { tp: tpsl.tp, sl: tpsl.sl },
            minRRR: preset.minRRR,
            trendFilter: { ok: trendOK, direction: trendDirection, ema200: ema200?.value },
            macdTrendFilter: { ok: macdTrendOK, histogram: macd?.histogram },
            supertrendFilter: { ok: supertrendOK, direction: supertrend?.direction, value: supertrend?.value },
            chikouFilter: { ok: chikouOK, direction: chikouAdvanced?.direction, confirmed: chikouAdvanced?.confirmed },
            rejectReason: !tradeable ? this.getRejectReason(signalDirection, hasStrongScore, hasMinConfluence, rsiOK, adxOK, meetsWinProb, preset, trendOK, macdTrendOK, supertrendOK, chikouOK) : null
        };
    }
    
    /**
     * Retourne la raison du rejet
     */
    getRejectReason(direction, hasScore, hasConf, rsiOK, adxOK, winProbOK, preset, trendOK = true, macdTrendOK = true, supertrendOK = true, chikouOK = true) {
        if (!direction) return 'Pas de signal directionnel';
        if (!trendOK) return 'Contre-tendance EMA200 (BLOQUÉ)';
        if (!macdTrendOK) return 'MACD contre le signal (BLOQUÉ)';
        if (!supertrendOK) return 'Supertrend contre le signal (BLOQUÉ)';
        if (!chikouOK) return 'Chikou ne confirme pas (BLOQUÉ)';
        if (!hasScore) return `Score insuffisant (min: ${preset.minScore})`;
        if (!hasConf) return `Confluence insuffisante (min: ${preset.minConfluence})`;
        if (!rsiOK) return 'RSI hors limites';
        if (!adxOK) return `ADX trop faible (min: ${preset.adxMin})`;
        if (!winProbOK) return `Probabilité trop faible (min: ${(preset.minWinProbability*100).toFixed(0)}%)`;
        return 'Inconnu';
    }

    /**
     * Analyse avec la stratégie Smart Money Concepts (SMC)
     * @param {string} symbol 
     * @param {string} timeframe 
     * @param {Array} candles 
     * @param {number} currentPrice 
     * @param {Object} preset 
     * @param {Object} tpsl 
     * @returns {Object}
     */
    async analyzeWithSMC(symbol, timeframe, candles, currentPrice, preset, tpsl) {
        // Analyse SMC
        const smcAnalysis = smcSignalDetector.analyze(candles, {
            minScore: this.config.minScore || preset.minScore,
            minConfluence: preset.minConfluence,
            useRSIFilter: this.config.useRSIFilter,
            useMACDFilter: true,
            useVolumeFilter: true,
            useSessionFilter: true
        }, timeframe);

        if (!smcAnalysis || !smcAnalysis.signal) {
            return {
                success: true,
                symbol,
                timeframe,
                strategy: 'smc',
                currentPrice,
                tradeable: false,
                rejectReason: smcAnalysis?.rejectReason || 'Pas de signal SMC'
            };
        }

        const signal = smcAnalysis.signal;
        const tradeable = smcAnalysis.tradeable;

        // Calcul des niveaux TP/SL
        let stopLoss = smcAnalysis.suggestedSL;
        let takeProfit = smcAnalysis.suggestedTP;
        let slPercent = smcAnalysis.suggestedSLPercent;
        let tpPercent = smcAnalysis.suggestedTPPercent;

        // Fallback sur les valeurs par défaut si pas de niveaux SMC
        if (!stopLoss || !takeProfit) {
            if (signal.direction === 'long') {
                slPercent = tpsl.sl;
                tpPercent = tpsl.tp;
                stopLoss = currentPrice * (1 - slPercent / 100);
                takeProfit = currentPrice * (1 + tpPercent / 100);
            } else if (signal.direction === 'short') {
                slPercent = tpsl.sl;
                tpPercent = tpsl.tp;
                stopLoss = currentPrice * (1 + slPercent / 100);
                takeProfit = currentPrice * (1 - tpPercent / 100);
            }
        }

        const rrr = slPercent && tpPercent ? tpPercent / slPercent : 2;

        return {
            success: true,
            symbol,
            timeframe,
            strategy: 'smc',
            currentPrice,
            tradeable,
            direction: signal.direction,
            score: signal.absScore,
            confluence: smcAnalysis.confluence,
            winProbability: smcAnalysis.winProbability,
            // Niveaux TP/SL
            stopLoss,
            takeProfit,
            slPercent,
            tpPercent,
            rrr,
            // Données SMC
            smcData: smcAnalysis.smcData,
            marketStructure: smcAnalysis.smcData?.structure?.trend,
            currentZone: smcAnalysis.smcData?.premiumDiscount?.currentZone,
            session: smcAnalysis.smcData?.session,
            // Indicateurs
            indicators: smcAnalysis.indicators,
            // Raisons
            reasons: signal.reasons,
            rejectReason: !tradeable ? smcAnalysis.rejectReason : null
        };
    }

    /**
     * Analyse avec la stratégie Bollinger Squeeze
     * @param {string} symbol 
     * @param {string} timeframe 
     * @param {Array} candles 
     * @param {number} currentPrice 
     * @param {Object} preset 
     * @param {Object} tpsl 
     * @returns {Object}
     */
    async analyzeWithBollinger(symbol, timeframe, candles, currentPrice, preset, tpsl) {
        // Analyse Bollinger Squeeze
        const bbAnalysis = signalDetector.analyzeBollingerSqueeze(candles, timeframe, {
            bbPeriod: this.config.bbPeriod || 20,
            bbStdDev: this.config.bbStdDev || 2,
            kcPeriod: this.config.kcPeriod || 20,
            kcMultiplier: this.config.kcMultiplier || 1.5,
            momentumPeriod: this.config.momentumPeriod || 12
        });

        if (!bbAnalysis || !bbAnalysis.success || !bbAnalysis.signal) {
            return {
                success: true,
                symbol,
                timeframe,
                strategy: 'bollinger',
                currentPrice,
                tradeable: false,
                rejectReason: 'Pas de signal Bollinger Squeeze'
            };
        }

        const signal = bbAnalysis.signal;
        const direction = signal.direction === 'bullish' ? 'long' : 
                         signal.direction === 'bearish' ? 'short' : null;

        if (!direction) {
            return {
                success: true,
                symbol,
                timeframe,
                strategy: 'bollinger',
                currentPrice,
                tradeable: false,
                rejectReason: 'Direction non déterminée'
            };
        }

        // Calcul des niveaux TP/SL
        let stopLoss, takeProfit, slPercent, tpPercent;
        
        if (direction === 'long') {
            slPercent = tpsl.sl;
            tpPercent = tpsl.tp;
            stopLoss = currentPrice * (1 - slPercent / 100);
            takeProfit = currentPrice * (1 + tpPercent / 100);
        } else {
            slPercent = tpsl.sl;
            tpPercent = tpsl.tp;
            stopLoss = currentPrice * (1 + slPercent / 100);
            takeProfit = currentPrice * (1 - tpPercent / 100);
        }

        const rrr = tpPercent / slPercent;

        // Vérification de tradabilité - ASSOUPLI pour permettre les SHORT
        // On ne bloque plus basé sur RSI ou autres filtres stricts
        const tradeable = signal.strength >= 0.3 && bbAnalysis.winProbability >= (this.config.minWinProbability || 0.55);

        return {
            success: true,
            symbol,
            timeframe,
            strategy: 'bollinger',
            currentPrice,
            tradeable,
            direction,
            score: Math.abs(signal.score || 5),
            confluence: (signal.rsiConfirms ? 1 : 0) + (signal.volumeConfirms ? 1 : 0) + 1,
            winProbability: bbAnalysis.winProbability,
            // Niveaux TP/SL
            stopLoss,
            takeProfit,
            slPercent,
            tpPercent,
            rrr,
            // Données Bollinger
            squeeze: bbAnalysis.squeeze,
            momentum: bbAnalysis.momentum,
            bollingerBands: bbAnalysis.bollingerBands,
            // Indicateurs
            indicators: bbAnalysis.indicators,
            // Raisons
            reasons: [signal.description],
            rejectReason: !tradeable ? 'Signal trop faible ou probabilité insuffisante' : null
        };
    }

    /**
     * Analyse un symbole spécifique (méthode legacy pour compatibilité)
     * @param {string} symbol 
     * @returns {Promise<Object>}
     */
    async analyzeSymbol(symbol) {
        const timeframe = this.config.timeframes[0];
        return this.analyzeSymbolOnTimeframe(symbol, timeframe);
    }
    
    /**
     * Analyse un symbole spécifique (ancienne méthode complète)
     * @param {string} symbol 
     * @returns {Promise<Object>}
     */
    async analyzeSymbolFull(symbol) {
        const timeframe = this.config.timeframes[0];
        const candles = await priceFetcher.getCandles(symbol, timeframe, 250); // Plus de données pour EMA200
        
        if (!candles || candles.length < 60) {
            return { success: false, symbol, error: 'Données insuffisantes' };
        }
        
        const currentPrice = candles[candles.length - 1].close;
        
        // ===== ANALYSE MULTI-TIMEFRAME =====
        let mtfAnalysis = null;
        let mtfConfirmed = true; // Par défaut, pas de blocage si MTF désactivé
        let mtfBonus = 0;
        
        if (this.config.multiTimeframeMode) {
            try {
                // Récupère les données pour chaque timeframe configuré
                const mtfTimeframes = this.config.mtfTimeframes || ['5m', '15m', '1h'];
                const mtfResults = {};
                
                for (const tf of mtfTimeframes) {
                    const tfCandles = await priceFetcher.getCandles(symbol, tf, 100);
                    if (tfCandles && tfCandles.length >= 30) {
                        const tfAnalysis = signalDetector.analyze(tfCandles, {}, tf);
                        mtfResults[tf] = {
                            timeframe: tf,
                            score: tfAnalysis.ichimokuScore?.score || 0,
                            direction: tfAnalysis.ichimokuScore?.direction || 'neutral',
                            signal: tfAnalysis.finalSignal?.action || null,
                            confidence: tfAnalysis.finalSignal?.confidence || 'low',
                            indicatorScore: tfAnalysis.indicators?.score || 0
                        };
                    }
                }
                
                // Calcule le consensus multi-timeframe
                let bullishCount = 0;
                let bearishCount = 0;
                let weightedScore = 0;
                let totalWeight = 0;
                
                const weights = this.config.mtfWeights || { '5m': 0.25, '15m': 0.30, '1h': 0.25, '4h': 0.20 };
                
                for (const [tf, result] of Object.entries(mtfResults)) {
                    const weight = weights[tf] || 0.25;
                    if (result.direction === 'bullish' || result.signal === 'BUY') {
                        bullishCount++;
                        weightedScore += Math.abs(result.score) * weight;
                    } else if (result.direction === 'bearish' || result.signal === 'SELL') {
                        bearishCount++;
                        weightedScore -= Math.abs(result.score) * weight;
                    }
                    totalWeight += weight;
                }
                
                const minConfirmation = this.config.mtfMinConfirmation || 2;
                const dominantDirection = bullishCount > bearishCount ? 'bullish' : 
                                         bearishCount > bullishCount ? 'bearish' : 'neutral';
                const confirmationCount = Math.max(bullishCount, bearishCount);
                
                mtfAnalysis = {
                    timeframes: mtfResults,
                    bullishCount,
                    bearishCount,
                    dominantDirection,
                    confirmationCount,
                    aligned: confirmationCount >= minConfirmation,
                    weightedScore: totalWeight > 0 ? weightedScore / totalWeight : 0
                };
                
                // Vérifie si le signal principal est confirmé par les autres TF
                mtfConfirmed = confirmationCount >= minConfirmation;
                
                // Bonus si tous les TF sont alignés
                if (confirmationCount === Object.keys(mtfResults).length && confirmationCount >= 2) {
                    mtfBonus = 2; // +2 points si parfaitement aligné
                    this.log(`${symbol}: MTF parfaitement aligné (${confirmationCount} TF ${dominantDirection}) +${mtfBonus} bonus`, 'info');
                } else if (mtfConfirmed) {
                    mtfBonus = 1; // +1 point si confirmé
                }
                
            } catch (e) {
                this.log(`${symbol}: Erreur MTF: ${e.message}`, 'warn');
            }
        }
        
        // Analyse avec réglages Ichimoku optimisés pour le timeframe
        const analysis = signalDetector.analyze(candles, {}, timeframe);
        
        // L'analyse avancée est maintenant intégrée dans signalDetector.analyze()
        const advancedAnalysis = analysis.indicators;
        
        // ===== FUNDING RATE - SECRET ULTIME =====
        // Funding très négatif = trop de shorts = squeeze probable vers le haut
        // Funding très positif = trop de longs = dump probable vers le bas
        let fundingRate = { rate: 0, signal: 'neutral', strength: 0 };
        try {
            fundingRate = await api.getFundingRate(symbol);
        } catch (e) {
            // Ignore les erreurs de funding rate
        }
        
        // Calcul du changement 24h
        const change24h = candles.length >= 24
            ? ((currentPrice - candles[candles.length - 24].close) / candles[candles.length - 24].close) * 100
            : 0;
        
        // ===== NOUVEAU SYSTÈME DE QUALITÉ DES SIGNAUX =====
        const ichimokuScore = analysis.ichimokuScore?.score || 0;
        const absIchimokuScore = Math.abs(ichimokuScore);
        const minScore = this.config.minScore || 3;
        
        // Récupère le score de qualité des indicateurs avancés
        const signalQuality = advancedAnalysis?.signalQuality || null;
        const indicatorScore = advancedAnalysis?.score || 0;
        const confluence = advancedAnalysis?.confluence || 0;
        
        // Signal valide si score >= minScore OU si signal détecté
        const hasStrongIchimokuScore = absIchimokuScore >= minScore;
        const hasSignal = analysis.finalSignal?.action === 'BUY' || analysis.finalSignal?.action === 'SELL';
        const hasConfidence = ['medium', 'high'].includes(analysis.finalSignal?.confidence);
        
        // ===== FILTRE MOMENTUM GLOBAL =====
        // Vérifie que le trade est dans le sens du momentum
        const rsi = advancedAnalysis?.rsi?.value || 50;
        const macdHistogram = advancedAnalysis?.macd?.histogram || 0;
        const ema200Position = advancedAnalysis?.ema200?.position || 'neutral';
        const signalDirection = analysis.finalSignal?.action === 'BUY' ? 'long' : 'short';
        
        // ===== VWAP + CVD + RSI - COMBO SCALPING PRO =====
        const vwap = advancedAnalysis?.vwap || {};
        const cvd = advancedAnalysis?.cvd || {};
        const vwapPosition = vwap.position || 'neutral'; // 'above' ou 'below'
        const cvdTrend = cvd.trend || 'neutral'; // 'bullish', 'bearish', 'neutral'
        const cvdDivergence = cvd.divergence || 'none';
        
        // Momentum aligné - OPTIMISÉ CRYPTO SCALPING avec VWAP + CVD + Funding
        // Utilise les presets du timeframe pour les seuils RSI
        // + Funding Rate comme bonus/malus
        let momentumAligned = true;
        let fundingBonus = 0;
        
        // Récupère les seuils RSI du preset (ou valeurs par défaut)
        const presetRsiLongMax = this.config.presetRsiLongMax || 75;
        const presetRsiShortMin = this.config.presetRsiShortMin || 25;
        
        // Score Ichimoku fort = tendance confirmée, on assouplit encore le RSI
        const strongTrend = absIchimokuScore >= 6;
        
        if (signalDirection === 'long') {
            // Zone RSI pour LONG basée sur le preset du timeframe
            // En tendance forte, on étend encore de 10 points
            const rsiMax = strongTrend ? Math.min(90, presetRsiLongMax + 10) : presetRsiLongMax;
            const rsiOK = rsi >= 20 && rsi <= rsiMax;
            // MACD doit être positif OU en train de monter
            const macdOK = macdHistogram > -0.3 || (advancedAnalysis?.macd?.crossover === 'bullish');
            // VWAP: prix au-dessus = biais haussier
            const vwapOK = vwapPosition === 'above';
            // CVD: tendance haussière = pression acheteuse
            const cvdOK = cvdTrend === 'bullish' || cvdDivergence === 'bullish';
            // EMA comme backup
            const emaOK = ema200Position === 'above';
            
            // Funding Rate négatif = SHORT SQUEEZE probable = BONUS pour LONG
            if (fundingRate.signal === 'bullish') {
                fundingBonus = Math.round(fundingRate.strength * 2); // +1 à +2 points
                this.log(`${symbol}: Funding négatif (${(fundingRate.rate * 100).toFixed(3)}%) - Short squeeze probable! +${fundingBonus} bonus`, 'info');
            } else if (fundingRate.signal === 'bearish') {
                fundingBonus = -1; // Malus si funding très positif
            }
            
            // Combo gagnant: RSI OK + (VWAP OU CVD OU MACD OU EMA)
            // OU tendance très forte (score 7/7) avec au moins MACD OK
            momentumAligned = (rsiOK && (vwapOK || cvdOK || macdOK || emaOK)) || 
                             (absIchimokuScore >= 7 && macdOK);
            
        } else if (signalDirection === 'short') {
            // Zone RSI pour SHORT - TRÈS ASSOUPLI pour permettre les corrections en bull market
            // RSI entre 30 et 85 accepté (on peut shorter même avec RSI élevé = surachat)
            const rsiOK = rsi >= 20 && rsi <= 85;
            
            // MACD: accepte si négatif, en baisse, OU simplement < 1.0 (pas fortement haussier)
            const macdOK = macdHistogram < 1.0 || (advancedAnalysis?.macd?.crossover === 'bearish');
            
            // VWAP: prix en-dessous = biais baissier (bonus, pas obligatoire)
            const vwapOK = vwapPosition === 'below';
            // CVD: tendance baissière = pression vendeuse (bonus, pas obligatoire)
            const cvdOK = cvdTrend === 'bearish' || cvdDivergence === 'bearish';
            // EMA: pas utilisé comme filtre pour SHORT en bull market
            // car le prix est souvent au-dessus de l'EMA200
            
            // Funding Rate positif = LONG SQUEEZE probable = BONUS pour SHORT
            if (fundingRate.signal === 'bearish') {
                fundingBonus = Math.round(fundingRate.strength * 2); // +1 à +2 points
                this.log(`${symbol}: Funding positif (${(fundingRate.rate * 100).toFixed(3)}%) - Long squeeze probable! +${fundingBonus} bonus`, 'info');
            } else if (fundingRate.signal === 'bullish') {
                fundingBonus = -1; // Malus si funding très négatif
            }
            
            // MOMENTUM ASSOUPLI POUR SHORT:
            // En bull market, les corrections sont normales et tradables
            // On accepte le SHORT si:
            // 1. RSI OK (large plage 20-85)
            // 2. ET (MACD pas trop haussier OU score Ichimoku fort)
            // Les indicateurs VWAP/CVD sont des bonus, pas des bloqueurs
            momentumAligned = rsiOK && (macdOK || absIchimokuScore >= 5);
        }
        
        // ===== FILTRE CONFLUENCE MINIMUM =====
        // Utilise le preset du timeframe, avec assouplissement si score fort
        const presetMinConfluence = this.config.presetMinConfluence || 2;
        let minConfluence = presetMinConfluence;
        // Si score Ichimoku très fort, on réduit l'exigence de confluence
        if (absIchimokuScore >= 7) {
            minConfluence = Math.max(1, presetMinConfluence - 1);
        }
        const hasMinConfluence = confluence >= minConfluence;
        
        // Calcul de la probabilité de gain (amélioré avec VWAP, CVD, Funding Rate et MTF)
        const totalBonus = fundingBonus + mtfBonus; // Combine funding + MTF bonus
        const winProbability = this.calculateWinProbability(ichimokuScore, analysis.finalSignal?.confidence, signalQuality, totalBonus);
        const minWinProb = this.config.minWinProbability || 0.65;
        
        // ===== NOUVEAUX FILTRES DE SÉCURITÉ =====
        const filters = advancedAnalysis?.filters || {};
        const filtersPassed = advancedAnalysis?.filtersPassed || 0;
        const filtersTotal = advancedAnalysis?.filtersTotal || 5;
        const fakeout = advancedAnalysis?.fakeout || { isFakeout: false };
        const liquidity = advancedAnalysis?.liquidity || { sufficient: true };
        const adx = advancedAnalysis?.adx || { value: 0, trend: 'weak' };
        const atr = advancedAnalysis?.atr || { volatility: 'normal' };
        
        // ===== FILTRE ANTI-RANGE : ADX minimum =====
        // Utilise le preset du timeframe pour le seuil ADX
        // NOTE: Si ADX = 0, c'est un bug de calcul, on ignore le filtre
        const presetAdxMin = this.config.presetAdxMin || 15;
        const adxValue = adx.value || 0;
        // Si ADX = 0, on considère que le calcul a échoué et on ne bloque pas
        const adxValid = adxValue > 0;
        const isRangeMarket = adxValid && adxValue < presetAdxMin;
        const isStrongTrend = adxValid && adxValue >= (presetAdxMin + 10);
        
        // ===== FILTRE VOLATILITÉ =====
        // Évite les trades en très faible volatilité (consolidation)
        const isLowVolatility = atr.volatility === 'low';
        
        // ===== CRITÈRES DE TRADABILITÉ AMÉLIORÉS =====
        // Un signal est tradeable si:
        // 1. Le score de qualité est suffisant (grade A, B ou C avec confluence >= 3)
        // 2. OU score Ichimoku fort + signal détecté
        // 3. ET probabilité de gain >= seuil
        // 4. ET pas de fakeout détecté
        // 5. ET liquidité suffisante
        // 6. ET pas en range (ADX valide et >= seuil) OU score très fort (7/7) OU ADX invalide
        const qualityTradeable = signalQuality?.tradeable || 
                                (signalQuality?.minimumMet) ||
                                (confluence >= 2 && Math.abs(indicatorScore) >= 20);
        
        const ichimokuTradeable = hasStrongIchimokuScore && hasSignal && hasConfidence;
        
        // Filtres de sécurité obligatoires
        const safetyFiltersOK = !fakeout.isFakeout && liquidity.sufficient;
        
        // Filtre anti-range ASSOUPLI:
        // Autorise le trade si:
        // - ADX invalide (= 0, bug de calcul) → on ignore le filtre
        // - ADX >= seuil (pas en range)
        // - Score Ichimoku >= 6 (tendance confirmée par Ichimoku)
        // - Tendance forte (ADX >= trend threshold)
        const antiRangeOK = !adxValid ||           // ADX invalide = on ignore
                          !isRangeMarket ||        // Pas en range
                          absIchimokuScore >= 6 || // Score fort = tendance confirmée
                          isStrongTrend;           // ADX montre tendance forte
        
        // Filtre anti-consolidation ASSOUPLI
        // Évite les trades en très faible volatilité sauf si signal fort
        const volatilityOK = !isLowVolatility || absIchimokuScore >= 5;
        
        // ===== FILTRE TIMEFRAME =====
        // Utilise le minScore du preset - le filtre est déjà géré par hasStrongIchimokuScore
        // On vérifie juste que le score atteint le minimum du preset
        const timeframeFilterOK = absIchimokuScore >= (this.config.minScore || 3) || 
                                  (absIchimokuScore >= (this.config.minScore - 1) && confluence >= minConfluence);
        
        // ===== FILTRE MULTI-TIMEFRAME =====
        // Si MTF activé, vérifie que la direction est confirmée par les autres TF
        let mtfFilterOK = true;
        if (this.config.multiTimeframeMode && mtfAnalysis) {
            const signalDir = signalDirection === 'long' ? 'bullish' : 'bearish';
            mtfFilterOK = mtfAnalysis.dominantDirection === signalDir || mtfAnalysis.dominantDirection === 'neutral';
        }
        
        const tradeable = (qualityTradeable || ichimokuTradeable) && 
                         winProbability >= minWinProb && 
                         safetyFiltersOK &&
                         antiRangeOK &&
                         volatilityOK &&
                         momentumAligned &&
                         hasMinConfluence &&
                         timeframeFilterOK &&
                         mtfFilterOK;
        
        // Log si trade rejeté par les nouveaux filtres
        if ((qualityTradeable || ichimokuTradeable) && winProbability >= minWinProb && safetyFiltersOK) {
            if (!antiRangeOK) {
                this.log(`${symbol}: Rejeté - Marché en RANGE (ADX=${adxValue.toFixed(1)})`, 'warn');
            }
            if (!volatilityOK) {
                this.log(`${symbol}: Rejeté - Volatilité trop faible`, 'warn');
            }
            if (!momentumAligned) {
                this.log(`${symbol}: Rejeté - Momentum non aligné (RSI=${rsi.toFixed(0)}, MACD=${macdHistogram.toFixed(3)})`, 'warn');
            }
            if (!hasMinConfluence) {
                this.log(`${symbol}: Rejeté - Confluence insuffisante (${confluence}/${minConfluence})`, 'warn');
            }
            if (!timeframeFilterOK) {
                this.log(`${symbol}: Rejeté - Score trop faible pour ${timeframe} (${absIchimokuScore}/7)`, 'warn');
            }
            if (!mtfFilterOK) {
                this.log(`${symbol}: Rejeté - MTF non aligné (${mtfAnalysis?.dominantDirection} vs ${signalDirection})`, 'warn');
            }
        }
        
        // Extrait les indicateurs techniques pour le dashboard
        const indicatorsData = {
            // Indicateurs de base
            rsi: advancedAnalysis?.rsi?.value,
            stochRsi: advancedAnalysis?.stochRsi ? {
                k: advancedAnalysis.stochRsi.k,
                d: advancedAnalysis.stochRsi.d,
                signal: advancedAnalysis.stochRsi.signal
            } : null,
            macd: advancedAnalysis?.macd ? {
                histogram: advancedAnalysis.macd.histogram,
                signal: advancedAnalysis.macd.signal,
                crossover: advancedAnalysis.macd.crossover
            } : null,
            bollinger: advancedAnalysis?.bollinger ? {
                position: advancedAnalysis.bollinger.position,
                squeeze: advancedAnalysis.bollinger.squeeze
            } : null,
            volume: advancedAnalysis?.volume ? {
                ratio: advancedAnalysis.volume.ratio,
                spike: advancedAnalysis.volume.spike,
                trend: advancedAnalysis.volume.trend
            } : null,
            // Nouveaux indicateurs scalping
            vwap: advancedAnalysis?.vwap ? {
                value: advancedAnalysis.vwap.vwap,
                position: advancedAnalysis.vwap.position,
                distance: advancedAnalysis.vwap.distance,
                signal: advancedAnalysis.vwap.signal
            } : null,
            cvd: advancedAnalysis?.cvd ? {
                trend: advancedAnalysis.cvd.trend,
                divergence: advancedAnalysis.cvd.divergence,
                strength: advancedAnalysis.cvd.strength
            } : null,
            scalpingEMAs: advancedAnalysis?.scalpingEMAs ? {
                trend: advancedAnalysis.scalpingEMAs.trend,
                crossover: advancedAnalysis.scalpingEMAs.crossover
            } : null,
            ema200: advancedAnalysis?.ema200 ? {
                position: advancedAnalysis.ema200.position,
                distance: advancedAnalysis.ema200.distance
            } : null,
            // Nouveaux indicateurs de filtrage
            atr: advancedAnalysis?.atr ? {
                value: advancedAnalysis.atr.atr,
                percent: advancedAnalysis.atr.atrPercent,
                volatility: advancedAnalysis.atr.volatility
            } : null,
            adx: advancedAnalysis?.adx ? {
                value: advancedAnalysis.adx.adx,
                trendStrength: advancedAnalysis.adx.trendStrength,
                trending: advancedAnalysis.adx.trending,
                direction: advancedAnalysis.adx.trendDirection
            } : null,
            momentum: advancedAnalysis?.momentum ? {
                percent: advancedAnalysis.momentum.momentumPercent,
                signal: advancedAnalysis.momentum.signal,
                increasing: advancedAnalysis.momentum.increasing
            } : null
        };
        
        return {
            success: true,
            symbol,
            price: currentPrice,
            change24h: change24h.toFixed(2),
            // Scores
            score: ichimokuScore,
            indicatorScore,
            maxScore: analysis.ichimokuScore?.maxScore || 7,
            direction: analysis.ichimokuScore?.direction || 'neutral',
            signal: analysis.finalSignal,
            // Qualité du signal (avec filtres)
            signalQuality: signalQuality ? {
                score: signalQuality.score,
                grade: signalQuality.grade,
                tradeable: signalQuality.tradeable,
                factors: signalQuality.factors,
                filtersPassed: signalQuality.filtersPassed,
                filtersTotal: signalQuality.filtersTotal
            } : null,
            confluence,
            confluenceBonus: advancedAnalysis?.confluenceBonus || 'low',
            // Filtres de sécurité
            filters,
            filtersPassed,
            filtersTotal,
            fakeout: fakeout.isFakeout ? {
                detected: true,
                reasons: fakeout.reasons
            } : { detected: false },
            liquidity: {
                sufficient: liquidity.sufficient,
                warning: liquidity.warning
            },
            // Tradabilité
            tradeable,
            winProbability,
            winProbabilityPercent: (winProbability * 100).toFixed(1) + '%',
            // Données Ichimoku
            ichimoku: analysis.ichimoku,
            ichimokuScore: analysis.ichimokuScore,
            levels: analysis.levels,
            detectedSignals: analysis.detectedSignals,
            // Indicateurs techniques (enrichis)
            indicators: indicatorsData,
            // Signaux détaillés
            signalsList: advancedAnalysis?.signalsList || [],
            bullishSignals: advancedAnalysis?.bullishSignals || 0,
            bearishSignals: advancedAnalysis?.bearishSignals || 0,
            // Recommandation
            recommendation: analysis.recommendation,
            // ===== FUNDING RATE =====
            fundingRate: {
                rate: fundingRate.rate,
                ratePercent: fundingRate.ratePercent,
                signal: fundingRate.signal,
                strength: fundingRate.strength,
                bonus: fundingBonus,
                description: fundingRate.description
            },
            // ===== MULTI-TIMEFRAME =====
            multiTimeframe: mtfAnalysis ? {
                enabled: this.config.multiTimeframeMode,
                timeframes: mtfAnalysis.timeframes,
                bullishCount: mtfAnalysis.bullishCount,
                bearishCount: mtfAnalysis.bearishCount,
                dominantDirection: mtfAnalysis.dominantDirection,
                aligned: mtfAnalysis.aligned,
                confirmed: mtfConfirmed,
                bonus: mtfBonus,
                weightedScore: mtfAnalysis.weightedScore
            } : { enabled: false },
            timestamp: Date.now()
        };
    }
    
    /**
     * Synchronise les positions internes avec les positions réelles sur l'exchange
     * - Ajoute les positions réelles qui ne sont pas trackées (ex: après redémarrage)
     * - Retire les positions fermées par TP/SL
     */
    async syncPositionsWithExchange() {
        try {
            const realPositions = await api.getPositions();
            
            // Filtre les positions avec une taille > 0
            const activeRealPositions = realPositions.filter(p => {
                const size = parseFloat(p.szi || p.size || 0);
                return Math.abs(size) > 0;
            });
            
            const realSymbols = new Set(activeRealPositions.map(p => p.coin || p.symbol));
            
            // 1. AJOUTE les positions réelles qui ne sont pas dans activePositions
            // (important après un redémarrage du bot)
            for (const pos of activeRealPositions) {
                const symbol = pos.coin || pos.symbol;
                if (!this.state.activePositions.has(symbol)) {
                    const size = parseFloat(pos.szi || pos.size || 0);
                    const entryPrice = parseFloat(pos.entryPx || pos.entryPrice || 0);
                    const direction = size > 0 ? 'long' : 'short';
                    
                    this.state.activePositions.set(symbol, {
                        symbol,
                        direction,
                        entryPrice,
                        size: Math.abs(size),
                        openedAt: Date.now(),
                        fromSync: true // Marqueur pour indiquer que c'est une position récupérée
                    });
                    
                    this.log(`📥 Position ${symbol} détectée sur l'exchange (${direction})`, 'info');
                }
            }
            
            // 2. RETIRE les positions fermées (qui ne sont plus sur l'exchange)
            const closedPositions = [];
            for (const [symbol, position] of this.state.activePositions) {
                if (!realSymbols.has(symbol)) {
                    closedPositions.push(symbol);
                }
            }
            
            for (const symbol of closedPositions) {
                this.state.activePositions.delete(symbol);
                this.log(`📤 Position ${symbol} fermée (TP/SL atteint ou fermeture manuelle)`, 'trade');
                positionManager.untrackPosition(symbol);
            }
            
            return {
                realCount: activeRealPositions.length,
                trackedCount: this.state.activePositions.size,
                closed: closedPositions
            };
        } catch (error) {
            this.log(`Erreur sync positions: ${error.message}`, 'warn');
            return null;
        }
    }
    
    /**
     * Traite les opportunités multi-crypto
     * SÉCURITÉ MAXIMALE: Verrous + vérification exchange + limite stricte
     * @param {Array} opportunities 
     */
    async processMultiOpportunities(opportunities) {
        // VERROU GLOBAL: Empêche les traitements simultanés
        if (this.state.isProcessingTrades) {
            this.log(`Traitement en cours, skip...`, 'info');
            return;
        }
        
        // ===== PROTECTION PERTES CONSÉCUTIVES =====
        // Vérifie si le bot est en pause après trop de pertes
        if (this.pausedUntil > Date.now()) {
            const remainingMin = Math.ceil((this.pausedUntil - Date.now()) / 60000);
            this.log(`⏸️ Bot en pause (${this.consecutiveLosses} pertes consécutives). Reprise dans ${remainingMin} min`, 'warn');
            return;
        }
        
        this.state.isProcessingTrades = true;
        
        try {
            // ÉTAPE 1: Récupère les positions RÉELLES sur l'exchange (source de vérité)
            // IMPORTANT: Utilise l'adresse de trading pour récupérer les bonnes positions
            const tradingAddress = auth.getBalanceAddress();
            let realPositions = [];
            try {
                realPositions = await api.getPositions(tradingAddress);
                this.log(`Positions récupérées pour ${tradingAddress?.slice(0,10)}...: ${realPositions.length}`, 'info');
            } catch (e) {
                this.log(`Erreur récupération positions: ${e.message}`, 'error');
                return;
            }
            
            // Filtre les positions avec une taille > 0
            const activeRealPositions = realPositions.filter(p => {
                const size = parseFloat(p.szi || p.size || 0);
                return Math.abs(size) > 0;
            });
            
            // Crée un Set des symboles avec position ouverte
            const symbolsWithPosition = new Set(activeRealPositions.map(p => p.coin || p.symbol));
            
            // Met à jour activePositions avec les positions réelles
            this.state.activePositions.clear();
            for (const pos of activeRealPositions) {
                const symbol = pos.coin || pos.symbol;
                const size = parseFloat(pos.szi || pos.size || 0);
                this.state.activePositions.set(symbol, {
                    symbol,
                    direction: size > 0 ? 'long' : 'short',
                    entryPrice: parseFloat(pos.entryPx || 0),
                    size: Math.abs(size)
                });
            }
            
            const activeCount = activeRealPositions.length;
            
            // ÉTAPE 2: Vérifie si on peut ouvrir de nouvelles positions
            if (activeCount >= this.config.maxConcurrentTrades) {
                this.log(`Max trades atteint (${activeCount}/${this.config.maxConcurrentTrades})`, 'info');
                return;
            }
            
            const maxNew = this.config.maxConcurrentTrades - activeCount;
            
            // ÉTAPE 3: Filtre les opportunités
            const validOpportunities = opportunities.filter(opp => {
                // BLOQUE si position existe sur ce symbole
                if (symbolsWithPosition.has(opp.symbol)) return false;
                // BLOQUE si trade en cours sur ce symbole
                if (this.state.tradingLocks.has(opp.symbol)) return false;
                return true;
            });
            
            if (validOpportunities.length === 0) {
                return;
            }
            
            // Prend UNE SEULE opportunité à la fois pour éviter les problèmes
            const opp = validOpportunities[0];
            
            // Vérifie que le signal existe
            if (!opp.signal) {
                const action = opp.score >= 3 ? 'BUY' : opp.score <= -3 ? 'SELL' : null;
                if (!action) return;
                opp.signal = action;
            }
            
            const tfInfo = opp.timeframe ? ` [${opp.timeframe}]` : '';
            this.log(`🎯 Opportunité ${opp.symbol}${tfInfo}: ${opp.signal} (score: ${opp.score})`, 'signal');
            
            // Exécute le trade (avec verrou)
            await this.executeTradeForSymbol(opp);
            
        } finally {
            // Libère le verrou global
            this.state.isProcessingTrades = false;
        }
    }
    
    /**
     * Exécute un trade pour un symbole spécifique
     * SÉCURITÉ: Verrou par symbole + double vérification exchange
     * @param {Object} opportunity 
     */
    async executeTradeForSymbol(opportunity) {
        const { symbol, price, levels } = opportunity;
        const signal = opportunity.signal || {};
        
        // Utilise le timeframe de l'opportunité (mode MTF) ou le timeframe par défaut
        const timeframe = opportunity.timeframe || this.config.timeframes[0];
        
        // Récupère les TP/SL et RRR du timeframe de l'opportunité
        const oppTpsl = opportunity.tpsl || this.TIMEFRAME_TPSL[timeframe] || { tp: 2.0, sl: 1.0 };
        const oppMinRRR = opportunity.minRRR || this.getTimeframePreset(timeframe).minRRR || 0.5;
        
        // Récupère les candles pour les filtres RSI et MTF
        let candles = null;
        try {
            candles = await priceFetcher.getCandles(symbol, timeframe, 100);
        } catch (e) {
            this.log(`${symbol}: Impossible de récupérer les candles pour filtres: ${e.message}`, 'warn');
        }
        
        // VERROU PAR SYMBOLE: Empêche les trades simultanés sur le même symbole
        if (this.state.tradingLocks.has(symbol)) {
            this.log(`${symbol}: Trade déjà en cours, skip`, 'info');
            return null;
        }
        
        // ===== ANTI-OVERTRADING: Cooldown par symbole =====
        const lastTradeForSymbol = this.state.lastTradeTime.get(symbol);
        if (lastTradeForSymbol) {
            const timeSinceLastTrade = Date.now() - lastTradeForSymbol;
            if (timeSinceLastTrade < this.antiOvertradingConfig.symbolCooldownMs) {
                const remainingMs = this.antiOvertradingConfig.symbolCooldownMs - timeSinceLastTrade;
                const remainingMin = (remainingMs / 60000).toFixed(1);
                this.log(`${symbol}: ⏳ Cooldown actif (${remainingMin}min restantes)`, 'info');
                return null;
            }
        }
        
        // ===== ANTI-OVERTRADING: Cooldown global =====
        const timeSinceGlobalTrade = Date.now() - this.lastGlobalTradeTime;
        if (timeSinceGlobalTrade < this.antiOvertradingConfig.globalCooldownMs) {
            this.log(`${symbol}: ⏳ Cooldown global actif`, 'info');
            return null;
        }
        
        // ===== ANTI-OVERTRADING: Limite trades consécutifs même direction =====
        const direction = signal.action === 'BUY' ? 'long' : 'short';
        if (direction === 'short' && this.state.consecutiveShorts >= this.antiOvertradingConfig.maxConsecutiveSameDirection) {
            this.log(`${symbol}: ⚠️ Trop de SHORTS consécutifs (${this.state.consecutiveShorts}), attente d'un LONG`, 'warn');
            return null;
        }
        if (direction === 'long' && this.state.consecutiveLongs >= this.antiOvertradingConfig.maxConsecutiveSameDirection) {
            this.log(`${symbol}: ⚠️ Trop de LONGS consécutifs (${this.state.consecutiveLongs}), attente d'un SHORT`, 'warn');
            return null;
        }
        
        // Pose le verrou
        this.state.tradingLocks.add(symbol);
        
        try {
            // VÉRIFICATION 1: Position dans notre état interne
            if (this.state.activePositions.has(symbol)) {
                this.log(`${symbol}: Position déjà ouverte (interne), skip`, 'info');
                return null;
            }
            
            // VÉRIFICATION 2: Position sur l'exchange (source de vérité)
            // IMPORTANT: Utilise l'adresse de trading
            const tradingAddress = auth.getBalanceAddress();
            const positions = await api.getPositions(tradingAddress);
            const existingPosition = positions.find(p => {
                const posSymbol = p.coin || p.symbol;
                const size = parseFloat(p.szi || p.size || 0);
                return posSymbol === symbol && Math.abs(size) > 0;
            });
            
            if (existingPosition) {
                this.log(`${symbol}: Position existe sur l'exchange, skip`, 'info');
                const size = parseFloat(existingPosition.szi || existingPosition.size || 0);
                this.state.activePositions.set(symbol, {
                    symbol,
                    direction: size > 0 ? 'long' : 'short',
                    entryPrice: parseFloat(existingPosition.entryPx || 0),
                    size: Math.abs(size)
                });
                return null;
            }
            
            // Vérifie la corrélation et le drawdown
            const canTradeCheck = correlationManager.canTrade(symbol, positions);
            
            if (!canTradeCheck.allowed) {
                this.log(`${symbol}: Trade bloqué - ${canTradeCheck.reasons.join(', ')}`, 'warn');
                return null;
            }
            
            // ========== FILTRE RSI ==========
            if (this.config.useRSIFilter && candles && candles.length > 14) {
                const closes = candles.map(c => c.close);
                const rsiResult = indicators.calculateRSI(closes);
                
                if (signal.action === 'BUY' && rsiResult.value >= this.config.rsiOverbought) {
                    this.log(`${symbol}: ❌ LONG bloqué - RSI en surachat (${rsiResult.value.toFixed(1)} >= ${this.config.rsiOverbought})`, 'warn');
                    return null;
                }
                
                if (signal.action === 'SELL' && rsiResult.value <= this.config.rsiOversold) {
                    this.log(`${symbol}: ❌ SHORT bloqué - RSI en survente (${rsiResult.value.toFixed(1)} <= ${this.config.rsiOversold})`, 'warn');
                    return null;
                }
                
                this.log(`${symbol}: ✅ RSI OK (${rsiResult.value.toFixed(1)})`, 'info');
            }
            
            // Utilise l'adresse de trading pour récupérer le solde
            const balanceAddress = auth.getBalanceAddress();
            const balance = await api.getAccountBalance(balanceAddress);
            const direction = signal.action === 'BUY' ? 'long' : 'short';
            
            // Vérifie qu'on a un solde suffisant
            if (!balance.totalEquity || balance.totalEquity < 1) {
                this.log(`${symbol}: Solde insuffisant ($${balance.totalEquity?.toFixed(2) || 0}) sur ${balanceAddress?.slice(0,10)}...`, 'warn');
                return null;
            }
            
            // Récupère les niveaux techniques suggérés par l'analyse
            const recommendation = opportunity.recommendation || {};
            
            // Récupère l'ATR si disponible (pour le mode ATR)
            const atrValue = opportunity.indicators?.atr?.value || 0;
            
            // Calcul SL/TP selon le mode configuré
            const sltp = riskManager.calculateSLTP(price, direction, {
                supportLevel: levels?.supports[0]?.level,
                resistanceLevel: levels?.resistances[0]?.level,
                // Niveaux techniques calculés par signalDetector
                technicalSL: recommendation.suggestedSL,
                technicalTP: recommendation.suggestedTP,
                slSource: recommendation.slSource,
                tpSource: recommendation.tpSource,
                // Mode TP/SL et paramètres
                tpslMode: this.config.tpslMode || 'auto',
                atrValue: atrValue,
                atrMultiplierSL: this.config.atrMultiplierSL || 1.5,
                atrMultiplierTP: this.config.atrMultiplierTP || 2.5,
                customSLPercent: this.config.defaultSL,
                customTPPercent: this.config.defaultTP
            });
            
            if (!sltp.meetsMinRRR) {
                const minRRR = riskManager.config.minRiskRewardRatio;
                if (minRRR > 0) {
                    this.log(`${symbol}: RRR insuffisant (${sltp.riskRewardRatio} < ${minRRR})`, 'warn');
                    return null;
                }
                // Si minRRR = 0 (OFF), on continue quand même
            }
            
            // Log la source des niveaux SL/TP
            if (sltp.usedTechnicalLevels) {
                this.log(`${symbol}: SL basé sur ${sltp.slSource}, TP basé sur ${sltp.tpSource}`, 'info');
            }
            
            // Calcul taille position
            const positionData = riskManager.calculatePositionSize(
                balance.totalEquity,
                price,
                sltp.stopLoss,
                this.config.leverage
            );
            
            // Vérifie que la taille est valide
            if (!positionData.size || positionData.size <= 0) {
                this.log(`${symbol}: Taille de position invalide`, 'warn');
                return null;
            }
            
            // Log détaillé avec score de qualité
            const qualityGrade = opportunity.signalQuality?.grade || 'N/A';
            const qualityScore = opportunity.signalQuality?.score || 0;
            const confluenceCount = opportunity.confluence || 0;
            const winProb = opportunity.winProbability ? (opportunity.winProbability * 100).toFixed(0) : 'N/A';
            
            this.log(`📊 TRADE ${signal.action} ${symbol}`, 'trade');
            this.log(`  🎯 Qualité: Grade ${qualityGrade} (${qualityScore}/100) | Confluence: ${confluenceCount} indicateurs | Win: ${winProb}%`, 'trade');
            this.log(`  💰 Prix: ${price} | SL: ${sltp.stopLoss} | TP: ${sltp.takeProfit}`, 'trade');
            this.log(`  📏 Taille: ${positionData.size.toFixed(4)} | RRR: ${sltp.riskRewardRatio} | Levier: ${this.config.leverage}x`, 'trade');
            
            // Log les facteurs de qualité
            if (opportunity.signalQuality?.factors?.length > 0) {
                this.log(`  📋 Facteurs: ${opportunity.signalQuality.factors.slice(0, 3).join(', ')}`, 'trade');
            }
            
            // Exécute
            const order = await api.placeOrderWithTPSL({
                symbol,
                isBuy: signal.action === 'BUY',
                size: positionData.size,
                price: price,
                takeProfit: sltp.takeProfit,
                stopLoss: sltp.stopLoss,
                leverage: this.config.leverage
            });
            
            // Stocke la position avec les détails d'analyse
            this.state.activePositions.set(symbol, {
                symbol,
                direction,
                entryPrice: price,
                size: positionData.size,
                stopLoss: sltp.stopLoss,
                takeProfit: sltp.takeProfit,
                openedAt: Date.now(),
                leverage: this.config.leverage,
                riskRewardRatio: sltp.riskRewardRatio,
                // Détails d'analyse pour affichage
                analysis: {
                    signalType: signal.type || 'unknown',
                    signalReason: signal.reason || signal.type || 'Signal Ichimoku',
                    qualityGrade: qualityGrade,
                    qualityScore: qualityScore,
                    winProbability: winProb,
                    confluence: confluenceCount,
                    factors: opportunity.signalQuality?.factors || [],
                    slSource: sltp.slSource || 'percent',
                    tpSource: sltp.tpSource || 'percent',
                    ichimokuScore: opportunity.ichimokuScore || 0,
                    timeframe: this.config.timeframe
                }
            });
            
            // ===== MISE À JOUR ANTI-OVERTRADING =====
            this.state.lastTradeTime.set(symbol, Date.now());
            this.lastGlobalTradeTime = Date.now();
            
            // Met à jour les compteurs de direction consécutive
            if (direction === 'short') {
                this.state.consecutiveShorts++;
                this.state.consecutiveLongs = 0;
            } else {
                this.state.consecutiveLongs++;
                this.state.consecutiveShorts = 0;
            }
            this.state.lastTradeDirection = direction;
            
            this.log(`📊 Anti-overtrading: ${direction.toUpperCase()} #${direction === 'short' ? this.state.consecutiveShorts : this.state.consecutiveLongs}`, 'info');
            
            // Track la position pour détecter les fermetures (TP/SL atteint)
            positionManager.trackPosition({
                symbol,
                side: direction,
                entryPrice: price,
                size: positionData.size,
                stopLoss: sltp.stopLoss,
                takeProfit: sltp.takeProfit
            });
            
            this.emit('onTrade', { symbol, signal, order });
            return order;
            
        } catch (error) {
            this.log(`Erreur trade ${symbol}: ${error.message}`, 'error');
            return null;
        } finally {
            // LIBÈRE LE VERROU dans tous les cas
            this.state.tradingLocks.delete(symbol);
        }
    }

    /**
     * Calcule les détails d'un trade potentiel pour un symbole
     * @param {string} symbol 
     * @param {Object} options - Options incluant strategy et timeframe
     * @returns {Promise<Object>}
     */
    async getTradeDetails(symbol, options = {}) {
        try {
            const strategy = options.strategy || this.config.strategy || 'ichimoku';
            const timeframe = options.timeframe || this.config.timeframes[0];
            const candles = await priceFetcher.getCandles(symbol, timeframe, 250);
            
            if (!candles || candles.length < 60) {
                return { success: false, error: 'Données insuffisantes' };
            }
            
            const currentPrice = candles[candles.length - 1].close;
            
            // Analyse selon la stratégie sélectionnée
            let fullAnalysis;
            let analysis;
            
            if (strategy === 'smc') {
                // Stratégie SMC
                const smcAnalysis = smcSignalDetector.analyze(candles, {}, timeframe);
                const smcScore = smcAnalysis.signal?.score || 0;
                const smcDirection = smcAnalysis.signal?.direction || 'neutral';
                
                fullAnalysis = {
                    ichimoku: {},
                    signals: {}
                };
                
                analysis = {
                    success: true,
                    score: smcDirection === 'long' ? smcScore : -smcScore,
                    direction: smcDirection === 'long' ? 'bullish' : smcDirection === 'short' ? 'bearish' : 'neutral',
                    signal: smcDirection === 'long' ? 'BUY' : smcDirection === 'short' ? 'SELL' : null,
                    tradeable: smcAnalysis.tradeable,
                    winProbability: smcAnalysis.winProbability || 0.6,
                    confluence: smcAnalysis.confluence || 0,
                    confidence: smcAnalysis.signal?.confidence > 0.7 ? 'high' : 'medium',
                    tpsl: { tp: 3.0, sl: 1.5 }
                };
            } else if (strategy === 'bollinger') {
                // Stratégie Bollinger Squeeze
                const bbAnalysis = signalDetector.analyzeBollingerSqueeze(candles, timeframe, {});
                const bbSignal = bbAnalysis.signal;
                const bbScore = bbSignal?.score || 0;
                const bbDirection = bbSignal?.direction || 'neutral';
                
                fullAnalysis = {
                    ichimoku: {},
                    signals: {}
                };
                
                analysis = {
                    success: true,
                    score: bbDirection === 'bullish' ? bbScore : -bbScore,
                    direction: bbDirection,
                    signal: bbSignal?.action || null,
                    tradeable: bbAnalysis.success && bbSignal,
                    winProbability: bbAnalysis.winProbability || 0.6,
                    confluence: (bbSignal?.rsiConfirms ? 1 : 0) + (bbSignal?.volumeConfirms ? 1 : 0),
                    confidence: bbSignal?.strength > 0.7 ? 'high' : 'medium',
                    tpsl: { tp: 2.5, sl: 1.2 }
                };
            } else {
                // Stratégie Ichimoku (par défaut)
                fullAnalysis = signalDetector.analyze(candles, {}, timeframe);
                analysis = await this.analyzeSymbol(symbol);
            }
            
            if (!analysis.success) {
                return { success: false, error: analysis.error };
            }
            
            const { score, direction, tradeable, winProbability: analysisWinProb, confluence } = analysis;
            
            // Récupère les niveaux Ichimoku depuis fullAnalysis
            const ichimokuData = fullAnalysis.ichimoku || {};
            const tenkan = ichimokuData.tenkan || ichimokuData.tenkanSen;
            const kijun = ichimokuData.kijun || ichimokuData.kijunSen;
            const senkouA = ichimokuData.senkouA || ichimokuData.senkouSpanA;
            const senkouB = ichimokuData.senkouB || ichimokuData.senkouSpanB;
            
            // Détermine la direction du trade
            const tradeDirection = analysis.signal === 'BUY' ? 'long' : 
                                   analysis.signal === 'SELL' ? 'short' : 
                                   score >= 3 ? 'long' : score <= -3 ? 'short' : null;
            
            if (!tradeDirection) {
                return {
                    success: true,
                    symbol,
                    price: currentPrice,
                    score,
                    maxScore: 7,
                    direction,
                    tradeable: false,
                    reason: 'Pas de signal clair (score entre -3 et 3)',
                    ichimokuLevels: {
                        tenkan, kijun,
                        kumoTop: Math.max(senkouA || 0, senkouB || 0),
                        kumoBottom: Math.min(senkouA || Infinity, senkouB || Infinity)
                    }
                };
            }
            
            // Utilise les TP/SL du preset du timeframe
            const tpslConfig = analysis.tpsl || this.TIMEFRAME_TPSL[timeframe] || { tp: 2.0, sl: 1.0 };
            
            // Calcul SL/TP basé sur le mode configuré
            const sltp = riskManager.calculateSLTP(currentPrice, tradeDirection, {
                tpslMode: this.config.tpslMode || 'percent',
                customSLPercent: tpslConfig.sl,
                customTPPercent: tpslConfig.tp,
                supportLevel: tradeDirection === 'long' ? Math.min(senkouA || currentPrice, senkouB || currentPrice) : null,
                resistanceLevel: tradeDirection === 'short' ? Math.max(senkouA || currentPrice, senkouB || currentPrice) : null
            });
            
            // Calcul de la taille de position (simulé avec 1000$ de capital)
            const simulatedBalance = 1000;
            const positionData = riskManager.calculatePositionSize(
                simulatedBalance,
                currentPrice,
                sltp.stopLoss,
                this.config.leverage
            );
            
            // Calcul des probabilités de gain
            const winProbability = analysisWinProb || this.calculateWinProbability(score, analysis.confidence);
            
            // Calcul du profit/perte potentiel
            const potentialProfit = Math.abs(sltp.takeProfit - currentPrice) * positionData.size;
            const potentialLoss = Math.abs(currentPrice - sltp.stopLoss) * positionData.size;
            
            // Expected value
            const expectedValue = (winProbability * potentialProfit) - ((1 - winProbability) * potentialLoss);
            
            // Signaux détectés depuis fullAnalysis
            const detectedSignals = [];
            if (fullAnalysis.signals) {
                for (const [name, sig] of Object.entries(fullAnalysis.signals)) {
                    if (sig && sig.detected) {
                        detectedSignals.push({
                            name: name.replace(/([A-Z])/g, ' $1').trim(),
                            signal: sig.signal || sig.direction,
                            description: sig.description || `${name} détecté`
                        });
                    }
                }
            }
            
            return {
                success: true,
                symbol,
                price: currentPrice,
                score,
                maxScore: 7,
                direction: tradeDirection,
                signal: tradeDirection === 'long' ? 'BUY' : 'SELL',
                confidence: Math.abs(score) >= 5 ? 'high' : Math.abs(score) >= 3 ? 'medium' : 'low',
                
                // Niveaux SL/TP
                stopLoss: sltp.stopLoss,
                takeProfit: sltp.takeProfit,
                slPercent: typeof sltp.riskPercent === 'number' ? sltp.riskPercent.toFixed(2) : (sltp.riskPercent || tpslConfig.sl.toFixed(2)),
                tpPercent: typeof sltp.rewardPercent === 'number' ? sltp.rewardPercent.toFixed(2) : (sltp.rewardPercent || tpslConfig.tp.toFixed(2)),
                riskRewardRatio: sltp.riskRewardRatio,
                meetsMinRRR: sltp.meetsMinRRR,
                
                // Niveaux Ichimoku
                ichimokuLevels: {
                    tenkan: tenkan || null,
                    kijun: kijun || null,
                    kumoTop: Math.max(senkouA || 0, senkouB || 0) || null,
                    kumoBottom: Math.min(senkouA || Infinity, senkouB || Infinity) || null
                },
                
                // Probabilités et gains
                winProbability: winProbability,
                winProbabilityPercent: (winProbability * 100).toFixed(1) + '%',
                potentialProfit: potentialProfit.toFixed(2),
                potentialLoss: potentialLoss.toFixed(2),
                expectedValue: expectedValue.toFixed(2),
                expectedValuePercent: ((expectedValue / simulatedBalance) * 100).toFixed(2) + '%',
                
                // Position sizing (pour 1000$)
                suggestedSize: positionData.size.toFixed(6),
                riskAmount: positionData.riskAmount.toFixed(2),
                riskPercent: positionData.riskPercent.toFixed(2) + '%',
                
                // Signaux détectés
                detectedSignals,
                
                // Recommandation
                recommendation: this.getTradeRecommendation(score, sltp.riskRewardRatio, winProbability),
                
                tradeable
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Calcule la probabilité de gain basée sur le score et la confiance
     * @param {number} score 
     * @param {string} confidence 
     * @param {Object} signalQuality - Score de qualité du signal (nouveau)
     * @param {number} fundingBonus - Bonus/malus du funding rate
     * @returns {number}
     */
    calculateWinProbability(score, confidence, signalQuality = null, fundingBonus = 0) {
        // ===== OPTIMISÉ POUR SCALPING 1m/5m =====
        // Base probability selon le score Ichimoku (-7 à +7)
        // Ajusté pour scalping: scores moyens donnent plus de chances
        const absScore = Math.abs(score);
        let baseProbability;
        
        // Probabilités de base ASSOUPLIES pour générer plus de trades
        if (absScore >= 7) baseProbability = 0.78;      // Score parfait 7/7
        else if (absScore >= 6) baseProbability = 0.74; // Score excellent 6/7
        else if (absScore >= 5) baseProbability = 0.70; // Score très bon 5/7
        else if (absScore >= 4) baseProbability = 0.66; // Score bon 4/7
        else if (absScore >= 3) baseProbability = 0.62; // Score moyen 3/7
        else if (absScore >= 2) baseProbability = 0.58; // Score faible mais tradeable
        else if (absScore >= 1) baseProbability = 0.54; // Score minimal
        else baseProbability = 0.50;                    // Score nul - 50/50
        
        // ===== CONFIANCE ASSOUPLIE POUR SCALPING =====
        // En scalping, même une confiance low peut être tradeable avec d'autres confirmations
        // Bonus confiance AUGMENTÉS
        const confidenceBonus = {
            'high': 0.12,    // +12% si confiance haute
            'medium': 0.08,  // +8% si confiance moyenne
            'low': 0.04      // +4% même en confiance basse (scalping rapide)
        }[confidence] || 0.04;
        
        // ===== BONUS QUALITÉ ASSOUPLI =====
        let qualityBonus = 0;
        if (signalQuality) {
            const grade = signalQuality.grade || 'D';
            const qualityScore = signalQuality.score || 0;
            
            // Bonus selon le grade (assoupli)
            if (grade === 'A') {
                qualityBonus = 0.12; // +12% pour grade A
            } else if (grade === 'B') {
                qualityBonus = 0.08; // +8% pour grade B
            } else if (grade === 'C') {
                qualityBonus = 0.05; // +5% pour grade C (même non tradeable)
            } else if (grade === 'D' && qualityScore >= 30) {
                qualityBonus = 0.02; // +2% pour grade D avec score décent
            }
            
            // Bonus supplémentaire selon le score de qualité brut
            if (qualityScore >= 70) qualityBonus += 0.03;
            else if (qualityScore >= 50) qualityBonus += 0.02;
        }
        
        // ===== BONUS SCORE ICHIMOKU =====
        // Bonus progressif selon le score
        let scoreBonus = 0;
        if (absScore >= 7) scoreBonus = 0.06;       // +6% pour 7/7
        else if (absScore >= 6) scoreBonus = 0.04; // +4% pour 6/7
        else if (absScore >= 5) scoreBonus = 0.03; // +3% pour 5/7
        else if (absScore >= 4) scoreBonus = 0.02; // +2% pour 4/7
        
        // ===== BONUS FUNDING RATE - SECRET ULTIME =====
        // Funding très négatif + LONG = short squeeze probable = +5% bonus
        // Funding très positif + SHORT = long squeeze probable = +5% bonus
        const fundingBonusPercent = fundingBonus * 0.025; // +2.5% par point de bonus (max +5%)
        
        // Probabilité finale (plafonnée à 92% pour scalping)
        const finalProbability = Math.min(0.92, baseProbability + confidenceBonus + qualityBonus + scoreBonus + fundingBonusPercent);
        
        // Log supprimé car trop verbeux - appelé pour chaque crypto x timeframe
        
        return finalProbability;
    }
    
    /**
     * Génère une recommandation de trade
     * @param {number} score 
     * @param {number} rrr 
     * @param {number} winProb 
     * @returns {Object}
     */
    getTradeRecommendation(score, rrr, winProb) {
        const absScore = Math.abs(score);
        
        // Calcul du grade - ASSOUPLI pour donner plus de poids au score Ichimoku
        // Un score 7/7 est un signal très fort, même si RRR ou winProb sont moyens
        let grade, message, color;
        
        // Grade A: Score très fort (6-7) OU combinaison forte
        if (absScore >= 6 || (absScore >= 5 && rrr >= 1.5 && winProb >= 0.60)) {
            grade = 'A';
            message = 'Excellente opportunité - Signal très fort';
            color = 'green';
        // Grade B: Score fort (5) OU bonne combinaison
        } else if (absScore >= 5 || (absScore >= 4 && rrr >= 1.5 && winProb >= 0.55)) {
            grade = 'B';
            message = 'Bonne opportunité - Signal confirmé';
            color = 'green';
        // Grade C: Score moyen (3-4)
        } else if (absScore >= 3) {
            grade = 'C';
            message = 'Opportunité moyenne - Prudence recommandée';
            color = 'yellow';
        } else if (absScore >= 2) {
            grade = 'D';
            message = 'Signal faible - Attendre confirmation';
            color = 'orange';
        } else {
            grade = 'F';
            message = 'Pas de signal - Ne pas trader';
            color = 'red';
        }
        
        return { grade, message, color, shouldTrade: ['A', 'B', 'C'].includes(grade) };
    }

    /**
     * Exécute une analyse complète (legacy - single symbol)
     */
    async runAnalysis() {
        return this.runMultiAnalysis();
    }

    /**
     * Traite un signal de trading
     * @param {Object} signal 
     * @param {Object} analysis 
     */
    async processSignal(signal, analysis) {
        this.state.lastSignal = signal;
        
        this.log(`🎯 SIGNAL DÉTECTÉ: ${signal.action} (confiance: ${signal.confidence})`, 'signal');
        
        signal.signals.forEach(s => {
            this.log(`  - ${s.name}: ${s.description}`, 'signal');
        });

        this.emit('onSignal', signal);

        // En mode auto, exécute le trade
        if (this.config.mode === 'auto') {
            await this.executeTrade(signal, analysis);
        } else {
            this.log('Mode manuel: en attente de confirmation utilisateur', 'info');
        }
    }

    /**
     * Exécute un trade basé sur un signal
     * @param {Object} signal 
     * @param {Object} analysis 
     */
    async executeTrade(signal, analysis) {
        try {
            // Vérifie le risk management
            const balance = await api.getAccountBalance();
            const riskCheck = riskManager.canTrade(balance.totalEquity, {
                riskRewardRatio: analysis.recommendation?.suggestedTP && analysis.recommendation?.suggestedSL
                    ? Math.abs(analysis.recommendation.suggestedTP - analysis.currentPrice) / 
                      Math.abs(analysis.currentPrice - analysis.recommendation.suggestedSL)
                    : 1.5
            });

            if (!riskCheck.allowed) {
                this.log('❌ Trade refusé par le Risk Manager:', 'warn');
                riskCheck.checks.filter(c => !c.passed).forEach(c => {
                    this.log(`  - ${c.check}: ${c.reason}`, 'warn');
                });
                return null;
            }

            // Calcul des niveaux SL/TP
            const direction = signal.action === 'BUY' ? 'long' : 'short';
            const sltp = riskManager.calculateSLTP(
                analysis.currentPrice,
                direction,
                {
                    supportLevel: analysis.levels?.supports[0]?.level,
                    resistanceLevel: analysis.levels?.resistances[0]?.level
                }
            );

            // Vérifie le RRR (sauf si désactivé avec minRRR = 0)
            if (!sltp.meetsMinRRR) {
                const minRRR = riskManager.config.minRiskRewardRatio;
                if (minRRR > 0) {
                    this.log(`❌ RRR insuffisant: ${sltp.riskRewardRatio} (min: ${minRRR})`, 'warn');
                    return null;
                }
                // Si minRRR = 0 (OFF), on continue
            }

            // Calcul de la taille de position
            const positionData = riskManager.calculatePositionSize(
                balance.totalEquity,
                analysis.currentPrice,
                sltp.stopLoss,
                this.config.leverage
            );

            // Validation finale du trade
            const validation = riskManager.validateTrade({
                entryPrice: analysis.currentPrice,
                stopLoss: sltp.stopLoss,
                takeProfit: sltp.takeProfit,
                size: positionData.size,
                direction
            }, balance.totalEquity);

            if (!validation.valid) {
                this.log('❌ Validation du trade échouée:', 'warn');
                validation.errors.forEach(e => this.log(`  - ${e}`, 'warn'));
                return null;
            }

            // Log du trade
            this.log('============================', 'trade');
            this.log(`📊 EXÉCUTION TRADE ${signal.action}`, 'trade');
            this.log(`Symbole: ${this.config.symbol}`, 'trade');
            this.log(`Direction: ${direction.toUpperCase()}`, 'trade');
            this.log(`Prix: ${analysis.currentPrice}`, 'trade');
            this.log(`Taille: ${positionData.size.toFixed(4)}`, 'trade');
            this.log(`SL: ${sltp.stopLoss} (${sltp.riskPercent}%)`, 'trade');
            this.log(`TP: ${sltp.takeProfit} (${sltp.rewardPercent}%)`, 'trade');
            this.log(`RRR: ${sltp.riskRewardRatio}`, 'trade');
            this.log(`Risque: ${positionData.riskAmount.toFixed(2)} USD (${positionData.riskPercent}%)`, 'trade');
            this.log('============================', 'trade');

            // Exécute l'ordre avec TP/SL
            const order = await api.placeOrderWithTPSL({
                symbol: this.config.symbol,
                isBuy: signal.action === 'BUY',
                size: positionData.size,
                price: null, // Market order
                takeProfit: sltp.takeProfit,
                stopLoss: sltp.stopLoss
            });

            this.log(`✅ Ordre exécuté avec succès`, 'success');

            // Stocke la position actuelle
            this.state.currentPosition = {
                symbol: this.config.symbol,
                direction,
                entryPrice: analysis.currentPrice,
                size: positionData.size,
                stopLoss: sltp.stopLoss,
                takeProfit: sltp.takeProfit,
                openedAt: Date.now()
            };

            this.emit('onTrade', {
                signal,
                order,
                position: this.state.currentPosition
            });

            return order;

        } catch (error) {
            this.log(`❌ Erreur exécution trade: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Exécute un trade manuel
     * @param {Object} params 
     */
    async manualTrade(params) {
        const { symbol, direction, size, price, stopLoss, takeProfit } = params;

        this.log(`Trade manuel: ${direction} ${size} ${symbol} (Levier: ${this.config.leverage}x)`, 'trade');

        try {
            const order = await api.placeOrderWithTPSL({
                symbol,
                isBuy: direction === 'long',
                size,
                price,
                takeProfit,
                stopLoss,
                leverage: this.config.leverage
            });

            return { success: true, order };
        } catch (error) {
            this.log(`Erreur trade manuel: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Ferme la position actuelle
     */
    async closePosition() {
        if (!this.state.currentPosition) {
            this.log('Aucune position à fermer', 'warn');
            return null;
        }

        try {
            const result = await api.closePosition(this.state.currentPosition.symbol);
            
            // Calcul du PnL
            const currentPrice = await priceFetcher.getPrice(this.state.currentPosition.symbol);
            const pnl = this.state.currentPosition.direction === 'long'
                ? (currentPrice - this.state.currentPosition.entryPrice) * this.state.currentPosition.size
                : (this.state.currentPosition.entryPrice - currentPrice) * this.state.currentPosition.size;

            // Enregistre dans le risk manager
            riskManager.recordTrade({
                pnl,
                isWin: pnl > 0
            });

            this.log(`Position fermée. PnL: ${pnl.toFixed(2)} USD`, pnl > 0 ? 'success' : 'warn');
            
            this.state.currentPosition = null;
            
            return result;
        } catch (error) {
            this.log(`Erreur fermeture position: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Gère la fermeture d'une position (appelé par positionManager)
     * Met à jour le compteur de pertes consécutives et déclenche la pause si nécessaire
     * @param {string} symbol 
     * @param {number} pnl 
     * @param {string} exitReason 
     */
    handlePositionClosed(symbol, pnl, exitReason) {
        this.log(`📊 Position ${symbol} fermée: ${exitReason} | P&L: $${pnl.toFixed(2)}`, pnl > 0 ? 'success' : 'warn');
        
        // Enregistre dans le risk manager
        riskManager.recordTrade({
            pnl,
            isWin: pnl > 0
        });
        
        // Gestion des pertes consécutives
        if (pnl < 0) {
            this.consecutiveLosses++;
            this.log(`⚠️ Perte #${this.consecutiveLosses} consécutive`, 'warn');
            
            // Vérifie si on doit mettre en pause
            if (this.consecutiveLosses >= this.antiOvertradingConfig.maxConsecutiveLosses) {
                this.pausedUntil = Date.now() + this.antiOvertradingConfig.pauseAfterLossesMs;
                const pauseMinutes = this.antiOvertradingConfig.pauseAfterLossesMs / 60000;
                this.log(`🛑 PAUSE AUTOMATIQUE: ${this.consecutiveLosses} pertes consécutives. Reprise dans ${pauseMinutes} minutes.`, 'error');
            }
        } else {
            // Réinitialise le compteur après un gain
            if (this.consecutiveLosses > 0) {
                this.log(`✅ Série de pertes interrompue après ${this.consecutiveLosses} pertes`, 'success');
            }
            this.consecutiveLosses = 0;
            this.pausedUntil = 0;
        }
        
        // Supprime la position de notre état interne
        this.state.activePositions.delete(symbol);
    }

    /**
     * Retourne l'état actuel du moteur
     * @returns {Object}
     */
    getStatus() {
        return {
            isRunning: this.state.isRunning,
            mode: this.config.mode,
            symbol: this.config.symbol,
            timeframes: this.config.timeframes,
            analysisCount: this.state.analysisCount,
            lastAnalysis: this.state.lastAnalysis,
            lastSignal: this.state.lastSignal,
            currentPosition: this.state.currentPosition,
            config: this.config,
            // Nouveaux statuts
            positionManager: positionManager.getStatus(),
            correlationManager: correlationManager.getStatus(),
            connectionManager: connectionManager.getStatus(),
            rateLimiter: rateLimiter.getStats()
        };
    }

    /**
     * Retourne les logs
     * @param {number} limit 
     * @returns {Array}
     */
    getLogs(limit = 100) {
        return this.logs.slice(-limit);
    }

    /**
     * Effectue une analyse sans exécuter de trade
     * @returns {Promise<Object>}
     */
    async analyzeOnly() {
        try {
            const timeframe = this.config.timeframes[0];
            const candles = await priceFetcher.getCandles(
                this.config.symbol,
                timeframe,
                250 // Plus de données pour EMA200
            );

            if (!candles || candles.length < 60) {
                return { success: false, error: 'Données insuffisantes' };
            }

            // Analyse avec réglages Ichimoku optimisés pour le timeframe
            const analysis = signalDetector.analyze(candles, {}, timeframe);
            const currentPrice = candles[candles.length - 1].close;

            return {
                success: true,
                timestamp: Date.now(),
                symbol: this.config.symbol,
                timeframe,
                price: currentPrice,
                ...analysis
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Récupère les positions ouvertes
     * @returns {Promise<Array>}
     */
    async getOpenPositions() {
        try {
            return await api.getOpenPositions();
        } catch (error) {
            this.log(`Erreur récupération positions: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Récupère le solde du compte
     * @returns {Promise<Object>}
     */
    async getBalance() {
        try {
            return await api.getAccountBalance();
        } catch (error) {
            this.log(`Erreur récupération solde: ${error.message}`, 'error');
            return null;
        }
    }
}

// Export singleton
const tradeEngine = new TradeEngine();
export default tradeEngine;
