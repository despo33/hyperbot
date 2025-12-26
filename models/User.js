/**
 * Modèle User pour MongoDB
 * Gère les utilisateurs et leurs données associées
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Schema pour les profils de configuration
const configProfileSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        default: 'Profil par défaut'
    },
    description: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    // Configuration du bot
    config: {
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
        },
        analysisInterval: {
            type: Number,
            default: 60000
        },
        multiTimeframeMode: {
            type: Boolean,
            default: false
        },
        mtfTimeframes: {
            type: [String],
            default: ['5m', '15m', '1h']
        },
        mtfMinConfirmation: {
            type: Number,
            default: 2
        },
        useRSIFilter: {
            type: Boolean,
            default: true
        },
        rsiOverbought: {
            type: Number,
            default: 70
        },
        rsiOversold: {
            type: Number,
            default: 30
        },
        atrMultiplierSL: {
            type: Number,
            default: 1.5
        },
        atrMultiplierTP: {
            type: Number,
            default: 2.5
        },
        riskPerTrade: {
            type: Number,
            default: 2
        },
        maxPositionSize: {
            type: Number,
            default: 50
        },
        dailyLossLimit: {
            type: Number,
            default: 5
        },
        maxDrawdown: {
            type: Number,
            default: 20
        },
        maxTradesPerDay: {
            type: Number,
            default: 10
        },
        maxConsecutiveLosses: {
            type: Number,
            default: 3
        },
        minRiskRewardRatio: {
            type: Number,
            default: 1.5
        },
        // Stratégie de trading
        strategy: {
            type: String,
            enum: ['ichimoku', 'smc', 'bollinger'],
            default: 'ichimoku'
        },
        // Paramètres Bollinger Squeeze
        bbPeriod: {
            type: Number,
            default: 20
        },
        bbStdDev: {
            type: Number,
            default: 2
        },
        kcPeriod: {
            type: Number,
            default: 20
        },
        kcMultiplier: {
            type: Number,
            default: 1.5
        },
        momentumPeriod: {
            type: Number,
            default: 12
        },
        bbRsiFilter: {
            type: Boolean,
            default: true
        },
        bbVolumeFilter: {
            type: Boolean,
            default: true
        }
    }
});

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
    // Agent Wallet Hyperliquid (trading-only, no withdraw)
    isAgentWallet: {
        type: Boolean,
        default: false
    },
    // Adresse du wallet principal (master) si c'est un Agent Wallet
    masterAddress: {
        type: String,
        default: null
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
    
    // Rôle utilisateur
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    
    // Statut du compte
    isActive: {
        type: Boolean,
        default: true
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
    
    // Profils de configuration
    configProfiles: [configProfileSchema],
    activeProfileIndex: {
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
        },
        // Intervalle d'analyse
        analysisInterval: {
            type: Number,
            default: 60000
        },
        // Multi-Timeframe
        multiTimeframeMode: {
            type: Boolean,
            default: false
        },
        mtfTimeframes: {
            type: [String],
            default: ['5m', '15m', '1h']
        },
        mtfMinConfirmation: {
            type: Number,
            default: 2
        },
        // Filtres RSI
        useRSIFilter: {
            type: Boolean,
            default: true
        },
        rsiOverbought: {
            type: Number,
            default: 70
        },
        rsiOversold: {
            type: Number,
            default: 30
        },
        // ATR
        atrMultiplierSL: {
            type: Number,
            default: 1.5
        },
        atrMultiplierTP: {
            type: Number,
            default: 2.5
        },
        // Risk Management
        riskPerTrade: {
            type: Number,
            default: 2
        },
        maxPositionSize: {
            type: Number,
            default: 50
        },
        dailyLossLimit: {
            type: Number,
            default: 5
        },
        maxDrawdown: {
            type: Number,
            default: 20
        },
        maxTradesPerDay: {
            type: Number,
            default: 10
        },
        maxConsecutiveLosses: {
            type: Number,
            default: 3
        },
        minRiskRewardRatio: {
            type: Number,
            default: 1.5
        },
        // Stratégie de trading
        strategy: {
            type: String,
            enum: ['ichimoku', 'smc', 'bollinger'],
            default: 'ichimoku'
        },
        // Paramètres Bollinger Squeeze
        bbPeriod: {
            type: Number,
            default: 20
        },
        bbStdDev: {
            type: Number,
            default: 2
        },
        kcPeriod: {
            type: Number,
            default: 20
        },
        kcMultiplier: {
            type: Number,
            default: 1.5
        },
        momentumPeriod: {
            type: Number,
            default: 12
        },
        bbRsiFilter: {
            type: Boolean,
            default: true
        },
        bbVolumeFilter: {
            type: Boolean,
            default: true
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

// Note: Les index sont déjà créés via unique: true dans le schema
// Pas besoin de les redéclarer ici (évite les warnings Mongoose)

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

// Méthode pour obtenir le profil actif
userSchema.methods.getActiveProfile = function() {
    if (this.configProfiles.length === 0) return null;
    return this.configProfiles[this.activeProfileIndex] || this.configProfiles[0];
};

// Méthode pour ajouter un profil
userSchema.methods.addProfile = function(profileData) {
    // IMPORTANT: Copie profonde pour éviter les références partagées entre profils
    let configCopy;
    if (profileData.config) {
        configCopy = JSON.parse(JSON.stringify(profileData.config));
    } else if (this.botConfig) {
        // Copie profonde de botConfig (toObject() pour Mongoose, puis JSON pour les objets imbriqués)
        const botConfigObj = this.botConfig.toObject ? this.botConfig.toObject() : this.botConfig;
        configCopy = JSON.parse(JSON.stringify(botConfigObj));
    } else {
        configCopy = {};
    }
    
    const profile = {
        name: profileData.name || `Profil ${this.configProfiles.length + 1}`,
        description: profileData.description || '',
        isActive: this.configProfiles.length === 0,
        config: configCopy
    };
    this.configProfiles.push(profile);
    if (this.configProfiles.length === 1) {
        this.activeProfileIndex = 0;
    }
    return this.configProfiles[this.configProfiles.length - 1];
};

// Méthode pour définir le profil actif
userSchema.methods.setActiveProfile = function(index) {
    if (index >= 0 && index < this.configProfiles.length) {
        this.configProfiles.forEach((p, i) => p.isActive = (i === index));
        this.activeProfileIndex = index;
        // IMPORTANT: Remplace complètement botConfig avec la config du profil
        // (pas de merge pour éviter que les anciennes valeurs persistent)
        const profile = this.configProfiles[index];
        if (profile && profile.config) {
            // Convertit en objet simple si c'est un document Mongoose
            const profileConfig = profile.config.toObject ? profile.config.toObject() : profile.config;
            // Remplace botConfig avec les valeurs du profil
            Object.keys(profileConfig).forEach(key => {
                if (profileConfig[key] !== undefined) {
                    this.botConfig[key] = profileConfig[key];
                }
            });
            this.markModified('botConfig');
        }
        return true;
    }
    return false;
};

// Méthode pour mettre à jour un profil
userSchema.methods.updateProfile = function(index, updates) {
    if (index >= 0 && index < this.configProfiles.length) {
        const profile = this.configProfiles[index];
        if (updates.name) profile.name = updates.name;
        if (updates.description !== undefined) profile.description = updates.description;
        if (updates.config) {
            profile.config = { ...profile.config, ...updates.config };
        }
        // Si c'est le profil actif, met aussi à jour botConfig
        if (index === this.activeProfileIndex && updates.config) {
            this.botConfig = { ...this.botConfig, ...updates.config };
        }
        return profile;
    }
    return null;
};

// Méthode pour supprimer un profil
userSchema.methods.deleteProfile = function(index) {
    if (this.configProfiles.length <= 1) {
        return false; // Garde au moins un profil
    }
    if (index >= 0 && index < this.configProfiles.length) {
        this.configProfiles.splice(index, 1);
        // Ajuste l'index actif si nécessaire
        if (this.activeProfileIndex >= this.configProfiles.length) {
            this.activeProfileIndex = this.configProfiles.length - 1;
        }
        // Marque le nouveau profil actif
        this.configProfiles[this.activeProfileIndex].isActive = true;
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
        role: this.role,
        isActive: this.isActive,
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
