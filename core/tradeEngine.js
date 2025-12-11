/**
 * Moteur de Trading Principal
 * Orchestre tous les composants: analyse, signaux, risk management et exécution
 */

import api from '../services/hyperliquidApi.js';
import auth from '../services/hyperliquidAuth.js';
import priceFetcher from './priceFetcher.js';
import signalDetector from './signalDetector.js';
import riskManager from './riskManager.js';
import ichimoku from './ichimoku.js';
import indicators from './indicators.js';
import positionManager from './positionManager.js';
import correlationManager from './correlationManager.js';
import rateLimiter from '../services/rateLimiter.js';
import connectionManager from '../services/connectionManager.js';
import multiTimeframe from './multiTimeframe.js';
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
        // TP/SL par timeframe
        this.TIMEFRAME_TPSL = {
            '1m': { tp: 0.5, sl: 0.25 },
            '5m': { tp: 1.0, sl: 0.5 },
            '15m': { tp: 2.0, sl: 1.0 },
            '30m': { tp: 3.0, sl: 1.5 },
            '1h': { tp: 4.0, sl: 2.0 },
            '4h': { tp: 6.0, sl: 3.0 },
            '1d': { tp: 10.0, sl: 5.0 }
        };
        
        // ===== PRESETS DE FILTRES PAR TIMEFRAME =====
        // Réglages optimisés automatiquement selon le timeframe choisi
        this.TIMEFRAME_PRESETS = {
            '1m': {
                name: 'Ultra Scalping',
                minScore: 4,              // Score Ichimoku minimum
                minWinProbability: 0.60,  // Probabilité minimum (60%)
                minConfluence: 2,         // Confluence minimum
                rsiLongMax: 80,           // RSI max pour LONG
                rsiShortMin: 20,          // RSI min pour SHORT
                adxMin: 8,                // ADX minimum (très bas pour 1m)
                minRRR: 0.5,              // RRR minimum très bas pour scalping rapide
                analysisInterval: 30000,  // Analyse toutes les 30s
                description: 'Trades rapides, filtres souples pour capturer les mouvements'
            },
            '5m': {
                name: 'Scalping',
                minScore: 4,
                minWinProbability: 0.62,
                minConfluence: 2,
                rsiLongMax: 75,
                rsiShortMin: 25,
                adxMin: 10,
                minRRR: 0.7,              // RRR assoupli pour scalping
                analysisInterval: 60000,  // Analyse toutes les 1min
                description: 'Scalping classique, bon équilibre vitesse/qualité'
            },
            '15m': {
                name: 'Intraday',
                minScore: 3,
                minWinProbability: 0.65,
                minConfluence: 2,
                rsiLongMax: 70,
                rsiShortMin: 30,
                adxMin: 15,
                minRRR: 1.0,              // RRR standard
                analysisInterval: 60000,
                description: 'Trading intraday, filtres équilibrés'
            },
            '30m': {
                name: 'Intraday+',
                minScore: 3,
                minWinProbability: 0.65,
                minConfluence: 2,
                rsiLongMax: 70,
                rsiShortMin: 30,
                adxMin: 18,
                minRRR: 1.0,
                analysisInterval: 120000, // Analyse toutes les 2min
                description: 'Intraday avec plus de confirmation'
            },
            '1h': {
                name: 'Swing Court',
                minScore: 3,
                minWinProbability: 0.68,
                minConfluence: 2,
                rsiLongMax: 70,
                rsiShortMin: 30,
                adxMin: 20,
                minRRR: 1.2,
                analysisInterval: 180000, // Analyse toutes les 3min
                description: 'Swing trading court terme, filtres stricts'
            },
            '4h': {
                name: 'Swing',
                minScore: 3,
                minWinProbability: 0.70,
                minConfluence: 2,
                rsiLongMax: 68,
                rsiShortMin: 32,
                adxMin: 22,
                minRRR: 1.5,
                analysisInterval: 300000, // Analyse toutes les 5min
                description: 'Swing trading, haute qualité de signal'
            },
            '1d': {
                name: 'Position',
                minScore: 3,
                minWinProbability: 0.72,
                minConfluence: 2,
                rsiLongMax: 65,
                rsiShortMin: 35,
                adxMin: 20,
                minRRR: 2.0,
                analysisInterval: 600000, // Analyse toutes les 10min
                description: 'Position trading, signaux très fiables'
            }
        };
        
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
            multiTimeframeMode: false,    // Activer l'analyse multi-timeframe
            mtfTimeframes: ['5m', '15m', '1h'], // Timeframes à analyser en mode MTF
            mtfMinConfirmation: 2,        // Minimum de TF en accord pour valider
            mtfWeights: {                 // Poids de chaque timeframe
                '1m': 0.15,
                '5m': 0.25,
                '15m': 0.30,
                '1h': 0.20,
                '4h': 0.10
            }
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
            isProcessingTrades: false     // Flag global de traitement
        };

        // Intervalle d'analyse
        this.analysisInterval = null;

        // Logs en mémoire pour le dashboard
        this.logs = [];
        this.maxLogs = 500;

        // Callbacks pour les événements
        this.eventCallbacks = {
            onLog: [],
            onSignal: [],
            onTrade: [],
            onAnalysis: []
        };

        this.configPath = path.join(__dirname, '..', 'storage', 'config.json');
        this.loadConfig();
    }

    /**
     * Charge la configuration depuis le fichier
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                this.config = { ...this.config, ...data };
                this.log('Configuration chargée', 'info');
            }
        } catch (error) {
            this.log(`Erreur chargement config: ${error.message}`, 'error');
        }
    }

    /**
     * Sauvegarde la configuration
     */
    saveConfig() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            this.log('Configuration sauvegardée', 'info');
        } catch (error) {
            this.log(`Erreur sauvegarde config: ${error.message}`, 'error');
        }
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
        
        this.log(`Applying preset "${preset.name}" for ${timeframe}`, 'info');
        
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
            this.log(`RRR minimum ajusté: ${preset.minRRR}`, 'info');
        }
        
        this.log(`Preset ${preset.name}: Score>=${preset.minScore}, WinProb>=${(preset.minWinProbability*100).toFixed(0)}%, RSI LONG<=${preset.rsiLongMax}, ADX>=${preset.adxMin}, RRR>=${preset.minRRR}`, 'info');
        
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
        
        // Détermine les TP/SL à utiliser
        let tpPercent, slPercent;
        
        if (newConfig.defaultTP !== undefined && newConfig.defaultSL !== undefined) {
            // Utilise les valeurs envoyées par le dashboard
            tpPercent = newConfig.defaultTP;
            slPercent = newConfig.defaultSL;
            this.log(`TP/SL configurés manuellement: TP=${tpPercent}%, SL=${slPercent}%`, 'info');
        } else if (newConfig.timeframes) {
            // Utilise les valeurs par défaut du timeframe
            const tf = newConfig.timeframes[0] || '15m';
            const tpsl = this.TIMEFRAME_TPSL[tf] || { tp: 2.0, sl: 1.0 };
            tpPercent = tpsl.tp;
            slPercent = tpsl.sl;
            this.log(`TP/SL adaptés au timeframe ${tf}: TP=${tpPercent}%, SL=${slPercent}%`, 'info');
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
        
        // Vérifie les filtres avec les presets du timeframe
        const hasStrongScore = absIchimokuScore >= preset.minScore;
        const hasMinConfluence = confluence >= preset.minConfluence;
        
        // Filtre RSI selon le preset
        let rsiOK = true;
        if (signalDirection === 'long') {
            rsiOK = rsi <= preset.rsiLongMax;
        } else if (signalDirection === 'short') {
            rsiOK = rsi >= preset.rsiShortMin;
        }
        
        // Filtre ADX
        const adxValue = adx.value || 0;
        const adxOK = adxValue === 0 || adxValue >= preset.adxMin; // 0 = calcul échoué, on ignore
        
        // Calcul probabilité de gain
        const winProbability = this.calculateWinProbability(analysis, confluence, 0);
        const meetsWinProb = winProbability >= preset.minWinProbability;
        
        // Signal tradeable ?
        const tradeable = signalDirection && hasStrongScore && hasMinConfluence && rsiOK && adxOK && meetsWinProb;
        
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
            rejectReason: !tradeable ? this.getRejectReason(signalDirection, hasStrongScore, hasMinConfluence, rsiOK, adxOK, meetsWinProb, preset) : null
        };
    }
    
    /**
     * Retourne la raison du rejet
     */
    getRejectReason(direction, hasScore, hasConf, rsiOK, adxOK, winProbOK, preset) {
        if (!direction) return 'Pas de signal directionnel';
        if (!hasScore) return `Score insuffisant (min: ${preset.minScore})`;
        if (!hasConf) return `Confluence insuffisante (min: ${preset.minConfluence})`;
        if (!rsiOK) return 'RSI hors limites';
        if (!adxOK) return `ADX trop faible (min: ${preset.adxMin})`;
        if (!winProbOK) return `Probabilité trop faible (min: ${(preset.minWinProbability*100).toFixed(0)}%)`;
        return 'Inconnu';
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
            // Zone RSI pour SHORT basée sur le preset du timeframe
            // En tendance forte, on étend encore de 10 points
            const rsiMin = strongTrend ? Math.max(10, presetRsiShortMin - 10) : presetRsiShortMin;
            const rsiOK = rsi >= rsiMin && rsi <= 80;
            // MACD doit être négatif OU en train de descendre
            const macdOK = macdHistogram < 0.3 || (advancedAnalysis?.macd?.crossover === 'bearish');
            // VWAP: prix en-dessous = biais baissier
            const vwapOK = vwapPosition === 'below';
            // CVD: tendance baissière = pression vendeuse
            const cvdOK = cvdTrend === 'bearish' || cvdDivergence === 'bearish';
            // EMA comme backup
            const emaOK = ema200Position === 'below';
            
            // Funding Rate positif = LONG SQUEEZE probable = BONUS pour SHORT
            if (fundingRate.signal === 'bearish') {
                fundingBonus = Math.round(fundingRate.strength * 2); // +1 à +2 points
                this.log(`${symbol}: Funding positif (${(fundingRate.rate * 100).toFixed(3)}%) - Long squeeze probable! +${fundingBonus} bonus`, 'info');
            } else if (fundingRate.signal === 'bullish') {
                fundingBonus = -1; // Malus si funding très négatif
            }
            
            // Combo gagnant: RSI OK + (VWAP OU CVD OU MACD OU EMA)
            // OU tendance très forte (score 7/7) avec au moins MACD OK
            momentumAligned = (rsiOK && (vwapOK || cvdOK || macdOK || emaOK)) ||
                             (absIchimokuScore >= 7 && macdOK);
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
            
            // Stocke la position
            this.state.activePositions.set(symbol, {
                symbol,
                direction,
                entryPrice: price,
                size: positionData.size,
                stopLoss: sltp.stopLoss,
                takeProfit: sltp.takeProfit,
                openedAt: Date.now()
            });
            
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
     * @returns {Promise<Object>}
     */
    async getTradeDetails(symbol) {
        try {
            // Analyse le symbole
            const analysis = await this.analyzeSymbol(symbol);
            
            if (!analysis.success) {
                return { success: false, error: analysis.error };
            }
            
            const { price, score, direction, signal, levels, ichimoku } = analysis;
            
            // Détermine la direction du trade
            const tradeDirection = signal?.action === 'BUY' ? 'long' : 
                                   signal?.action === 'SELL' ? 'short' : 
                                   score >= 3 ? 'long' : score <= -3 ? 'short' : null;
            
            if (!tradeDirection) {
                return {
                    success: true,
                    symbol,
                    price,
                    score,
                    direction,
                    tradeable: false,
                    reason: 'Pas de signal clair (score entre -3 et 3)'
                };
            }
            
            // Calcul SL/TP basé sur Ichimoku
            const sltp = riskManager.calculateSLTP(price, tradeDirection, {
                supportLevel: levels?.supports[0]?.level,
                resistanceLevel: levels?.resistances[0]?.level
            });
            
            // Calcul de la taille de position (simulé avec 1000$ de capital)
            const simulatedBalance = 1000;
            const positionData = riskManager.calculatePositionSize(
                simulatedBalance,
                price,
                sltp.stopLoss,
                this.config.leverage
            );
            
            // Calcul des probabilités de gain basées sur le score Ichimoku
            const winProbability = this.calculateWinProbability(score, signal?.confidence);
            
            // Calcul du profit/perte potentiel
            const potentialProfit = Math.abs(sltp.takeProfit - price) * positionData.size;
            const potentialLoss = Math.abs(price - sltp.stopLoss) * positionData.size;
            
            // Expected value
            const expectedValue = (winProbability * potentialProfit) - ((1 - winProbability) * potentialLoss);
            
            return {
                success: true,
                symbol,
                price,
                score,
                maxScore: analysis.maxScore,
                direction: tradeDirection,
                signal: signal?.action || (tradeDirection === 'long' ? 'BUY' : 'SELL'),
                confidence: signal?.confidence || (Math.abs(score) >= 5 ? 'high' : Math.abs(score) >= 3 ? 'medium' : 'low'),
                
                // Niveaux
                stopLoss: sltp.stopLoss,
                takeProfit: sltp.takeProfit,
                slPercent: sltp.riskPercent,
                tpPercent: sltp.rewardPercent,
                riskRewardRatio: sltp.riskRewardRatio,
                meetsMinRRR: sltp.meetsMinRRR,
                
                // Ichimoku levels
                ichimokuLevels: {
                    tenkan: ichimoku?.tenkan,
                    kijun: ichimoku?.kijun,
                    senkouA: ichimoku?.senkouA,
                    senkouB: ichimoku?.senkouB,
                    kumoTop: Math.max(ichimoku?.senkouA || 0, ichimoku?.senkouB || 0),
                    kumoBottom: Math.min(ichimoku?.senkouA || 0, ichimoku?.senkouB || 0)
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
                detectedSignals: analysis.detectedSignals || [],
                
                // Recommandation
                recommendation: this.getTradeRecommendation(score, sltp.riskRewardRatio, winProbability),
                
                tradeable: analysis.tradeable
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
        
        if (absScore >= 7) baseProbability = 0.75;      // Score parfait 7/7
        else if (absScore >= 6) baseProbability = 0.72; // Score excellent 6/7
        else if (absScore >= 5) baseProbability = 0.68; // Score très bon 5/7
        else if (absScore >= 4) baseProbability = 0.64; // Score bon 4/7
        else if (absScore >= 3) baseProbability = 0.58; // Score moyen 3/7
        else if (absScore >= 2) baseProbability = 0.52; // Score faible mais tradeable
        else baseProbability = 0.45;                    // Score très faible
        
        // ===== CONFIANCE ASSOUPLIE POUR SCALPING =====
        // En scalping, même une confiance low peut être tradeable avec d'autres confirmations
        const confidenceBonus = {
            'high': 0.10,    // +10% si confiance haute
            'medium': 0.06,  // +6% si confiance moyenne
            'low': 0.02      // +2% même en confiance basse (scalping rapide)
        }[confidence] || 0.02;
        
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
        
        this.log(`Win probability: base=${(baseProbability*100).toFixed(0)}% + conf=${(confidenceBonus*100).toFixed(0)}% + quality=${(qualityBonus*100).toFixed(0)}% + score=${(scoreBonus*100).toFixed(0)}% + funding=${(fundingBonusPercent*100).toFixed(0)}% = ${(finalProbability*100).toFixed(0)}%`, 'debug');
        
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
        
        // Calcul du grade
        let grade, message, color;
        
        if (absScore >= 5 && rrr >= 2 && winProb >= 0.65) {
            grade = 'A';
            message = 'Excellente opportunité - Signal très fort';
            color = 'green';
        } else if (absScore >= 4 && rrr >= 1.5 && winProb >= 0.58) {
            grade = 'B';
            message = 'Bonne opportunité - Signal confirmé';
            color = 'green';
        } else if (absScore >= 3 && rrr >= 1.5) {
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
        
        return { grade, message, color, shouldTrade: ['A', 'B'].includes(grade) };
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
