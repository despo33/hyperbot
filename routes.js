/**
 * Routes API du dashboard de trading
 * Accès direct sans authentification - les données se complètent avec la clé API Hyperliquid
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import tradeEngine from './core/tradeEngine.js';
import riskManager from './core/riskManager.js';
import priceFetcher from './core/priceFetcher.js';
import signalDetector from './core/signalDetector.js';
import auth from './services/hyperliquidAuth.js';
import api from './services/hyperliquidApi.js';
import scanner, { TOP_CRYPTOS } from './core/scanner.js';

// Utilitaires centralisés
import { optionalAuth, requireAuth } from './utils/auth.js';
import { encryptSecret, decryptSecret } from './utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ==================== BOT STATUS ROUTES ====================

/**
 * GET /api/status
 * Retourne le statut complet du bot
 * Utilise le wallet de l'utilisateur connecté si disponible
 */
router.get('/status', optionalAuth, async (req, res) => {
    try {
        const status = tradeEngine.getStatus();
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
 * Démarre le bot (protégé)
 */
router.post('/bot/start', requireAuth, async (req, res) => {
    try {
        const success = await tradeEngine.start();
        res.json({ success, message: success ? 'Bot démarré' : 'Échec du démarrage' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/bot/stop
 * Arrête le bot (protégé)
 */
router.post('/bot/stop', requireAuth, (req, res) => {
    const success = tradeEngine.stop();
    res.json({ success, message: success ? 'Bot arrêté' : 'Bot déjà arrêté' });
});

/**
 * GET /api/logs
 * Retourne les logs
 */
router.get('/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const logs = tradeEngine.getLogs(limit);
    res.json({ logs });
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
 * Effectue une analyse sans trader
 */
router.get('/analysis', async (req, res) => {
    try {
        const analysis = await tradeEngine.analyzeOnly();
        res.json(analysis);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/positions
 * Retourne les positions ouvertes de l'utilisateur avec leurs analyses
 */
router.get('/positions', optionalAuth, async (req, res) => {
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
 * GET /api/orders
 * Retourne les ordres ouverts de l'utilisateur
 */
router.get('/orders', optionalAuth, async (req, res) => {
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
 */
router.post('/trade', requireAuth, async (req, res) => {
    try {
        const { symbol, direction, size, price, stopLoss, takeProfit } = req.body;

        if (!symbol || !direction || !size) {
            return res.status(400).json({ error: 'Paramètres manquants' });
        }

        const result = await tradeEngine.manualTrade({
            symbol,
            direction,
            size: parseFloat(size),
            price: price ? parseFloat(price) : null,
            stopLoss: stopLoss ? parseFloat(stopLoss) : null,
            takeProfit: takeProfit ? parseFloat(takeProfit) : null
        });

        res.json(result);
    } catch (error) {
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
 * Retourne la config trading de l'utilisateur
 */
router.get('/config/trading', optionalAuth, async (req, res) => {
    // Si utilisateur connecté, retourne sa config
    if (req.user && req.user.botConfig) {
        return res.json({ config: req.user.botConfig, fromUser: true });
    }
    // Sinon config globale
    res.json({ config: tradeEngine.config, fromUser: false });
});

/**
 * POST /api/config/trading
 * Met à jour la config trading de l'utilisateur
 */
router.post('/config/trading', optionalAuth, async (req, res) => {
    try {
        // Si utilisateur connecté, sauvegarde dans son compte
        if (req.user) {
            const configUpdate = req.body;
            
            // Met à jour la config utilisateur
            if (configUpdate.symbols) req.user.botConfig.symbols = configUpdate.symbols;
            if (configUpdate.timeframes) req.user.botConfig.timeframes = configUpdate.timeframes;
            if (configUpdate.leverage) req.user.botConfig.leverage = configUpdate.leverage;
            if (configUpdate.maxConcurrentTrades) req.user.botConfig.maxConcurrentTrades = configUpdate.maxConcurrentTrades;
            if (configUpdate.minWinProbability) req.user.botConfig.minWinProbability = configUpdate.minWinProbability;
            if (configUpdate.minScore) req.user.botConfig.minScore = configUpdate.minScore;
            if (configUpdate.tpslMode) req.user.botConfig.tpslMode = configUpdate.tpslMode;
            if (configUpdate.defaultTP) req.user.botConfig.defaultTP = configUpdate.defaultTP;
            if (configUpdate.defaultSL) req.user.botConfig.defaultSL = configUpdate.defaultSL;
            if (configUpdate.analysisInterval) req.user.botConfig.analysisInterval = configUpdate.analysisInterval;
            if (configUpdate.atrMultiplierSL) req.user.botConfig.atrMultiplierSL = configUpdate.atrMultiplierSL;
            if (configUpdate.atrMultiplierTP) req.user.botConfig.atrMultiplierTP = configUpdate.atrMultiplierTP;
            if (configUpdate.useRSIFilter !== undefined) req.user.botConfig.useRSIFilter = configUpdate.useRSIFilter;
            if (configUpdate.rsiOverbought) req.user.botConfig.rsiOverbought = configUpdate.rsiOverbought;
            if (configUpdate.rsiOversold) req.user.botConfig.rsiOversold = configUpdate.rsiOversold;
            // Multi-Timeframe
            if (configUpdate.multiTimeframeMode !== undefined) req.user.botConfig.multiTimeframeMode = configUpdate.multiTimeframeMode;
            if (configUpdate.mtfTimeframes) req.user.botConfig.mtfTimeframes = configUpdate.mtfTimeframes;
            if (configUpdate.mtfMinConfirmation) req.user.botConfig.mtfMinConfirmation = configUpdate.mtfMinConfirmation;
            if (configUpdate.enabledSignals) {
                req.user.botConfig.enabledSignals = { ...req.user.botConfig.enabledSignals, ...configUpdate.enabledSignals };
            }
            
            await req.user.save();
            console.log(`[CONFIG] Config sauvegardée pour ${req.user.username}`);
            
            // Applique aussi au tradeEngine pour la session
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
 * Retourne la config risk management
 */
router.get('/config/risk', (req, res) => {
    res.json({ config: riskManager.getConfig() });
});

/**
 * POST /api/config/risk
 * Met à jour la config risk management
 */
router.post('/config/risk', (req, res) => {
    try {
        riskManager.updateConfig(req.body);
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

// ==================== API KEYS ROUTES (LIÉES À L'UTILISATEUR) ====================

/**
 * POST /api/keys/save
 * Sauvegarde les clés API dans le compte utilisateur
 */
router.post('/keys/save', optionalAuth, async (req, res) => {
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
 * Retourne l'adresse de trading de l'utilisateur connecté
 */
router.get('/keys/trading-address', optionalAuth, async (req, res) => {
    // Si utilisateur connecté, retourne UNIQUEMENT son wallet (pas de fallback)
    if (req.user) {
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
        return res.json({
            tradingAddress: null,
            address: null,
            walletName: null,
            isUserWallet: true
        });
    }
    
    // Seulement si PAS connecté: wallet global
    res.json({
        tradingAddress: auth.tradingAddress || auth.getAddress(),
        address: auth.getAddress(),
        isUserWallet: false
    });
});

/**
 * GET /api/keys/status
 * Retourne le statut de l'authentification de l'utilisateur
 */
router.get('/keys/status', optionalAuth, async (req, res) => {
    // Si utilisateur connecté, retourne UNIQUEMENT ses wallets (pas de fallback global)
    if (req.user) {
        const activeWallet = req.user.getActiveWallet();
        return res.json({
            authenticated: !!activeWallet,
            address: activeWallet?.address || null,
            tradingAddress: activeWallet?.tradingAddress || activeWallet?.address || null,
            walletName: activeWallet?.name || null,
            walletsCount: req.user.wallets.length,
            isUserWallet: true
        });
    }
    
    // Seulement si PAS connecté: utilise wallet global
    res.json({
        authenticated: auth.isReady(),
        address: auth.getAddress(),
        tradingAddress: auth.tradingAddress,
        isUserWallet: false
    });
});

/**
 * GET /api/account/check/:address
 * Vérifie le solde d'une adresse spécifique (pour debug)
 */
router.get('/account/check/:address', async (req, res) => {
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
 * Teste la connexion
 */
router.post('/keys/test', async (req, res) => {
    try {
        const result = await auth.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/keys/load
 * Charge les clés sauvegardées
 */
router.post('/keys/load', async (req, res) => {
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

/**
 * GET /api/wallets
 * Liste tous les wallets enregistrés
 */
router.get('/wallets', (req, res) => {
    try {
        const wallets = auth.listWallets();
        const activeWallet = auth.getActiveWallet();
        res.json({ 
            wallets, 
            activeWallet,
            count: wallets.length 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/wallets/add
 * Ajoute un nouveau wallet
 */
router.post('/wallets/add', async (req, res) => {
    try {
        const { name, secretPhrase, tradingAddress, apiKey } = req.body;

        if (!secretPhrase) {
            return res.status(400).json({ error: 'Secret phrase requis' });
        }

        const result = await auth.addWallet(name, secretPhrase, tradingAddress, apiKey);
        
        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/wallets/:walletId
 * Supprime un wallet
 */
router.delete('/wallets/:walletId', (req, res) => {
    try {
        const { walletId } = req.params;
        const result = auth.removeWallet(walletId);
        
        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/wallets/:walletId/rename
 * Renomme un wallet
 */
router.put('/wallets/:walletId/rename', (req, res) => {
    try {
        const { walletId } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nom requis' });
        }

        const result = auth.renameWallet(walletId, name);
        
        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/wallets/:walletId/activate
 * Active un wallet spécifique
 */
router.post('/wallets/:walletId/activate', async (req, res) => {
    try {
        const { walletId } = req.params;
        const result = await auth.switchWallet(walletId);
        
        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/wallets/:walletId/trading-address
 * Met à jour l'adresse de trading d'un wallet
 */
router.put('/wallets/:walletId/trading-address', (req, res) => {
    try {
        const { walletId } = req.params;
        const { tradingAddress } = req.body;

        if (!tradingAddress) {
            return res.status(400).json({ error: 'Adresse de trading requise' });
        }

        const result = auth.updateTradingAddress(walletId, tradingAddress);
        
        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/wallets/load
 * Charge tous les wallets sauvegardés
 */
router.post('/wallets/load', async (req, res) => {
    try {
        const result = await auth.loadAllWallets();
        const wallets = auth.listWallets();
        const activeWallet = auth.getActiveWallet();
        
        res.json({
            ...result,
            wallets,
            activeWallet
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/wallets/:walletId/balance
 * Récupère le solde d'un wallet spécifique
 */
router.get('/wallets/:walletId/balance', async (req, res) => {
    try {
        const { walletId } = req.params;
        const wallets = auth.listWallets();
        const wallet = wallets.find(w => w.id === walletId);
        
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet non trouvé' });
        }

        const balance = await api.getAccountBalance(wallet.tradingAddress || wallet.address);
        
        res.json({
            walletId,
            name: wallet.name,
            address: wallet.address,
            tradingAddress: wallet.tradingAddress,
            balance
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SIGNALS ROUTES ====================

/**
 * GET /api/signals/history
 * Retourne l'historique des signaux
 */
router.get('/signals/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const history = signalDetector.getSignalHistory(limit);
    res.json({ signals: history });
});

/**
 * GET /api/signals/last
 * Retourne le dernier signal
 */
router.get('/signals/last', (req, res) => {
    const signal = signalDetector.getLastSignal();
    res.json({ signal });
});

// ==================== BALANCE & ACCOUNT ====================

/**
 * GET /api/account/balance
 * Retourne le solde du compte (utilise l'adresse de trading si configurée)
 */
router.get('/account/balance', async (req, res) => {
    try {
        // Utilise l'adresse de trading si différente de l'API wallet
        const addressToUse = auth.getBalanceAddress();
        const balance = await api.getAccountBalance(addressToUse);
        res.json({
            ...balance,
            addressUsed: addressToUse
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/account/fills
 * Retourne l'historique des trades
 */
router.get('/account/fills', async (req, res) => {
    try {
        // Utilise l'adresse de trading
        const tradingAddress = auth.getBalanceAddress();
        const fills = await api.getUserFills(tradingAddress);
        res.json({ fills });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/account/stats
 * Retourne les statistiques calculées à partir de l'historique
 */
router.get('/account/stats', optionalAuth, async (req, res) => {
    try {
        // Utilise le wallet de l'utilisateur si connecté
        let tradingAddress;
        if (req.user) {
            const activeWallet = req.user.getActiveWallet();
            tradingAddress = activeWallet?.tradingAddress || activeWallet?.address;
        }
        if (!tradingAddress) {
            tradingAddress = auth.getBalanceAddress();
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
 * Retourne l'historique des trades avec filtres
 * Utilise le wallet de l'utilisateur connecté
 */
router.get('/account/history', optionalAuth, async (req, res) => {
    try {
        // Utilise le wallet de l'utilisateur si connecté
        let tradingAddress;
        if (req.user) {
            const activeWallet = req.user.getActiveWallet();
            tradingAddress = activeWallet?.tradingAddress || activeWallet?.address;
        }
        if (!tradingAddress) {
            tradingAddress = auth.getBalanceAddress();
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
            const entryPrice = trade.entries.length > 0 
                ? trade.entries.reduce((sum, e) => sum + e.price * e.size, 0) / trade.entries.reduce((sum, e) => sum + e.size, 0)
                : 0;
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
 * Lance un scan de toutes les cryptos
 */
router.get('/scanner/scan', async (req, res) => {
    try {
        const timeframe = req.query.timeframe || '1h';
        const symbols = req.query.symbols ? req.query.symbols.split(',') : TOP_CRYPTOS;
        
        const results = await scanner.scanAll(symbols, timeframe);
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
 * Retourne les résultats du dernier scan
 */
router.get('/scanner/results', (req, res) => {
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
 * Retourne les meilleures opportunités de trading
 */
router.get('/scanner/opportunities', (req, res) => {
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
 * Retourne l'analyse d'un symbole spécifique
 */
router.get('/scanner/symbol/:symbol', async (req, res) => {
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
 * Retourne les détails complets d'un trade potentiel (SL, TP, probabilités)
 */
router.get('/trade-details/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const details = await tradeEngine.getTradeDetails(symbol.toUpperCase());
        res.json(details);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/scanner/start
 * Démarre le scan automatique
 */
router.post('/scanner/start', (req, res) => {
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
 * Arrête le scan automatique
 */
router.post('/scanner/stop', (req, res) => {
    scanner.stopAutoScan();
    res.json({ success: true, message: 'Scan automatique arrêté' });
});

/**
 * GET /api/scanner/cryptos
 * Retourne la liste des cryptos supportées
 */
router.get('/scanner/cryptos', (req, res) => {
    res.json({ cryptos: TOP_CRYPTOS });
});

export default router;
