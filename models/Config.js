/**
 * Modèle Config pour MongoDB
 * Stocke les configurations du bot
 */

import mongoose from 'mongoose';

const configSchema = new mongoose.Schema({
    // Identifiant unique de la config
    name: {
        type: String,
        required: true,
        unique: true,
        default: 'default'
    },
    
    // Symboles à trader
    symbols: [{
        type: String
    }],
    
    // Timeframes
    timeframes: [{
        type: String
    }],
    
    // Paramètres de trading
    trading: {
        mode: {
            type: String,
            enum: ['auto', 'manual', 'semi-auto'],
            default: 'auto'
        },
        leverage: {
            type: Number,
            default: 10
        },
        maxConcurrentTrades: {
            type: Number,
            default: 7
        },
        minWinProbability: {
            type: Number,
            default: 0.65
        },
        minScore: {
            type: Number,
            default: 3
        }
    },
    
    // Paramètres TP/SL
    tpsl: {
        mode: {
            type: String,
            enum: ['auto', 'percent', 'atr', 'ichimoku_pure'],
            default: 'auto'
        },
        defaultTP: {
            type: Number,
            default: 2
        },
        defaultSL: {
            type: Number,
            default: 1.3
        },
        atrMultiplierTP: {
            type: Number,
            default: 2.5
        },
        atrMultiplierSL: {
            type: Number,
            default: 1.5
        }
    },
    
    // Signaux activés
    enabledSignals: {
        tkCross: { type: Boolean, default: true },
        kumoBreakout: { type: Boolean, default: true },
        kumoTwist: { type: Boolean, default: true },
        kijunBounce: { type: Boolean, default: true }
    },
    
    // Filtres
    filters: {
        useRSIFilter: { type: Boolean, default: true },
        rsiOverbought: { type: Number, default: 70 },
        rsiOversold: { type: Number, default: 30 },
        useMultiTimeframe: { type: Boolean, default: false },
        mtfConfirmationRequired: { type: Boolean, default: false }
    },
    
    // Métadonnées
    isActive: {
        type: Boolean,
        default: true
    },
    lastModified: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Middleware pour mettre à jour lastModified
configSchema.pre('save', function(next) {
    this.lastModified = new Date();
    next();
});

const Config = mongoose.model('Config', configSchema);
export default Config;
