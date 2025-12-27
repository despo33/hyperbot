/**
 * Routes API du dashboard de trading
 * 
 * ARCHITECTURE:
 * - botManager + UserBotInstance: Système multi-utilisateurs (chaque user a son bot)
 * - tradeEngine: Moteur legacy, utilisé comme fallback et pour l'analyse globale
 * 
 * Les routes utilisent botManager pour les opérations utilisateur et tradeEngine
 * comme fallback quand aucun bot utilisateur n'est actif.
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Moteur legacy (fallback + analyse globale)
import tradeEngine from './core/tradeEngine.js';
// Gestionnaire multi-utilisateurs (système principal)
import botManager from './core/BotManager.js';
import riskManager from './core/riskManager.js';
import priceFetcher from './core/priceFetcher.js';
import signalDetector from './core/signalDetector.js';
import auth from './services/hyperliquidAuth.js';
import api from './services/hyperliquidApi.js';
import scanner, { TOP_CRYPTOS } from './core/scanner.js';
import backtester from './core/backtester.js';
import User from './models/User.js';

// Utilitaires centralisés
import { optionalAuth, requireAuth } from './utils/auth.js';
import { encryptSecret, decryptSecret } from './utils/crypto.js';
import { tradingConfigSchema, profileSchema, tradeSchema, walletSchema, validate } from './utils/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ==================== BOT STATUS ROUTES ====================

/**
 * GET /api/status
 * Retourne le statut complet du bot (PROTÉGÉ)
 * Utilise le wallet de l'utilisateur connecté
 */
router.get('/status', requireAuth, async (req, res) => {
    try {
        // Si utilisateur connecté, récupère le statut de SON bot
        let botStatus = null;
        if (req.user) {
            const userId = req.user._id.toString();
            botStatus = botManager.getBotStatus(userId);
        }
        
        // Fallback sur le tradeEngine global si pas de bot utilisateur
        const status = botStatus || tradeEngine.getStatus();
        const riskStats = riskManager.getStats();
        
        let balance = null;
        let positions = [];
        let addressToUse = null;
        let isAuthenticated = false;
        let userAddress = null;
        let tradingAddress = null;
        
        // Si utilisateur connecté, utilise UNIQUEMENT son wallet actif (pas de fallback)
        if (req.user) {
            const activeWallet = req.user.getActiveWallet();
            if (activeWallet) {
                addressToUse = activeWallet.tradingAddress || activeWallet.address;
                userAddress = activeWallet.address;
                tradingAddress = activeWallet.tradingAddress;
                isAuthenticated = true;
                
                // Initialise l'auth avec le wallet de l'utilisateur
                if (activeWallet.secretPhrase) {
                    try {
                        const secret = decryptSecret(activeWallet.secretPhrase);
                        await auth.initialize(secret);
                        if (activeWallet.tradingAddress) {
                            auth.setTradingAddress(activeWallet.tradingAddress);
                        }
                    } catch (e) {
                        console.error('[API] Erreur init wallet utilisateur:', e.message);
                    }
                }
            }
            // Si utilisateur connecté mais pas de wallet, on ne fait PAS de fallback
        } else {
            // Seulement si PAS connecté: utilise le wallet global (ancien système)
            addressToUse = auth.getBalanceAddress();
            isAuthenticated = auth.isReady();
            userAddress = auth.getAddress();
            tradingAddress = auth.tradingAddress;
        }
        
        if (addressToUse) {
            try {
                balance = await api.getAccountBalance(addressToUse);
                positions = await api.getOpenPositions(addressToUse);
            } catch (e) {
                console.error('[API] Erreur récupération données:', e.message);
            }
        }

        res.json({
            bot: status,
            risk: riskStats,
            balance,
            positions,
            authenticated: isAuthenticated,
            address: userAddress,
            tradingAddress: tradingAddress,
            userId: req.user?._id || null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/bot/start
 * Démarre le bot de l'utilisateur connecté
 */
router.post('/bot/start', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const activeWallet = req.user.getActiveWallet();
        
        if (!activeWallet) {
            return res.status(400).json({ 
                success: false, 
                error: 'Aucun wallet configuré. Ajoutez un wallet dans Configuration API.' 
            });
        }
        
        // Récupère la config du profil actif (priorité sur botConfig global)
        let userConfig = req.user.botConfig || {};
        let profileName = 'default';
        
        if (req.user.configProfiles && req.user.configProfiles.length > 0) {
            const activeIndex = req.user.activeProfileIndex || 0;
            const activeProfile = req.user.configProfiles[activeIndex];
            if (activeProfile && activeProfile.config) {
                userConfig = activeProfile.config;
                profileName = activeProfile.name;
                console.log(`[BOT] Démarrage avec profil "${profileName}" pour ${req.user.username}`);
            }
        }
        
        // Démarre le bot de l'utilisateur avec la config du profil actif
        const success = await botManager.startBot(userId, activeWallet, userConfig);
        
        res.json({ 
            success, 
            message: success ? `Bot démarré avec profil "${profileName}"` : 'Échec du démarrage',
            profileName,
            userId: userId.substring(0, 8) + '...'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/bot/stop
 * Arrête le bot de l'utilisateur connecté
 */
router.post('/bot/stop', requireAuth, (req, res) => {
    try {
        const userId = req.user._id.toString();
        const success = botManager.stopBot(userId);
        
        res.json({ 
            success, 
            message: success ? 'Bot arrêté' : 'Bot déjà arrêté ou non démarré' 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/logs
 * Retourne les logs du bot de l'utilisateur (PROTÉGÉ)
 */
router.get('/logs', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const userId = req.user._id.toString();
    const logs = botManager.getBotLogs(userId, limit);
    res.json({ logs, userId: userId.substring(0, 8) + '...' });
});

// ==================== TRADING ROUTES ====================

/**
 * GET /api/price/:symbol
 * Retourne le prix actuel
 */
router.get('/price/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const price = await priceFetcher.getPrice(symbol);
        const stats = await priceFetcher.getPriceStats(symbol);
        res.json({ symbol, price, stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/candles/:symbol
 * Retourne les candles
 */
router.get('/candles/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const timeframe = req.query.timeframe || '1h';
        const limit = parseInt(req.query.limit) || 100;
        
        const candles = await priceFetcher.getCandles(symbol, timeframe, limit);
        res.json({ symbol, timeframe, candles });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/analysis
 * Effectue une analyse sans trader (PROTÉGÉ)
 */
router.get('/analysis', requireAuth, async (req, res) => {
    try {
        const analysis = await tradeEngine.analyzeOnly();
        res.json(analysis);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/positions
 * Retourne les positions ouvertes de l'utilisateur avec leurs analyses (PROTÉGÉ)
 */
router.get('/positions', requireAuth, async (req, res) => {
    try {
        let address;
        if (req.user) {
            const activeWallet = req.user.getActiveWallet();
            address = activeWallet?.tradingAddress || activeWallet?.address;
        }
        const positions = await api.getOpenPositions(address);
        
        // Enrichit chaque position avec son analyse si disponible
        const enrichedPositions = positions.map(pos => {
            const symbol = pos.coin || pos.symbol;
            const analysis = tradeEngine.state.multiAnalysis?.get(symbol);
            return {
                ...pos,
                analysis: analysis ? {
                    score: analysis.score,
                    direction: analysis.direction,
                    confidence: analysis.confidence,
                    winProbability: analysis.winProbability,
                    indicators: analysis.indicators,
                    signalQuality: analysis.signalQuality,
                    recommendation: analysis.recommendation,
                    sltp: analysis.sltp,
                    timestamp: analysis.timestamp
                } : null
            };
        });
        
        res.json({ positions: enrichedPositions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/position-details/:symbol
 * Retourne les détails complets d'une position (analyse, calculs, raisons) (PROTÉGÉ)
 */
router.get('/position-details/:symbol', requireAuth, async (req, res) => {
    try {
        const { symbol } = req.params;
        
        // Récupère la position depuis l'exchange
        let address;
        if (req.user) {
            const activeWallet = req.user.getActiveWallet();
            address = activeWallet?.tradingAddress || activeWallet?.address;
        }
        const positions = await api.getOpenPositions(address);
        const position = positions.find(p => (p.coin || p.symbol) === symbol);
        
        if (!position) {
            return res.status(404).json({ error: 'Position non trouvée' });
        }
        
        // Récupère les données stockées lors de l'ouverture
        const storedPosition = tradeEngine.state.activePositions?.get(symbol);
        
        // Récupère l'analyse actuelle
        const currentAnalysis = tradeEngine.state.multiAnalysis?.get(symbol);
        
        // Calcule le P&L actuel
        const entryPrice = storedPosition?.entryPrice || parseFloat(position.entryPrice || position.entryPx || 0);
        const currentPrice = await api.getPrice(symbol);
        const size = Math.abs(parseFloat(position.size || position.szi || 0));
        const direction = size > 0 ? 'long' : 'short';
        
        let unrealizedPnl = 0;
        let pnlPercent = 0;
        if (entryPrice > 0 && currentPrice > 0) {
            if (direction === 'long') {
                unrealizedPnl = (currentPrice - entryPrice) * size;
                pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
            } else {
                unrealizedPnl = (entryPrice - currentPrice) * size;
                pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
            }
        }
        
        // Construit la réponse détaillée
        const details = {
            // Infos de base
            symbol,
            direction,
            size,
            entryPrice,
            currentPrice,
            
            // P&L
            unrealizedPnl,
            pnlPercent,
            
            // Niveaux TP/SL
            stopLoss: storedPosition?.stopLoss || null,
            takeProfit: storedPosition?.takeProfit || null,
            leverage: storedPosition?.leverage || position.leverage || 1,
            riskRewardRatio: storedPosition?.riskRewardRatio || null,
            
            // Timing
            openedAt: storedPosition?.openedAt || null,
            duration: storedPosition?.openedAt ? Date.now() - storedPosition.openedAt : null,
            
            // Analyse au moment de l'entrée (raisons du trade)
            entryAnalysis: storedPosition?.analysis || null,
            
            // Analyse actuelle (état du marché maintenant)
            currentAnalysis: currentAnalysis ? {
                score: currentAnalysis.score,
                direction: currentAnalysis.direction,
                confidence: currentAnalysis.confidence,
                winProbability: currentAnalysis.winProbability,
                ichimokuScore: currentAnalysis.ichimokuScore,
                signalQuality: currentAnalysis.signalQuality,
                indicators: currentAnalysis.indicators,
                recommendation: currentAnalysis.recommendation
            } : null,
            
            // Données brutes de l'exchange
            exchangeData: {
                liquidationPrice: position.liquidationPrice || position.liquidationPx || null,
                marginUsed: position.marginUsed || null,
                unrealizedPnl: position.unrealizedPnl || null
            }
        };
        
        res.json(details);
    } catch (error) {
        console.error('Erreur position-details:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/orders
 * Retourne les ordres ouverts de l'utilisateur (PROTÉGÉ)
 */
router.get('/orders', requireAuth, async (req, res) => {
    try {
        let address;
        if (req.user) {
            const activeWallet = req.user.getActiveWallet();
            address = activeWallet?.tradingAddress || activeWallet?.address;
        }
        const orders = await api.getOpenOrders(address);
        res.json({ orders });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/trade
 * Place un trade manuel (protégé)
 * Accepte soit 'size' directement, soit 'amount' + 'leverage' pour calculer la taille
 */
router.post('/trade', requireAuth, async (req, res) => {
    try {
        const { symbol, direction, size, amount, leverage, price, stopLoss, takeProfit } = req.body;

        if (!symbol || !direction) {
            return res.status(400).json({ error: 'Paramètres manquants (symbol, direction)' });
        }

        // Calcule la taille de position
        let finalSize = size;
        
        if (!finalSize && amount && leverage) {
            // Récupère le prix actuel pour calculer la taille
            const currentPrice = await priceFetcher.getPrice(symbol);
            if (!currentPrice) {
                return res.status(400).json({ error: 'Impossible de récupérer le prix actuel' });
            }
            // Taille = (montant * levier) / prix
            finalSize = (parseFloat(amount) * parseFloat(leverage)) / currentPrice;
            // Arrondi à 4 décimales
            finalSize = Math.floor(finalSize * 10000) / 10000;
            console.log(`[TRADE] Calcul taille: $${amount} x${leverage} / $${currentPrice} = ${finalSize}`);
        }

        if (!finalSize || finalSize <= 0) {
            return res.status(400).json({ error: 'Taille de position invalide' });
        }

        const result = await tradeEngine.manualTrade({
            symbol,
            direction,
            size: parseFloat(finalSize),
            price: price ? parseFloat(price) : null,
            stopLoss: stopLoss ? parseFloat(stopLoss) : null,
            takeProfit: takeProfit ? parseFloat(takeProfit) : null,
            leverage: leverage ? parseInt(leverage) : null
        });

        res.json(result);
    } catch (error) {
        console.error('[TRADE] Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/close-position
 * Ferme une position (protégé)
 */
router.post('/close-position', requireAuth, async (req, res) => {
    try {
        const { symbol } = req.body;
        const result = await api.closePosition(symbol || tradeEngine.config.symbol);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/position/close
 * Ferme une position manuellement (alias pour le dashboard)
 */
router.post('/position/close', requireAuth, async (req, res) => {
    try {
        const { symbol, size } = req.body;
        
        if (!symbol) {
            return res.status(400).json({ success: false, error: 'Symbol requis' });
        }
        
        // Récupère l'adresse de trading de l'utilisateur
        const activeWallet = req.user.getActiveWallet();
        if (!activeWallet) {
            return res.status(400).json({ success: false, error: 'Aucun wallet actif' });
        }
        
        const userAddress = activeWallet.tradingAddress || activeWallet.address;
        console.log(`[MANUAL CLOSE] Fermeture manuelle de la position ${symbol} pour ${userAddress?.slice(0,10)}... (size: ${size})`);
        
        // Utilise l'adresse utilisateur pour récupérer et fermer la position
        const result = await api.closePositionForUser(symbol, userAddress);
        
        console.log(`[MANUAL CLOSE] Résultat API:`, JSON.stringify(result, null, 2));
        
        // Vérifie si l'ordre a été accepté par Hyperliquid
        if (result && result.status === 'ok') {
            // Vérifie si l'ordre a été rempli (filled)
            const response = result.response;
            if (response && response.data && response.data.statuses) {
                const status = response.data.statuses[0];
                if (status && status.filled) {
                    console.log(`[MANUAL CLOSE] ✅ Position ${symbol} fermée avec succès - filled: ${JSON.stringify(status.filled)}`);
                    res.json({ success: true, result, message: `Position ${symbol} fermée` });
                } else if (status && status.error) {
                    console.log(`[MANUAL CLOSE] ❌ Erreur ordre: ${status.error}`);
                    res.json({ success: false, error: status.error });
                } else {
                    console.log(`[MANUAL CLOSE] ⚠️ Ordre envoyé mais statut incertain:`, status);
                    res.json({ success: true, result, message: `Ordre de fermeture envoyé pour ${symbol}` });
                }
            } else {
                console.log(`[MANUAL CLOSE] ✅ Position ${symbol} - ordre accepté`);
                res.json({ success: true, result, message: `Position ${symbol} fermée` });
            }
        } else if (result) {
            console.log(`[MANUAL CLOSE] ⚠️ Résultat inattendu:`, result);
            res.json({ success: true, result, message: `Ordre envoyé pour ${symbol}` });
        } else {
            res.json({ success: false, error: 'Échec de la fermeture - pas de réponse' });
        }
    } catch (error) {
        console.error(`[MANUAL CLOSE] ❌ Erreur:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/cancel-orders
 * Annule les ordres (protégé)
 */
router.post('/cancel-orders', requireAuth, async (req, res) => {
    try {
        const { symbol } = req.body;
        const result = await api.cancelAllOrders(symbol);
        res.json({ success: true, cancelled: result.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== CONFIG ROUTES (LIÉES À L'UTILISATEUR) ====================

/**
 * GET /api/config/trading
 * Retourne la config trading du profil actif de l'utilisateur (PROTÉGÉ)
 */
router.get('/config/trading', requireAuth, async (req, res) => {
    // Priorité: Config du profil actif > botConfig global > config par défaut
    if (req.user.configProfiles && req.user.configProfiles.length > 0) {
        const activeIndex = req.user.activeProfileIndex || 0;
        const activeProfile = req.user.configProfiles[activeIndex];
        if (activeProfile && activeProfile.config) {
            return res.json({ 
                config: activeProfile.config, 
                fromUser: true, 
                fromProfile: true,
                activeProfileIndex: activeIndex,
                profileName: activeProfile.name
            });
        }
    }
    
    // Fallback sur botConfig global
    if (req.user.botConfig) {
        return res.json({ config: req.user.botConfig, fromUser: true, fromProfile: false });
    }
    
    // Fallback config par défaut
    res.json({ config: tradeEngine.config, fromUser: false, fromProfile: false });
});

/**
 * POST /api/config/trading
 * Met à jour la config trading de l'utilisateur (protégé)
 */
router.post('/config/trading', requireAuth, validate(tradingConfigSchema), async (req, res) => {
    try {
        // Si utilisateur connecté, sauvegarde dans son compte
        if (req.user) {
            const configUpdate = req.body;
            
            // Met à jour la config utilisateur (utilise !== undefined pour permettre les valeurs falsy)
            if (configUpdate.symbols) req.user.botConfig.symbols = configUpdate.symbols;
            if (configUpdate.timeframes) req.user.botConfig.timeframes = configUpdate.timeframes;
            if (configUpdate.leverage !== undefined) req.user.botConfig.leverage = configUpdate.leverage;
            if (configUpdate.maxConcurrentTrades !== undefined) req.user.botConfig.maxConcurrentTrades = configUpdate.maxConcurrentTrades;
            if (configUpdate.minWinProbability !== undefined) req.user.botConfig.minWinProbability = configUpdate.minWinProbability;
            if (configUpdate.minScore !== undefined) req.user.botConfig.minScore = configUpdate.minScore;
            if (configUpdate.tpslMode !== undefined) req.user.botConfig.tpslMode = configUpdate.tpslMode;
            if (configUpdate.defaultTP !== undefined) req.user.botConfig.defaultTP = configUpdate.defaultTP;
            if (configUpdate.defaultSL !== undefined) req.user.botConfig.defaultSL = configUpdate.defaultSL;
            if (configUpdate.analysisInterval !== undefined) req.user.botConfig.analysisInterval = configUpdate.analysisInterval;
            if (configUpdate.atrMultiplierSL !== undefined) req.user.botConfig.atrMultiplierSL = configUpdate.atrMultiplierSL;
            if (configUpdate.atrMultiplierTP !== undefined) req.user.botConfig.atrMultiplierTP = configUpdate.atrMultiplierTP;
            if (configUpdate.useRSIFilter !== undefined) req.user.botConfig.useRSIFilter = configUpdate.useRSIFilter;
            if (configUpdate.rsiOverbought !== undefined) req.user.botConfig.rsiOverbought = configUpdate.rsiOverbought;
            if (configUpdate.rsiOversold !== undefined) req.user.botConfig.rsiOversold = configUpdate.rsiOversold;
            // Multi-Timeframe
            if (configUpdate.multiTimeframeMode !== undefined) req.user.botConfig.multiTimeframeMode = configUpdate.multiTimeframeMode;
            if (configUpdate.mtfTimeframes) req.user.botConfig.mtfTimeframes = configUpdate.mtfTimeframes;
            if (configUpdate.mtfMinConfirmation !== undefined) req.user.botConfig.mtfMinConfirmation = configUpdate.mtfMinConfirmation;
            // Multi-Timeframe (nouveaux champs du dashboard)
            if (configUpdate.useMTF !== undefined) req.user.botConfig.useMTF = configUpdate.useMTF;
            if (configUpdate.mtfPrimary !== undefined) req.user.botConfig.mtfPrimary = configUpdate.mtfPrimary;
            if (configUpdate.mtfHigher !== undefined) req.user.botConfig.mtfHigher = configUpdate.mtfHigher;
            if (configUpdate.mtfConfirmations !== undefined) req.user.botConfig.mtfConfirmations = configUpdate.mtfConfirmations;
            // Mode et Multi-Crypto
            if (configUpdate.mode !== undefined) req.user.botConfig.mode = configUpdate.mode;
            if (configUpdate.multiCryptoMode !== undefined) req.user.botConfig.multiCryptoMode = configUpdate.multiCryptoMode;
            if (configUpdate.multiTFTrading !== undefined) req.user.botConfig.multiTFTrading = configUpdate.multiTFTrading;
            // Risk Management
            if (configUpdate.riskPerTrade !== undefined) req.user.botConfig.riskPerTrade = configUpdate.riskPerTrade;
            if (configUpdate.maxPositionSize !== undefined) req.user.botConfig.maxPositionSize = configUpdate.maxPositionSize;
            if (configUpdate.dailyLossLimit !== undefined) req.user.botConfig.dailyLossLimit = configUpdate.dailyLossLimit;
            if (configUpdate.maxDrawdown !== undefined) req.user.botConfig.maxDrawdown = configUpdate.maxDrawdown;
            if (configUpdate.maxTradesPerDay !== undefined) req.user.botConfig.maxTradesPerDay = configUpdate.maxTradesPerDay;
            if (configUpdate.maxConsecutiveLosses !== undefined) req.user.botConfig.maxConsecutiveLosses = configUpdate.maxConsecutiveLosses;
            if (configUpdate.minRiskRewardRatio !== undefined) req.user.botConfig.minRiskRewardRatio = configUpdate.minRiskRewardRatio;
            // Stratégie de trading
            if (configUpdate.strategy !== undefined) req.user.botConfig.strategy = configUpdate.strategy;
            // Paramètres Bollinger Squeeze
            if (configUpdate.bbPeriod !== undefined) req.user.botConfig.bbPeriod = configUpdate.bbPeriod;
            if (configUpdate.bbStdDev !== undefined) req.user.botConfig.bbStdDev = configUpdate.bbStdDev;
            if (configUpdate.kcPeriod !== undefined) req.user.botConfig.kcPeriod = configUpdate.kcPeriod;
            if (configUpdate.kcMultiplier !== undefined) req.user.botConfig.kcMultiplier = configUpdate.kcMultiplier;
            if (configUpdate.momentumPeriod !== undefined) req.user.botConfig.momentumPeriod = configUpdate.momentumPeriod;
            if (configUpdate.bbRsiFilter !== undefined) req.user.botConfig.bbRsiFilter = configUpdate.bbRsiFilter;
            if (configUpdate.bbVolumeFilter !== undefined) req.user.botConfig.bbVolumeFilter = configUpdate.bbVolumeFilter;
            if (configUpdate.enabledSignals) {
                req.user.botConfig.enabledSignals = { ...req.user.botConfig.enabledSignals, ...configUpdate.enabledSignals };
            }
            // Signaux SMC (simplifiés)
            if (configUpdate.smcSignals) {
                req.user.botConfig.smcSignals = { ...req.user.botConfig.smcSignals, ...configUpdate.smcSignals };
            }
            
            // Sauvegarde aussi dans le profil actif (si existe)
            // Note: On met à jour uniquement les champs envoyés, pas de spread global
            if (req.user.configProfiles && req.user.configProfiles.length > 0) {
                const activeProfileIndex = req.user.activeProfileIndex || 0;
                const activeProfile = req.user.configProfiles[activeProfileIndex];
                if (activeProfile && activeProfile.config) {
                    // Met à jour uniquement les champs définis (pas de spread)
                    if (configUpdate.symbols) activeProfile.config.symbols = configUpdate.symbols;
                    if (configUpdate.timeframes) activeProfile.config.timeframes = configUpdate.timeframes;
                    if (configUpdate.leverage !== undefined) activeProfile.config.leverage = configUpdate.leverage;
                    if (configUpdate.maxConcurrentTrades !== undefined) activeProfile.config.maxConcurrentTrades = configUpdate.maxConcurrentTrades;
                    if (configUpdate.minWinProbability !== undefined) activeProfile.config.minWinProbability = configUpdate.minWinProbability;
                    if (configUpdate.minScore !== undefined) activeProfile.config.minScore = configUpdate.minScore;
                    if (configUpdate.tpslMode !== undefined) activeProfile.config.tpslMode = configUpdate.tpslMode;
                    if (configUpdate.defaultTP !== undefined) activeProfile.config.defaultTP = configUpdate.defaultTP;
                    if (configUpdate.defaultSL !== undefined) activeProfile.config.defaultSL = configUpdate.defaultSL;
                    if (configUpdate.analysisInterval !== undefined) activeProfile.config.analysisInterval = configUpdate.analysisInterval;
                    if (configUpdate.atrMultiplierSL !== undefined) activeProfile.config.atrMultiplierSL = configUpdate.atrMultiplierSL;
                    if (configUpdate.atrMultiplierTP !== undefined) activeProfile.config.atrMultiplierTP = configUpdate.atrMultiplierTP;
                    if (configUpdate.useRSIFilter !== undefined) activeProfile.config.useRSIFilter = configUpdate.useRSIFilter;
                    if (configUpdate.rsiOverbought !== undefined) activeProfile.config.rsiOverbought = configUpdate.rsiOverbought;
                    if (configUpdate.rsiOversold !== undefined) activeProfile.config.rsiOversold = configUpdate.rsiOversold;
                    if (configUpdate.multiTimeframeMode !== undefined) activeProfile.config.multiTimeframeMode = configUpdate.multiTimeframeMode;
                    if (configUpdate.mtfTimeframes) activeProfile.config.mtfTimeframes = configUpdate.mtfTimeframes;
                    if (configUpdate.mtfMinConfirmation !== undefined) activeProfile.config.mtfMinConfirmation = configUpdate.mtfMinConfirmation;
                    if (configUpdate.strategy !== undefined) activeProfile.config.strategy = configUpdate.strategy;
                    if (configUpdate.enabledSignals) {
                        activeProfile.config.enabledSignals = { ...activeProfile.config.enabledSignals, ...configUpdate.enabledSignals };
                    }
                    // Mode et Multi-Crypto
                    if (configUpdate.mode !== undefined) activeProfile.config.mode = configUpdate.mode;
                    if (configUpdate.multiCryptoMode !== undefined) activeProfile.config.multiCryptoMode = configUpdate.multiCryptoMode;
                    if (configUpdate.multiTFTrading !== undefined) activeProfile.config.multiTFTrading = configUpdate.multiTFTrading;
                    // Multi-Timeframe (nouveaux champs)
                    if (configUpdate.useMTF !== undefined) activeProfile.config.useMTF = configUpdate.useMTF;
                    if (configUpdate.mtfPrimary !== undefined) activeProfile.config.mtfPrimary = configUpdate.mtfPrimary;
                    if (configUpdate.mtfHigher !== undefined) activeProfile.config.mtfHigher = configUpdate.mtfHigher;
                    if (configUpdate.mtfConfirmations !== undefined) activeProfile.config.mtfConfirmations = configUpdate.mtfConfirmations;
                    // Bollinger params
                    if (configUpdate.bbPeriod !== undefined) activeProfile.config.bbPeriod = configUpdate.bbPeriod;
                    if (configUpdate.bbStdDev !== undefined) activeProfile.config.bbStdDev = configUpdate.bbStdDev;
                    if (configUpdate.kcPeriod !== undefined) activeProfile.config.kcPeriod = configUpdate.kcPeriod;
                    if (configUpdate.kcMultiplier !== undefined) activeProfile.config.kcMultiplier = configUpdate.kcMultiplier;
                    if (configUpdate.momentumPeriod !== undefined) activeProfile.config.momentumPeriod = configUpdate.momentumPeriod;
                    if (configUpdate.bbRsiFilter !== undefined) activeProfile.config.bbRsiFilter = configUpdate.bbRsiFilter;
                    if (configUpdate.bbVolumeFilter !== undefined) activeProfile.config.bbVolumeFilter = configUpdate.bbVolumeFilter;
                    // Signaux SMC (simplifiés)
                    if (configUpdate.smcSignals) {
                        activeProfile.config.smcSignals = { ...activeProfile.config.smcSignals, ...configUpdate.smcSignals };
                    }
                    
                    // Marque le sous-document comme modifié pour Mongoose
                    req.user.markModified('configProfiles');
                    console.log(`[CONFIG] Profil actif "${activeProfile.name}" mis à jour`);
                }
            }
            
            await req.user.save();
            console.log(`[CONFIG] Config sauvegardée pour ${req.user.username}`);
            
            // Applique au bot utilisateur actif (si en cours d'exécution)
            const userId = req.user._id.toString();
            botManager.updateBotConfig(userId, configUpdate);
            
            // Applique aussi au tradeEngine pour la session (fallback)
            tradeEngine.updateConfig(configUpdate);
            
            return res.json({ success: true, config: req.user.botConfig, savedToUser: true });
        }
        
        // Sinon sauvegarde globale
        tradeEngine.updateConfig(req.body);
        res.json({ success: true, config: tradeEngine.config, savedToUser: false });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/config/risk
 * Retourne la config risk management du profil actif (PROTÉGÉ)
 */
router.get('/config/risk', requireAuth, async (req, res) => {
    const globalConfig = riskManager.getConfig();
    
    // Priorité: Config du profil actif > botConfig global > riskManager par défaut
    if (req.user.configProfiles && req.user.configProfiles.length > 0) {
        const activeIndex = req.user.activeProfileIndex || 0;
        const activeProfile = req.user.configProfiles[activeIndex];
        if (activeProfile && activeProfile.config) {
            return res.json({ 
                config: {
                    riskPerTrade: activeProfile.config.riskPerTrade ?? req.user.botConfig?.riskPerTrade ?? globalConfig.riskPerTrade ?? 2,
                    maxPositionSize: activeProfile.config.maxPositionSize ?? req.user.botConfig?.maxPositionSize ?? globalConfig.maxPositionSize ?? 50,
                    dailyLossLimit: activeProfile.config.dailyLossLimit ?? req.user.botConfig?.dailyLossLimit ?? globalConfig.dailyLossLimit ?? 5,
                    maxDrawdown: activeProfile.config.maxDrawdown ?? req.user.botConfig?.maxDrawdown ?? globalConfig.maxDrawdown ?? 20,
                    maxTradesPerDay: activeProfile.config.maxTradesPerDay ?? req.user.botConfig?.maxTradesPerDay ?? globalConfig.maxTradesPerDay ?? 10,
                    maxConsecutiveLosses: activeProfile.config.maxConsecutiveLosses ?? req.user.botConfig?.maxConsecutiveLosses ?? globalConfig.maxConsecutiveLosses ?? 3,
                    minRiskRewardRatio: activeProfile.config.minRiskRewardRatio ?? req.user.botConfig?.minRiskRewardRatio ?? globalConfig.minRiskRewardRatio ?? 1.5
                },
                fromUser: true,
                fromProfile: true,
                activeProfileIndex: activeIndex,
                profileName: activeProfile.name
            });
        }
    }
    
    // Fallback sur botConfig global
    if (req.user.botConfig) {
        return res.json({ 
            config: {
                riskPerTrade: req.user.botConfig.riskPerTrade ?? globalConfig.riskPerTrade ?? 2,
                maxPositionSize: req.user.botConfig.maxPositionSize ?? globalConfig.maxPositionSize ?? 50,
                dailyLossLimit: req.user.botConfig.dailyLossLimit ?? globalConfig.dailyLossLimit ?? 5,
                maxDrawdown: req.user.botConfig.maxDrawdown ?? globalConfig.maxDrawdown ?? 20,
                maxTradesPerDay: req.user.botConfig.maxTradesPerDay ?? globalConfig.maxTradesPerDay ?? 10,
                maxConsecutiveLosses: req.user.botConfig.maxConsecutiveLosses ?? globalConfig.maxConsecutiveLosses ?? 3,
                minRiskRewardRatio: req.user.botConfig.minRiskRewardRatio ?? globalConfig.minRiskRewardRatio ?? 1.5
            },
            fromUser: true,
            fromProfile: false
        });
    }
    
    res.json({ config: globalConfig, fromUser: false, fromProfile: false });
});

/**
 * POST /api/config/risk
 * Met à jour la config risk management (protégé)
 */
router.post('/config/risk', requireAuth, async (req, res) => {
    try {
        const configUpdate = req.body;
        
        // Si utilisateur connecté, sauvegarde TOUS les paramètres dans son compte
        if (req.user) {
            // Paramètres Risk Manager
            if (configUpdate.riskPerTrade !== undefined) req.user.botConfig.riskPerTrade = configUpdate.riskPerTrade;
            if (configUpdate.maxPositionSize !== undefined) req.user.botConfig.maxPositionSize = configUpdate.maxPositionSize;
            if (configUpdate.dailyLossLimit !== undefined) req.user.botConfig.dailyLossLimit = configUpdate.dailyLossLimit;
            if (configUpdate.maxDrawdown !== undefined) req.user.botConfig.maxDrawdown = configUpdate.maxDrawdown;
            if (configUpdate.maxTradesPerDay !== undefined) req.user.botConfig.maxTradesPerDay = configUpdate.maxTradesPerDay;
            if (configUpdate.maxConsecutiveLosses !== undefined) req.user.botConfig.maxConsecutiveLosses = configUpdate.maxConsecutiveLosses;
            if (configUpdate.minRiskRewardRatio !== undefined) req.user.botConfig.minRiskRewardRatio = configUpdate.minRiskRewardRatio;
            
            // Sauvegarde aussi dans le profil actif (si existe)
            // Note: On met à jour uniquement les champs risk, pas tout le config
            if (req.user.configProfiles && req.user.configProfiles.length > 0) {
                const activeProfileIndex = req.user.activeProfileIndex || 0;
                const activeProfile = req.user.configProfiles[activeProfileIndex];
                if (activeProfile && activeProfile.config) {
                    // Met à jour uniquement les champs risk (pas de spread global)
                    if (configUpdate.riskPerTrade !== undefined) activeProfile.config.riskPerTrade = configUpdate.riskPerTrade;
                    if (configUpdate.maxPositionSize !== undefined) activeProfile.config.maxPositionSize = configUpdate.maxPositionSize;
                    if (configUpdate.dailyLossLimit !== undefined) activeProfile.config.dailyLossLimit = configUpdate.dailyLossLimit;
                    if (configUpdate.maxDrawdown !== undefined) activeProfile.config.maxDrawdown = configUpdate.maxDrawdown;
                    if (configUpdate.maxTradesPerDay !== undefined) activeProfile.config.maxTradesPerDay = configUpdate.maxTradesPerDay;
                    if (configUpdate.maxConsecutiveLosses !== undefined) activeProfile.config.maxConsecutiveLosses = configUpdate.maxConsecutiveLosses;
                    if (configUpdate.minRiskRewardRatio !== undefined) activeProfile.config.minRiskRewardRatio = configUpdate.minRiskRewardRatio;
                    
                    // Marque le sous-document comme modifié pour Mongoose
                    req.user.markModified('configProfiles');
                    console.log(`[RISK] Profil actif "${activeProfile.name}" mis à jour`);
                }
            }
            
            await req.user.save();
            console.log(`[RISK] Config risk sauvegardée pour ${req.user.username}`);
            
            // Applique au bot utilisateur actif
            const userId = req.user._id.toString();
            botManager.updateBotConfig(userId, {
                riskPerTrade: configUpdate.riskPerTrade,
                maxPositionSize: configUpdate.maxPositionSize,
                dailyLossLimit: configUpdate.dailyLossLimit,
                maxDrawdown: configUpdate.maxDrawdown,
                maxTradesPerDay: configUpdate.maxTradesPerDay,
                maxConsecutiveLosses: configUpdate.maxConsecutiveLosses,
                minRiskRewardRatio: configUpdate.minRiskRewardRatio
            });
        }
        
        // Sauvegarde aussi dans riskManager global
        riskManager.updateConfig(configUpdate);
        res.json({ success: true, config: riskManager.getConfig() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/risk/reset
 * Réinitialise les stats journalières (protégé)
 */
router.post('/risk/reset', requireAuth, async (req, res) => {
    try {
        const balance = await api.getAccountBalance();
        riskManager.resetDailyStats(balance.totalEquity);
        res.json({ success: true, stats: riskManager.getStats() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/risk/restart-bot
 * Redémarre le bot après arrêt risk (protégé)
 */
router.post('/risk/restart-bot', requireAuth, (req, res) => {
    riskManager.restartBot();
    res.json({ success: true, stats: riskManager.getStats() });
});

// ==================== PROFILES ROUTES ====================

/**
 * GET /api/profiles
 * Retourne la liste des profils de l'utilisateur
 */
router.get('/profiles', requireAuth, async (req, res) => {
    try {
        const profiles = req.user.configProfiles.map((p, index) => ({
            id: p._id,
            index,
            name: p.name,
            description: p.description,
            isActive: index === req.user.activeProfileIndex,
            createdAt: p.createdAt
        }));
        
        res.json({ 
            success: true, 
            profiles,
            activeProfileIndex: req.user.activeProfileIndex
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/profiles
 * Crée un nouveau profil
 */
router.post('/profiles', requireAuth, validate(profileSchema), async (req, res) => {
    try {
        const { name, description, copyFromCurrent } = req.body;
        
        // Limite à 10 profils max
        if (req.user.configProfiles.length >= 10) {
            return res.status(400).json({ error: 'Maximum 10 profils autorisés' });
        }
        
        const profileData = {
            name: name || `Profil ${req.user.configProfiles.length + 1}`,
            description: description || '',
            config: copyFromCurrent !== false ? { ...req.user.botConfig.toObject() } : undefined
        };
        
        const newProfile = req.user.addProfile(profileData);
        await req.user.save();
        
        console.log(`[PROFILES] Profil "${newProfile.name}" créé pour ${req.user.username}`);
        
        res.json({ 
            success: true, 
            profile: {
                id: newProfile._id,
                index: req.user.configProfiles.length - 1,
                name: newProfile.name,
                description: newProfile.description,
                isActive: newProfile.isActive
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/profiles/:index
 * Retourne les détails d'un profil spécifique
 */
router.get('/profiles/:index', requireAuth, async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        
        if (index < 0 || index >= req.user.configProfiles.length) {
            return res.status(404).json({ error: 'Profil non trouvé' });
        }
        
        const profile = req.user.configProfiles[index];
        
        res.json({ 
            success: true, 
            profile: {
                id: profile._id,
                index,
                name: profile.name,
                description: profile.description,
                isActive: index === req.user.activeProfileIndex,
                config: profile.config,
                createdAt: profile.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/profiles/:index
 * Met à jour un profil
 */
router.put('/profiles/:index', requireAuth, async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        const { name, description, config } = req.body;
        
        const updatedProfile = req.user.updateProfile(index, { name, description, config });
        
        if (!updatedProfile) {
            return res.status(404).json({ error: 'Profil non trouvé' });
        }
        
        await req.user.save();
        
        // Si c'est le profil actif et que le bot tourne, met à jour le bot
        if (index === req.user.activeProfileIndex && config) {
            const userId = req.user._id.toString();
            botManager.updateBotConfig(userId, config);
        }
        
        console.log(`[PROFILES] Profil "${updatedProfile.name}" mis à jour pour ${req.user.username}`);
        
        res.json({ 
            success: true, 
            profile: {
                id: updatedProfile._id,
                index,
                name: updatedProfile.name,
                description: updatedProfile.description,
                isActive: index === req.user.activeProfileIndex
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/profiles/:index/activate
 * Active un profil
 */
router.post('/profiles/:index/activate', requireAuth, async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        
        const success = req.user.setActiveProfile(index);
        
        if (!success) {
            return res.status(404).json({ error: 'Profil non trouvé' });
        }
        
        await req.user.save();
        
        // Met à jour le bot avec la nouvelle config
        const userId = req.user._id.toString();
        const profile = req.user.configProfiles[index];
        if (profile && profile.config) {
            botManager.updateBotConfig(userId, profile.config);
        }
        
        console.log(`[PROFILES] Profil "${profile.name}" activé pour ${req.user.username}`);
        
        res.json({ 
            success: true, 
            activeProfileIndex: index,
            profileName: profile.name,
            config: profile.config || req.user.botConfig
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/profiles/:index
 * Supprime un profil
 */
router.delete('/profiles/:index', requireAuth, async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        console.log(`[PROFILES] DELETE demandé pour index ${index} par ${req.user.username}`);
        console.log(`[PROFILES] Nombre de profils avant: ${req.user.configProfiles.length}`);
        
        const profileName = req.user.configProfiles[index]?.name;
        
        // Si c'est le dernier profil, on le supprime et on en crée un nouveau par défaut
        if (req.user.configProfiles.length <= 1) {
            // Supprime le profil actuel
            req.user.configProfiles = [];
            req.user.activeProfileIndex = 0;
            
            // Crée un profil par défaut
            req.user.addProfile({
                name: 'Profil par défaut',
                description: 'Profil créé automatiquement'
            });
            
            // Force Mongoose à détecter la modification
            req.user.markModified('configProfiles');
            await req.user.save();
            
            console.log(`[PROFILES] Dernier profil "${profileName}" supprimé, profil par défaut créé pour ${req.user.username}`);
            console.log(`[PROFILES] Nombre de profils après: ${req.user.configProfiles.length}`);
            
            return res.json({ 
                success: true, 
                message: 'Profil supprimé, un nouveau profil par défaut a été créé',
                activeProfileIndex: 0,
                remainingProfiles: 1
            });
        }
        
        const success = req.user.deleteProfile(index);
        
        if (!success) {
            return res.status(404).json({ error: 'Profil non trouvé' });
        }
        
        // Force Mongoose à détecter la modification
        req.user.markModified('configProfiles');
        await req.user.save();
        
        console.log(`[PROFILES] Nombre de profils après: ${req.user.configProfiles.length}`);
        
        console.log(`[PROFILES] Profil "${profileName}" supprimé pour ${req.user.username}`);
        
        res.json({ 
            success: true, 
            activeProfileIndex: req.user.activeProfileIndex,
            remainingProfiles: req.user.configProfiles.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/profiles/:index/duplicate
 * Duplique un profil
 */
router.post('/profiles/:index/duplicate', requireAuth, async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        
        if (req.user.configProfiles.length >= 10) {
            return res.status(400).json({ error: 'Maximum 10 profils autorisés' });
        }
        
        if (index < 0 || index >= req.user.configProfiles.length) {
            return res.status(404).json({ error: 'Profil non trouvé' });
        }
        
        const sourceProfile = req.user.configProfiles[index];
        const newProfile = req.user.addProfile({
            name: `${sourceProfile.name} (copie)`,
            description: sourceProfile.description,
            config: { ...sourceProfile.config.toObject() }
        });
        
        await req.user.save();
        
        console.log(`[PROFILES] Profil "${sourceProfile.name}" dupliqué pour ${req.user.username}`);
        
        res.json({ 
            success: true, 
            profile: {
                id: newProfile._id,
                index: req.user.configProfiles.length - 1,
                name: newProfile.name,
                description: newProfile.description,
                isActive: false
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API KEYS ROUTES (LIÉES À L'UTILISATEUR) ====================

/**
 * POST /api/keys/save
 * Sauvegarde les clés API dans le compte utilisateur (protégé)
 */
router.post('/keys/save', requireAuth, async (req, res) => {
    try {
        const { secretPhrase, apiKey, tradingAddress, walletName } = req.body;

        if (!secretPhrase) {
            return res.status(400).json({ error: 'Secret phrase requis' });
        }

        // Valide et génère l'adresse (supporte seed phrase et clé privée)
        let address = '';
        try {
            const { ethers } = await import('ethers');
            let wallet;
            
            if (secretPhrase.startsWith('0x')) {
                // Clé privée
                wallet = new ethers.Wallet(secretPhrase);
            } else {
                // Seed phrase
                wallet = ethers.Wallet.fromPhrase(secretPhrase);
            }
            
            address = wallet.address;
        } catch (e) {
            return res.status(400).json({ error: 'Phrase secrète ou clé privée invalide' });
        }

        // Si utilisateur connecté, sauvegarde dans son compte
        if (req.user) {
            // Vérifie si ce wallet existe déjà pour cet utilisateur
            const existingWallet = req.user.wallets.find(w => w.address === address);
            
            if (existingWallet) {
                // Met à jour le wallet existant
                existingWallet.tradingAddress = tradingAddress || existingWallet.tradingAddress;
                existingWallet.name = walletName || existingWallet.name;
            } else {
                // Ajoute un nouveau wallet
                const encryptedSecret = encryptSecret(secretPhrase);
                req.user.addWallet({
                    name: walletName || `Wallet ${req.user.wallets.length + 1}`,
                    address,
                    secretPhrase: encryptedSecret,
                    tradingAddress: tradingAddress || null
                });
            }
            
            await req.user.save();
            console.log(`[KEYS] Wallet sauvegardé pour ${req.user.username}: ${address}`);
        }

        // Initialise l'authentification pour la session
        await auth.initialize(secretPhrase);
        if (tradingAddress && tradingAddress.startsWith('0x')) {
            auth.setTradingAddress(tradingAddress);
        }

        // NE PAS sauvegarder en local si utilisateur connecté (tout sur MongoDB)
        if (!req.user) {
            // Seulement pour les utilisateurs non connectés (fallback)
            auth.saveKeys(secretPhrase, apiKey || '', auth.tradingAddress);
        }

        res.json({ 
            success: true, 
            apiAddress: address,
            tradingAddress: tradingAddress || address,
            message: req.user ? 'Wallet sauvegardé dans votre compte MongoDB' : 'Clés sauvegardées localement',
            savedToAccount: !!req.user
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/keys/trading-address
 * Retourne l'adresse de trading de l'utilisateur connecté (PROTÉGÉ)
 */
router.get('/keys/trading-address', requireAuth, async (req, res) => {
    const activeWallet = req.user.getActiveWallet();
    if (activeWallet) {
        return res.json({
            tradingAddress: activeWallet.tradingAddress || activeWallet.address,
            address: activeWallet.address,
            walletName: activeWallet.name,
            isUserWallet: true
        });
    }
    // Utilisateur connecté mais pas de wallet
    res.json({
        tradingAddress: null,
        address: null,
        walletName: null,
        isUserWallet: true
    });
});

/**
 * GET /api/keys/status
 * Retourne le statut de l'authentification de l'utilisateur (PROTÉGÉ)
 */
router.get('/keys/status', requireAuth, async (req, res) => {
    const activeWallet = req.user.getActiveWallet();
    res.json({
        authenticated: !!activeWallet,
        address: activeWallet?.address || null,
        tradingAddress: activeWallet?.tradingAddress || activeWallet?.address || null,
        walletName: activeWallet?.name || null,
        walletsCount: req.user.wallets.length,
        isUserWallet: true
    });
});

/**
 * GET /api/account/check/:address
 * Vérifie le solde d'une adresse spécifique (PROTÉGÉ - admin/debug)
 */
router.get('/account/check/:address', requireAuth, async (req, res) => {
    try {
        const { address } = req.params;
        
        // Requête directe à l'API Hyperliquid
        const response = await fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'clearinghouseState',
                user: address
            })
        });
        
        const perpsData = await response.json();
        
        // Requête Spot
        const spotResponse = await fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'spotClearinghouseState',
                user: address
            })
        });
        
        const spotData = await spotResponse.json();
        
        res.json({
            address,
            perps: perpsData,
            spot: spotData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/keys/test
 * Teste la connexion (protégé)
 */
router.post('/keys/test', requireAuth, async (req, res) => {
    try {
        const result = await auth.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/keys/load
 * Charge les clés sauvegardées (protégé)
 */
router.post('/keys/load', requireAuth, async (req, res) => {
    try {
        const keys = auth.loadKeys();
        
        if (!keys) {
            return res.status(404).json({ error: 'Aucune clé sauvegardée' });
        }

        await auth.initialize(keys.secretPhrase);

        res.json({
            success: true,
            address: auth.getAddress()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== MULTI-WALLET ROUTES ====================
// NOTE: Les routes /wallets principales sont dans walletRoutes.js (MongoDB)
// La route legacy /wallets/load a été supprimée car elle interférait avec le système MongoDB

// ==================== SIGNALS ROUTES ====================

/**
 * GET /api/signals/history
 * Retourne l'historique des signaux (PROTÉGÉ)
 */
router.get('/signals/history', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const history = signalDetector.getSignalHistory(limit);
    res.json({ signals: history });
});

/**
 * GET /api/signals/last
 * Retourne le dernier signal (PROTÉGÉ)
 */
router.get('/signals/last', requireAuth, (req, res) => {
    const signal = signalDetector.getLastSignal();
    res.json({ signal });
});

// ==================== BALANCE & ACCOUNT ====================

/**
 * GET /api/account/balance
 * Retourne le solde du compte de l'utilisateur connecté (PROTÉGÉ)
 */
router.get('/account/balance', requireAuth, async (req, res) => {
    try {
        const activeWallet = req.user.getActiveWallet();
        const addressToUse = activeWallet?.tradingAddress || activeWallet?.address;
        
        if (!addressToUse) {
            return res.json({ balance: 0, equity: 0, message: 'Aucun wallet configuré' });
        }
        
        const balance = await api.getAccountBalance(addressToUse);
        res.json({
            ...balance,
            addressUsed: addressToUse,
            isUserWallet: true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/account/fills
 * Retourne l'historique des trades de l'utilisateur connecté (PROTÉGÉ)
 */
router.get('/account/fills', requireAuth, async (req, res) => {
    try {
        const activeWallet = req.user.getActiveWallet();
        const tradingAddress = activeWallet?.tradingAddress || activeWallet?.address;
        
        if (!tradingAddress) {
            return res.json({ fills: [], message: 'Aucun wallet configuré' });
        }
        
        const fills = await api.getUserFills(tradingAddress);
        res.json({ fills, isUserWallet: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/account/stats
 * Retourne les statistiques calculées à partir de l'historique (PROTÉGÉ)
 */
router.get('/account/stats', requireAuth, async (req, res) => {
    try {
        const activeWallet = req.user.getActiveWallet();
        const tradingAddress = activeWallet?.tradingAddress || activeWallet?.address;
        
        if (!tradingAddress) {
            return res.json({
                totalTrades: 0, wins: 0, losses: 0, winRate: 0,
                totalPnL: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
                message: 'Aucun wallet configuré'
            });
        }
        
        const fills = await api.getUserFills(tradingAddress);
        
        if (!fills || fills.length === 0) {
            return res.json({
                totalTrades: 0,
                wins: 0,
                losses: 0,
                winRate: 0,
                totalPnL: 0,
                avgWin: 0,
                avgLoss: 0,
                profitFactor: 0,
                maxDrawdown: 0,
                winStreak: 0,
                lossStreak: 0,
                pnlHistory: []
            });
        }
        
        // Groupe les fills par trade (même oid ou temps proche)
        const trades = [];
        let currentTrade = null;
        
        for (const fill of fills) {
            const pnl = parseFloat(fill.closedPnl || 0);
            const time = fill.time || Date.now();
            const side = fill.side;
            const coin = fill.coin;
            const size = parseFloat(fill.sz || 0);
            const price = parseFloat(fill.px || 0);
            
            // Si c'est une fermeture de position (closedPnl != 0)
            if (pnl !== 0) {
                trades.push({
                    time,
                    coin,
                    side,
                    size,
                    price,
                    pnl,
                    isWin: pnl > 0
                });
            }
        }
        
        // Calcul des statistiques
        const wins = trades.filter(t => t.isWin);
        const losses = trades.filter(t => !t.isWin);
        
        const totalWinPnL = wins.reduce((sum, t) => sum + t.pnl, 0);
        const totalLossPnL = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
        
        const avgWin = wins.length > 0 ? totalWinPnL / wins.length : 0;
        const avgLoss = losses.length > 0 ? totalLossPnL / losses.length : 0;
        const profitFactor = totalLossPnL > 0 ? totalWinPnL / totalLossPnL : totalWinPnL > 0 ? 999 : 0;
        
        // Calcul des séries
        let currentWinStreak = 0;
        let currentLossStreak = 0;
        let maxWinStreak = 0;
        let maxLossStreak = 0;
        
        for (const trade of trades) {
            if (trade.isWin) {
                currentWinStreak++;
                currentLossStreak = 0;
                maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
            } else {
                currentLossStreak++;
                currentWinStreak = 0;
                maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
            }
        }
        
        // Calcul du drawdown
        let peak = 0;
        let maxDrawdown = 0;
        let runningPnL = 0;
        const pnlHistory = [];
        
        for (const trade of trades) {
            runningPnL += trade.pnl;
            peak = Math.max(peak, runningPnL);
            const drawdown = peak > 0 ? ((peak - runningPnL) / peak) * 100 : 0;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
            
            pnlHistory.push({
                time: trade.time,
                pnl: trade.pnl,
                cumulative: runningPnL,
                coin: trade.coin
            });
        }
        
        // Stats du jour
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTrades = trades.filter(t => new Date(t.time) >= today);
        const todayPnL = todayTrades.reduce((sum, t) => sum + t.pnl, 0);
        const todayWins = todayTrades.filter(t => t.isWin).length;
        const todayWinRate = todayTrades.length > 0 ? (todayWins / todayTrades.length) * 100 : 0;
        
        res.json({
            totalTrades: trades.length,
            wins: wins.length,
            losses: losses.length,
            winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
            totalPnL: runningPnL,
            avgWin,
            avgLoss,
            profitFactor,
            maxDrawdown,
            winStreak: maxWinStreak,
            lossStreak: maxLossStreak,
            currentWinStreak,
            currentLossStreak,
            // Stats du jour
            todayTrades: todayTrades.length,
            todayPnL,
            todayWinRate,
            // Historique pour le graphique
            pnlHistory: pnlHistory.slice(-100) // Derniers 100 trades
        });
    } catch (error) {
        console.error('Erreur stats:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/account/history
 * Retourne l'historique des trades avec filtres (PROTÉGÉ)
 */
router.get('/account/history', requireAuth, async (req, res) => {
    try {
        const activeWallet = req.user.getActiveWallet();
        const tradingAddress = activeWallet?.tradingAddress || activeWallet?.address;
        
        if (!tradingAddress) {
            return res.json({ trades: [], stats: { total: 0 }, message: 'Aucun wallet configuré' });
        }
        
        const fills = await api.getUserFills(tradingAddress);
        
        // Paramètres de filtrage
        const { period, symbol, result, direction } = req.query;
        
        // Calcul de la date limite selon la période
        let dateLimit = null;
        const now = new Date();
        if (period === 'today') {
            dateLimit = new Date(now.setHours(0, 0, 0, 0));
        } else if (period === 'week') {
            dateLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (period === 'month') {
            dateLimit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
        
        // Groupe les fills en trades (entrée + sortie)
        const tradesMap = new Map();
        
        for (const fill of fills) {
            const coin = fill.coin;
            const time = fill.time;
            const side = fill.side; // 'B' ou 'A' (Buy/Ask=Sell)
            const size = parseFloat(fill.sz || 0);
            const price = parseFloat(fill.px || 0);
            const pnl = parseFloat(fill.closedPnl || 0);
            const dir = fill.dir; // 'Open Long', 'Close Long', etc.
            
            // Crée une clé unique pour le trade
            const tradeKey = `${coin}_${fill.oid || time}`;
            
            if (!tradesMap.has(tradeKey)) {
                tradesMap.set(tradeKey, {
                    coin,
                    direction: dir?.includes('Long') ? 'long' : 'short',
                    entries: [],
                    exits: [],
                    totalPnL: 0
                });
            }
            
            const trade = tradesMap.get(tradeKey);
            
            if (dir?.includes('Open')) {
                trade.entries.push({ time, price, size });
            } else if (dir?.includes('Close')) {
                trade.exits.push({ time, price, size, pnl });
                trade.totalPnL += pnl;
            }
        }
        
        // Convertit en tableau et calcule les métriques
        let trades = [];
        
        for (const [key, trade] of tradesMap) {
            if (trade.exits.length === 0) continue; // Ignore les trades non fermés
            
            const entryTime = trade.entries[0]?.time || trade.exits[0]?.time;
            const exitTime = trade.exits[trade.exits.length - 1]?.time;
            let entryPrice = 0;
            if (trade.entries.length > 0) {
                // Calcul normal si on a les entrées
                entryPrice = trade.entries.reduce((sum, e) => sum + e.price * e.size, 0) / trade.entries.reduce((sum, e) => sum + e.size, 0);
            } else if (trade.exits.length > 0) {
                // Calcul inversé à partir du PnL et du prix de sortie
                // PnL = (exitPrice - entryPrice) * size pour long
                // PnL = (entryPrice - exitPrice) * size pour short
                const avgExitPrice = trade.exits.reduce((sum, e) => sum + e.price * e.size, 0) / trade.exits.reduce((sum, e) => sum + e.size, 0);
                const totalSize = trade.exits.reduce((sum, e) => sum + e.size, 0);
                if (totalSize > 0 && avgExitPrice > 0) {
                    if (trade.direction === 'long') {
                        // entryPrice = exitPrice - (PnL / size)
                        entryPrice = avgExitPrice - (trade.totalPnL / totalSize);
                    } else {
                        // entryPrice = exitPrice + (PnL / size)
                        entryPrice = avgExitPrice + (trade.totalPnL / totalSize);
                    }
                }
            }
            const exitPrice = trade.exits.reduce((sum, e) => sum + e.price * e.size, 0) / trade.exits.reduce((sum, e) => sum + e.size, 0);
            const totalSize = trade.entries.reduce((sum, e) => sum + e.size, 0) || trade.exits.reduce((sum, e) => sum + e.size, 0);
            
            trades.push({
                id: key,
                coin: trade.coin,
                direction: trade.direction,
                entryTime,
                exitTime,
                entryPrice,
                exitPrice,
                size: totalSize,
                pnl: trade.totalPnL,
                duration: exitTime - entryTime,
                isWin: trade.totalPnL > 0
            });
        }
        
        // Trie par date décroissante
        trades.sort((a, b) => b.exitTime - a.exitTime);
        
        // Applique les filtres
        if (dateLimit) {
            trades = trades.filter(t => new Date(t.exitTime) >= dateLimit);
        }
        if (symbol && symbol !== 'all') {
            trades = trades.filter(t => t.coin === symbol);
        }
        if (result === 'win') {
            trades = trades.filter(t => t.isWin);
        } else if (result === 'loss') {
            trades = trades.filter(t => !t.isWin);
        }
        if (direction && direction !== 'all') {
            trades = trades.filter(t => t.direction === direction);
        }
        
        // Calcul des stats
        const wins = trades.filter(t => t.isWin);
        const losses = trades.filter(t => !t.isWin);
        const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
        
        // Liste des symboles uniques pour le filtre
        const uniqueSymbols = [...new Set(fills.map(f => f.coin))];
        
        res.json({
            trades,
            stats: {
                total: trades.length,
                wins: wins.length,
                losses: losses.length,
                winRate: trades.length > 0 ? (wins.length / trades.length * 100).toFixed(1) : 0,
                totalPnL
            },
            symbols: uniqueSymbols
        });
    } catch (error) {
        console.error('Erreur history:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== SCANNER ROUTES ====================

/**
 * GET /api/scanner/scan
 * Lance un scan de toutes les cryptos (PROTÉGÉ)
 */
router.get('/scanner/scan', requireAuth, async (req, res) => {
    try {
        const timeframe = req.query.timeframe || '1h';
        const strategy = req.query.strategy || 'ichimoku';
        const symbols = req.query.symbols ? req.query.symbols.split(',') : TOP_CRYPTOS;
        
        const results = await scanner.scanAll(symbols, timeframe, { strategy });
        const summary = scanner.getSummary();
        
        res.json({
            success: true,
            summary,
            results: results.filter(r => r.success)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/scanner/results
 * Retourne les résultats du dernier scan (PROTÉGÉ)
 */
router.get('/scanner/results', requireAuth, (req, res) => {
    const sortBy = req.query.sortBy || 'score';
    const order = req.query.order || 'desc';
    
    const results = scanner.getAllResults(sortBy, order);
    const summary = scanner.getSummary();
    
    res.json({
        summary,
        results
    });
});

/**
 * GET /api/scanner/opportunities
 * Retourne les meilleures opportunités de trading (PROTÉGÉ)
 */
router.get('/scanner/opportunities', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 5;
    
    const opportunities = scanner.getBestOpportunities(limit);
    const bullish = scanner.getBullishCryptos();
    const bearish = scanner.getBearishCryptos();
    
    res.json({
        opportunities,
        bullish,
        bearish
    });
});

/**
 * GET /api/scanner/symbol/:symbol
 * Retourne l'analyse d'un symbole spécifique (PROTÉGÉ)
 */
router.get('/scanner/symbol/:symbol', requireAuth, async (req, res) => {
    try {
        const { symbol } = req.params;
        const timeframe = req.query.timeframe || '1h';
        
        const result = await scanner.analyzeSymbol(symbol.toUpperCase(), timeframe);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/trade-details/:symbol
 * Retourne les détails complets d'un trade potentiel (SL, TP, probabilités) (PROTÉGÉ)
 * Accepte les paramètres strategy et timeframe pour utiliser la même stratégie que le scanner
 */
router.get('/trade-details/:symbol', requireAuth, async (req, res) => {
    try {
        const { symbol } = req.params;
        const strategy = req.query.strategy || 'ichimoku';
        const timeframe = req.query.timeframe || '15m';
        
        const details = await tradeEngine.getTradeDetails(symbol.toUpperCase(), { strategy, timeframe });
        res.json(details);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/scanner/start
 * Démarre le scan automatique (protégé)
 */
router.post('/scanner/start', requireAuth, (req, res) => {
    const intervalMs = req.body.interval || 300000; // 5 min par défaut
    const timeframe = req.body.timeframe || '1h';
    
    scanner.startAutoScan(intervalMs, TOP_CRYPTOS, timeframe);
    
    res.json({
        success: true,
        message: 'Scan automatique démarré',
        interval: intervalMs
    });
});

/**
 * POST /api/scanner/stop
 * Arrête le scan automatique (protégé)
 */
router.post('/scanner/stop', requireAuth, (req, res) => {
    scanner.stopAutoScan();
    res.json({ success: true, message: 'Scan automatique arrêté' });
});

/**
 * GET /api/scanner/cryptos
 * Retourne la liste des cryptos supportées (PROTÉGÉ)
 */
router.get('/scanner/cryptos', requireAuth, (req, res) => {
    res.json({ cryptos: TOP_CRYPTOS });
});

// ==================== BACKTESTING ROUTES ====================

/**
 * POST /api/backtest/run
 * Lance un backtest avec les paramètres spécifiés
 */
router.post('/backtest/run', requireAuth, async (req, res) => {
    try {
        const strategy = req.body.strategy || 'ichimoku';
        
        const config = {
            symbol: req.body.symbol || 'BTC',
            timeframe: req.body.timeframe || '15m',
            initialCapital: req.body.initialCapital || 1000,
            leverage: req.body.leverage || 5,
            riskPerTrade: req.body.riskPerTrade || 2,
            // Filtres de base
            useEMA200Filter: req.body.useEMA200Filter !== false,
            useMACDFilter: req.body.useMACDFilter !== false,
            useRSIFilter: req.body.useRSIFilter !== false,
            // Filtres avancés Ichimoku
            useSupertrendFilter: req.body.useSupertrendFilter !== false,
            useStrictFilters: req.body.useStrictFilters !== false,
            useChikouFilter: req.body.useChikouFilter !== false,
            // Filtres SMC
            useVolumeFilter: req.body.useVolumeFilter !== false,
            useSessionFilter: req.body.useSessionFilter !== false,
            // Scores
            minScore: req.body.minScore || 5,
            minConfluence: req.body.minConfluence || 3,
            minWinProbability: req.body.minWinProbability || 0.65,
            // Dates de période
            startDate: req.body.startDate || null,
            endDate: req.body.endDate || null,
            // Modes TP/SL (percent, atr, ichimoku, fibonacci)
            tpslMode: req.body.tpslMode || 'percent',
            atrMultiplierSL: req.body.atrMultiplierSL || 1.5,
            atrMultiplierTP: req.body.atrMultiplierTP || 2.5,
            customTP: req.body.customTP || null,
            customSL: req.body.customSL || null,
            // RRR minimum pour tous les modes
            minRRR: req.body.minRRR || 2,
            // Stratégie de trading (ichimoku ou smc)
            strategy: strategy
        };
        
        console.log(`[BACKTEST] Stratégie: ${strategy}, Filtres: EMA200=${config.useEMA200Filter}, MACD=${config.useMACDFilter}, RSI=${config.useRSIFilter}, Volume=${config.useVolumeFilter}, Session=${config.useSessionFilter}`);

        const result = await backtester.run(config);
        
        res.json({
            success: true,
            result
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * GET /api/backtest/status
 * Retourne le statut du backtest en cours (PROTÉGÉ)
 */
router.get('/backtest/status', requireAuth, (req, res) => {
    res.json(backtester.getStatus());
});

/**
 * GET /api/backtest/list
 * Liste les backtests sauvegardés
 */
router.get('/backtest/list', requireAuth, (req, res) => {
    try {
        const backtests = backtester.listSavedBacktests();
        res.json({ success: true, backtests });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/backtest/:filename
 * Charge un backtest sauvegardé
 */
router.get('/backtest/:filename', requireAuth, (req, res) => {
    try {
        const result = backtester.loadBacktest(req.params.filename);
        res.json({ success: true, result });
    } catch (error) {
        res.status(404).json({ success: false, error: error.message });
    }
});

// ==================== ADMIN ROUTES ====================

// Rate limiting pour les routes admin (protection brute force)
const adminRateLimits = new Map();
const ADMIN_RATE_LIMIT = 30; // 30 requêtes
const ADMIN_RATE_WINDOW = 60000; // par minute

/**
 * Middleware pour vérifier le rôle admin avec rate limiting et audit
 */
function requireAdmin(req, res, next) {
    // Vérifie le rôle
    if (!req.user || req.user.role !== 'admin') {
        console.log(`[SECURITY] Tentative d'accès admin refusée - IP: ${req.ip} - User: ${req.user?.email || 'non-auth'}`);
        return res.status(403).json({ success: false, error: 'Accès refusé. Droits administrateur requis.' });
    }
    
    // Rate limiting par IP
    const ip = req.ip;
    const now = Date.now();
    const userLimit = adminRateLimits.get(ip) || { count: 0, resetTime: now + ADMIN_RATE_WINDOW };
    
    if (now > userLimit.resetTime) {
        userLimit.count = 0;
        userLimit.resetTime = now + ADMIN_RATE_WINDOW;
    }
    
    userLimit.count++;
    adminRateLimits.set(ip, userLimit);
    
    if (userLimit.count > ADMIN_RATE_LIMIT) {
        console.log(`[SECURITY] Rate limit admin dépassé - IP: ${ip} - User: ${req.user.email}`);
        return res.status(429).json({ success: false, error: 'Trop de requêtes. Réessayez dans 1 minute.' });
    }
    
    // Log d'audit pour les actions admin
    console.log(`[ADMIN AUDIT] ${req.method} ${req.path} - Admin: ${req.user.email} - IP: ${ip}`);
    
    next();
}

/**
 * GET /api/admin/users
 * Liste tous les utilisateurs (ADMIN ONLY)
 */
router.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const status = req.query.status || 'all';
        
        let query = {};
        
        // Filtre par recherche
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Filtre par statut
        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'inactive') {
            query.isActive = false;
        }
        
        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .select('-password -wallets.secretPhrase')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);
        
        res.json({
            success: true,
            users: users.map(u => ({
                id: u._id,
                email: u.email,
                username: u.username,
                role: u.role,
                isActive: u.isActive,
                isEmailVerified: u.isEmailVerified,
                walletsCount: u.wallets?.length || 0,
                lastLogin: u.lastLogin,
                createdAt: u.createdAt
            })),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/stats
 * Statistiques globales (ADMIN ONLY)
 */
router.get('/admin/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const verifiedUsers = await User.countDocuments({ isEmailVerified: true });
        
        // Nouveaux utilisateurs cette semaine
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const newUsersWeek = await User.countDocuments({ createdAt: { $gte: oneWeekAgo } });
        
        // Utilisateurs avec wallets
        const usersWithWallets = await User.countDocuments({ 'wallets.0': { $exists: true } });
        
        // Admins
        const adminCount = await User.countDocuments({ role: 'admin' });
        
        res.json({
            success: true,
            stats: {
                totalUsers,
                activeUsers,
                verifiedUsers,
                newUsersWeek,
                usersWithWallets,
                adminCount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/users/:id
 * Détails d'un utilisateur (ADMIN ONLY)
 */
router.get('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password -wallets.secretPhrase');
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        res.json({ success: true, user: user.toSafeObject() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/admin/users/:id
 * Modifier un utilisateur (ADMIN ONLY)
 */
router.put('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { role, isActive, isEmailVerified } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        // Empêche de modifier son propre rôle
        if (req.params.id === req.user._id.toString() && role && role !== req.user.role) {
            return res.status(400).json({ success: false, error: 'Vous ne pouvez pas modifier votre propre rôle' });
        }
        
        if (role !== undefined) user.role = role;
        if (isActive !== undefined) user.isActive = isActive;
        if (isEmailVerified !== undefined) user.isEmailVerified = isEmailVerified;
        
        await user.save();
        
        res.json({ success: true, message: 'Utilisateur modifié', user: user.toSafeObject() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Supprimer un utilisateur (ADMIN ONLY)
 */
router.delete('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Empêche de se supprimer soi-même
        if (req.params.id === req.user._id.toString()) {
            return res.status(400).json({ success: false, error: 'Vous ne pouvez pas supprimer votre propre compte' });
        }
        
        const user = await User.findByIdAndDelete(req.params.id);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        res.json({ success: true, message: `Utilisateur ${user.email} supprimé` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Réinitialiser le mot de passe d'un utilisateur (ADMIN ONLY)
 */
router.post('/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'Mot de passe trop court (min 6 caractères)' });
        }
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        user.password = newPassword; // Le hook pre-save hashera le mot de passe
        await user.save();
        
        res.json({ success: true, message: `Mot de passe de ${user.email} réinitialisé` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
