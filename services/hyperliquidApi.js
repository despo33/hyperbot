/**
 * Module API Hyperliquid
 * Gère toutes les interactions avec l'API Hyperliquid
 * Documentation: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
 */

import { ethers } from 'ethers';
import msgpack from 'msgpack-lite';
import auth from './hyperliquidAuth.js';

// URLs de l'API Hyperliquid
const API_URL = 'https://api.hyperliquid.xyz';
const INFO_URL = `${API_URL}/info`;
const EXCHANGE_URL = `${API_URL}/exchange`;

/**
 * Classe principale pour l'API Hyperliquid
 */
class HyperliquidApi {
    constructor() {
        this.auth = auth;
        // Cache pour les métadonnées
        this.cachedMeta = null;
        this.lastMetaUpdate = 0;
        this.META_CACHE_DURATION = 60000; // 1 minute
        // Cache pour les prix (évite les requêtes répétées)
        this.cachedMids = null;
        this.lastMidsUpdate = 0;
        this.MIDS_CACHE_DURATION = 2000; // 2 secondes (prix changent vite)
        // Cache pour les candles par symbole/timeframe
        this.candleCache = new Map();
        this.CANDLE_CACHE_DURATION = 5000; // 5 secondes
    }

    /**
     * Requête POST générique vers l'API info
     * @param {Object} payload 
     * @returns {Promise<Object>}
     */
    async infoRequest(payload) {
        try {
            const response = await fetch(INFO_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Erreur requête info:', error.message);
            throw error;
        }
    }

    /**
     * Requête POST vers l'API exchange (nécessite signature)
     * @param {Object} action 
     * @returns {Promise<Object>}
     */
    async exchangeRequest(action) {
        if (!this.auth.isReady()) {
            throw new Error('Authentification requise pour les opérations exchange');
        }

        const timestamp = Date.now();
        const nonce = timestamp;

        // Génération de la signature selon le protocole Hyperliquid
        const signatureData = await this.signL1Action(action, nonce);

        const payload = {
            action,
            nonce,
            signature: signatureData,
            vaultAddress: null
        };

        console.log('[API] === ENVOI ORDRE HYPERLIQUID ===');
        console.log('[API] Payload:', JSON.stringify(payload, null, 2));
        
        try {
            const response = await fetch(EXCHANGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const text = await response.text();
            console.log('[API] Réponse brute:', text);

            // Vérifie si la réponse est OK
            if (!response.ok) {
                console.error('[API] ❌ ERREUR HTTP:', response.status, text);
                throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
            }
            
            // Vérifie si c'est du JSON valide
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error(`Réponse invalide de l'API: ${text.substring(0, 100)}`);
            }

            if (data.status === 'err') {
                console.error('[API] ❌ ERREUR API:', data.response);
                throw new Error(data.response || 'Erreur exchange');
            }

            console.log('[API] ✅ Ordre réussi:', JSON.stringify(data, null, 2));
            return data;
        } catch (error) {
            console.error('[API] ❌ Erreur requête exchange:', error.message);
            throw error;
        }
    }

    /**
     * Calcule le hash de l'action selon le format Hyperliquid
     * @param {Object} action 
     * @param {string|null} vaultAddress 
     * @param {number} nonce 
     * @returns {Buffer}
     */
    /**
     * Ordonne les clés d'un objet récursivement pour msgpack
     * Hyperliquid attend un ordre spécifique des clés
     */
    orderKeys(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.orderKeys(item));
        }
        
        // Ordre spécifique des clés pour les différents types d'objets
        const keyOrder = {
            // Pour les ordres
            order: ['a', 'b', 'p', 's', 'r', 't', 'c'],
            // Pour le type d'ordre
            orderType: ['limit', 'trigger'],
            // Pour limit
            limit: ['tif'],
            // Pour trigger - ordre important!
            trigger: ['isMarket', 'triggerPx', 'tpsl'],
            // Pour l'action
            action: ['type', 'orders', 'grouping']
        };
        
        const orderedObj = {};
        const keys = Object.keys(obj);
        
        // Trie les clés selon l'ordre défini ou alphabétiquement
        keys.sort((a, b) => {
            // Trouve l'ordre approprié
            for (const orderList of Object.values(keyOrder)) {
                const aIdx = orderList.indexOf(a);
                const bIdx = orderList.indexOf(b);
                if (aIdx !== -1 && bIdx !== -1) {
                    return aIdx - bIdx;
                }
            }
            return a.localeCompare(b);
        });
        
        for (const key of keys) {
            orderedObj[key] = this.orderKeys(obj[key]);
        }
        
        return orderedObj;
    }

    actionHash(action, vaultAddress, nonce) {
        // Ordonne les clés avant d'encoder
        const orderedAction = this.orderKeys(action);
        
        // Encode l'action avec msgpack
        const data = msgpack.encode(orderedAction);
        
        // Ajoute le nonce (8 bytes big endian)
        const nonceBuffer = Buffer.alloc(8);
        nonceBuffer.writeBigUInt64BE(BigInt(nonce));
        
        // Ajoute le vault address
        let vaultBuffer;
        if (vaultAddress === null) {
            vaultBuffer = Buffer.from([0x00]);
        } else {
            vaultBuffer = Buffer.concat([
                Buffer.from([0x01]),
                Buffer.from(vaultAddress.slice(2), 'hex')
            ]);
        }
        
        // Concatène tout
        const fullData = Buffer.concat([data, nonceBuffer, vaultBuffer]);
        
        // Hash avec keccak256
        return ethers.keccak256(fullData);
    }

    /**
     * Construit le phantom agent pour la signature
     * @param {string} hash 
     * @param {boolean} isMainnet 
     * @returns {Object}
     */
    constructPhantomAgent(hash, isMainnet = true) {
        return {
            source: isMainnet ? 'a' : 'b',
            connectionId: hash
        };
    }

    /**
     * Signe une action L1 pour Hyperliquid
     * Format de signature EIP-712 spécifique à Hyperliquid
     * @param {Object} action 
     * @param {number} nonce 
     * @param {string|null} vaultAddress
     * @returns {Promise<Object>}
     */
    async signL1Action(action, nonce, vaultAddress = null) {
        const wallet = this.auth.wallet;
        
        // Calcule le hash de l'action
        const hash = this.actionHash(action, vaultAddress, nonce);
        
        // Construit le phantom agent
        const phantomAgent = this.constructPhantomAgent(hash, true);
        
        // Domaine EIP-712 pour Hyperliquid
        const domain = {
            name: 'Exchange',
            version: '1',
            chainId: 1337,
            verifyingContract: '0x0000000000000000000000000000000000000000'
        };

        // Types pour la signature
        const types = {
            Agent: [
                { name: 'source', type: 'string' },
                { name: 'connectionId', type: 'bytes32' }
            ]
        };

        try {
            // Signature EIP-712
            const signature = await wallet.signTypedData(domain, types, phantomAgent);
            
            // Décompose la signature en r, s, v
            const sig = ethers.Signature.from(signature);
            
            return {
                r: sig.r,
                s: sig.s,
                v: sig.v
            };
        } catch (error) {
            console.error('[API] Erreur signature:', error.message);
            throw error;
        }
    }

    // ==================== MÉTHODES INFO (publiques) ====================

    /**
     * Récupère les métadonnées des marchés
     * @returns {Promise<Object>}
     */
    async getMeta() {
        // Cache pour éviter trop de requêtes
        if (this.cachedMeta && Date.now() - this.lastMetaUpdate < this.META_CACHE_DURATION) {
            return this.cachedMeta;
        }

        const data = await this.infoRequest({ type: 'meta' });
        this.cachedMeta = data;
        this.lastMetaUpdate = Date.now();
        return data;
    }

    /**
     * Récupère tous les prix mid des actifs (avec cache)
     * @returns {Promise<Object>}
     */
    async getAllMids() {
        // Cache pour éviter trop de requêtes
        if (this.cachedMids && Date.now() - this.lastMidsUpdate < this.MIDS_CACHE_DURATION) {
            return this.cachedMids;
        }
        
        const data = await this.infoRequest({ type: 'allMids' });
        this.cachedMids = data;
        this.lastMidsUpdate = Date.now();
        return data;
    }

    /**
     * Récupère le prix d'un actif spécifique
     * @param {string} symbol - Ex: "BTC", "ETH"
     * @returns {Promise<number>}
     */
    async getPrice(symbol) {
        const mids = await this.getAllMids();
        const price = mids[symbol];
        
        if (!price) {
            throw new Error(`Prix non trouvé pour ${symbol}`);
        }

        return parseFloat(price);
    }

    /**
     * Récupère les données de candles (OHLCV) avec cache intelligent
     * @param {string} symbol - Ex: "BTC"
     * @param {string} interval - "1m", "5m", "15m", "1h", "4h", "1d"
     * @param {number} startTime - Timestamp début en ms
     * @param {number} endTime - Timestamp fin en ms (optionnel)
     * @returns {Promise<Array>}
     */
    async getCandles(symbol, interval, startTime, endTime = Date.now()) {
        // Cache key basée sur symbole + interval (pas startTime pour permettre le cache)
        const cacheKey = `${symbol}_${interval}`;
        const cached = this.candleCache.get(cacheKey);
        
        // Utilise le cache si récent (sauf si on demande des données historiques spécifiques)
        const isRecentRequest = endTime >= Date.now() - 60000;
        if (cached && isRecentRequest && Date.now() - cached.timestamp < this.CANDLE_CACHE_DURATION) {
            return cached.data;
        }
        
        const response = await this.infoRequest({
            type: 'candleSnapshot',
            req: {
                coin: symbol,
                interval,
                startTime,
                endTime
            }
        });

        // Formatage des candles
        const candles = response.map(candle => ({
            timestamp: candle.t,
            open: parseFloat(candle.o),
            high: parseFloat(candle.h),
            low: parseFloat(candle.l),
            close: parseFloat(candle.c),
            volume: parseFloat(candle.v)
        }));
        
        // Met en cache si requête récente
        if (isRecentRequest) {
            this.candleCache.set(cacheKey, { data: candles, timestamp: Date.now() });
            // Nettoie le cache si trop grand (max 50 entrées)
            if (this.candleCache.size > 50) {
                const firstKey = this.candleCache.keys().next().value;
                this.candleCache.delete(firstKey);
            }
        }
        
        return candles;
    }

    /**
     * Récupère l'état du clearing house pour un utilisateur
     * @param {string} address - Adresse Ethereum (optionnel, utilise l'auth par défaut)
     * @returns {Promise<Object>}
     */
    async getClearinghouseState(address = null) {
        const userAddress = address || this.auth.getAddress();
        
        if (!userAddress) {
            throw new Error('Adresse requise');
        }

        return await this.infoRequest({
            type: 'clearinghouseState',
            user: userAddress
        });
    }

    /**
     * Récupère les positions ouvertes
     * @param {string} address - Adresse (optionnel)
     * @returns {Promise<Array>}
     */
    async getOpenPositions(address = null) {
        const state = await this.getClearinghouseState(address);
        
        return state.assetPositions
            .filter(p => parseFloat(p.position.szi) !== 0)
            .map(p => ({
                symbol: p.position.coin,
                coin: p.position.coin, // Alias pour compatibilité
                size: parseFloat(p.position.szi),
                szi: p.position.szi, // Alias pour compatibilité
                entryPrice: parseFloat(p.position.entryPx),
                unrealizedPnl: parseFloat(p.position.unrealizedPnl),
                leverage: parseFloat(p.position.leverage?.value || 1),
                liquidationPrice: parseFloat(p.position.liquidationPx || 0),
                marginUsed: parseFloat(p.position.marginUsed || 0)
            }));
    }

    /**
     * Alias pour getOpenPositions (compatibilité)
     * @param {string} address 
     * @returns {Promise<Array>}
     */
    async getPositions(address = null) {
        return this.getOpenPositions(address);
    }

    /**
     * Récupère les ordres ouverts
     * @param {string} address 
     * @returns {Promise<Array>}
     */
    async getOpenOrders(address = null) {
        const userAddress = address || this.auth.getAddress();

        const response = await this.infoRequest({
            type: 'openOrders',
            user: userAddress
        });

        return response.map(order => ({
            id: order.oid,
            symbol: order.coin,
            side: order.side,
            price: parseFloat(order.limitPx),
            size: parseFloat(order.sz),
            filled: parseFloat(order.filled || 0),
            timestamp: order.timestamp
        }));
    }

    /**
     * Récupère le solde Spot
     * @param {string} address 
     * @returns {Promise<Object>}
     */
    async getSpotBalance(address = null) {
        const userAddress = address || this.auth.getAddress();
        
        if (!userAddress) {
            return { balances: [] };
        }

        try {
            const response = await this.infoRequest({
                type: 'spotClearinghouseState',
                user: userAddress
            });
            
            console.log('[API] SpotClearinghouseState:', JSON.stringify(response, null, 2));
            return response;
        } catch (e) {
            console.log('[API] Erreur Spot balance:', e.message);
            return { balances: [] };
        }
    }

    /**
     * Récupère le solde du compte (Perps + Spot)
     * @param {string} address - Adresse optionnelle (pour utiliser une adresse différente de l'API wallet)
     * @returns {Promise<Object>}
     */
    async getAccountBalance(address = null) {
        const state = await this.getClearinghouseState(address);
        
        // Récupère aussi le solde Spot
        const spotState = await this.getSpotBalance(address);
        
        // Debug: affiche la structure complète
        console.log('[API] ClearinghouseState:', JSON.stringify(state, null, 2));
        
        // Hyperliquid retourne les données dans différents formats selon le compte
        const marginSummary = state.crossMarginSummary || state.marginSummary || {};
        
        // Solde Perps
        const perpsValue = parseFloat(marginSummary.accountValue || 0);
        const withdrawable = parseFloat(state.withdrawable || 0);
        const totalMarginUsed = parseFloat(marginSummary.totalMarginUsed || 0);
        const totalNtlPos = parseFloat(marginSummary.totalNtlPos || 0);
        
        // Solde Spot (cherche USDC)
        let spotUSDC = 0;
        let spotBalances = [];
        if (spotState && spotState.balances) {
            spotBalances = spotState.balances;
            const usdcBalance = spotState.balances.find(b => 
                b.coin === 'USDC' || b.token === 'USDC'
            );
            if (usdcBalance) {
                spotUSDC = parseFloat(usdcBalance.hold || usdcBalance.total || 0);
            }
        }
        
        // Total = Perps + Spot USDC
        const totalEquity = perpsValue + spotUSDC;
        
        return {
            totalEquity: totalEquity,
            perpsEquity: perpsValue,
            spotUSDC: spotUSDC,
            freeMargin: withdrawable || spotUSDC,
            usedMargin: totalMarginUsed,
            unrealizedPnl: totalNtlPos,
            spotBalances: spotBalances
        };
    }

    // ==================== MÉTHODES EXCHANGE (authentifiées) ====================

    /**
     * Place un ordre sur Hyperliquid
     * @param {Object} orderParams
     * @param {string} orderParams.symbol - Symbole (ex: "BTC")
     * @param {boolean} orderParams.isBuy - true pour achat, false pour vente
     * @param {number} orderParams.size - Taille de la position
     * @param {number} orderParams.price - Prix limite (null pour market)
     * @param {boolean} orderParams.reduceOnly - Réduire seulement
     * @param {string} orderParams.orderType - "limit", "market"
     * @param {Object} orderParams.tpsl - Take profit / Stop loss optionnel
     * @returns {Promise<Object>}
     */
    async placeOrder({
        symbol,
        isBuy,
        size,
        price = null,
        reduceOnly = false,
        orderType = 'limit',
        tpsl = null
    }) {
        // Récupère l'index de l'asset
        const meta = await this.getMeta();
        const assetIndex = meta.universe.findIndex(a => a.name === symbol);
        
        if (assetIndex === -1) {
            throw new Error(`Asset ${symbol} non trouvé`);
        }

        // Récupère les infos de l'asset pour le szDecimals
        const assetInfo = meta.universe[assetIndex];
        const szDecimals = assetInfo.szDecimals || 4;
        
        // Arrondit la taille selon les décimales de l'asset
        // Hyperliquid exige une taille exacte selon szDecimals
        const multiplier = Math.pow(10, szDecimals);
        const roundedSize = Math.floor(size * multiplier) / multiplier;
        
        // Vérifie la taille minimum
        if (roundedSize <= 0) {
            throw new Error(`Taille trop petite pour ${symbol} (min: ${1/multiplier})`);
        }
        
        // Prix arrondi (5 décimales significatives pour Hyperliquid)
        const roundedPrice = price ? parseFloat(parseFloat(price).toPrecision(5)) : null;
        
        console.log(`[API] ${symbol}: size=${size} -> rounded=${roundedSize} (szDecimals=${szDecimals}, assetInfo:`, JSON.stringify(assetInfo), ')');
        
        // Construction de l'ordre selon le format Hyperliquid v2
        const order = {
            a: assetIndex, // Asset index
            b: isBuy, // true = buy, false = sell
            p: roundedPrice ? roundedPrice.toString() : '0', // Prix
            s: roundedSize.toString(), // Taille arrondie
            r: reduceOnly, // Reduce only
            t: orderType === 'market' 
                ? { limit: { tif: 'Ioc' } }  // Market = IOC (Immediate or Cancel)
                : { limit: { tif: 'Gtc' } }  // Limit = GTC (Good Till Cancel)
        };

        const action = {
            type: 'order',
            orders: [order],
            grouping: 'na'
        };
        
        console.log(`[API] Envoi ordre:`, JSON.stringify(action, null, 2));

        const result = await this.exchangeRequest(action);
        
        console.log(`[API] Ordre placé: ${isBuy ? 'LONG' : 'SHORT'} ${size} ${symbol} @ ${price || 'MARKET'}`);
        
        return result;
    }

    /**
     * Place un ordre avec Take Profit et Stop Loss
     * @param {Object} params 
     * @returns {Promise<Object>}
     */
    async placeOrderWithTPSL({
        symbol,
        isBuy,
        size,
        price,
        takeProfit,
        stopLoss,
        leverage = 5,
        reduceOnly = false
    }) {
        // SÉCURITÉ: Vérifie qu'il n'y a pas déjà une position sur ce symbole
        try {
            const tradingAddress = this.auth.tradingAddress || this.auth.getAddress();
            const existingPositions = await this.getPositions(tradingAddress);
            const hasPosition = existingPositions.some(p => {
                const posSymbol = p.coin || p.symbol;
                const posSize = parseFloat(p.szi || p.size || 0);
                return posSymbol === symbol && Math.abs(posSize) > 0;
            });
            
            if (hasPosition) {
                console.log(`[API] ⚠️ Position ${symbol} existe déjà, BLOQUÉ`);
                throw new Error(`Position ${symbol} existe déjà`);
            }
        } catch (e) {
            if (e.message.includes('existe déjà')) throw e;
            console.log(`[API] Impossible de vérifier positions: ${e.message}`);
        }
        
        // IMPORTANT: Définit le levier AVANT d'ouvrir la position
        try {
            console.log(`[API] 📊 Configuration levier ${leverage}x pour ${symbol}`);
            await this.setLeverage(symbol, leverage, true); // true = cross margin
        } catch (e) {
            console.log(`[API] ⚠️ Erreur config levier: ${e.message} - Continue avec levier par défaut`);
        }
        
        // Récupère les infos de l'asset
        const meta = await this.getMeta();
        const assetIndex = meta.universe.findIndex(a => a.name === symbol);
        
        if (assetIndex === -1) {
            throw new Error(`Asset ${symbol} non trouvé`);
        }

        const assetInfo = meta.universe[assetIndex];
        const szDecimals = assetInfo.szDecimals || 0;
        const multiplier = Math.pow(10, szDecimals);
        const roundedSize = Math.floor(size * multiplier) / multiplier;
        
        if (roundedSize <= 0) {
            throw new Error(`Taille trop petite pour ${symbol} (szDecimals=${szDecimals})`);
        }

        // Prix avec slippage 3% pour garantir l'exécution (market order agressif)
        const SLIPPAGE = 0.03;
        const slippagePrice = isBuy 
            ? price * (1 + SLIPPAGE)  // Achète plus cher
            : price * (1 - SLIPPAGE); // Vend moins cher
        
        // Arrondi du prix (5 chiffres significatifs)
        const roundedPrice = parseFloat(slippagePrice.toPrecision(5));
        
        console.log(`[API] 🚀 POSITION ${isBuy ? 'LONG' : 'SHORT'}: ${roundedSize} ${symbol}`);
        console.log(`[API]    Prix marché: ${price} -> avec slippage: ${roundedPrice}`);
        if (takeProfit) console.log(`[API]    TP: ${takeProfit}`);
        if (stopLoss) console.log(`[API]    SL: ${stopLoss}`);

        // Ordre MARKET avec slippage (IOC = Immediate Or Cancel)
        const mainOrder = {
            a: assetIndex,
            b: isBuy,
            p: roundedPrice.toString(),
            s: roundedSize.toString(),
            r: reduceOnly,
            t: { limit: { tif: 'Ioc' } }
        };

        const mainAction = {
            type: 'order',
            orders: [mainOrder],
            grouping: 'na'
        };

        const mainResult = await this.exchangeRequest(mainAction);
        
        // Vérifie si l'ordre principal a été exécuté
        const mainStatus = mainResult?.response?.data?.statuses?.[0];
        if (mainStatus?.error) {
            console.error(`[API] ❌ Position rejetée: ${mainStatus.error}`);
            throw new Error(mainStatus.error);
        }
        
        if (mainStatus?.filled) {
            const fillPrice = parseFloat(mainStatus.filled.avgPx) || price;
            console.log(`[API] ✅ Position ouverte @ ${fillPrice}!`);
            
            // Place les ordres TP/SL séparément après l'ouverture de la position
            // Utilise des ordres trigger pour TP et SL
            if (takeProfit || stopLoss) {
                await this.placeTpSlOrders({
                    assetIndex,
                    isBuy,
                    size: roundedSize,
                    takeProfit,
                    stopLoss,
                    symbol // Passe le symbole pour la vérification
                });
            }
        } else {
            console.log(`[API] ⏳ Ordre non rempli immédiatement`);
        }

        return mainResult;
    }

    /**
     * Place les ordres TP/SL après ouverture de position
     * SÉCURITÉ: Vérifie qu'il n'y a pas déjà des ordres TP/SL pour cet asset
     */
    async placeTpSlOrders({ assetIndex, isBuy, size, takeProfit, stopLoss, symbol }) {
        console.log(`[API] 🎯 placeTpSlOrders appelé: asset=${assetIndex}, isBuy=${isBuy}, size=${size}, TP=${takeProfit}, SL=${stopLoss}`);
        
        // SÉCURITÉ: Vérifie s'il y a déjà des ordres TP/SL pour cet asset
        try {
            // Utilise l'adresse de trading
            const tradingAddress = this.auth.tradingAddress || this.auth.getAddress();
            const existingOrders = await this.getOpenOrders(tradingAddress);
            const existingTPSL = existingOrders.filter(o => {
                const orderAsset = o.coin || o.asset;
                const isTPSL = o.orderType?.includes('Take Profit') || 
                               o.orderType?.includes('Stop') ||
                               o.reduceOnly === true;
                return orderAsset === symbol && isTPSL;
            });
            
            if (existingTPSL.length >= 1) {
                // Si au moins 1 ordre TP ou SL existe, on skip
                console.log(`[API] ⚠️ TP/SL déjà existants pour ${symbol} (${existingTPSL.length} ordres), skip`);
                return { skipped: true, reason: 'TP/SL already exist' };
            }
        } catch (e) {
            console.log(`[API] Impossible de vérifier les ordres existants: ${e.message}`);
            // NE PAS continuer si on ne peut pas vérifier - c'est trop risqué
            return { skipped: true, reason: 'Cannot verify existing orders' };
        }
        
        const orders = [];
        
        // TP = ordre trigger qui se déclenche quand le prix atteint le TP
        if (takeProfit) {
            const tpPrice = parseFloat(parseFloat(takeProfit).toPrecision(5));
            orders.push({
                a: assetIndex,
                b: !isBuy, // Inverse pour fermer
                p: tpPrice.toString(),
                s: size.toString(),
                r: true, // Reduce only
                t: {
                    trigger: {
                        triggerPx: tpPrice.toString(),
                        isMarket: true,
                        tpsl: 'tp'
                    }
                }
            });
            console.log(`[API]    Ordre TP préparé: ${JSON.stringify(orders[orders.length-1])}`);
        }
        
        // SL = ordre trigger qui se déclenche quand le prix atteint le SL
        if (stopLoss) {
            const slPrice = parseFloat(parseFloat(stopLoss).toPrecision(5));
            orders.push({
                a: assetIndex,
                b: !isBuy, // Inverse pour fermer
                p: slPrice.toString(),
                s: size.toString(),
                r: true, // Reduce only
                t: {
                    trigger: {
                        triggerPx: slPrice.toString(),
                        isMarket: true,
                        tpsl: 'sl'
                    }
                }
            });
            console.log(`[API]    Ordre SL préparé: ${JSON.stringify(orders[orders.length-1])}`);
        }
        
        if (orders.length === 0) {
            console.log(`[API] ⚠️ Aucun ordre TP/SL à placer`);
            return;
        }
        
        // Envoie les ordres TP/SL avec grouping positionTpsl
        const action = {
            type: 'order',
            orders: orders,
            grouping: 'positionTpsl'
        };
        
        console.log(`[API] 📊 Envoi ${orders.length} ordres TP/SL...`);
        
        try {
            const result = await this.exchangeRequest(action);
            console.log(`[API] Réponse TP/SL:`, JSON.stringify(result, null, 2));
            
            const statuses = result?.response?.data?.statuses || [];
            
            if (takeProfit && statuses[0]) {
                if (statuses[0].error) {
                    console.error(`[API] ❌ TP rejeté: ${statuses[0].error}`);
                } else if (statuses[0].resting) {
                    console.log(`[API] ✅ TP placé @ ${takeProfit} (oid: ${statuses[0].resting.oid})`);
                } else {
                    console.log(`[API] TP status:`, JSON.stringify(statuses[0]));
                }
            }
            
            const slIdx = takeProfit ? 1 : 0;
            if (stopLoss && statuses[slIdx]) {
                if (statuses[slIdx].error) {
                    console.error(`[API] ❌ SL rejeté: ${statuses[slIdx].error}`);
                } else if (statuses[slIdx].resting) {
                    console.log(`[API] ✅ SL placé @ ${stopLoss} (oid: ${statuses[slIdx].resting.oid})`);
                } else {
                    console.log(`[API] SL status:`, JSON.stringify(statuses[slIdx]));
                }
            }
        } catch (e) {
            console.error(`[API] ❌ Erreur placement TP/SL: ${e.message}`);
            console.log(`[API] 📊 Placez manuellement: TP=${takeProfit} SL=${stopLoss}`);
        }
    }

    /**
     * Place un ordre stop (trigger order)
     * @param {Object} params 
     * @returns {Promise<Object>}
     */
    async placeStopOrder({
        symbol,
        isBuy,
        size,
        triggerPrice,
        reduceOnly = true,
        tpslType = 'sl' // 'sl' ou 'tp'
    }) {
        const meta = await this.getMeta();
        const assetIndex = meta.universe.findIndex(a => a.name === symbol);
        
        if (assetIndex === -1) {
            throw new Error(`Asset ${symbol} non trouvé`);
        }
        
        // Récupère szDecimals pour arrondir la taille
        const assetInfo = meta.universe[assetIndex];
        const szDecimals = assetInfo.szDecimals || 4;
        const multiplier = Math.pow(10, szDecimals);
        const roundedSize = Math.floor(size * multiplier) / multiplier;
        
        // Prix arrondi
        const roundedTriggerPrice = parseFloat(parseFloat(triggerPrice).toPrecision(5));

        const order = {
            a: assetIndex,
            b: isBuy,
            p: roundedTriggerPrice.toString(), // Prix limite = trigger price pour market
            s: roundedSize.toString(),
            r: reduceOnly,
            t: {
                trigger: {
                    triggerPx: roundedTriggerPrice.toString(),
                    isMarket: true,
                    tpsl: tpslType
                }
            }
        };

        console.log(`[API] Stop order ${tpslType}:`, JSON.stringify(order));

        const action = {
            type: 'order',
            orders: [order],
            grouping: 'na'
        };

        return await this.exchangeRequest(action);
    }

    /**
     * Annule un ordre
     * @param {string} symbol 
     * @param {number} orderId 
     * @returns {Promise<Object>}
     */
    async cancelOrder(symbol, orderId) {
        const meta = await this.getMeta();
        const assetIndex = meta.universe.findIndex(a => a.name === symbol);

        const action = {
            type: 'cancel',
            cancels: [{
                a: assetIndex,
                o: orderId
            }]
        };

        return await this.exchangeRequest(action);
    }

    /**
     * Annule tous les ordres pour un symbole
     * @param {string} symbol 
     * @returns {Promise<Object>}
     */
    async cancelAllOrders(symbol = null) {
        const openOrders = await this.getOpenOrders();
        const toCancel = symbol 
            ? openOrders.filter(o => o.symbol === symbol)
            : openOrders;

        const results = [];
        for (const order of toCancel) {
            try {
                const result = await this.cancelOrder(order.symbol, order.id);
                results.push(result);
            } catch (e) {
                console.error(`[API] Erreur annulation ordre ${order.id}:`, e.message);
            }
        }

        return results;
    }

    /**
     * Ferme une position
     * @param {string} symbol 
     * @returns {Promise<Object>}
     */
    async closePosition(symbol) {
        const positions = await this.getOpenPositions();
        const position = positions.find(p => p.symbol === symbol);

        if (!position) {
            throw new Error(`Aucune position ouverte pour ${symbol}`);
        }

        // Ferme avec un ordre market inverse
        return await this.placeOrder({
            symbol,
            isBuy: position.size < 0, // Inverse de la position
            size: Math.abs(position.size),
            orderType: 'market',
            reduceOnly: true
        });
    }

    /**
     * Ferme une position pour un utilisateur spécifique
     * @param {string} symbol 
     * @param {string} userAddress - Adresse de l'utilisateur
     * @returns {Promise<Object>}
     */
    async closePositionForUser(symbol, userAddress) {
        console.log(`[API] closePositionForUser: symbol=${symbol}, userAddress=${userAddress}`);
        
        // Récupère les positions de l'utilisateur spécifique
        const positions = await this.getOpenPositions(userAddress);
        console.log(`[API] Positions trouvées pour ${userAddress?.slice(0,10)}...:`, positions.map(p => `${p.symbol}:${p.size}`));
        
        // Cherche la position - essaie plusieurs formats de symbole
        let position = positions.find(p => p.symbol === symbol);
        if (!position) {
            // Essaie sans le suffixe -PERP
            position = positions.find(p => p.symbol === symbol.replace('-PERP', ''));
        }
        if (!position) {
            // Essaie avec le coin
            position = positions.find(p => p.coin === symbol || p.coin === symbol.replace('-PERP', ''));
        }

        if (!position) {
            console.log(`[API] Position ${symbol} non trouvée parmi:`, positions.map(p => p.symbol || p.coin));
            throw new Error(`Aucune position ouverte pour ${symbol}`);
        }

        console.log(`[API] Fermeture position ${symbol}: size=${position.size}, isBuy=${position.size < 0}`);

        // Ferme avec un ordre market inverse
        return await this.placeOrder({
            symbol,
            isBuy: position.size < 0, // Inverse de la position
            size: Math.abs(position.size),
            orderType: 'market',
            reduceOnly: true
        });
    }

    /**
     * Modifie le levier pour un symbole
     * @param {string} symbol 
     * @param {number} leverage 
     * @param {boolean} isCross 
     * @returns {Promise<Object>}
     */
    async setLeverage(symbol, leverage, isCross = true) {
        const meta = await this.getMeta();
        const assetIndex = meta.universe.findIndex(a => a.name === symbol);

        const action = {
            type: 'updateLeverage',
            asset: assetIndex,
            isCross,
            leverage
        };

        return await this.exchangeRequest(action);
    }

    /**
     * Récupère l'historique des trades
     * @param {string} address 
     * @returns {Promise<Array>}
     */
    async getUserFills(address = null) {
        const userAddress = address || this.auth.getAddress();

        return await this.infoRequest({
            type: 'userFills',
            user: userAddress
        });
    }

    /**
     * Récupère l'historique des financements
     * @param {string} address 
     * @param {number} startTime 
     * @param {number} endTime 
     * @returns {Promise<Array>}
     */
    async getFundingHistory(address = null, startTime = 0, endTime = Date.now()) {
        const userAddress = address || this.auth.getAddress();

        return await this.infoRequest({
            type: 'userFunding',
            user: userAddress,
            startTime,
            endTime
        });
    }

    /**
     * Récupère les funding rates actuels pour tous les assets
     * @returns {Promise<Object>} Map symbol -> fundingRate
     */
    async getFundingRates() {
        try {
            const meta = await this.getMeta();
            const fundingRates = {};
            
            if (meta && meta.universe) {
                for (const asset of meta.universe) {
                    // Le funding rate est dans les métadonnées
                    fundingRates[asset.name] = {
                        rate: parseFloat(asset.funding || 0),
                        // Funding rate annualisé pour référence
                        annualized: parseFloat(asset.funding || 0) * 3 * 365 * 100
                    };
                }
            }
            
            return fundingRates;
        } catch (error) {
            console.error('Erreur récupération funding rates:', error.message);
            return {};
        }
    }

    /**
     * Récupère le funding rate pour un symbole spécifique
     * @param {string} symbol 
     * @returns {Promise<Object>} { rate, annualized, signal }
     */
    async getFundingRate(symbol) {
        try {
            const rates = await this.getFundingRates();
            const rate = rates[symbol]?.rate || 0;
            
            // Analyse du funding rate pour signal de trading
            // Funding très négatif = trop de shorts = squeeze probable vers le haut
            // Funding très positif = trop de longs = dump probable vers le bas
            let signal = 'neutral';
            let strength = 0;
            
            if (rate <= -0.001) { // -0.1% ou moins
                signal = 'bullish'; // Squeeze short probable
                strength = Math.min(1, Math.abs(rate) / 0.003); // Max à -0.3%
            } else if (rate >= 0.001) { // +0.1% ou plus
                signal = 'bearish'; // Dump probable
                strength = Math.min(1, rate / 0.003);
            }
            
            return {
                rate,
                ratePercent: rate * 100,
                annualized: rate * 3 * 365 * 100,
                signal,
                strength,
                description: this.describeFundingRate(rate)
            };
        } catch (error) {
            return { rate: 0, signal: 'neutral', strength: 0 };
        }
    }

    /**
     * Décrit le funding rate en texte
     */
    describeFundingRate(rate) {
        const pct = (rate * 100).toFixed(4);
        if (rate <= -0.001) return `Très négatif (${pct}%) - Short squeeze probable`;
        if (rate <= -0.0005) return `Négatif (${pct}%) - Légèrement bullish`;
        if (rate >= 0.001) return `Très positif (${pct}%) - Liquidation longs probable`;
        if (rate >= 0.0005) return `Positif (${pct}%) - Légèrement bearish`;
        return `Neutre (${pct}%)`;
    }
}

// Export singleton
const api = new HyperliquidApi();
export default api;
