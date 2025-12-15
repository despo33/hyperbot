/**
 * Configuration centralisée pour le trading bot
 * Évite la duplication des constantes entre tradeEngine.js et UserBotInstance.js
 */

// ===== TP/SL PAR TIMEFRAME =====
// Pourcentages de Take Profit et Stop Loss optimisés par timeframe
export const TIMEFRAME_TPSL = {
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
        minScore: 4,
        minWinProbability: 0.60,
        minConfluence: 2,
        rsiLongMax: 72,
        rsiShortMin: 28,
        adxMin: 12,
        minRRR: 0.8,
        analysisInterval: 60000
    },
    '15m': {
        name: 'Intraday Court',
        minScore: 5,
        minWinProbability: 0.62,
        minConfluence: 3,
        rsiLongMax: 70,
        rsiShortMin: 30,
        adxMin: 15,
        minRRR: 1.0,
        analysisInterval: 120000
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
export const ANTI_OVERTRADING_CONFIG = {
    symbolCooldownMs: 300000,      // 5 minutes entre trades sur même symbole
    globalCooldownMs: 60000,       // 1 minute entre tous les trades
    maxTradesPerHour: 10,
    maxTradesPerDay: 50
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
