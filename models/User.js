/**
 * Modèle User pour MongoDB
 * Gère les utilisateurs et leurs données associées
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const walletSchema = new mongoose.Schema({
    name: {
        type: String,
        default: 'Mon Wallet'
    },
    address: {
        type: String,
        required: true
    },
    secretPhrase: {
        type: String, // Chiffré
        required: true
    },
    tradingAddress: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: false
    },
    addedAt: {
        type: Date,
        default: Date.now
    }
});

const userSchema = new mongoose.Schema({
    // Identifiants
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    
    // Vérification email
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationCode: {
        type: String,
        default: null
    },
    emailVerificationExpires: {
        type: Date,
        default: null
    },
    
    // Reset password
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    },
    
    // Wallets Hyperliquid
    wallets: [walletSchema],
    activeWalletIndex: {
        type: Number,
        default: 0
    },
    
    // Configuration du bot
    botConfig: {
        symbols: {
            type: [String],
            default: ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP']
        },
        timeframes: {
            type: [String],
            default: ['1h']
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
        },
        tpslMode: {
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
        enabledSignals: {
            tkCross: { type: Boolean, default: true },
            kumoBreakout: { type: Boolean, default: true },
            kumoTwist: { type: Boolean, default: true },
            kijunBounce: { type: Boolean, default: true }
        }
    },
    
    // Statistiques
    stats: {
        totalTrades: { type: Number, default: 0 },
        winningTrades: { type: Number, default: 0 },
        losingTrades: { type: Number, default: 0 },
        totalPnl: { type: Number, default: 0 },
        bestTrade: { type: Number, default: 0 },
        worstTrade: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now }
    },
    
    // Métadonnées
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index pour les recherches
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

// Hash du mot de passe avant sauvegarde
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Méthode pour générer un code de vérification email
userSchema.methods.generateEmailVerificationCode = function() {
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 chiffres
    this.emailVerificationCode = code;
    this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    return code;
};

// Méthode pour générer un token de reset password
userSchema.methods.generateResetPasswordToken = function() {
    const token = crypto.randomBytes(32).toString('hex');
    this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    this.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    return token;
};

// Méthode pour obtenir le wallet actif
userSchema.methods.getActiveWallet = function() {
    if (this.wallets.length === 0) return null;
    return this.wallets[this.activeWalletIndex] || this.wallets[0];
};

// Méthode pour ajouter un wallet
userSchema.methods.addWallet = function(walletData) {
    this.wallets.push(walletData);
    if (this.wallets.length === 1) {
        this.activeWalletIndex = 0;
        this.wallets[0].isActive = true;
    }
    return this.wallets[this.wallets.length - 1];
};

// Méthode pour définir le wallet actif
userSchema.methods.setActiveWallet = function(index) {
    if (index >= 0 && index < this.wallets.length) {
        this.wallets.forEach((w, i) => w.isActive = (i === index));
        this.activeWalletIndex = index;
        return true;
    }
    return false;
};

// Méthode pour mettre à jour les stats
userSchema.methods.updateStats = function(trade) {
    this.stats.totalTrades++;
    if (trade.pnl > 0) {
        this.stats.winningTrades++;
        if (trade.pnl > this.stats.bestTrade) {
            this.stats.bestTrade = trade.pnl;
        }
    } else if (trade.pnl < 0) {
        this.stats.losingTrades++;
        if (trade.pnl < this.stats.worstTrade) {
            this.stats.worstTrade = trade.pnl;
        }
    }
    this.stats.totalPnl += trade.pnl;
    this.stats.lastUpdated = new Date();
};

// Méthode pour retourner les données publiques (sans mot de passe)
userSchema.methods.toPublicJSON = function() {
    return {
        id: this._id,
        email: this.email,
        username: this.username,
        isEmailVerified: this.isEmailVerified,
        wallets: this.wallets.map(w => ({
            id: w._id,
            name: w.name,
            address: w.address,
            tradingAddress: w.tradingAddress,
            isActive: w.isActive,
            addedAt: w.addedAt
        })),
        activeWalletIndex: this.activeWalletIndex,
        botConfig: this.botConfig,
        stats: this.stats,
        role: this.role,
        lastLogin: this.lastLogin,
        createdAt: this.createdAt
    };
};

const User = mongoose.model('User', userSchema);
export default User;
