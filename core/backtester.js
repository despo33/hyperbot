/**
 * Module de Backtesting
 * Teste les stratégies sur des données historiques
 */

import priceFetcher from './priceFetcher.js';
import signalDetector from './signalDetector.js';
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
            tpslMode = 'percent',  // 'percent', 'atr', 'ichimoku'
            atrMultiplierSL = 1.5,
            atrMultiplierTP = 2.5,
            customTP = null,       // TP personnalisé en %
            customSL = null        // SL personnalisé en %
        } = config;

        if (this.isRunning) {
            throw new Error('Un backtest est déjà en cours');
        }

        this.isRunning = true;
        this.progress = 0;

        try {
            console.log(`[BACKTEST] Démarrage: ${symbol} ${timeframe}`);
            
            // Récupère les données historiques (max disponible)
            const candles = await this.fetchHistoricalData(symbol, timeframe, 1000);
            
            if (!candles || candles.length < 200) {
                throw new Error(`Données insuffisantes: ${candles?.length || 0} candles (min: 200)`);
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
                        // Calcule le P&L avec le levier
                        // pnlPercent = variation du prix × levier
                        const priceChange = position.direction === 'long'
                            ? (result.exitPrice - position.entryPrice) / position.entryPrice
                            : (position.entryPrice - result.exitPrice) / position.entryPrice;
                        
                        const pnlPercent = priceChange * 100 * leverage;
                        
                        // Taille de la position = capital × risque% / SL%
                        // Cela garantit que si le SL est touché, on perd exactement riskPerTrade% du capital
                        const slPercent = position.slPercent || tpsl.sl;
                        const positionSize = (capital * (riskPerTrade / 100)) / (slPercent / 100);
                        
                        // P&L en $ = taille position × variation prix × levier
                        const pnlAmount = positionSize * priceChange * leverage;
                        
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
                        preset
                    });

                    if (signal.tradeable) {
                        // Ouvre une position
                        const direction = signal.direction;
                        
                        // Calcule TP/SL selon le mode choisi
                        const { stopLoss, takeProfit, slPercent, tpPercent } = this.calculateTPSL(
                            currentPrice,
                            direction,
                            tpslMode,
                            {
                                defaultTP: customTP || tpsl.tp,
                                defaultSL: customSL || tpsl.sl,
                                atrMultiplierSL,
                                atrMultiplierTP,
                                atr: signal.atr,
                                ichimokuLevels: signal.ichimokuLevels
                            }
                        );

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
                const positionSize = (capital * (riskPerTrade / 100)) / (slPercent / 100);
                const pnlAmount = positionSize * priceChange * leverage;
                
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
            preset
        } = config;

        // Analyse avec signalDetector
        const analysis = signalDetector.analyze(candles, {}, timeframe);
        
        if (!analysis || !analysis.ichimokuScore) {
            return { tradeable: false };
        }

        const ichimokuScore = analysis.ichimokuScore.score || 0;
        const absScore = Math.abs(ichimokuScore);
        const direction = ichimokuScore > 0 ? 'long' : ichimokuScore < 0 ? 'short' : null;
        
        if (!direction) {
            return { tradeable: false };
        }

        const currentPrice = candles[candles.length - 1].close;

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

        // Filtre RSI
        if (useRSIFilter) {
            if (direction === 'long' && (rsi > 70 || rsi < 25)) {
                tradeable = false;
            } else if (direction === 'short' && (rsi < 30 || rsi > 75)) {
                tradeable = false;
            }
        }

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
            ichimokuLevels
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
            ichimokuLevels = null
        } = params;

        let stopLoss, takeProfit, slPercent, tpPercent;

        switch (mode) {
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

        return { stopLoss, takeProfit, slPercent, tpPercent };
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
