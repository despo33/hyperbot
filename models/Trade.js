/**
 * Modèle Trade pour MongoDB
 * Stocke l'historique des trades
 */

import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema({
    // Lien vers l'utilisateur
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    walletAddress: {
        type: String,
        required: true
    },
    
    // Identifiants
    symbol: {
        type: String,
        required: true,
        index: true
    },
    orderId: {
        type: String,
        sparse: true
    },
    
    // Direction et prix
    direction: {
        type: String,
        enum: ['long', 'short'],
        required: true
    },
    entryPrice: {
        type: Number,
        required: true
    },
    exitPrice: {
        type: Number,
        default: null
    },
    size: {
        type: Number,
        required: true
    },
    leverage: {
        type: Number,
        default: 1
    },
    
    // TP/SL
    takeProfit: Number,
    stopLoss: Number,
    tpslMode: {
        type: String,
        enum: ['auto', 'percent', 'atr', 'ichimoku_pure'],
        default: 'auto'
    },
    
    // Résultats
    pnl: {
        type: Number,
        default: 0
    },
    pnlPercent: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['open', 'closed', 'cancelled'],
        default: 'open',
        index: true
    },
    exitReason: {
        type: String,
        enum: ['tp_hit', 'sl_hit', 'manual', 'signal', 'timeout', null],
        default: null
    },
    
    // Analyse au moment du trade
    analysis: {
        ichimokuScore: Number,
        winProbability: Number,
        confluence: Number,
        signalQuality: String,
        adx: Number,
        rsi: Number,
        timeframe: String
    },
    
    // Timestamps
    openedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    closedAt: {
        type: Date,
        default: null
    },
    duration: {
        type: Number, // en millisecondes
        default: 0
    }
}, {
    timestamps: true // Ajoute createdAt et updatedAt
});

// Index composé pour les requêtes fréquentes
tradeSchema.index({ symbol: 1, openedAt: -1 });
tradeSchema.index({ status: 1, openedAt: -1 });

// Méthode pour calculer la durée à la fermeture
tradeSchema.methods.close = function(exitPrice, exitReason) {
    this.exitPrice = exitPrice;
    this.exitReason = exitReason;
    this.status = 'closed';
    this.closedAt = new Date();
    this.duration = this.closedAt - this.openedAt;
    
    // Calcul du P&L
    if (this.direction === 'long') {
        this.pnl = (exitPrice - this.entryPrice) * this.size;
        this.pnlPercent = ((exitPrice - this.entryPrice) / this.entryPrice) * 100 * this.leverage;
    } else {
        this.pnl = (this.entryPrice - exitPrice) * this.size;
        this.pnlPercent = ((this.entryPrice - exitPrice) / this.entryPrice) * 100 * this.leverage;
    }
    
    return this.save();
};

// Méthodes statiques pour les statistiques
tradeSchema.statics.getStats = async function(filter = {}) {
    const trades = await this.find({ status: 'closed', ...filter });
    
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    
    return {
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: trades.length > 0 ? (wins.length / trades.length * 100).toFixed(1) : 0,
        totalPnl: trades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2),
        avgWin: wins.length > 0 ? (wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length).toFixed(2) : 0,
        avgLoss: losses.length > 0 ? (losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length).toFixed(2) : 0,
        avgDuration: trades.length > 0 ? Math.round(trades.reduce((sum, t) => sum + t.duration, 0) / trades.length / 1000 / 60) : 0 // en minutes
    };
};

const Trade = mongoose.model('Trade', tradeSchema);
export default Trade;
