/**
 * Configuration centralisée pour le trading bot
 * Évite la duplication des constantes entre tradeEngine.js et UserBotInstance.js
 */

// ===== TP/SL PAR TIMEFRAME =====
// Pourcentages de Take Profit et Stop Loss optimisés par timeframe
// OPTIMISÉ: Ratio Risk/Reward minimum 1:2 pour être profitable même avec 40% win rate
export const TIMEFRAME_TPSL = {
    '1m': { tp: 0.8, sl: 0.4 },    // RRR 1:2
    '5m': { tp: 1.6, sl: 0.8 },    // RRR 1:2
    '15m': { tp: 3.0, sl: 1.5 },   // RRR 1:2
    '30m': { tp: 4.0, sl: 2.0 },   // RRR 1:2
    '1h': { tp: 5.0, sl: 2.5 },    // RRR 1:2
    '4h': { tp: 8.0, sl: 4.0 },    // RRR 1:2
    '1d': { tp: 14.0, sl: 7.0 }    // RRR 1:2
};

// ===== PRESETS DE FILTRES PAR TIMEFRAME =====
// Réglages optimisés automatiquement selon le timeframe choisi
export const TIMEFRAME_PRESETS = {
    '1m': {
        name: 'Ultra Scalping',
        minScore: 4,
        minWinProbability: 0.58,
        minConfluence: 2,
        rsiLongMax: 75,
        rsiShortMin: 25,
        adxMin: 10,
        minRRR: 0.5,
        analysisInterval: 30000
    },
    '5m': {
        name: 'Scalping',
        minScore: 5,              // AUGMENTÉ: était 4
        minWinProbability: 0.65,  // AUGMENTÉ: était 0.60
        minConfluence: 3,         // AUGMENTÉ: était 2
        rsiLongMax: 68,           // RÉDUIT: était 72
        rsiShortMin: 32,          // AUGMENTÉ: était 28
        adxMin: 15,               // AUGMENTÉ: était 12
        minRRR: 1.2,              // AUGMENTÉ: était 0.8
        analysisInterval: 90000   // AUGMENTÉ: 1.5 min au lieu de 1
    },
    '15m': {
        name: 'Intraday Court',
        minScore: 6,              // AUGMENTÉ: était 5
        minWinProbability: 0.68,  // AUGMENTÉ: était 0.62
        minConfluence: 4,         // AUGMENTÉ: était 3
        rsiLongMax: 65,           // RÉDUIT: était 70
        rsiShortMin: 35,          // AUGMENTÉ: était 30
        adxMin: 18,               // AUGMENTÉ: était 15
        minRRR: 1.5,              // AUGMENTÉ: était 1.0
        analysisInterval: 180000  // AUGMENTÉ: 3 min au lieu de 2
    },
    '30m': {
        name: 'Intraday',
        minScore: 5,
        minWinProbability: 0.63,
        minConfluence: 3,
        rsiLongMax: 70,
        rsiShortMin: 30,
        adxMin: 18,
        minRRR: 1.2,
        analysisInterval: 180000
    },
    '1h': {
        name: 'Swing Court',
        minScore: 6,
        minWinProbability: 0.65,
        minConfluence: 3,
        rsiLongMax: 68,
        rsiShortMin: 32,
        adxMin: 20,
        minRRR: 1.5,
        analysisInterval: 300000
    },
    '4h': {
        name: 'Swing',
        minScore: 6,
        minWinProbability: 0.68,
        minConfluence: 4,
        rsiLongMax: 65,
        rsiShortMin: 35,
        adxMin: 22,
        minRRR: 2.0,
        analysisInterval: 600000
    },
    '1d': {
        name: 'Position',
        minScore: 7,
        minWinProbability: 0.70,
        minConfluence: 4,
        rsiLongMax: 65,
        rsiShortMin: 35,
        adxMin: 25,
        minRRR: 2.5,
        analysisInterval: 3600000
    }
};

// ===== CONFIGURATION PAR DÉFAUT DU BOT =====
export const DEFAULT_BOT_CONFIG = {
    symbols: ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP'],
    timeframes: ['1h'],
    leverage: 10,
    maxConcurrentTrades: 7,
    mode: 'auto',
    analysisInterval: 60000,
    minWinProbability: 0.65,
    minScore: 3,
    defaultTP: 2.0,
    defaultSL: 1.0,
    tpslMode: 'auto',
    atrMultiplierSL: 1.5,
    atrMultiplierTP: 2.5,
    enabledSignals: {
        tkCross: true,
        kumoBreakout: true,
        kumoTwist: true,
        kijunBounce: true
    },
    useRSIFilter: true,
    rsiOverbought: 70,
    rsiOversold: 30,
    riskPerTrade: 2,
    maxPositionSize: 50,  // % max du capital par position (sécurité)
    // Multi-Timeframe
    multiTimeframeMode: false,
    mtfTimeframes: ['5m', '15m', '1h'],
    mtfMinConfirmation: 2
};

// ===== ANTI-OVERTRADING =====
// RENFORCÉ pour éviter les séries de pertes
export const ANTI_OVERTRADING_CONFIG = {
    symbolCooldownMs: 600000,      // 10 minutes entre trades sur même symbole (était 5)
    globalCooldownMs: 120000,      // 2 minutes entre tous les trades (était 1)
    maxTradesPerHour: 5,           // RÉDUIT: était 10
    maxTradesPerDay: 20,           // RÉDUIT: était 50
    maxConsecutiveLosses: 3,       // NOUVEAU: arrête après 3 pertes consécutives
    pauseAfterLossesMs: 1800000    // NOUVEAU: pause 30 min après maxConsecutiveLosses
};

// ===== LISTE DES CRYPTOS SUPPORTÉES =====
export const SUPPORTED_SYMBOLS = [
    'BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'AVAX', 'LINK', 'DOT', 
    'MATIC', 'UNI', 'ATOM', 'APT', 'ARB', 'OP', 'INJ', 'SUI', 
    'SEI', 'NEAR', 'FTM', 'AAVE'
];

export default {
    TIMEFRAME_TPSL,
    TIMEFRAME_PRESETS,
    DEFAULT_BOT_CONFIG,
    ANTI_OVERTRADING_CONFIG,
    SUPPORTED_SYMBOLS
};
