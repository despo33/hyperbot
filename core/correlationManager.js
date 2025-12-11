/**
 * Correlation Manager
 * Évite d'ouvrir des positions sur des actifs corrélés
 * Gère le drawdown protection
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CorrelationManager {
    constructor() {
        // Groupes de corrélation prédéfinis
        this.correlationGroups = {
            // Majors - très corrélés
            'btc_ecosystem': ['BTC', 'WBTC'],
            'eth_ecosystem': ['ETH', 'STETH', 'WETH'],
            
            // Layer 1s - corrélation moyenne-haute
            'alt_l1': ['SOL', 'AVAX', 'NEAR', 'APT', 'SUI', 'SEI'],
            
            // Layer 2s Ethereum
            'eth_l2': ['ARB', 'OP', 'MATIC', 'BASE'],
            
            // DeFi tokens
            'defi': ['UNI', 'AAVE', 'LINK', 'MKR', 'CRV', 'SUSHI'],
            
            // Meme coins
            'meme': ['DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK'],
            
            // Exchange tokens
            'exchange': ['BNB', 'FTT', 'CRO', 'OKB'],
            
            // Cosmos ecosystem
            'cosmos': ['ATOM', 'OSMO', 'INJ', 'TIA'],
            
            // Gaming/Metaverse
            'gaming': ['AXS', 'SAND', 'MANA', 'GALA', 'IMX'],
            
            // AI tokens
            'ai': ['FET', 'AGIX', 'OCEAN', 'RNDR'],
            
            // Storage
            'storage': ['FIL', 'AR', 'STORJ'],
            
            // Privacy
            'privacy': ['XMR', 'ZEC', 'DASH'],
            
            // Old school
            'legacy': ['LTC', 'BCH', 'ETC', 'XRP', 'ADA', 'DOT']
        };

        this.config = {
            // Nombre max de positions dans le même groupe de corrélation
            maxPositionsPerGroup: 3,
            
            // Corrélation dynamique (calculée sur les prix)
            dynamicCorrelation: {
                enabled: true,
                threshold: 0.7,      // Corrélation > 0.7 = trop corrélé
                lookbackPeriod: 50,  // Nombre de bougies pour le calcul
                cacheTimeout: 300000 // Cache 5 minutes
            },
            
            // Drawdown protection
            drawdown: {
                enabled: true,
                maxDailyLossPercent: 5,    // Pause si perte > 5% du capital
                maxConsecutiveLosses: 3,   // Pause après 3 pertes consécutives
                cooldownMinutes: 60,       // Pause de 60 minutes
                resetHour: 0               // Reset à minuit UTC
            }
        };

        this.state = {
            openPositionsByGroup: {},
            dailyPnL: 0,
            dailyStartBalance: 0,
            consecutiveLosses: 0,
            lastTradeResult: null,
            isPaused: false,
            pauseReason: null,
            pauseUntil: null,
            lastReset: null
        };

        this.correlationCache = new Map();
        this.storagePath = path.join(__dirname, '../storage/correlation_state.json');
        
        this.loadState();
    }

    /**
     * Charge l'état sauvegardé
     */
    loadState() {
        try {
            if (fs.existsSync(this.storagePath)) {
                const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
                this.state = { ...this.state, ...data };
                
                // Vérifie si on doit reset (nouveau jour)
                this.checkDailyReset();
            }
        } catch (e) {
            console.error('[CORRELATION] Erreur chargement:', e.message);
        }
    }

    /**
     * Sauvegarde l'état
     */
    saveState() {
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.state, null, 2));
        } catch (e) {
            console.error('[CORRELATION] Erreur sauvegarde:', e.message);
        }
    }

    /**
     * Vérifie et effectue le reset journalier
     */
    checkDailyReset() {
        const now = new Date();
        const resetHour = this.config.drawdown.resetHour;
        
        if (this.state.lastReset) {
            const lastReset = new Date(this.state.lastReset);
            const hoursSinceReset = (now - lastReset) / (1000 * 60 * 60);
            
            // Reset si plus de 24h ou si on a passé l'heure de reset
            if (hoursSinceReset >= 24 || 
                (now.getUTCHours() >= resetHour && lastReset.getUTCDate() !== now.getUTCDate())) {
                this.resetDaily();
            }
        } else {
            this.resetDaily();
        }
    }

    /**
     * Reset les statistiques journalières
     */
    resetDaily() {
        console.log('[CORRELATION] 🔄 Reset journalier');
        this.state.dailyPnL = 0;
        this.state.consecutiveLosses = 0;
        this.state.isPaused = false;
        this.state.pauseReason = null;
        this.state.pauseUntil = null;
        this.state.lastReset = Date.now();
        this.saveState();
    }

    /**
     * Trouve le groupe de corrélation d'un symbole
     * @param {string} symbol 
     * @returns {string|null} Nom du groupe ou null
     */
    findCorrelationGroup(symbol) {
        const upperSymbol = symbol.toUpperCase();
        
        for (const [group, symbols] of Object.entries(this.correlationGroups)) {
            if (symbols.includes(upperSymbol)) {
                return group;
            }
        }
        
        return null;
    }

    /**
     * Calcule la corrélation de Pearson entre deux séries de prix
     * @param {Array} prices1 
     * @param {Array} prices2 
     * @returns {number} Corrélation (-1 à 1)
     */
    calculateCorrelation(prices1, prices2) {
        const n = Math.min(prices1.length, prices2.length);
        if (n < 10) return 0;

        // Calcule les rendements
        const returns1 = [];
        const returns2 = [];
        
        for (let i = 1; i < n; i++) {
            returns1.push((prices1[i] - prices1[i-1]) / prices1[i-1]);
            returns2.push((prices2[i] - prices2[i-1]) / prices2[i-1]);
        }

        // Moyennes
        const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
        const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

        // Covariance et écarts-types
        let covariance = 0;
        let variance1 = 0;
        let variance2 = 0;

        for (let i = 0; i < returns1.length; i++) {
            const diff1 = returns1[i] - mean1;
            const diff2 = returns2[i] - mean2;
            covariance += diff1 * diff2;
            variance1 += diff1 * diff1;
            variance2 += diff2 * diff2;
        }

        const stdDev1 = Math.sqrt(variance1);
        const stdDev2 = Math.sqrt(variance2);

        if (stdDev1 === 0 || stdDev2 === 0) return 0;

        return covariance / (stdDev1 * stdDev2);
    }

    /**
     * Vérifie si un nouveau trade est autorisé (corrélation)
     * @param {string} symbol - Symbole à trader
     * @param {Array} openPositions - Positions ouvertes actuelles
     * @returns {Object} { allowed, reason }
     */
    checkCorrelation(symbol, openPositions) {
        const group = this.findCorrelationGroup(symbol);
        
        if (!group) {
            // Pas dans un groupe connu, autorisé
            return { allowed: true, reason: null };
        }

        // Compte les positions dans le même groupe
        let positionsInGroup = 0;
        const conflictingSymbols = [];

        for (const pos of openPositions) {
            const posGroup = this.findCorrelationGroup(pos.coin || pos.symbol);
            if (posGroup === group) {
                positionsInGroup++;
                conflictingSymbols.push(pos.coin || pos.symbol);
            }
        }

        if (positionsInGroup >= this.config.maxPositionsPerGroup) {
            return {
                allowed: false,
                reason: `Déjà ${positionsInGroup} position(s) dans le groupe "${group}" (${conflictingSymbols.join(', ')})`,
                group,
                conflictingSymbols
            };
        }

        return { allowed: true, reason: null, group };
    }

    /**
     * Vérifie si le trading est autorisé (drawdown)
     * @returns {Object} { allowed, reason }
     */
    checkDrawdown() {
        this.checkDailyReset();

        // Vérifie si en pause
        if (this.state.isPaused) {
            if (this.state.pauseUntil && Date.now() < this.state.pauseUntil) {
                const remainingMinutes = Math.ceil((this.state.pauseUntil - Date.now()) / 60000);
                return {
                    allowed: false,
                    reason: `En pause: ${this.state.pauseReason}. Reprise dans ${remainingMinutes} min`,
                    isPaused: true
                };
            } else {
                // Fin de la pause
                this.state.isPaused = false;
                this.state.pauseReason = null;
                this.state.pauseUntil = null;
                this.saveState();
            }
        }

        return { allowed: true, reason: null };
    }

    /**
     * Enregistre le résultat d'un trade
     * @param {number} pnl - Profit/Perte en USD
     * @param {number} currentBalance - Solde actuel
     */
    recordTradeResult(pnl, currentBalance) {
        // Met à jour le P&L journalier
        this.state.dailyPnL += pnl;

        // Met à jour les pertes consécutives
        if (pnl < 0) {
            this.state.consecutiveLosses++;
            this.state.lastTradeResult = 'loss';
        } else {
            this.state.consecutiveLosses = 0;
            this.state.lastTradeResult = 'win';
        }

        // Initialise le solde de départ si nécessaire
        if (this.state.dailyStartBalance === 0) {
            this.state.dailyStartBalance = currentBalance - pnl;
        }

        // Calcule la perte journalière en %
        const dailyLossPercent = (this.state.dailyPnL / this.state.dailyStartBalance) * 100;

        console.log(`[CORRELATION] Trade: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USD`);
        console.log(`[CORRELATION]   P&L jour: ${this.state.dailyPnL.toFixed(2)} USD (${dailyLossPercent.toFixed(2)}%)`);
        console.log(`[CORRELATION]   Pertes consécutives: ${this.state.consecutiveLosses}`);

        // Vérifie les limites
        if (this.config.drawdown.enabled) {
            // Perte journalière max
            if (dailyLossPercent <= -this.config.drawdown.maxDailyLossPercent) {
                this.pauseTrading(`Perte journalière max atteinte (${dailyLossPercent.toFixed(2)}%)`);
            }
            // Pertes consécutives max
            else if (this.state.consecutiveLosses >= this.config.drawdown.maxConsecutiveLosses) {
                this.pauseTrading(`${this.state.consecutiveLosses} pertes consécutives`);
            }
        }

        this.saveState();
    }

    /**
     * Met le trading en pause
     * @param {string} reason 
     */
    pauseTrading(reason) {
        this.state.isPaused = true;
        this.state.pauseReason = reason;
        this.state.pauseUntil = Date.now() + (this.config.drawdown.cooldownMinutes * 60 * 1000);
        
        console.log(`[CORRELATION] ⚠️ TRADING EN PAUSE: ${reason}`);
        console.log(`[CORRELATION]   Reprise dans ${this.config.drawdown.cooldownMinutes} minutes`);
        
        this.saveState();
    }

    /**
     * Vérifie si un trade est autorisé (corrélation + drawdown)
     * @param {string} symbol 
     * @param {Array} openPositions 
     * @returns {Object} { allowed, reasons }
     */
    canTrade(symbol, openPositions) {
        const reasons = [];

        // Vérifie le drawdown
        const drawdownCheck = this.checkDrawdown();
        if (!drawdownCheck.allowed) {
            reasons.push(drawdownCheck.reason);
        }

        // Vérifie la corrélation
        const correlationCheck = this.checkCorrelation(symbol, openPositions);
        if (!correlationCheck.allowed) {
            reasons.push(correlationCheck.reason);
        }

        return {
            allowed: reasons.length === 0,
            reasons,
            drawdownOk: drawdownCheck.allowed,
            correlationOk: correlationCheck.allowed,
            group: correlationCheck.group
        };
    }

    /**
     * Retourne le statut actuel
     */
    getStatus() {
        const dailyLossPercent = this.state.dailyStartBalance > 0 
            ? (this.state.dailyPnL / this.state.dailyStartBalance) * 100 
            : 0;

        return {
            isPaused: this.state.isPaused,
            pauseReason: this.state.pauseReason,
            pauseUntil: this.state.pauseUntil,
            dailyPnL: this.state.dailyPnL,
            dailyLossPercent: parseFloat(dailyLossPercent.toFixed(2)),
            consecutiveLosses: this.state.consecutiveLosses,
            lastTradeResult: this.state.lastTradeResult,
            config: this.config
        };
    }

    /**
     * Met à jour la configuration
     * @param {Object} newConfig 
     */
    updateConfig(newConfig) {
        if (newConfig.drawdown) {
            this.config.drawdown = { ...this.config.drawdown, ...newConfig.drawdown };
        }
        if (newConfig.maxPositionsPerGroup !== undefined) {
            this.config.maxPositionsPerGroup = newConfig.maxPositionsPerGroup;
        }
        console.log('[CORRELATION] Configuration mise à jour');
    }

    /**
     * Force la reprise du trading
     */
    resumeTrading() {
        this.state.isPaused = false;
        this.state.pauseReason = null;
        this.state.pauseUntil = null;
        this.saveState();
        console.log('[CORRELATION] ✅ Trading repris manuellement');
    }
}

export default new CorrelationManager();
