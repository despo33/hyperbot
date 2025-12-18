/**
 * Instance de Bot par Utilisateur
 * Chaque utilisateur a sa propre instance avec ses paramètres et son état
 */

import api from '../services/hyperliquidApi.js';
import { HyperliquidAuth } from '../services/hyperliquidAuth.js';
import priceFetcher from './priceFetcher.js';
import signalDetector from './signalDetector.js';
import { decryptSecret } from '../utils/crypto.js';
import { TIMEFRAME_TPSL, TIMEFRAME_PRESETS, DEFAULT_BOT_CONFIG, ANTI_OVERTRADING_CONFIG } from './config.js';

/**
 * Instance de bot pour un utilisateur spécifique
 */
class UserBotInstance {
    constructor(userId, userConfig = {}) {
        this.userId = userId;
        this.auth = new HyperliquidAuth();
        
        // Utilise les constantes centralisées depuis config.js
        this.TIMEFRAME_TPSL = TIMEFRAME_TPSL;
        this.TIMEFRAME_PRESETS = TIMEFRAME_PRESETS;

        // Configuration par défaut (peut être surchargée par userConfig)
        this.config = {
            ...DEFAULT_BOT_CONFIG,
            ...userConfig
        };

        // État du bot
        this.state = {
            isRunning: false,
            lastAnalysis: null,
            lastSignal: null,
            currentPosition: null,
            pendingOrders: [],
            analysisCount: 0,
            multiAnalysis: new Map(),
            activePositions: new Map(),
            opportunities: [],
            tradingLocks: new Set(),
            isProcessingTrades: false,
            lastTradeTime: new Map(),
            consecutiveShorts: 0,
            consecutiveLongs: 0,
            lastTradeDirection: null
        };

        // Anti-overtrading (utilise config centralisée)
        this.antiOvertradingConfig = ANTI_OVERTRADING_CONFIG;
        this.lastGlobalTradeTime = 0;

        // Intervalle d'analyse
        this.analysisInterval = null;

        // Logs
        this.logs = [];
        this.maxLogs = 200;

        // Callbacks
        this.eventCallbacks = {
            onLog: [],
            onSignal: [],
            onTrade: [],
            onAnalysis: []
        };

        // Wallet actif
        this.activeWallet = null;
    }

    /**
     * Initialise le bot avec le wallet de l'utilisateur
     */
    async initializeWithWallet(wallet) {
        if (!wallet || !wallet.secretPhrase) {
            throw new Error('Wallet invalide ou sans clé secrète');
        }

        try {
            const secret = decryptSecret(wallet.secretPhrase);
            await this.auth.initialize(secret);
            
            if (wallet.tradingAddress) {
                this.auth.setTradingAddress(wallet.tradingAddress);
            }
            
            this.activeWallet = wallet;
            this.log(`Wallet initialisé: ${wallet.address.substring(0, 10)}...`, 'info');
            return true;
        } catch (error) {
            this.log(`Erreur initialisation wallet: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Démarre le bot
     */
    async start() {
        if (this.state.isRunning) {
            this.log('Bot déjà en cours d\'exécution', 'warning');
            return false;
        }

        if (!this.auth.isReady()) {
            throw new Error('Wallet non initialisé. Configurez votre wallet d\'abord.');
        }

        this.state.isRunning = true;
        this.log(`🚀 Bot démarré pour l'utilisateur ${this.userId}`, 'success');
        this.log(`Mode: ${this.config.mode.toUpperCase()}`, 'info');
        this.log(`Symboles: ${this.config.symbols.join(', ')}`, 'info');
        
        // Affiche les timeframes selon le mode
        if (this.config.multiTimeframeMode && this.config.mtfTimeframes?.length > 0) {
            this.log(`Mode Multi-Timeframe: ${this.config.mtfTimeframes.join(', ')}`, 'info');
        } else {
            this.log(`Timeframe: ${this.config.timeframes.join(', ')}`, 'info');
            // Applique le preset seulement en mode non-MTF
            this.applyTimeframePreset(this.config.timeframes[0]);
        }

        // Démarre la boucle d'analyse
        this.startAnalysisLoop();

        return true;
    }

    /**
     * Arrête le bot
     */
    stop() {
        if (!this.state.isRunning) {
            return false;
        }

        this.state.isRunning = false;
        
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }

        this.log(`🛑 Bot arrêté pour l'utilisateur ${this.userId}`, 'info');
        return true;
    }

    /**
     * Applique le preset du timeframe
     */
    applyTimeframePreset(timeframe) {
        const preset = this.TIMEFRAME_PRESETS[timeframe];
        if (preset) {
            this.config.minScore = preset.minScore;
            this.config.minWinProbability = preset.minWinProbability;
            this.config.analysisInterval = preset.analysisInterval;
            // Log seulement si pas en mode MTF
            if (!this.config.multiTimeframeMode) {
                this.log(`Preset ${preset.name} appliqué pour ${timeframe}`, 'info');
            }
        }
    }

    /**
     * Démarre la boucle d'analyse
     */
    startAnalysisLoop() {
        // Première analyse immédiate
        this.runAnalysis();

        // Puis à intervalle régulier
        this.analysisInterval = setInterval(() => {
            if (this.state.isRunning) {
                this.runAnalysis();
            }
        }, this.config.analysisInterval);
    }

    /**
     * Exécute une analyse
     */
    async runAnalysis() {
        if (!this.state.isRunning) return;

        try {
            this.state.analysisCount++;
            
            // Détermine les timeframes à analyser (mode MTF ou normal)
            const timeframesToAnalyze = this.config.multiTimeframeMode && this.config.mtfTimeframes?.length > 0
                ? this.config.mtfTimeframes
                : this.config.timeframes;
            
            const modeLabel = this.config.multiTimeframeMode ? 'MTF' : 'Normal';
            
            // Log du mode TP/SL
            const tpslModeLabels = {
                'auto': 'Ichimoku+ (dynamique)',
                'ichimoku': 'Ichimoku Pur',
                'ichimoku_pure': 'Ichimoku Pur',
                'atr': 'ATR Dynamique',
                'percent': 'Manuel'
            };
            const tpslModeLabel = tpslModeLabels[this.config.tpslMode] || 'Auto';
            
            // Modes dynamiques (tous sauf 'percent')
            const isDynamicMode = this.config.tpslMode !== 'percent';
            
            // Log des TP/SL par timeframe en mode MTF
            if (this.config.multiTimeframeMode) {
                this.log(`🔍 Analyse #${this.state.analysisCount} [MTF] - ${this.config.symbols.length} symboles`, 'info');
                this.log(`🎯 Mode TP/SL: ${tpslModeLabel}`, 'info');
                
                if (isDynamicMode) {
                    this.log(`📊 Timeframes: ${timeframesToAnalyze.join(', ')} (TP/SL calculés dynamiquement)`, 'info');
                } else {
                    // Mode manuel: affiche les valeurs fixes
                    const tp = this.config.defaultTP || 2;
                    const sl = this.config.defaultSL || 1;
                    this.log(`📊 Timeframes: ${timeframesToAnalyze.join(', ')} (TP:${tp}%/SL:${sl}% fixes)`, 'info');
                }
            } else {
                const tf = timeframesToAnalyze[0];
                if (isDynamicMode) {
                    this.log(`🔍 Analyse #${this.state.analysisCount} [${tf}] - ${this.config.symbols.length} symboles | TP/SL: ${tpslModeLabel}`, 'info');
                } else {
                    const tp = this.config.defaultTP || 2;
                    const sl = this.config.defaultSL || 1;
                    this.log(`🔍 Analyse #${this.state.analysisCount} [${tf}] - ${this.config.symbols.length} symboles (TP:${tp}%/SL:${sl}%)`, 'info');
                }
            }
            
            const opportunities = [];

            for (const symbol of this.config.symbols) {
                for (const timeframe of timeframesToAnalyze) {
                    try {
                        const result = await this.analyzeSymbol(symbol, timeframe);
                        if (result && result.signal) {
                            opportunities.push(result);
                        }
                    } catch (error) {
                        this.log(`Erreur analyse ${symbol} ${timeframe}: ${error.message}`, 'error');
                    }
                }
            }

            this.state.opportunities = opportunities;
            this.state.lastAnalysis = new Date();
            
            this.log(`✅ Analyse terminée: ${opportunities.length} opportunités trouvées`, 'info');

            // Émet l'événement d'analyse
            this.emit('onAnalysis', {
                count: this.state.analysisCount,
                opportunities: opportunities.length,
                timestamp: this.state.lastAnalysis
            });

            // En mode auto, exécute les trades
            if (this.config.mode === 'auto' && opportunities.length > 0) {
                this.log(`🎯 Mode AUTO: traitement de ${opportunities.length} opportunités`, 'info');
                await this.processOpportunities(opportunities);
            }

        } catch (error) {
            this.log(`Erreur boucle d'analyse: ${error.message}`, 'error');
        }
    }

    /**
     * Analyse un symbole sur un timeframe
     */
    async analyzeSymbol(symbol, timeframe) {
        // L'API Hyperliquid attend juste le symbole (BTC, ETH, etc.) sans -PERP
        const cleanSymbol = symbol.replace('-PERP', '');
        
        // Récupère les candles
        const candles = await priceFetcher.getCandles(cleanSymbol, timeframe, 200);
        if (!candles || candles.length < 60) {
            return null;
        }

        // Utilise signalDetector.analyze() qui fait tout le travail
        const analysis = signalDetector.analyze(candles, {}, timeframe);
        
        if (!analysis.success || !analysis.finalSignal || !analysis.finalSignal.action) {
            return null;
        }

        const finalSignal = analysis.finalSignal;
        const signalScore = finalSignal.score || finalSignal.normalizedScore || 0;
        
        // Vérifie les filtres de score
        if (signalScore < this.config.minScore) return null;

        // Convertit direction bullish/bearish en LONG/SHORT
        const direction = finalSignal.action === 'BUY' ? 'LONG' : 'SHORT';

        // Filtre RSI si activé
        if (this.config.useRSIFilter && analysis.indicators?.rsi) {
            const rsiValue = analysis.indicators.rsi?.value || analysis.indicators.rsi || 50;
            if (direction === 'LONG' && rsiValue > this.config.rsiOverbought) {
                return null;
            }
            if (direction === 'SHORT' && rsiValue < this.config.rsiOversold) {
                return null;
            }
        }

        const result = {
            symbol: cleanSymbol,
            timeframe,
            signal: { ...finalSignal, direction, score: signalScore },
            price: candles[candles.length - 1].close,
            ichimoku: analysis.ichimokuScore,
            indicators: analysis.indicators,
            timestamp: new Date()
        };

        this.state.lastSignal = result;
        
        // Log avec TP/SL selon le mode (tous les modes dynamiques affichent les valeurs calculées)
        const tpsl = this.calculateTPSL(result);
        const modeTag = this.config.tpslMode === 'percent' ? '' : ` [${this.config.tpslMode || 'auto'}]`;
        this.log(`📊 Signal ${direction} sur ${symbol} [${timeframe}] (score: ${signalScore.toFixed(1)}) - TP:${tpsl.tpPercent}%/SL:${tpsl.slPercent}%${modeTag}`, 'signal');
        this.emit('onSignal', result);

        return result;
    }

    /**
     * Traite les opportunités en mode auto
     */
    async processOpportunities(opportunities) {
        // Trie par score décroissant
        const sorted = opportunities.sort((a, b) => b.signal.score - a.signal.score);

        for (const opp of sorted) {
            if (this.state.activePositions.size >= this.config.maxConcurrentTrades) {
                break;
            }

            // Vérifie le cooldown
            const lastTrade = this.state.lastTradeTime.get(opp.symbol);
            if (lastTrade && Date.now() - lastTrade < this.antiOvertradingConfig.symbolCooldownMs) {
                continue;
            }

            try {
                await this.executeTrade(opp);
            } catch (error) {
                this.log(`Erreur exécution trade ${opp.symbol}: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Exécute un trade
     */
    async executeTrade(opportunity) {
        const { symbol, signal, price } = opportunity;

        // Vérifie si on a déjà une position sur ce symbole (via API)
        try {
            const tradingAddress = this.auth.tradingAddress || this.auth.getAddress();
            const positions = await api.getPositions(tradingAddress);
            const existingPosition = positions?.find(p => 
                (p.coin === symbol || p.coin === `${symbol}-PERP`) && 
                parseFloat(p.szi || p.size || 0) !== 0
            );
            
            if (existingPosition) {
                this.log(`⏭️ Position ${symbol} existe déjà, skip`, 'info');
                return;
            }
        } catch (error) {
            this.log(`⚠️ Impossible de vérifier positions existantes: ${error.message}`, 'warning');
        }

        // Calcule TP/SL
        const tpsl = this.calculateTPSL(opportunity);

        this.log(`🎯 Exécution ${signal.direction} sur ${symbol} @ ${price}`, 'trade');
        this.log(`   TP: ${tpsl.tp.toFixed(2)} | SL: ${tpsl.sl.toFixed(2)}`, 'trade');

        try {
            // Calcule la taille de la position basée sur le solde et le risque
            const balance = await this.getBalance();
            if (!balance || balance.totalEquity <= 0) {
                this.log(`❌ Solde insuffisant pour trader`, 'error');
                return;
            }

            const accountBalance = balance.totalEquity;
            const leverage = this.config.leverage || 10;
            
            // Risque par trade (% du capital, défaut 2%)
            const riskPercent = this.config.riskPerTrade || 2;
            const riskAmount = accountBalance * (riskPercent / 100);
            
            // Distance au SL en % du prix
            const slDistancePercent = Math.abs(price - tpsl.sl) / price;
            
            // Formule correcte: Taille = Risque / Distance SL%
            // Si SL = 1% et risque = $3.33, alors position value = $333
            // Car si le prix baisse de 1%, on perd 1% de $333 = $3.33
            let positionValue = riskAmount / slDistancePercent;
            let positionSize = positionValue / price;
            
            // Le levier ne multiplie PAS la taille de position
            // Il réduit seulement la marge requise (marge = position / levier)
            // Vérifie que la marge requise ne dépasse pas un % max du capital
            const maxMarginPercent = this.config.maxPositionSize || 50; // 50% max de marge par défaut
            const maxMargin = accountBalance * (maxMarginPercent / 100);
            let marginRequired = positionValue / leverage;
            
            if (marginRequired > maxMargin) {
                // Réduit la position pour respecter la marge max
                positionValue = maxMargin * leverage;
                positionSize = positionValue / price;
                marginRequired = maxMargin;
                this.log(`⚠️ Position réduite: marge max ${maxMarginPercent}% du capital ($${maxMargin.toFixed(2)})`, 'warning');
            }
            
            // Minimum 10$ de position (requis par Hyperliquid)
            const minNotional = 10;
            if (positionValue < minNotional) {
                positionSize = minNotional / price;
                positionValue = minNotional;
                marginRequired = positionValue / leverage;
                this.log(`⚠️ Position ajustée au minimum $${minNotional}`, 'warning');
            }

            this.log(`📊 Capital: $${accountBalance.toFixed(2)} | Risque: ${riskPercent}% ($${riskAmount.toFixed(2)})`, 'info');
            this.log(`📊 Position: ${positionSize.toFixed(4)} ${symbol} ($${positionValue.toFixed(2)}) | Levier: ${leverage}x | Marge: $${marginRequired.toFixed(2)}`, 'info');

            // Exécute l'ordre via l'API
            const isBuy = signal.direction === 'LONG';
            
            const result = await api.placeOrderWithTPSL({
                symbol: symbol,
                isBuy: isBuy,
                size: positionSize,
                price: price,
                takeProfit: tpsl.tp,
                stopLoss: tpsl.sl,
                leverage: leverage,
                reduceOnly: false
            });

            this.log(`✅ Ordre exécuté: ${JSON.stringify(result)}`, 'trade');
            
            // Met à jour l'état
            this.state.lastTradeTime.set(symbol, Date.now());
            this.lastGlobalTradeTime = Date.now();
            this.state.activePositions.set(symbol, {
                direction: signal.direction,
                entryPrice: price,
                size: positionSize,
                tp: tpsl.tp,
                sl: tpsl.sl,
                timestamp: new Date()
            });

            this.emit('onTrade', {
                symbol,
                direction: signal.direction,
                price,
                size: positionSize,
                tp: tpsl.tp,
                sl: tpsl.sl,
                result: result,
                timestamp: new Date()
            });

        } catch (error) {
            this.log(`❌ Erreur exécution ordre ${symbol}: ${error.message}`, 'error');
        }
    }
    
    /**
     * Récupère le solde du compte
     */
    async getBalance() {
        try {
            const tradingAddress = this.auth.tradingAddress || this.auth.getAddress();
            return await api.getAccountBalance(tradingAddress);
        } catch (error) {
            this.log(`Erreur récupération solde: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Calcule TP/SL selon le mode configuré
     */
    calculateTPSL(opportunity) {
        const { price, timeframe, signal, indicators, ichimoku } = opportunity;
        const preset = this.TIMEFRAME_TPSL[timeframe] || { tp: 2, sl: 1 };
        const direction = signal?.direction || 'LONG';
        const isLong = direction === 'LONG';

        let tp, sl;
        let tpPercent, slPercent;

        switch (this.config.tpslMode) {
            case 'percent':
                // Mode manuel: utilise les valeurs définies par l'utilisateur
                tpPercent = this.config.defaultTP || 2;
                slPercent = this.config.defaultSL || 1;
                break;
                
            case 'ichimoku':
            case 'ichimoku_pure':
                // Mode Ichimoku dynamique: calcule TP/SL basés sur les niveaux Ichimoku
                const ichimokuTPSL = this.calculateIchimokuTPSL(opportunity, false);
                tpPercent = ichimokuTPSL.tpPercent;
                slPercent = ichimokuTPSL.slPercent;
                break;
                
            case 'atr':
                // Mode ATR: utilise l'ATR pour calculer TP/SL dynamiques
                const atrTPSL = this.calculateATRTPSL(opportunity);
                tpPercent = atrTPSL.tpPercent;
                slPercent = atrTPSL.slPercent;
                break;
                
            case 'auto':
            default:
                // Mode auto (Ichimoku+): Ichimoku + autres indicateurs
                const autoTPSL = this.calculateIchimokuTPSL(opportunity, true);
                tpPercent = autoTPSL.tpPercent;
                slPercent = autoTPSL.slPercent;
                break;
        }

        // Calcule les prix TP/SL selon la direction
        if (isLong) {
            tp = price * (1 + tpPercent / 100);
            sl = price * (1 - slPercent / 100);
        } else {
            tp = price * (1 - tpPercent / 100);
            sl = price * (1 + slPercent / 100);
        }

        return { tp, sl, tpPercent, slPercent };
    }

    /**
     * Calcule TP/SL dynamiques basés sur Ichimoku et autres indicateurs
     * @param {Object} opportunity - L'opportunité de trade
     * @param {boolean} useOtherIndicators - Si true, utilise aussi RSI, ATR, Bollinger pour affiner
     */
    calculateIchimokuTPSL(opportunity, useOtherIndicators = true) {
        const { price, signal, indicators, ichimoku } = opportunity;
        const direction = signal?.direction || 'LONG';
        const isLong = direction === 'LONG';
        const score = signal?.score || 5;

        // Valeurs par défaut (fallback)
        let slPercent = 1.5;
        let tpPercent = 3;

        try {
            // === CALCUL DU STOP LOSS basé sur Ichimoku ===
            if (ichimoku) {
                const tenkan = ichimoku.tenkan || ichimoku.tenkanSen;
                const kijun = ichimoku.kijun || ichimoku.kijunSen;
                const senkouA = ichimoku.senkouA || ichimoku.senkouSpanA;
                const senkouB = ichimoku.senkouB || ichimoku.senkouSpanB;
                
                // Kumo (nuage) = zone entre Senkou A et B
                const kumoTop = Math.max(senkouA || 0, senkouB || 0);
                const kumoBottom = Math.min(senkouA || price, senkouB || price);
                
                if (isLong) {
                    // LONG: SL sous Kijun ou sous le Kumo
                    let slLevel = kijun || kumoBottom;
                    
                    // Si le prix est au-dessus du Kumo, SL = bas du Kumo
                    if (price > kumoTop && kumoBottom > 0) {
                        slLevel = kumoBottom;
                    }
                    // Si le prix est dans le Kumo, SL = Kijun ou Tenkan
                    else if (price <= kumoTop && price >= kumoBottom) {
                        slLevel = Math.min(kijun || price * 0.98, tenkan || price * 0.98);
                    }
                    
                    // Calcule le % de distance
                    if (slLevel && slLevel < price) {
                        slPercent = ((price - slLevel) / price) * 100;
                    }
                } else {
                    // SHORT: SL au-dessus de Kijun ou au-dessus du Kumo
                    let slLevel = kijun || kumoTop;
                    
                    if (price < kumoBottom && kumoTop > 0) {
                        slLevel = kumoTop;
                    } else if (price >= kumoBottom && price <= kumoTop) {
                        slLevel = Math.max(kijun || price * 1.02, tenkan || price * 1.02);
                    }
                    
                    if (slLevel && slLevel > price) {
                        slPercent = ((slLevel - price) / price) * 100;
                    }
                }
            }

            // === AJUSTEMENT basé sur les autres indicateurs (si activé) ===
            if (useOtherIndicators) {
                // RSI: Si RSI extrême, réduit le SL (plus de marge)
                if (indicators?.rsi) {
                    const rsi = indicators.rsi.value || indicators.rsi;
                    if (isLong && rsi < 35) {
                        // RSI survendu = signal fort, on peut serrer le SL
                        slPercent *= 0.85;
                    } else if (!isLong && rsi > 65) {
                        // RSI suracheté = signal fort pour short
                        slPercent *= 0.85;
                    } else if ((isLong && rsi > 60) || (!isLong && rsi < 40)) {
                        // RSI contre nous = élargir le SL
                        slPercent *= 1.2;
                    }
                }

                // Volatilité (ATR si disponible ou Bollinger)
                if (indicators?.atr) {
                    const atrPercent = (indicators.atr / price) * 100;
                    // Si ATR élevé, élargir le SL
                    if (atrPercent > 2) {
                        slPercent = Math.max(slPercent, atrPercent * 0.8);
                    }
                } else if (indicators?.bollinger) {
                    const bb = indicators.bollinger;
                    const bbWidth = ((bb.upper - bb.lower) / bb.middle) * 100;
                    // Bollinger large = volatilité élevée
                    if (bbWidth > 4) {
                        slPercent *= 1.15;
                    }
                }
            }

            // === CALCUL DU TAKE PROFIT ===
            // Basé sur le RRR minimum configuré et le score du signal
            const minRRR = this.config.minRiskRewardRatio || 1.5;
            
            // Score élevé = on peut viser plus haut
            let rrrMultiplier = minRRR;
            if (score >= 7) {
                rrrMultiplier = minRRR * 1.5; // Signal très fort
            } else if (score >= 5) {
                rrrMultiplier = minRRR * 1.2; // Signal fort
            }
            
            tpPercent = slPercent * rrrMultiplier;

            // === LIMITES DE SÉCURITÉ ===
            // SL minimum 0.3%, maximum 5%
            slPercent = Math.max(0.3, Math.min(5, slPercent));
            // TP minimum 0.5%, maximum 15%
            tpPercent = Math.max(0.5, Math.min(15, tpPercent));

        } catch (error) {
            this.log(`Erreur calcul Ichimoku TP/SL: ${error.message}`, 'warning');
            // Fallback sur les presets
            const preset = this.TIMEFRAME_TPSL[opportunity.timeframe] || { tp: 2, sl: 1 };
            slPercent = preset.sl;
            tpPercent = preset.tp;
        }

        return { tpPercent: Math.round(tpPercent * 100) / 100, slPercent: Math.round(slPercent * 100) / 100 };
    }

    /**
     * Calcule TP/SL basés uniquement sur l'ATR (volatilité)
     */
    calculateATRTPSL(opportunity) {
        const { price, signal, indicators } = opportunity;
        const direction = signal?.direction || 'LONG';
        const score = signal?.score || 5;
        const minRRR = this.config.minRiskRewardRatio || 1.5;

        // Valeurs par défaut
        let slPercent = 1.5;
        let tpPercent = 3;

        try {
            // Utilise l'ATR si disponible
            if (indicators?.atr) {
                const atrPercent = (indicators.atr / price) * 100;
                // SL = 1.5x ATR (standard)
                slPercent = atrPercent * 1.5;
            } else if (indicators?.bollinger) {
                // Fallback sur Bollinger si pas d'ATR
                const bb = indicators.bollinger;
                const bbWidth = ((bb.upper - bb.lower) / bb.middle) * 100;
                slPercent = bbWidth / 3; // ~1/3 de la largeur des bandes
            }

            // TP basé sur RRR et score
            let rrrMultiplier = minRRR;
            if (score >= 7) {
                rrrMultiplier = minRRR * 1.5;
            } else if (score >= 5) {
                rrrMultiplier = minRRR * 1.2;
            }
            
            tpPercent = slPercent * rrrMultiplier;

            // Limites de sécurité
            slPercent = Math.max(0.3, Math.min(5, slPercent));
            tpPercent = Math.max(0.5, Math.min(15, tpPercent));

        } catch (error) {
            this.log(`Erreur calcul ATR TP/SL: ${error.message}`, 'warning');
            const preset = this.TIMEFRAME_TPSL[opportunity.timeframe] || { tp: 2, sl: 1 };
            slPercent = preset.sl;
            tpPercent = preset.tp;
        }

        return { tpPercent: Math.round(tpPercent * 100) / 100, slPercent: Math.round(slPercent * 100) / 100 };
    }

    /**
     * Met à jour la configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.timeframes && newConfig.timeframes.length > 0) {
            this.applyTimeframePreset(newConfig.timeframes[0]);
        }

        // Synchronise les paramètres Risk Manager avec le riskManager global
        // Note: En mode multi-utilisateurs, chaque bot devrait avoir son propre riskManager
        // Pour l'instant, on synchronise avec le global pour assurer la compatibilité
        const riskParams = {};
        if (newConfig.riskPerTrade !== undefined) riskParams.riskPerTrade = newConfig.riskPerTrade;
        if (newConfig.maxPositionSize !== undefined) riskParams.maxPositionSize = newConfig.maxPositionSize;
        if (newConfig.dailyLossLimit !== undefined) riskParams.dailyLossLimit = newConfig.dailyLossLimit;
        if (newConfig.maxDrawdown !== undefined) riskParams.maxDrawdown = newConfig.maxDrawdown;
        if (newConfig.maxTradesPerDay !== undefined) riskParams.maxTradesPerDay = newConfig.maxTradesPerDay;
        if (newConfig.maxConsecutiveLosses !== undefined) riskParams.maxConsecutiveLosses = newConfig.maxConsecutiveLosses;
        if (newConfig.minRiskRewardRatio !== undefined) riskParams.minRiskRewardRatio = newConfig.minRiskRewardRatio;
        if (newConfig.defaultTP !== undefined) riskParams.defaultTPPercent = newConfig.defaultTP;
        if (newConfig.defaultSL !== undefined) riskParams.defaultSLPercent = newConfig.defaultSL;

        if (Object.keys(riskParams).length > 0) {
            // Import dynamique pour éviter les dépendances circulaires
            import('./riskManager.js').then(module => {
                module.default.updateConfig(riskParams);
            }).catch(() => {
                // Silencieux si le module n'est pas disponible
            });
        }

        this.log('Configuration mise à jour', 'info');
    }

    /**
     * Retourne le statut du bot
     */
    getStatus() {
        return {
            userId: this.userId,
            isRunning: this.state.isRunning,
            config: this.config,
            analysisCount: this.state.analysisCount,
            lastAnalysis: this.state.lastAnalysis,
            lastSignal: this.state.lastSignal,
            opportunities: this.state.opportunities,
            activePositions: Array.from(this.state.activePositions.entries()),
            wallet: this.activeWallet ? {
                address: this.activeWallet.address,
                name: this.activeWallet.name
            } : null
        };
    }

    /**
     * Retourne les logs
     */
    getLogs(limit = 50) {
        return this.logs.slice(-limit);
    }

    /**
     * Ajoute un log
     */
    log(message, type = 'info') {
        const entry = {
            timestamp: new Date(),
            message,
            type,
            userId: this.userId
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.emit('onLog', entry);
        console.log(`[BOT-${this.userId.toString().substring(0, 8)}] [${type.toUpperCase()}] ${message}`);
    }

    /**
     * Émet un événement
     */
    emit(event, data) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Erreur callback ${event}:`, e);
                }
            });
        }
    }

    /**
     * Enregistre un callback
     */
    on(event, callback) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].push(callback);
        }
    }

    /**
     * Supprime un callback
     */
    off(event, callback) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event] = this.eventCallbacks[event].filter(cb => cb !== callback);
        }
    }

    /**
     * Nettoie l'instance
     */
    destroy() {
        this.stop();
        this.eventCallbacks = {
            onLog: [],
            onSignal: [],
            onTrade: [],
            onAnalysis: []
        };
        this.logs = [];
    }
}

export default UserBotInstance;
