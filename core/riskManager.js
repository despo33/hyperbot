/**
 * Module de Risk Management
 * Gère tous les aspects de gestion du risque pour le trading
 * 
 * Fonctionnalités:
 * - Calcul de la taille de position selon le risque
 * - Limites journalières de perte
 * - Limitation du nombre de trades
 * - Contrôle du drawdown
 * - Ratio risque/rendement minimum
 * - Désactivation après pertes consécutives
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Classe de gestion du risque
 */
class RiskManager {
    constructor() {
        this.configPath = path.join(__dirname, '..', 'storage', 'risk.json');
        this.statePath = path.join(__dirname, '..', 'storage', 'state.json');
        
        // Configuration par défaut
        this.config = {
            riskPerTrade: 1,           // % du capital risqué par trade
            dailyLossLimit: 5,         // Limite de perte journalière en %
            maxTradesPerDay: 10,        // Nombre max de trades par jour
            maxDrawdown: 20,           // Drawdown max en %
            maxPositionSize: 10,       // Taille max de position en % du capital
            minRiskRewardRatio: 0.5,   // Ratio risque/rendement minimum (assoupli pour scalping)
            maxConsecutiveLosses: 3,   // Arrêt après X pertes consécutives
            useLeverage: true,         // Utiliser le levier
            maxLeverage: 10,           // Levier maximum
            defaultSLPercent: 2,       // SL par défaut en % du prix d'entrée
            defaultTPPercent: 4        // TP par défaut en % du prix d'entrée
        };

        // État du jour
        this.dailyState = {
            date: this.getTodayDate(),
            tradesCount: 0,
            totalPnL: 0,
            wins: 0,
            losses: 0,
            consecutiveLosses: 0,
            peakBalance: 0,
            startBalance: 0,
            currentDrawdown: 0,
            isStopped: false,
            stopReason: null
        };

        this.loadConfig();
        this.loadState();
    }

    /**
     * Retourne la date du jour au format YYYY-MM-DD
     * @returns {string}
     */
    getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Charge la configuration depuis le fichier
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                this.config = { ...this.config, ...data };
                console.log('[RISK] Configuration chargée');
            }
        } catch (error) {
            console.error('[RISK] Erreur chargement config:', error.message);
        }
    }

    /**
     * Sauvegarde la configuration
     */
    saveConfig() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('[RISK] Configuration sauvegardée');
        } catch (error) {
            console.error('[RISK] Erreur sauvegarde config:', error.message);
        }
    }

    /**
     * Charge l'état depuis le fichier
     */
    loadState() {
        try {
            if (fs.existsSync(this.statePath)) {
                const data = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
                
                // Vérifie si c'est un nouveau jour
                if (data.dailyState && data.dailyState.date === this.getTodayDate()) {
                    this.dailyState = data.dailyState;
                } else {
                    // Nouveau jour, réinitialise les stats journalières
                    console.log('[RISK] Nouveau jour, réinitialisation des statistiques');
                    this.dailyState.peakBalance = data.dailyState?.peakBalance || 0;
                }
            }
        } catch (error) {
            console.error('[RISK] Erreur chargement état:', error.message);
        }
    }

    /**
     * Sauvegarde l'état
     */
    saveState() {
        try {
            const dir = path.dirname(this.statePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const state = {
                dailyState: this.dailyState,
                lastUpdate: new Date().toISOString()
            };

            fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
        } catch (error) {
            console.error('[RISK] Erreur sauvegarde état:', error.message);
        }
    }

    /**
     * Met à jour la configuration
     * @param {Object} newConfig 
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Log les changements de TP/SL
        if (newConfig.defaultTPPercent !== undefined || newConfig.defaultSLPercent !== undefined) {
            console.log(`[RISK] TP/SL mis à jour: TP=${this.config.defaultTPPercent}%, SL=${this.config.defaultSLPercent}%`);
        }
        
        this.saveConfig();
    }

    /**
     * Initialise le balance de départ pour le jour
     * @param {number} balance 
     */
    initializeDayBalance(balance) {
        if (this.dailyState.startBalance === 0) {
            this.dailyState.startBalance = balance;
            this.dailyState.peakBalance = Math.max(this.dailyState.peakBalance, balance);
        }
        this.saveState();
    }

    /**
     * Calcule la taille de position selon le risque
     * @param {number} accountBalance - Solde du compte
     * @param {number} entryPrice - Prix d'entrée prévu
     * @param {number} stopLossPrice - Prix du stop loss
     * @param {number} leverage - Levier à utiliser (optionnel)
     * @returns {Object} Détails de la position
     */
    calculatePositionSize(accountBalance, entryPrice, stopLossPrice, leverage = 1) {
        // Montant risqué = % du capital
        const riskAmount = accountBalance * (this.config.riskPerTrade / 100);

        // Distance au SL en %
        const slDistance = Math.abs(entryPrice - stopLossPrice) / entryPrice;

        // Taille de position sans levier
        let positionSize = riskAmount / (slDistance * entryPrice);

        // Applique le levier si activé
        if (this.config.useLeverage && leverage > 1) {
            const effectiveLeverage = Math.min(leverage, this.config.maxLeverage);
            positionSize *= effectiveLeverage;
        }

        // Vérifie la limite de taille max
        const maxSizeValue = accountBalance * (this.config.maxPositionSize / 100);
        let positionValue = positionSize * entryPrice;

        if (positionValue > maxSizeValue) {
            positionSize = maxSizeValue / entryPrice;
            positionValue = positionSize * entryPrice;
        }

        // IMPORTANT: Hyperliquid exige un minimum de $10 par ordre
        const MIN_ORDER_VALUE = 10;
        if (positionValue < MIN_ORDER_VALUE) {
            // Augmente la taille pour atteindre le minimum
            positionSize = MIN_ORDER_VALUE / entryPrice;
            positionValue = MIN_ORDER_VALUE;
            console.log(`[RISK] Taille ajustée au minimum $${MIN_ORDER_VALUE}`);
        }

        return {
            size: positionSize,
            value: positionValue,
            riskAmount,
            riskPercent: this.config.riskPerTrade,
            slDistance: slDistance * 100, // en %
            effectiveLeverage: leverage,
            marginRequired: (positionSize * entryPrice) / leverage,
            adjustedToMinimum: positionValue === MIN_ORDER_VALUE
        };
    }

    /**
     * Calcule les niveaux de Stop Loss et Take Profit
     * MODES: auto (Ichimoku), atr (ATR dynamique), percent (% fixe), manual
     * @param {number} entryPrice - Prix d'entrée
     * @param {string} direction - 'long' ou 'short'
     * @param {Object} options - Options supplémentaires (niveaux techniques, etc.)
     * @returns {Object}
     */
    calculateSLTP(entryPrice, direction, options = {}) {
        const { 
            supportLevel, 
            resistanceLevel,
            // Niveaux techniques calculés par signalDetector
            technicalSL,
            technicalTP,
            slSource,
            tpSource,
            customSLPercent, 
            customTPPercent,
            // Nouveaux paramètres pour les modes
            tpslMode,           // 'auto', 'atr', 'percent', 'manual'
            atrValue,           // Valeur ATR actuelle
            atrMultiplierSL,    // Multiplicateur ATR pour SL
            atrMultiplierTP     // Multiplicateur ATR pour TP
        } = options;

        const slPercent = customSLPercent || this.config.defaultSLPercent;
        const tpPercent = customTPPercent || this.config.defaultTPPercent;
        
        // ===== MODE ATR DYNAMIQUE =====
        if (tpslMode === 'atr' && atrValue && atrValue > 0) {
            return this.calculateATRBasedSLTP(entryPrice, direction, atrValue, atrMultiplierSL || 1.5, atrMultiplierTP || 2.5);
        }
        
        // ===== MODE POURCENTAGE =====
        if (tpslMode === 'percent') {
            console.log(`[SLTP] Mode PERCENT: SL=${slPercent}%, TP=${tpPercent}%, Entry=${entryPrice}, Dir=${direction}`);
            return this.calculatePercentBasedSLTP(entryPrice, direction, slPercent, tpPercent);
        }
        
        // ===== MODE ICHIMOKU PUR =====
        if (tpslMode === 'ichimoku_pure') {
            return this.calculateIchimokuPureSLTP(entryPrice, direction, supportLevel, resistanceLevel, slPercent, tpPercent);
        }
        
        // ===== MODE AUTO (ICHIMOKU+) - Par défaut =====

        let stopLoss, takeProfit;
        let finalSLSource = 'default_percent';
        let finalTPSource = 'default_percent';

        // Calcul des niveaux par défaut basés sur les pourcentages
        const defaultSL_long = entryPrice * (1 - slPercent / 100);
        const defaultTP_long = entryPrice * (1 + tpPercent / 100);
        const defaultSL_short = entryPrice * (1 + slPercent / 100);
        const defaultTP_short = entryPrice * (1 - tpPercent / 100);

        const minSLDistance = entryPrice * 0.005; // Min 0.5% du prix
        const maxSLDistance = entryPrice * 0.05;  // Max 5% du prix

        if (direction === 'long') {
            // ===== STOP LOSS POUR LONG =====
            // Priorité 1: Niveau technique calculé (Ichimoku/EMA200/Bollinger)
            if (technicalSL && technicalSL < entryPrice) {
                const distance = entryPrice - technicalSL;
                if (distance >= minSLDistance && distance <= maxSLDistance) {
                    stopLoss = technicalSL;
                    finalSLSource = slSource || 'technical';
                }
            }
            
            // Priorité 2: Support Ichimoku direct
            if (!stopLoss && supportLevel && supportLevel < entryPrice) {
                const distance = entryPrice - supportLevel;
                if (distance >= minSLDistance && distance <= maxSLDistance) {
                    stopLoss = supportLevel * 0.998; // Légèrement en-dessous
                    finalSLSource = 'ichimoku_support';
                }
            }
            
            // Priorité 3: Pourcentage par défaut
            if (!stopLoss) {
                stopLoss = defaultSL_long;
                finalSLSource = 'default_percent';
            }

            // ===== TAKE PROFIT POUR LONG =====
            // Priorité 1: Niveau technique calculé
            if (technicalTP && technicalTP > entryPrice) {
                takeProfit = technicalTP;
                finalTPSource = tpSource || 'technical';
            }
            // Priorité 2: Résistance Ichimoku
            else if (resistanceLevel && resistanceLevel > entryPrice) {
                takeProfit = resistanceLevel * 0.998; // Légèrement avant
                finalTPSource = 'ichimoku_resistance';
            }
            // Priorité 3: Calculé selon le RRR minimum
            else {
                const risk = entryPrice - stopLoss;
                const minReward = risk * this.config.minRiskRewardRatio;
                takeProfit = Math.max(defaultTP_long, entryPrice + minReward);
                finalTPSource = 'rrr_calculated';
            }
            
        } else {
            // ===== STOP LOSS POUR SHORT =====
            // Priorité 1: Niveau technique calculé
            if (technicalSL && technicalSL > entryPrice) {
                const distance = technicalSL - entryPrice;
                if (distance >= minSLDistance && distance <= maxSLDistance) {
                    stopLoss = technicalSL;
                    finalSLSource = slSource || 'technical';
                }
            }
            
            // Priorité 2: Résistance Ichimoku direct
            if (!stopLoss && resistanceLevel && resistanceLevel > entryPrice) {
                const distance = resistanceLevel - entryPrice;
                if (distance >= minSLDistance && distance <= maxSLDistance) {
                    stopLoss = resistanceLevel * 1.002; // Légèrement au-dessus
                    finalSLSource = 'ichimoku_resistance';
                }
            }
            
            // Priorité 3: Pourcentage par défaut
            if (!stopLoss) {
                stopLoss = defaultSL_short;
                finalSLSource = 'default_percent';
            }

            // ===== TAKE PROFIT POUR SHORT =====
            // Priorité 1: Niveau technique calculé
            if (technicalTP && technicalTP < entryPrice) {
                takeProfit = technicalTP;
                finalTPSource = tpSource || 'technical';
            }
            // Priorité 2: Support Ichimoku
            else if (supportLevel && supportLevel < entryPrice) {
                takeProfit = supportLevel * 1.002; // Légèrement après
                finalTPSource = 'ichimoku_support';
            }
            // Priorité 3: Calculé selon le RRR minimum
            else {
                const risk = stopLoss - entryPrice;
                const minReward = risk * this.config.minRiskRewardRatio;
                takeProfit = Math.min(defaultTP_short, entryPrice - minReward);
                finalTPSource = 'rrr_calculated';
            }
        }

        // Calcul du ratio risque/rendement
        const risk = Math.abs(entryPrice - stopLoss);
        const reward = Math.abs(takeProfit - entryPrice);
        const riskRewardRatio = risk > 0 ? reward / risk : 0;

        return {
            entryPrice,
            stopLoss: parseFloat(stopLoss.toFixed(6)),
            takeProfit: parseFloat(takeProfit.toFixed(6)),
            riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
            riskPercent: (risk / entryPrice * 100).toFixed(2),
            rewardPercent: (reward / entryPrice * 100).toFixed(2),
            meetsMinRRR: this.config.minRiskRewardRatio === 0 || riskRewardRatio >= this.config.minRiskRewardRatio,
            // Nouvelles infos sur les sources
            slSource: finalSLSource,
            tpSource: finalTPSource,
            usedTechnicalLevels: finalSLSource !== 'default_percent' || finalTPSource !== 'default_percent'
        };
    }

    /**
     * Calcule SL/TP basé sur l'ATR (Average True Range)
     * S'adapte automatiquement à la volatilité du marché
     * @param {number} entryPrice - Prix d'entrée
     * @param {string} direction - 'long' ou 'short'
     * @param {number} atr - Valeur ATR actuelle
     * @param {number} slMultiplier - Multiplicateur pour le SL (ex: 1.5)
     * @param {number} tpMultiplier - Multiplicateur pour le TP (ex: 2.5)
     * @returns {Object}
     */
    calculateATRBasedSLTP(entryPrice, direction, atr, slMultiplier = 1.5, tpMultiplier = 2.5) {
        const slDistance = atr * slMultiplier;
        const tpDistance = atr * tpMultiplier;

        let stopLoss, takeProfit;

        if (direction === 'long') {
            stopLoss = entryPrice - slDistance;
            takeProfit = entryPrice + tpDistance;
        } else {
            stopLoss = entryPrice + slDistance;
            takeProfit = entryPrice - tpDistance;
        }

        const risk = Math.abs(entryPrice - stopLoss);
        const reward = Math.abs(takeProfit - entryPrice);
        const riskRewardRatio = risk > 0 ? reward / risk : 0;

        return {
            entryPrice,
            stopLoss: parseFloat(stopLoss.toFixed(6)),
            takeProfit: parseFloat(takeProfit.toFixed(6)),
            riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
            riskPercent: (risk / entryPrice * 100).toFixed(2),
            rewardPercent: (reward / entryPrice * 100).toFixed(2),
            meetsMinRRR: this.config.minRiskRewardRatio === 0 || riskRewardRatio >= this.config.minRiskRewardRatio,
            slSource: 'atr_dynamic',
            tpSource: 'atr_dynamic',
            usedTechnicalLevels: true,
            atrInfo: {
                atr: parseFloat(atr.toFixed(6)),
                slMultiplier,
                tpMultiplier,
                slDistance: parseFloat(slDistance.toFixed(6)),
                tpDistance: parseFloat(tpDistance.toFixed(6))
            }
        };
    }

    /**
     * Calcule SL/TP basé sur des pourcentages fixes
     * Simple et prévisible
     * @param {number} entryPrice - Prix d'entrée
     * @param {string} direction - 'long' ou 'short'
     * @param {number} slPercent - Pourcentage de SL
     * @param {number} tpPercent - Pourcentage de TP
     * @returns {Object}
     */
    calculatePercentBasedSLTP(entryPrice, direction, slPercent, tpPercent) {
        let stopLoss, takeProfit;

        if (direction === 'long') {
            stopLoss = entryPrice * (1 - slPercent / 100);
            takeProfit = entryPrice * (1 + tpPercent / 100);
        } else {
            stopLoss = entryPrice * (1 + slPercent / 100);
            takeProfit = entryPrice * (1 - tpPercent / 100);
        }

        const risk = Math.abs(entryPrice - stopLoss);
        const reward = Math.abs(takeProfit - entryPrice);
        const riskRewardRatio = risk > 0 ? reward / risk : 0;

        return {
            entryPrice,
            stopLoss: parseFloat(stopLoss.toFixed(6)),
            takeProfit: parseFloat(takeProfit.toFixed(6)),
            riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
            riskPercent: slPercent.toFixed(2),
            rewardPercent: tpPercent.toFixed(2),
            meetsMinRRR: this.config.minRiskRewardRatio === 0 || riskRewardRatio >= this.config.minRiskRewardRatio,
            slSource: 'percent_fixed',
            tpSource: 'percent_fixed',
            usedTechnicalLevels: false
        };
    }

    /**
     * Calcule SL/TP basé UNIQUEMENT sur les niveaux Ichimoku
     * Pas de fallback sur EMA200 ou Bollinger - seulement Ichimoku ou % par défaut
     * @param {number} entryPrice - Prix d'entrée
     * @param {string} direction - 'long' ou 'short'
     * @param {number} supportLevel - Support Ichimoku
     * @param {number} resistanceLevel - Résistance Ichimoku
     * @param {number} slPercent - SL par défaut en %
     * @param {number} tpPercent - TP par défaut en %
     * @returns {Object}
     */
    calculateIchimokuPureSLTP(entryPrice, direction, supportLevel, resistanceLevel, slPercent, tpPercent) {
        let stopLoss, takeProfit;
        let slSource = 'default_percent';
        let tpSource = 'default_percent';
        
        const buffer = 0.002; // 0.2% de marge
        const minDistance = entryPrice * 0.003; // Min 0.3%
        const maxDistance = entryPrice * 0.08;  // Max 8%

        if (direction === 'long') {
            // SL: Support Ichimoku uniquement
            if (supportLevel && supportLevel < entryPrice) {
                const distance = entryPrice - supportLevel;
                if (distance >= minDistance && distance <= maxDistance) {
                    stopLoss = supportLevel * (1 - buffer);
                    slSource = 'ichimoku_support';
                }
            }
            
            // Fallback: % par défaut
            if (!stopLoss) {
                stopLoss = entryPrice * (1 - slPercent / 100);
                slSource = 'default_percent';
            }
            
            // TP: Résistance Ichimoku uniquement
            if (resistanceLevel && resistanceLevel > entryPrice) {
                takeProfit = resistanceLevel * (1 - buffer);
                tpSource = 'ichimoku_resistance';
            } else {
                // Fallback: calculé selon RRR
                const risk = entryPrice - stopLoss;
                const minReward = risk * Math.max(this.config.minRiskRewardRatio, 1.5);
                takeProfit = entryPrice + minReward;
                tpSource = 'rrr_calculated';
            }
            
        } else {
            // SL: Résistance Ichimoku uniquement
            if (resistanceLevel && resistanceLevel > entryPrice) {
                const distance = resistanceLevel - entryPrice;
                if (distance >= minDistance && distance <= maxDistance) {
                    stopLoss = resistanceLevel * (1 + buffer);
                    slSource = 'ichimoku_resistance';
                }
            }
            
            // Fallback: % par défaut
            if (!stopLoss) {
                stopLoss = entryPrice * (1 + slPercent / 100);
                slSource = 'default_percent';
            }
            
            // TP: Support Ichimoku uniquement
            if (supportLevel && supportLevel < entryPrice) {
                takeProfit = supportLevel * (1 + buffer);
                tpSource = 'ichimoku_support';
            } else {
                // Fallback: calculé selon RRR
                const risk = stopLoss - entryPrice;
                const minReward = risk * Math.max(this.config.minRiskRewardRatio, 1.5);
                takeProfit = entryPrice - minReward;
                tpSource = 'rrr_calculated';
            }
        }

        const risk = Math.abs(entryPrice - stopLoss);
        const reward = Math.abs(takeProfit - entryPrice);
        const riskRewardRatio = risk > 0 ? reward / risk : 0;

        return {
            entryPrice,
            stopLoss: parseFloat(stopLoss.toFixed(6)),
            takeProfit: parseFloat(takeProfit.toFixed(6)),
            riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
            riskPercent: (risk / entryPrice * 100).toFixed(2),
            rewardPercent: (reward / entryPrice * 100).toFixed(2),
            meetsMinRRR: this.config.minRiskRewardRatio === 0 || riskRewardRatio >= this.config.minRiskRewardRatio,
            slSource,
            tpSource,
            usedTechnicalLevels: slSource.includes('ichimoku') || tpSource.includes('ichimoku'),
            mode: 'ichimoku_pure'
        };
    }

    /**
     * Vérifie si un trade peut être exécuté selon les règles de risk management
     * @param {number} accountBalance - Solde actuel
     * @param {Object} tradeParams - Paramètres du trade proposé
     * @returns {Object} {allowed: boolean, reasons: []}
     */
    canTrade(accountBalance, tradeParams = {}) {
        const checks = [];
        let allowed = true;

        // Initialise le solde de départ si nécessaire
        this.initializeDayBalance(accountBalance);

        // 1. Vérifie si le bot est arrêté
        if (this.dailyState.isStopped) {
            checks.push({ passed: false, check: 'Bot Status', reason: this.dailyState.stopReason });
            allowed = false;
        }

        // 2. Vérifie le nombre de trades du jour (0 = illimité)
        if (this.config.maxTradesPerDay > 0 && this.dailyState.tradesCount >= this.config.maxTradesPerDay) {
            checks.push({ 
                passed: false, 
                check: 'Max Trades', 
                reason: `Limite atteinte: ${this.dailyState.tradesCount}/${this.config.maxTradesPerDay}` 
            });
            allowed = false;
        } else {
            const maxDisplay = this.config.maxTradesPerDay > 0 ? this.config.maxTradesPerDay : '∞';
            checks.push({ passed: true, check: 'Max Trades', value: `${this.dailyState.tradesCount}/${maxDisplay}` });
        }

        // 3. Vérifie la limite de perte journalière (0 = désactivé)
        const dailyPnLPercent = (this.dailyState.totalPnL / this.dailyState.startBalance) * 100;
        if (this.config.dailyLossLimit > 0 && dailyPnLPercent <= -this.config.dailyLossLimit) {
            checks.push({ 
                passed: false, 
                check: 'Daily Loss Limit', 
                reason: `Perte journalière: ${dailyPnLPercent.toFixed(2)}% (limite: -${this.config.dailyLossLimit}%)` 
            });
            allowed = false;
            this.stopBot('Limite de perte journalière atteinte');
        } else {
            checks.push({ passed: true, check: 'Daily Loss Limit', value: `${dailyPnLPercent.toFixed(2)}%` });
        }

        // 4. Vérifie le drawdown
        this.dailyState.peakBalance = Math.max(this.dailyState.peakBalance, accountBalance);
        const drawdown = ((this.dailyState.peakBalance - accountBalance) / this.dailyState.peakBalance) * 100;
        this.dailyState.currentDrawdown = drawdown;

        if (drawdown >= this.config.maxDrawdown) {
            checks.push({ 
                passed: false, 
                check: 'Max Drawdown', 
                reason: `Drawdown: ${drawdown.toFixed(2)}% (max: ${this.config.maxDrawdown}%)` 
            });
            allowed = false;
            this.stopBot('Drawdown maximum atteint');
        } else {
            checks.push({ passed: true, check: 'Max Drawdown', value: `${drawdown.toFixed(2)}%` });
        }

        // 5. Vérifie les pertes consécutives (0 = désactivé)
        if (this.config.maxConsecutiveLosses > 0 && this.dailyState.consecutiveLosses >= this.config.maxConsecutiveLosses) {
            checks.push({ 
                passed: false, 
                check: 'Consecutive Losses', 
                reason: `${this.dailyState.consecutiveLosses} pertes consécutives (max: ${this.config.maxConsecutiveLosses})` 
            });
            allowed = false;
            this.stopBot('Trop de pertes consécutives');
        } else {
            const maxDisplay = this.config.maxConsecutiveLosses > 0 ? this.config.maxConsecutiveLosses : '∞';
            checks.push({ passed: true, check: 'Consecutive Losses', value: `${this.dailyState.consecutiveLosses}/${maxDisplay}` });
        }

        // 6. Vérifie le ratio risque/rendement si fourni
        if (tradeParams.riskRewardRatio !== undefined) {
            if (tradeParams.riskRewardRatio < this.config.minRiskRewardRatio) {
                checks.push({ 
                    passed: false, 
                    check: 'Risk/Reward Ratio', 
                    reason: `RRR: ${tradeParams.riskRewardRatio} (min: ${this.config.minRiskRewardRatio})` 
                });
                allowed = false;
            } else {
                checks.push({ passed: true, check: 'Risk/Reward Ratio', value: tradeParams.riskRewardRatio });
            }
        }

        this.saveState();

        return {
            allowed,
            checks,
            dailyStats: {
                trades: this.dailyState.tradesCount,
                pnl: this.dailyState.totalPnL,
                pnlPercent: dailyPnLPercent.toFixed(2),
                wins: this.dailyState.wins,
                losses: this.dailyState.losses,
                drawdown: drawdown.toFixed(2)
            }
        };
    }

    /**
     * Enregistre le résultat d'un trade
     * @param {Object} tradeResult 
     */
    recordTrade(tradeResult) {
        const { pnl, isWin } = tradeResult;

        this.dailyState.tradesCount++;
        this.dailyState.totalPnL += pnl;

        if (isWin) {
            this.dailyState.wins++;
            this.dailyState.consecutiveLosses = 0;
        } else {
            this.dailyState.losses++;
            this.dailyState.consecutiveLosses++;
        }

        // Vérifie si les limites sont atteintes après ce trade
        this.checkLimitsAfterTrade();

        this.saveState();
        console.log(`[RISK] Trade enregistré: ${isWin ? 'WIN' : 'LOSS'} ${pnl.toFixed(2)} USD`);
    }

    /**
     * Vérifie les limites après un trade
     */
    checkLimitsAfterTrade() {
        const pnlPercent = (this.dailyState.totalPnL / this.dailyState.startBalance) * 100;

        if (this.config.dailyLossLimit > 0 && pnlPercent <= -this.config.dailyLossLimit) {
            this.stopBot('Limite de perte journalière atteinte');
        }

        if (this.config.maxConsecutiveLosses > 0 && this.dailyState.consecutiveLosses >= this.config.maxConsecutiveLosses) {
            this.stopBot('Trop de pertes consécutives');
        }
    }

    /**
     * Arrête le bot avec une raison
     * @param {string} reason 
     */
    stopBot(reason) {
        this.dailyState.isStopped = true;
        this.dailyState.stopReason = reason;
        this.saveState();
        console.log(`[RISK] ⛔ Bot arrêté: ${reason}`);
    }

    /**
     * Redémarre le bot
     */
    restartBot() {
        this.dailyState.isStopped = false;
        this.dailyState.stopReason = null;
        this.saveState();
        console.log('[RISK] ✅ Bot redémarré');
    }

    /**
     * Réinitialise les statistiques journalières
     * @param {number} newBalance 
     */
    resetDailyStats(newBalance = 0) {
        this.dailyState = {
            date: this.getTodayDate(),
            tradesCount: 0,
            totalPnL: 0,
            wins: 0,
            losses: 0,
            consecutiveLosses: 0,
            peakBalance: newBalance,
            startBalance: newBalance,
            currentDrawdown: 0,
            isStopped: false,
            stopReason: null
        };
        this.saveState();
        console.log('[RISK] Statistiques journalières réinitialisées');
    }

    /**
     * Retourne les statistiques actuelles
     * @returns {Object}
     */
    getStats() {
        const winRate = this.dailyState.tradesCount > 0 
            ? (this.dailyState.wins / this.dailyState.tradesCount * 100).toFixed(1) 
            : 0;

        return {
            config: this.config,
            daily: {
                ...this.dailyState,
                winRate: `${winRate}%`
            }
        };
    }

    /**
     * Retourne la configuration actuelle
     * @returns {Object}
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Valide les paramètres d'un trade avant exécution
     * @param {Object} trade 
     * @param {number} balance 
     * @returns {Object}
     */
    validateTrade(trade, balance) {
        const { entryPrice, stopLoss, takeProfit, size, direction } = trade;

        const errors = [];
        const warnings = [];

        // Calcul du risque
        const slDistance = Math.abs(entryPrice - stopLoss) / entryPrice * 100;
        const tpDistance = Math.abs(takeProfit - entryPrice) / entryPrice * 100;
        const rrr = tpDistance / slDistance;

        // Valeur de la position
        const positionValue = size * entryPrice;
        const positionPercent = (positionValue / balance) * 100;

        // Risque en USD
        const riskUSD = size * Math.abs(entryPrice - stopLoss);
        const riskPercent = (riskUSD / balance) * 100;

        // Validations
        if (riskPercent > this.config.riskPerTrade * 1.5) {
            errors.push(`Risque trop élevé: ${riskPercent.toFixed(2)}% (max: ${this.config.riskPerTrade}%)`);
        } else if (riskPercent > this.config.riskPerTrade) {
            warnings.push(`Risque légèrement élevé: ${riskPercent.toFixed(2)}%`);
        }

        if (positionPercent > this.config.maxPositionSize) {
            errors.push(`Position trop grande: ${positionPercent.toFixed(2)}% (max: ${this.config.maxPositionSize}%)`);
        }

        if (rrr < this.config.minRiskRewardRatio) {
            errors.push(`RRR insuffisant: ${rrr.toFixed(2)} (min: ${this.config.minRiskRewardRatio})`);
        }

        // Vérifie la cohérence SL/TP
        if (direction === 'long') {
            if (stopLoss >= entryPrice) errors.push('SL doit être sous le prix d\'entrée pour un LONG');
            if (takeProfit <= entryPrice) errors.push('TP doit être au-dessus du prix d\'entrée pour un LONG');
        } else {
            if (stopLoss <= entryPrice) errors.push('SL doit être au-dessus du prix d\'entrée pour un SHORT');
            if (takeProfit >= entryPrice) errors.push('TP doit être sous le prix d\'entrée pour un SHORT');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            analysis: {
                riskPercent: riskPercent.toFixed(2),
                riskUSD: riskUSD.toFixed(2),
                positionPercent: positionPercent.toFixed(2),
                riskRewardRatio: rrr.toFixed(2),
                slDistance: slDistance.toFixed(2),
                tpDistance: tpDistance.toFixed(2)
            }
        };
    }
}

// Export singleton
const riskManager = new RiskManager();
export default riskManager;
