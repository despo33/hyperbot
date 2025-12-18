/**
 * Schémas de validation Joi pour les entrées utilisateur
 * Centralise toutes les validations pour éviter les injections et erreurs
 */

import Joi from 'joi';

// ===== AUTHENTIFICATION =====

export const registerSchema = Joi.object({
    email: Joi.string()
        .email()
        .max(254)
        .required()
        .messages({
            'string.email': 'Email invalide',
            'string.max': 'Email trop long (max 254 caractères)',
            'any.required': 'Email requis'
        }),
    username: Joi.string()
        .alphanum()
        .min(3)
        .max(30)
        .required()
        .messages({
            'string.alphanum': 'Le nom d\'utilisateur ne peut contenir que des lettres et chiffres',
            'string.min': 'Nom d\'utilisateur trop court (min 3 caractères)',
            'string.max': 'Nom d\'utilisateur trop long (max 30 caractères)',
            'any.required': 'Nom d\'utilisateur requis'
        }),
    password: Joi.string()
        .min(8)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            'string.min': 'Mot de passe trop court (min 8 caractères)',
            'string.max': 'Mot de passe trop long (max 128 caractères)',
            'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
            'any.required': 'Mot de passe requis'
        })
});

export const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .max(254)
        .required()
        .messages({
            'string.email': 'Email invalide',
            'any.required': 'Email requis'
        }),
    password: Joi.string()
        .max(128)
        .required()
        .messages({
            'any.required': 'Mot de passe requis'
        })
});

export const resetPasswordSchema = Joi.object({
    token: Joi.string()
        .required()
        .messages({
            'any.required': 'Token requis'
        }),
    password: Joi.string()
        .min(8)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            'string.min': 'Mot de passe trop court (min 8 caractères)',
            'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
            'any.required': 'Mot de passe requis'
        })
});

// ===== CONFIGURATION TRADING =====

export const tradingConfigSchema = Joi.object({
    symbols: Joi.array()
        .items(Joi.string().uppercase().max(10))
        .max(50),
    timeframes: Joi.array()
        .items(Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d'))
        .max(7),
    leverage: Joi.number()
        .integer()
        .min(1)
        .max(100),
    maxConcurrentTrades: Joi.number()
        .integer()
        .min(1)
        .max(20),
    minWinProbability: Joi.number()
        .min(0)
        .max(1),
    minScore: Joi.number()
        .integer()
        .min(1)
        .max(10),
    tpslMode: Joi.string()
        .valid('auto', 'percent', 'atr', 'ichimoku_pure'),
    defaultTP: Joi.number()
        .min(0.1)
        .max(50),
    defaultSL: Joi.number()
        .min(0.1)
        .max(50),
    analysisInterval: Joi.number()
        .integer()
        .min(5000)
        .max(3600000),
    multiTimeframeMode: Joi.boolean(),
    mtfTimeframes: Joi.array()
        .items(Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d'))
        .max(7),
    mtfMinConfirmation: Joi.number()
        .integer()
        .min(1)
        .max(7),
    useRSIFilter: Joi.boolean(),
    rsiOverbought: Joi.number()
        .integer()
        .min(50)
        .max(100),
    rsiOversold: Joi.number()
        .integer()
        .min(0)
        .max(50),
    atrMultiplierSL: Joi.number()
        .min(0.5)
        .max(5),
    atrMultiplierTP: Joi.number()
        .min(0.5)
        .max(10),
    riskPerTrade: Joi.number()
        .min(0.1)
        .max(10),
    maxPositionSize: Joi.number()
        .min(1)
        .max(100),
    enabledSignals: Joi.object({
        tkCross: Joi.boolean(),
        kumoBreakout: Joi.boolean(),
        kumoTwist: Joi.boolean(),
        kijunBounce: Joi.boolean()
    }),
    // Stratégie de trading
    strategy: Joi.string()
        .valid('ichimoku', 'smc', 'bollinger'),
    // Indicateurs avancés
    useSupertrend: Joi.boolean(),
    useFibonacci: Joi.boolean(),
    useKumoTwist: Joi.boolean(),
    useChikouAdvanced: Joi.boolean(),
    // Multi-Timeframe
    useMTF: Joi.boolean(),
    mtfPrimary: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d'),
    mtfHigher: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d'),
    mtfConfirmations: Joi.number().integer().min(1).max(5),
    // Mode
    mode: Joi.string().valid('auto', 'manual', 'paper'),
    multiCryptoMode: Joi.boolean(),
    // Paramètres Bollinger Squeeze
    bbPeriod: Joi.number().integer().min(5).max(100),
    bbStdDev: Joi.number().min(0.5).max(5),
    kcPeriod: Joi.number().integer().min(5).max(100),
    kcMultiplier: Joi.number().min(0.5).max(5),
    momentumPeriod: Joi.number().integer().min(3).max(50),
    bbRsiFilter: Joi.boolean(),
    bbVolumeFilter: Joi.boolean(),
    bbMomentumFilter: Joi.boolean(),
    bbSqueezeOnly: Joi.boolean()
}).unknown(false);

// ===== PROFILS =====

export const profileSchema = Joi.object({
    name: Joi.string()
        .min(1)
        .max(50)
        .required()
        .messages({
            'string.min': 'Nom du profil requis',
            'string.max': 'Nom du profil trop long (max 50 caractères)'
        }),
    description: Joi.string()
        .max(200)
        .allow(''),
    copyFromCurrent: Joi.boolean(),
    config: tradingConfigSchema
});

// ===== WALLET =====

export const walletSchema = Joi.object({
    secretPhrase: Joi.string()
        .required()
        .messages({
            'any.required': 'Phrase secrète requise'
        }),
    walletName: Joi.string()
        .max(50)
        .default('Mon Wallet'),
    tradingAddress: Joi.string()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Adresse de trading invalide'
        })
});

// ===== TRADE =====

export const tradeSchema = Joi.object({
    symbol: Joi.string()
        .uppercase()
        .max(10)
        .required(),
    direction: Joi.string()
        .valid('LONG', 'SHORT')
        .required(),
    size: Joi.number()
        .positive()
        .required(),
    price: Joi.number()
        .positive()
        .allow(null),
    stopLoss: Joi.number()
        .positive()
        .allow(null),
    takeProfit: Joi.number()
        .positive()
        .allow(null)
});

// ===== MIDDLEWARE DE VALIDATION =====

/**
 * Crée un middleware de validation Joi
 * @param {Joi.Schema} schema - Le schéma Joi à utiliser
 * @returns {Function} - Middleware Express
 */
export function validate(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        
        if (error) {
            const errors = error.details.map(d => d.message);
            return res.status(400).json({ 
                error: 'Validation échouée',
                details: errors 
            });
        }
        
        req.body = value;
        next();
    };
}

export default {
    registerSchema,
    loginSchema,
    resetPasswordSchema,
    tradingConfigSchema,
    profileSchema,
    walletSchema,
    tradeSchema,
    validate
};
