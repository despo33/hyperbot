/**
 * Module de Backtesting
 * Teste les stratégies sur des données historiques
 */

import priceFetcher from './priceFetcher.js';
import signalDetector from './signalDetector.js';
import smcSignalDetector from './smcSignalDetector.js';
import indicators from './indicators.js';
import ichimoku from './ichimoku.js';
import { TIMEFRAME_TPSL, TIMEFRAME_PRESETS } from './config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Backtester {
    constructor() {
        this.results = [];
        this.isRunning = false;
        this.progress = 0;
        this.storagePath = path.join(__dirname, '../storage/backtests');
        
        // Crée le dossier de stockage si nécessaire
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
    }

    /**
     * Lance un backtest sur une période donnée
     * @param {Object} config - Configuration du backtest
     * @returns {Promise<Object>} Résultats du backtest
     */
    async run(config) {
        const {
            symbol = 'BTC',
            timeframe = '15m',
            startDate = null,      // Date de début (timestamp ou null pour max)
            endDate = null,        // Date de fin (timestamp ou null pour maintenant)
            initialCapital = 1000,
            leverage = 5,
            riskPerTrade = 2,      // % du capital par trade
            useEMA200Filter = true,
            useMACDFilter = true,
            useRSIFilter = true,
            minScore = 5,
            minConfluence = 3,
            minWinProbability = 0.65,
            // ===== MODES TP/SL =====
            tpslMode = 'percent',  // 'percent', 'atr', 'ichimoku', 'fibonacci'
            atrMultiplierSL = 1.5,
            atrMultiplierTP = 2.5,
            customTP = null,       // TP personnalisé en %
            customSL = null,       // SL personnalisé en %
            // ===== FILTRES AVANCÉS ICHIMOKU =====
            useStrictFilters = true,  // Active les filtres ADX, Volume, Bollinger
            useChikouFilter = true,   // Confirmation Chikou Ichimoku
            useSupertrendFilter = true, // Filtre Supertrend (ne trade que dans le sens de la tendance)
            minADX = 20,              // ADX minimum pour confirmer tendance
            maxADX = 50,              // ADX maximum (évite fin de tendance)
            // ===== FILTRES SMC =====
            useVolumeFilter = true,   // Filtre volume pour SMC
            useSessionFilter = true,  // Filtre session London/NY pour SMC
            // ===== RRR MINIMUM =====
            minRRR = 2,               // RRR minimum pour tous les modes
            // ===== STRATÉGIE =====
            strategy = 'ichimoku'     // 'ichimoku' ou 'smc' (Smart Money Concepts)
        } = config;

        if (this.isRunning) {
            throw new Error('Un backtest est déjà en cours');
        }

        this.isRunning = true;
        this.progress = 0;

        try {
            console.log(`[BACKTEST] Démarrage: ${symbol} ${timeframe} - Stratégie: ${strategy.toUpperCase()}`);
            
            // Récupère les données historiques (max disponible)
            let candles = await this.fetchHistoricalData(symbol, timeframe, 1000);
            
            if (!candles || candles.length < 200) {
                throw new Error(`Données insuffisantes: ${candles?.length || 0} candles (min: 200)`);
            }

            // Filtre par dates si spécifiées
            if (startDate || endDate) {
                candles = candles.filter(c => {
                    const candleTime = c.timestamp || c.time;
                    if (startDate && candleTime < startDate) return false;
                    if (endDate && candleTime > endDate) return false;
                    return true;
                });
                
                if (candles.length < 200) {
                    throw new Error(`Données insuffisantes pour la période: ${candles.length} candles (min: 200)`);
                }
            }

            console.log(`[BACKTEST] ${candles.length} candles récupérées`);

            // Configuration du preset
            const preset = TIMEFRAME_PRESETS[timeframe] || TIMEFRAME_PRESETS['15m'];
            const tpsl = TIMEFRAME_TPSL[timeframe] || { tp: 2.0, sl: 1.0 };

            // Variables de simulation
            let capital = initialCapital;
            let position = null;
            const trades = [];
            const equityCurve = [{ timestamp: candles[0].timestamp, equity: capital }];

            // Parcourt les candles (commence à 200 pour avoir assez de données pour les indicateurs)
            for (let i = 200; i < candles.length; i++) {
                this.progress = Math.round((i / candles.length) * 100);
                
                const currentCandle = candles[i];
                const historicalCandles = candles.slice(0, i + 1);
                const currentPrice = currentCandle.close;

                // Si on a une position ouverte, vérifie TP/SL
                if (position) {
                    const result = this.checkPositionExit(position, currentCandle);
                    
                    if (result.closed) {
                        // Calcule le P&L
                        // priceChange = variation du prix en décimal
                        const priceChange = position.direction === 'long'
                            ? (result.exitPrice - position.entryPrice) / position.entryPrice
                            : (position.entryPrice - result.exitPrice) / position.entryPrice;
                        
                        // pnlPercent = variation du prix × levier (pour affichage)
                        const pnlPercent = priceChange * 100 * leverage;
                        
                        // Calcul du P&L basé sur le risque par trade
                        // riskAmount = montant risqué par trade (ex: 2% de 1000$ = 20$)
                        // Si SL touché, on perd exactement riskAmount
                        // Si TP touché, on gagne riskAmount × RRR (ratio TP/SL)
                        const slPercent = position.slPercent || tpsl.sl;
                        const riskAmount = capital * (riskPerTrade / 100);
                        
                        // P&L = riskAmount × (variation réelle / SL prévu)
                        // Exemple: SL = 1.5%, variation = -1.5% → P&L = -riskAmount
                        // Exemple: SL = 1.5%, variation = +3% → P&L = +2 × riskAmount
                        const pnlAmount = riskAmount * (priceChange * 100 / slPercent);
                        
                        capital += pnlAmount;
                        
                        trades.push({
                            symbol,
                            direction: position.direction,
                            entryPrice: position.entryPrice,
                            exitPrice: result.exitPrice,
                            entryTime: position.entryTime,
                            exitTime: currentCandle.timestamp,
                            exitReason: result.reason,
                            pnlPercent: pnlPercent.toFixed(2),
                            pnlAmount: pnlAmount.toFixed(2),
                            capital: capital.toFixed(2)
                        });
                        
                        position = null;
                    }
                }

                // Si pas de position, cherche un signal
                if (!position) {
                    const signal = await this.analyzeCandles(historicalCandles, timeframe, {
                        useEMA200Filter,
                        useMACDFilter,
                        useRSIFilter,
                        minScore,
                        minConfluence,
                        minWinProbability,
                        preset,
                        useStrictFilters,
                        useChikouFilter,
                        useSupertrendFilter,
                        minADX,
                        maxADX,
                        // Filtres SMC
                        useVolumeFilter,
                        useSessionFilter,
                        strategy
                    });

                    if (signal.tradeable) {
                        // Ouvre une position
                        const direction = signal.direction;
                        
                        // Calcule TP/SL selon le mode choisi
                        // Pour SMC, utilise les niveaux suggérés par la stratégie si disponibles
                        let tpslResult;
                        if (signal.strategy === 'smc' && signal.smcLevels && signal.smcLevels.stopLoss) {
                            // Utilise les niveaux SMC (basés sur la structure du marché)
                            tpslResult = {
                                stopLoss: signal.smcLevels.stopLoss,
                                takeProfit: signal.smcLevels.takeProfit,
                                slPercent: signal.smcLevels.slPercent,
                                tpPercent: signal.smcLevels.tpPercent,
                                actualRRR: signal.smcLevels.tpPercent / signal.smcLevels.slPercent
                            };
                            
                            // Vérifie le RRR minimum
                            if (tpslResult.actualRRR < minRRR) {
                                tpslResult = { rejected: true, reason: `RRR SMC insuffisant (${tpslResult.actualRRR.toFixed(2)})` };
                            }
                        } else {
                            // Utilise le calcul standard pour Ichimoku
                            tpslResult = this.calculateTPSL(
                                currentPrice,
                                direction,
                                tpslMode,
                                {
                                    defaultTP: customTP || tpsl.tp,
                                    defaultSL: customSL || tpsl.sl,
                                    atrMultiplierSL,
                                    atrMultiplierTP,
                                    atr: signal.atr,
                                    ichimokuLevels: signal.ichimokuLevels,
                                    fibonacciData: signal.fibonacciData,
                                    minRRR: minRRR
                                }
                            );
                        }
                        
                        // Vérifie si le RRR est suffisant (surtout pour mode Ichimoku)
                        if (!tpslResult || tpslResult.rejected) {
                            continue; // Skip ce trade si RRR insuffisant
                        }
                        
                        const { stopLoss, takeProfit, slPercent, tpPercent } = tpslResult;

                        position = {
                            direction,
                            entryPrice: currentPrice,
                            stopLoss,
                            takeProfit,
                            slPercent,
                            tpPercent,
                            tpslMode,
                            entryTime: currentCandle.timestamp,
                            score: signal.score,
                            confluence: signal.confluence
                        };
                    }
                }

                // Enregistre l'équité
                equityCurve.push({
                    timestamp: currentCandle.timestamp,
                    equity: capital
                });
            }

            // Ferme la position restante si elle existe
            if (position) {
                const lastCandle = candles[candles.length - 1];
                
                // Même calcul que pour les trades normaux
                const priceChange = position.direction === 'long'
                    ? (lastCandle.close - position.entryPrice) / position.entryPrice
                    : (position.entryPrice - lastCandle.close) / position.entryPrice;
                
                const pnlPercent = priceChange * 100 * leverage;
                const slPercent = position.slPercent || tpsl.sl;
                const riskAmount = capital * (riskPerTrade / 100);
                const pnlAmount = riskAmount * (priceChange * 100 / slPercent);
                
                capital += pnlAmount;
                
                trades.push({
                    symbol,
                    direction: position.direction,
                    entryPrice: position.entryPrice,
                    exitPrice: lastCandle.close,
                    entryTime: position.entryTime,
                    exitTime: lastCandle.timestamp,
                    exitReason: 'end_of_data',
                    pnlPercent: pnlPercent.toFixed(2),
                    pnlAmount: pnlAmount.toFixed(2),
                    capital: capital.toFixed(2)
                });
            }

            // Calcule les statistiques
            const stats = this.calculateStats(trades, initialCapital, capital, equityCurve);

            const result = {
                config: {
                    symbol,
                    timeframe,
                    initialCapital,
                    leverage,
                    riskPerTrade,
                    useEMA200Filter,
                    useMACDFilter,
                    useRSIFilter,
                    minScore,
                    minConfluence,
                    minWinProbability,
                    tpsl
                },
                period: {
                    start: new Date(candles[200].timestamp).toISOString(),
                    end: new Date(candles[candles.length - 1].timestamp).toISOString(),
                    candlesAnalyzed: candles.length - 200
                },
                stats,
                trades,
                equityCurve: this.sampleEquityCurve(equityCurve, 100) // Échantillonne pour réduire la taille
            };

            // Sauvegarde le résultat
            this.saveResult(result);

            console.log(`[BACKTEST] Terminé: ${trades.length} trades, Win Rate: ${stats.winRate}%`);
            
            return result;

        } finally {
            this.isRunning = false;
            this.progress = 100;
        }
    }

    /**
     * Récupère les données historiques
     */
    async fetchHistoricalData(symbol, timeframe, limit = 1000) {
        try {
            // Utilise le priceFetcher existant
            const candles = await priceFetcher.getCandles(symbol, timeframe, limit);
            return candles;
        } catch (error) {
            console.error(`[BACKTEST] Erreur récupération données: ${error.message}`);
            throw error;
        }
    }

    /**
     * Analyse les candles et retourne un signal
     */
    async analyzeCandles(candles, timeframe, config) {
        const {
            useEMA200Filter,
            useMACDFilter,
            useRSIFilter,
            minScore,
            minConfluence,
            minWinProbability,
            preset,
            useStrictFilters = true,
            useChikouFilter = true,
            useSupertrendFilter = true,
            minADX = 20,
            maxADX = 50,
            // Filtres SMC
            useVolumeFilter = true,
            useSessionFilter = true,
            strategy = 'ichimoku'
        } = config;

        const currentPrice = candles[candles.length - 1].close;

        // ===== STRATÉGIE SMC (Smart Money Concepts) =====
        if (strategy === 'smc') {
            const smcAnalysis = smcSignalDetector.analyze(candles, {
                minScore,
                minConfluence,
                useRSIFilter,
                useMACDFilter,
                useVolumeFilter,
                useSessionFilter
            }, timeframe);

            if (!smcAnalysis || !smcAnalysis.tradeable) {
                return { tradeable: false, strategy: 'smc' };
            }

            return {
                tradeable: true,
                strategy: 'smc',
                direction: smcAnalysis.signal.direction,
                score: smcAnalysis.smcScore.absScore,
                confluence: smcAnalysis.confluence,
                winProbability: smcAnalysis.winProbability,
                atr: smcAnalysis.indicators?.atr?.value,
                // Niveaux SMC pour TP/SL
                smcLevels: {
                    stopLoss: smcAnalysis.suggestedSL,
                    takeProfit: smcAnalysis.suggestedTP,
                    slPercent: smcAnalysis.suggestedSLPercent,
                    tpPercent: smcAnalysis.suggestedTPPercent
                },
                smcData: smcAnalysis.smcData
            };
        }

        // ===== STRATÉGIE BOLLINGER SQUEEZE =====
        if (strategy === 'bollinger') {
            const bbAnalysis = signalDetector.analyzeBollingerSqueeze(candles, timeframe, config.bollingerConfig || {});

            if (!bbAnalysis || !bbAnalysis.success || !bbAnalysis.signal) {
                return { tradeable: false, strategy: 'bollinger' };
            }

            const signal = bbAnalysis.signal;
            const direction = signal.action === 'BUY' ? 'long' : 'short';
            const absScore = Math.abs(signal.score);

            // Filtres
            let tradeable = true;

            // Filtre Score
            if (absScore < minScore) {
                tradeable = false;
            }

            // Filtre RSI
            if (useRSIFilter && !signal.rsiConfirms) {
                tradeable = false;
            }

            // Filtre Volume
            if (useVolumeFilter && !signal.volumeConfirms) {
                tradeable = false;
            }

            // Calcul de la confluence
            let confluence = 0;
            if (signal.rsiConfirms) confluence++;
            if (signal.volumeConfirms) confluence++;
            if (bbAnalysis.momentum.increasing) confluence++;
            if (bbAnalysis.squeeze.squeezeRelease) confluence++;

            if (confluence < minConfluence) {
                tradeable = false;
            }

            return {
                tradeable,
                strategy: 'bollinger',
                direction,
                score: absScore,
                confluence,
                winProbability: bbAnalysis.winProbability,
                atr: null, // Sera calculé séparément si nécessaire
                bollingerData: {
                    squeeze: bbAnalysis.squeeze,
                    momentum: bbAnalysis.momentum,
                    levels: bbAnalysis.levels
                }
            };
        }

        // ===== STRATÉGIE ICHIMOKU (par défaut) =====
        const analysis = signalDetector.analyze(candles, {}, timeframe);
        
        if (!analysis || !analysis.ichimokuScore) {
            return { tradeable: false, strategy: 'ichimoku' };
        }

        const ichimokuScore = analysis.ichimokuScore.score || 0;
        const absScore = Math.abs(ichimokuScore);
        const direction = ichimokuScore > 0 ? 'long' : ichimokuScore < 0 ? 'short' : null;
        
        if (!direction) {
            return { tradeable: false, strategy: 'ichimoku' };
        }

        // Indicateurs
        const rsi = analysis.indicators?.rsi?.value || 50;
        const macd = analysis.indicators?.macd || {};
        const ema200 = analysis.indicators?.ema200;

        // Confluence
        let confluence = 0;
        if (analysis.indicators?.rsi?.signal) confluence++;
        if (analysis.indicators?.macd?.signal) confluence++;
        if (analysis.indicators?.adx?.trending) confluence++;
        if (analysis.indicators?.vwap?.signal) confluence++;
        if (analysis.indicators?.cvd?.signal) confluence++;

        // Filtres
        let tradeable = true;

        // Filtre Score
        if (absScore < minScore) {
            tradeable = false;
        }

        // Filtre Confluence
        if (confluence < minConfluence) {
            tradeable = false;
        }

        // Filtre EMA200
        if (useEMA200Filter && ema200 && ema200.value) {
            const priceAboveEMA = currentPrice > ema200.value;
            const priceBelowEMA = currentPrice < ema200.value;
            const emaDistance = Math.abs((currentPrice - ema200.value) / ema200.value * 100);

            if (direction === 'long' && priceBelowEMA && emaDistance > 1.0) {
                tradeable = false;
            } else if (direction === 'short' && priceAboveEMA && emaDistance > 1.0) {
                tradeable = false;
            }
        }

        // Filtre MACD
        if (useMACDFilter && macd && macd.histogram !== undefined) {
            if (direction === 'long' && macd.histogram < -0.5) {
                tradeable = false;
            } else if (direction === 'short' && macd.histogram > 0.5) {
                tradeable = false;
            }
        }

        // Filtre RSI - AMÉLIORÉ: cherche les zones de retournement
        if (useRSIFilter) {
            if (direction === 'long') {
                // LONG: RSI doit être entre 35-65 (pas en surachat, pas en survente extrême)
                if (rsi > 65 || rsi < 30) {
                    tradeable = false;
                }
            } else if (direction === 'short') {
                // SHORT: RSI doit être entre 35-65
                if (rsi < 35 || rsi > 70) {
                    tradeable = false;
                }
            }
        }

        // ===== NOUVEAUX FILTRES POUR AMÉLIORER LE WIN RATE =====
        
        // 1. Filtre ADX - Ne trade que si tendance présente (si activé)
        const adx = analysis.indicators?.adx;
        if (useStrictFilters && adx && adx.value) {
            // ADX < minADX = pas de tendance, éviter
            if (adx.value < minADX) {
                tradeable = false;
            }
            // ADX > maxADX = tendance très forte, potentiellement fin de mouvement
            if (adx.value > maxADX) {
                tradeable = false;
            }
        }
        
        // 2. Filtre Volume - Ne trade que si volume suffisant (si activé)
        const volume = analysis.indicators?.volume;
        if (useStrictFilters && volume && volume.ratio) {
            // Volume doit être au moins 80% de la moyenne
            if (volume.ratio < 0.8) {
                tradeable = false;
            }
        }
        
        // 3. Filtre Bollinger - Évite les entrées en zone extrême (si activé)
        const bollinger = analysis.indicators?.bollinger;
        if (useStrictFilters && bollinger && bollinger.position !== undefined) {
            // Position: 0 = bande basse, 0.5 = milieu, 1 = bande haute
            if (direction === 'long' && bollinger.position > 0.85) {
                // Trop proche de la bande haute pour un LONG
                tradeable = false;
            } else if (direction === 'short' && bollinger.position < 0.15) {
                // Trop proche de la bande basse pour un SHORT
                tradeable = false;
            }
        }
        
        // 4. Confirmation Chikou (Ichimoku) - Signal plus fiable (si activé)
        const chikouConfirmed = analysis.chikouConfirmation?.confirmed || false;
        const chikouDirection = analysis.chikouConfirmation?.direction;
        if (useChikouFilter && chikouConfirmed && chikouDirection) {
            // Chikou doit confirmer la direction
            if ((direction === 'long' && chikouDirection !== 'bullish') ||
                (direction === 'short' && chikouDirection !== 'bearish')) {
                tradeable = false;
            }
        }
        
        // 5. Filtre de momentum - MACD doit être dans la bonne direction ET en accélération
        if (useMACDFilter && macd) {
            const macdLine = macd.macd || 0;
            const signalLine = macd.signal || 0;
            
            if (direction === 'long') {
                // Pour LONG: MACD doit être au-dessus du signal OU en train de croiser
                if (macdLine < signalLine - 0.1) {
                    tradeable = false;
                }
            } else {
                // Pour SHORT: MACD doit être en-dessous du signal
                if (macdLine > signalLine + 0.1) {
                    tradeable = false;
                }
            }
        }

        // ===== 6. FILTRE SUPERTREND - Ne trade que dans le sens de la tendance =====
        const supertrend = analysis.indicators?.supertrend;
        if (useSupertrendFilter && supertrend && supertrend.direction !== 'neutral') {
            // LONG uniquement si Supertrend est bullish
            if (direction === 'long' && supertrend.direction !== 'bullish') {
                tradeable = false;
            }
            // SHORT uniquement si Supertrend est bearish
            if (direction === 'short' && supertrend.direction !== 'bearish') {
                tradeable = false;
            }
        }

        // ===== 7. Calcul Fibonacci pour TP/SL dynamiques =====
        const fibonacciData = analysis.indicators?.fibonacci || indicators.calculateFibonacci(candles, 50);

        // Récupère l'ATR et les niveaux Ichimoku pour les modes TP/SL
        const atr = analysis.indicators?.atr?.atr || 0;
        const ichimokuLevels = analysis.levels || null;

        return {
            tradeable,
            direction,
            score: ichimokuScore,
            confluence,
            rsi,
            macd: macd.histogram,
            atr,
            ichimokuLevels,
            fibonacciData,
            supertrend,
            adxValue: adx?.value,
            volumeRatio: volume?.ratio
        };
    }

    /**
     * Calcule les niveaux TP/SL selon le mode choisi
     * @param {number} price - Prix d'entrée
     * @param {string} direction - 'long' ou 'short'
     * @param {string} mode - 'percent', 'atr', 'ichimoku'
     * @param {Object} params - Paramètres supplémentaires
     * @returns {Object} { stopLoss, takeProfit, slPercent, tpPercent }
     */
    calculateTPSL(price, direction, mode, params) {
        const {
            defaultTP = 2.0,
            defaultSL = 1.0,
            atrMultiplierSL = 1.5,
            atrMultiplierTP = 2.5,
            atr = 0,
            ichimokuLevels = null,
            fibonacciData = null,
            minRRR = 2
        } = params;

        let stopLoss, takeProfit, slPercent, tpPercent;

        switch (mode) {
            case 'fibonacci':
                // Mode Fibonacci: TP/SL basés sur les niveaux de retracement
                if (fibonacciData && fibonacciData.levels) {
                    const levels = fibonacciData.levels;
                    
                    if (direction === 'long') {
                        // LONG: SL sous le support Fibonacci, TP vers la résistance
                        if (fibonacciData.nearestSupport) {
                            stopLoss = fibonacciData.nearestSupport.price * 0.998;
                        } else {
                            stopLoss = price * (1 - defaultSL / 100);
                        }
                        
                        // TP au niveau 0% (sommet) ou extension
                        if (fibonacciData.isUptrend) {
                            takeProfit = levels['0']; // Retour au sommet
                        } else {
                            takeProfit = levels['100']; // Extension vers le haut
                        }
                        
                        // Si le TP est trop proche, utilise l'extension 161.8%
                        if (takeProfit && (takeProfit - price) / price < 0.01) {
                            const range = fibonacciData.swingHigh - fibonacciData.swingLow;
                            takeProfit = fibonacciData.swingHigh + range * 0.618;
                        }
                    } else {
                        // SHORT: SL au-dessus de la résistance Fibonacci, TP vers le support
                        if (fibonacciData.nearestResistance) {
                            stopLoss = fibonacciData.nearestResistance.price * 1.002;
                        } else {
                            stopLoss = price * (1 + defaultSL / 100);
                        }
                        
                        // TP au niveau 100% (creux) ou extension
                        if (fibonacciData.isUptrend) {
                            takeProfit = levels['100']; // Vers le creux
                        } else {
                            takeProfit = levels['0']; // Retour au creux
                        }
                        
                        // Si le TP est trop proche, utilise l'extension
                        if (takeProfit && (price - takeProfit) / price < 0.01) {
                            const range = fibonacciData.swingHigh - fibonacciData.swingLow;
                            takeProfit = fibonacciData.swingLow - range * 0.618;
                        }
                    }
                    
                    slPercent = Math.abs((stopLoss - price) / price) * 100;
                    tpPercent = Math.abs((takeProfit - price) / price) * 100;
                } else {
                    // Fallback sur pourcentage si Fibonacci non disponible
                    return this.calculateTPSL(price, direction, 'percent', params);
                }
                break;

            case 'atr':
                // Mode ATR: SL/TP basés sur la volatilité
                if (atr > 0) {
                    const slDistance = atr * atrMultiplierSL;
                    const tpDistance = atr * atrMultiplierTP;
                    
                    if (direction === 'long') {
                        stopLoss = price - slDistance;
                        takeProfit = price + tpDistance;
                    } else {
                        stopLoss = price + slDistance;
                        takeProfit = price - tpDistance;
                    }
                    
                    slPercent = (slDistance / price) * 100;
                    tpPercent = (tpDistance / price) * 100;
                } else {
                    // Fallback sur pourcentage si ATR non disponible
                    return this.calculateTPSL(price, direction, 'percent', params);
                }
                break;

            case 'ichimoku':
                // Mode Ichimoku: utilise les niveaux techniques
                if (ichimokuLevels && ichimokuLevels.supports && ichimokuLevels.resistances) {
                    const supports = ichimokuLevels.supports || [];
                    const resistances = ichimokuLevels.resistances || [];
                    
                    if (direction === 'long') {
                        // SL sous le support le plus proche, TP à la résistance
                        const nearestSupport = supports.find(s => s.level < price);
                        const nearestResistance = resistances.find(r => r.level > price);
                        
                        stopLoss = nearestSupport ? nearestSupport.level * 0.998 : price * (1 - defaultSL / 100);
                        takeProfit = nearestResistance ? nearestResistance.level * 0.998 : price * (1 + defaultTP / 100);
                    } else {
                        // Short: SL au-dessus de la résistance, TP au support
                        const nearestResistance = resistances.find(r => r.level > price);
                        const nearestSupport = supports.find(s => s.level < price);
                        
                        stopLoss = nearestResistance ? nearestResistance.level * 1.002 : price * (1 + defaultSL / 100);
                        takeProfit = nearestSupport ? nearestSupport.level * 1.002 : price * (1 - defaultTP / 100);
                    }
                    
                    slPercent = Math.abs((stopLoss - price) / price) * 100;
                    tpPercent = Math.abs((takeProfit - price) / price) * 100;
                } else {
                    // Fallback sur pourcentage si niveaux non disponibles
                    return this.calculateTPSL(price, direction, 'percent', params);
                }
                break;

            case 'percent':
            default:
                // Mode pourcentage fixe
                slPercent = defaultSL;
                tpPercent = defaultTP;
                
                if (direction === 'long') {
                    stopLoss = price * (1 - defaultSL / 100);
                    takeProfit = price * (1 + defaultTP / 100);
                } else {
                    stopLoss = price * (1 + defaultSL / 100);
                    takeProfit = price * (1 - defaultTP / 100);
                }
                break;
        }

        // Vérifie le RRR minimum pour TOUS les modes
        const actualRRR = tpPercent / slPercent;
        if (minRRR > 1 && actualRRR < minRRR) {
            return { rejected: true, reason: `RRR ${actualRRR.toFixed(2)} < ${minRRR}` };
        }

        return { stopLoss, takeProfit, slPercent, tpPercent, actualRRR };
    }

    /**
     * Vérifie si la position doit être fermée (TP/SL)
     */
    checkPositionExit(position, candle) {
        const { direction, stopLoss, takeProfit } = position;
        const high = candle.high;
        const low = candle.low;

        if (direction === 'long') {
            // Vérifie SL d'abord (priorité)
            if (low <= stopLoss) {
                return { closed: true, exitPrice: stopLoss, reason: 'sl_hit' };
            }
            // Vérifie TP
            if (high >= takeProfit) {
                return { closed: true, exitPrice: takeProfit, reason: 'tp_hit' };
            }
        } else {
            // Short
            if (high >= stopLoss) {
                return { closed: true, exitPrice: stopLoss, reason: 'sl_hit' };
            }
            if (low <= takeProfit) {
                return { closed: true, exitPrice: takeProfit, reason: 'tp_hit' };
            }
        }

        return { closed: false };
    }

    /**
     * Calcule les statistiques du backtest
     */
    calculateStats(trades, initialCapital, finalCapital, equityCurve) {
        if (trades.length === 0) {
            return {
                totalTrades: 0,
                winRate: 0,
                profitFactor: 0,
                totalReturn: 0,
                maxDrawdown: 0
            };
        }

        const wins = trades.filter(t => parseFloat(t.pnlAmount) > 0);
        const losses = trades.filter(t => parseFloat(t.pnlAmount) < 0);

        const totalWins = wins.reduce((sum, t) => sum + parseFloat(t.pnlAmount), 0);
        const totalLosses = Math.abs(losses.reduce((sum, t) => sum + parseFloat(t.pnlAmount), 0));

        // Calcul du drawdown maximum
        let maxEquity = initialCapital;
        let maxDrawdown = 0;
        for (const point of equityCurve) {
            if (point.equity > maxEquity) {
                maxEquity = point.equity;
            }
            const drawdown = ((maxEquity - point.equity) / maxEquity) * 100;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }

        // Calcul des trades par direction
        const longs = trades.filter(t => t.direction === 'long');
        const shorts = trades.filter(t => t.direction === 'short');
        const longWins = longs.filter(t => parseFloat(t.pnlAmount) > 0);
        const shortWins = shorts.filter(t => parseFloat(t.pnlAmount) > 0);

        return {
            totalTrades: trades.length,
            wins: wins.length,
            losses: losses.length,
            winRate: ((wins.length / trades.length) * 100).toFixed(1),
            profitFactor: totalLosses > 0 ? (totalWins / totalLosses).toFixed(2) : 'N/A',
            totalReturn: (((finalCapital - initialCapital) / initialCapital) * 100).toFixed(2),
            totalPnL: (finalCapital - initialCapital).toFixed(2),
            maxDrawdown: maxDrawdown.toFixed(2),
            avgWin: wins.length > 0 ? (totalWins / wins.length).toFixed(2) : 0,
            avgLoss: losses.length > 0 ? (totalLosses / losses.length).toFixed(2) : 0,
            // Stats par direction
            longTrades: longs.length,
            longWinRate: longs.length > 0 ? ((longWins.length / longs.length) * 100).toFixed(1) : 0,
            shortTrades: shorts.length,
            shortWinRate: shorts.length > 0 ? ((shortWins.length / shorts.length) * 100).toFixed(1) : 0,
            // Séries
            maxConsecutiveWins: this.getMaxConsecutive(trades, true),
            maxConsecutiveLosses: this.getMaxConsecutive(trades, false)
        };
    }

    /**
     * Calcule le nombre max de trades consécutifs (gagnants ou perdants)
     */
    getMaxConsecutive(trades, isWin) {
        let max = 0;
        let current = 0;
        
        for (const trade of trades) {
            const isWinTrade = parseFloat(trade.pnlAmount) > 0;
            if (isWinTrade === isWin) {
                current++;
                if (current > max) max = current;
            } else {
                current = 0;
            }
        }
        
        return max;
    }

    /**
     * Échantillonne la courbe d'équité pour réduire la taille
     */
    sampleEquityCurve(curve, maxPoints) {
        if (curve.length <= maxPoints) return curve;
        
        const step = Math.ceil(curve.length / maxPoints);
        const sampled = [];
        
        for (let i = 0; i < curve.length; i += step) {
            sampled.push(curve[i]);
        }
        
        // Ajoute toujours le dernier point
        if (sampled[sampled.length - 1] !== curve[curve.length - 1]) {
            sampled.push(curve[curve.length - 1]);
        }
        
        return sampled;
    }

    /**
     * Sauvegarde le résultat du backtest
     */
    saveResult(result) {
        const filename = `backtest_${result.config.symbol}_${result.config.timeframe}_${Date.now()}.json`;
        const filepath = path.join(this.storagePath, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
        console.log(`[BACKTEST] Résultat sauvegardé: ${filename}`);
        
        return filename;
    }

    /**
     * Liste les backtests sauvegardés
     */
    listSavedBacktests() {
        try {
            const files = fs.readdirSync(this.storagePath)
                .filter(f => f.endsWith('.json'))
                .map(f => {
                    const filepath = path.join(this.storagePath, f);
                    const stats = fs.statSync(filepath);
                    return {
                        filename: f,
                        size: stats.size,
                        createdAt: stats.mtime
                    };
                })
                .sort((a, b) => b.createdAt - a.createdAt);
            
            return files;
        } catch (e) {
            return [];
        }
    }

    /**
     * Charge un backtest sauvegardé
     */
    loadBacktest(filename) {
        const filepath = path.join(this.storagePath, filename);
        if (!fs.existsSync(filepath)) {
            throw new Error('Backtest non trouvé');
        }
        
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }

    /**
     * Retourne le statut actuel
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            progress: this.progress
        };
    }
}

export default new Backtester();
