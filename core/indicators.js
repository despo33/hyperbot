/**
 * Module d'Indicateurs Techniques Avancés
 * RSI, MACD, Bollinger Bands, Volume Analysis, EMA200, Stochastic RSI, OBV
 * Optimisé pour le trading crypto 24/7
 * 
 * CONFIGURATIONS OPTIMISÉES POUR CRYPTO:
 * - Marchés 24/7 (pas de gaps overnight)
 * - Haute volatilité
 * - Mouvements rapides
 */

class TechnicalIndicators {
    constructor() {
        // Configuration par défaut (1h timeframe)
        this.config = {
            rsi: {
                period: 14,
                overbought: 70,
                oversold: 30
            },
            stochRsi: {
                rsiPeriod: 14,
                stochPeriod: 14,
                kPeriod: 3,
                dPeriod: 3,
                overbought: 80,
                oversold: 20
            },
            macd: {
                // Réglages crypto optimisés (plus rapides que 12/26/9 standard)
                fastPeriod: 8,
                slowPeriod: 17,
                signalPeriod: 9
            },
            bollinger: {
                period: 20,
                stdDev: 2
            },
            volume: {
                maPeriod: 20,
                spikeMultiplier: 1.5
            },
            ema: {
                fast: 50,
                slow: 200
            }
        };

        // Configurations par timeframe pour crypto - OPTIMISÉES SCALPING
        // Crypto = haute volatilité, 24/7, mouvements rapides
        this.timeframeConfigs = {
            '1m': {
                // RSI court pour réactivité, seuils élargis pour éviter faux signaux
                rsi: { period: 5, overbought: 80, oversold: 20 },
                // StochRSI ultra-rapide pour scalping
                stochRsi: { rsiPeriod: 5, stochPeriod: 5, kPeriod: 2, dPeriod: 2, overbought: 85, oversold: 15 },
                // MACD rapide pour détecter les retournements
                macd: { fastPeriod: 3, slowPeriod: 10, signalPeriod: 3 },
                // Bollinger serré pour scalping
                bollinger: { period: 10, stdDev: 1.8 },
                // Volume spike plus sensible
                volume: { maPeriod: 8, spikeMultiplier: 1.5 },
                // EMA courtes pour tendance immédiate
                ema: { fast: 9, slow: 21 },
                // ADX adapté scalping
                adx: { period: 7, trendThreshold: 15 }
            },
            '5m': {
                // RSI équilibré pour 5m
                rsi: { period: 7, overbought: 75, oversold: 25 },
                stochRsi: { rsiPeriod: 7, stochPeriod: 7, kPeriod: 3, dPeriod: 3, overbought: 82, oversold: 18 },
                // MACD optimisé crypto 5m
                macd: { fastPeriod: 5, slowPeriod: 12, signalPeriod: 4 },
                bollinger: { period: 12, stdDev: 2 },
                volume: { maPeriod: 12, spikeMultiplier: 1.6 },
                // EMA pour tendance court terme
                ema: { fast: 12, slow: 26 },
                adx: { period: 10, trendThreshold: 18 }
            },
            '15m': {
                rsi: { period: 9, overbought: 72, oversold: 28 },
                stochRsi: { rsiPeriod: 9, stochPeriod: 9, kPeriod: 3, dPeriod: 3, overbought: 80, oversold: 20 },
                macd: { fastPeriod: 6, slowPeriod: 14, signalPeriod: 5 },
                bollinger: { period: 15, stdDev: 2 },
                volume: { maPeriod: 15, spikeMultiplier: 1.5 },
                ema: { fast: 21, slow: 55 },
                adx: { period: 12, trendThreshold: 20 }
            },
            '1h': {
                rsi: { period: 14, overbought: 70, oversold: 30 },
                stochRsi: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3, overbought: 80, oversold: 20 },
                macd: { fastPeriod: 8, slowPeriod: 17, signalPeriod: 9 },
                bollinger: { period: 20, stdDev: 2 },
                volume: { maPeriod: 20, spikeMultiplier: 1.5 },
                ema: { fast: 50, slow: 200 }
            },
            '4h': {
                rsi: { period: 14, overbought: 68, oversold: 32 },
                stochRsi: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3, overbought: 78, oversold: 22 },
                macd: { fastPeriod: 10, slowPeriod: 21, signalPeriod: 9 },
                bollinger: { period: 20, stdDev: 2.2 },
                volume: { maPeriod: 20, spikeMultiplier: 1.4 },
                ema: { fast: 50, slow: 200 }
            },
            '1d': {
                rsi: { period: 14, overbought: 65, oversold: 35 },
                stochRsi: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3, overbought: 75, oversold: 25 },
                macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
                bollinger: { period: 20, stdDev: 2.5 },
                volume: { maPeriod: 20, spikeMultiplier: 1.3 },
                ema: { fast: 50, slow: 200 }
            }
        };
    }

    /**
     * Applique la configuration pour un timeframe spécifique
     * @param {string} timeframe 
     */
    setTimeframe(timeframe) {
        const tfConfig = this.timeframeConfigs[timeframe];
        if (tfConfig) {
            this.config = { ...this.config, ...tfConfig };
            // Log supprimé car trop verbeux (appelé pour chaque crypto x timeframe)
        }
    }

    /**
     * Retourne la configuration actuelle
     * @returns {Object}
     */
    getConfig() {
        return this.config;
    }

    /**
     * Retourne les réglages Ichimoku optimisés selon le timeframe
     * @param {string} timeframe - '1m', '5m', '15m', '1h', '4h', '1d'
     * @returns {Object} Paramètres Ichimoku optimisés
     */
    getIchimokuSettings(timeframe) {
        const settings = {
            // Scalping (1m-5m) - Signaux très rapides, réduit pour crypto volatile
            '1m': { tenkan: 6, kijun: 13, senkou: 26, displacement: 13 },
            '5m': { tenkan: 6, kijun: 13, senkou: 26, displacement: 13 },
            // Day Trading (15m) - Équilibré rapide
            '15m': { tenkan: 9, kijun: 26, senkou: 52, displacement: 26 },
            // Intraday (1h) - Crypto optimisé 24/7 (ajusté pour marché continu)
            '1h': { tenkan: 10, kijun: 30, senkou: 60, displacement: 30 },
            // Swing (4h) - Moins de faux signaux, doublé pour filtrer le bruit
            '4h': { tenkan: 20, kijun: 60, senkou: 120, displacement: 30 },
            // Position (1d) - Long terme, réglages classiques
            '1d': { tenkan: 9, kijun: 26, senkou: 52, displacement: 26 }
        };
        
        return settings[timeframe] || settings['1h'];
    }

    /**
     * Calcule le RSI (Relative Strength Index)
     * @param {Array} closes - Prix de clôture
     * @param {number} period - Période (défaut: 14)
     * @returns {Object} RSI value et signal
     */
    calculateRSI(closes, period = this.config.rsi.period) {
        if (closes.length < period + 1) {
            return { value: 50, signal: 'neutral', strength: 0 };
        }

        let gains = 0;
        let losses = 0;

        // Calcul initial
        for (let i = 1; i <= period; i++) {
            const change = closes[i] - closes[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // Calcul avec lissage exponentiel
        for (let i = period + 1; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            if (change > 0) {
                avgGain = (avgGain * (period - 1) + change) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            } else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
            }
        }

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));

        // Déterminer le signal
        let signal = 'neutral';
        let strength = 0;

        if (rsi >= this.config.rsi.overbought) {
            signal = 'overbought';
            strength = (rsi - this.config.rsi.overbought) / (100 - this.config.rsi.overbought);
        } else if (rsi <= this.config.rsi.oversold) {
            signal = 'oversold';
            strength = (this.config.rsi.oversold - rsi) / this.config.rsi.oversold;
        } else if (rsi > 50) {
            signal = 'bullish';
            strength = (rsi - 50) / 20;
        } else {
            signal = 'bearish';
            strength = (50 - rsi) / 20;
        }

        return {
            value: parseFloat(rsi.toFixed(2)),
            signal,
            strength: Math.min(1, strength)
        };
    }

    /**
     * Calcule l'EMA (Exponential Moving Average)
     * @param {Array} data - Données
     * @param {number} period - Période
     * @returns {Array} EMA values
     */
    calculateEMA(data, period) {
        const ema = [];
        const multiplier = 2 / (period + 1);

        // Premier EMA = SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i];
        }
        ema.push(sum / period);

        // EMA suivants
        for (let i = period; i < data.length; i++) {
            const value = (data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
            ema.push(value);
        }

        return ema;
    }

    /**
     * Calcule le MACD (Moving Average Convergence Divergence)
     * @param {Array} closes - Prix de clôture
     * @returns {Object} MACD, signal line, histogram et signal de trading
     */
    calculateMACD(closes) {
        const { fastPeriod, slowPeriod, signalPeriod } = this.config.macd;

        if (closes.length < slowPeriod + signalPeriod) {
            return { macd: 0, signal: 0, histogram: 0, trend: 'neutral', crossover: null };
        }

        const emaFast = this.calculateEMA(closes, fastPeriod);
        const emaSlow = this.calculateEMA(closes, slowPeriod);

        // MACD Line = EMA fast - EMA slow
        const macdLine = [];
        const offset = slowPeriod - fastPeriod;
        for (let i = 0; i < emaSlow.length; i++) {
            macdLine.push(emaFast[i + offset] - emaSlow[i]);
        }

        // Signal Line = EMA of MACD
        const signalLine = this.calculateEMA(macdLine, signalPeriod);

        // Histogram
        const histogramOffset = signalPeriod - 1;
        const currentMACD = macdLine[macdLine.length - 1];
        const currentSignal = signalLine[signalLine.length - 1];
        const currentHistogram = currentMACD - currentSignal;

        // Détection de crossover
        let crossover = null;
        if (macdLine.length >= 2 && signalLine.length >= 2) {
            const prevMACD = macdLine[macdLine.length - 2];
            const prevSignal = signalLine[signalLine.length - 2];
            
            if (prevMACD <= prevSignal && currentMACD > currentSignal) {
                crossover = 'bullish';
            } else if (prevMACD >= prevSignal && currentMACD < currentSignal) {
                crossover = 'bearish';
            }
        }

        // Trend
        let trend = 'neutral';
        if (currentHistogram > 0 && currentMACD > 0) {
            trend = 'strong_bullish';
        } else if (currentHistogram > 0) {
            trend = 'bullish';
        } else if (currentHistogram < 0 && currentMACD < 0) {
            trend = 'strong_bearish';
        } else if (currentHistogram < 0) {
            trend = 'bearish';
        }

        return {
            macd: parseFloat(currentMACD.toFixed(6)),
            signal: parseFloat(currentSignal.toFixed(6)),
            histogram: parseFloat(currentHistogram.toFixed(6)),
            trend,
            crossover
        };
    }

    /**
     * Calcule les Bollinger Bands
     * @param {Array} closes - Prix de clôture
     * @returns {Object} Upper, middle, lower bands et signal
     */
    calculateBollingerBands(closes) {
        const { period, stdDev } = this.config.bollinger;

        if (closes.length < period) {
            return { upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 50, signal: 'neutral' };
        }

        // SMA (Middle Band)
        const recentCloses = closes.slice(-period);
        const sma = recentCloses.reduce((a, b) => a + b, 0) / period;

        // Standard Deviation
        const squaredDiffs = recentCloses.map(c => Math.pow(c - sma, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const standardDeviation = Math.sqrt(variance);

        // Bands
        const upper = sma + (standardDeviation * stdDev);
        const lower = sma - (standardDeviation * stdDev);
        const currentPrice = closes[closes.length - 1];

        // Bandwidth (volatilité)
        const bandwidth = ((upper - lower) / sma) * 100;

        // %B (position du prix dans les bandes)
        const percentB = ((currentPrice - lower) / (upper - lower)) * 100;

        // Signal
        let signal = 'neutral';
        if (percentB >= 100) {
            signal = 'overbought';
        } else if (percentB <= 0) {
            signal = 'oversold';
        } else if (percentB > 80) {
            signal = 'upper_band';
        } else if (percentB < 20) {
            signal = 'lower_band';
        }

        // Squeeze detection (faible volatilité)
        const squeeze = bandwidth < 4; // Bandes serrées

        return {
            upper: parseFloat(upper.toFixed(6)),
            middle: parseFloat(sma.toFixed(6)),
            lower: parseFloat(lower.toFixed(6)),
            bandwidth: parseFloat(bandwidth.toFixed(2)),
            percentB: parseFloat(percentB.toFixed(2)),
            signal,
            squeeze
        };
    }

    /**
     * Calcule le Stochastic RSI (plus sensible que le RSI classique)
     * @param {Array} closes - Prix de clôture
     * @returns {Object} Stochastic RSI values et signal
     */
    calculateStochRSI(closes) {
        const { rsiPeriod, stochPeriod, kPeriod, dPeriod, overbought, oversold } = this.config.stochRsi;
        
        if (closes.length < rsiPeriod + stochPeriod + kPeriod) {
            return { k: 50, d: 50, signal: 'neutral', crossover: null };
        }

        // Calcule les RSI pour chaque période
        const rsiValues = [];
        for (let i = rsiPeriod; i <= closes.length; i++) {
            const slice = closes.slice(i - rsiPeriod - 1, i);
            const rsi = this.calculateRSI(slice, rsiPeriod);
            rsiValues.push(rsi.value);
        }

        if (rsiValues.length < stochPeriod) {
            return { k: 50, d: 50, signal: 'neutral', crossover: null };
        }

        // Stochastic du RSI
        const stochValues = [];
        for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
            const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
            const highestRSI = Math.max(...slice);
            const lowestRSI = Math.min(...slice);
            const currentRSI = rsiValues[i];
            
            const stoch = highestRSI === lowestRSI ? 50 : 
                ((currentRSI - lowestRSI) / (highestRSI - lowestRSI)) * 100;
            stochValues.push(stoch);
        }

        // %K = SMA du Stochastic
        const kValues = [];
        for (let i = kPeriod - 1; i < stochValues.length; i++) {
            const slice = stochValues.slice(i - kPeriod + 1, i + 1);
            kValues.push(slice.reduce((a, b) => a + b, 0) / kPeriod);
        }

        // %D = SMA du %K
        const dValues = [];
        for (let i = dPeriod - 1; i < kValues.length; i++) {
            const slice = kValues.slice(i - dPeriod + 1, i + 1);
            dValues.push(slice.reduce((a, b) => a + b, 0) / dPeriod);
        }

        const currentK = kValues[kValues.length - 1] || 50;
        const currentD = dValues[dValues.length - 1] || 50;
        const prevK = kValues[kValues.length - 2] || currentK;
        const prevD = dValues[dValues.length - 2] || currentD;

        // Détection crossover
        let crossover = null;
        if (prevK <= prevD && currentK > currentD) {
            crossover = 'bullish';
        } else if (prevK >= prevD && currentK < currentD) {
            crossover = 'bearish';
        }

        // Signal
        let signal = 'neutral';
        if (currentK <= oversold && crossover === 'bullish') {
            signal = 'strong_buy';
        } else if (currentK >= overbought && crossover === 'bearish') {
            signal = 'strong_sell';
        } else if (currentK <= oversold) {
            signal = 'oversold';
        } else if (currentK >= overbought) {
            signal = 'overbought';
        } else if (currentK > currentD) {
            signal = 'bullish';
        } else if (currentK < currentD) {
            signal = 'bearish';
        }

        return {
            k: parseFloat(currentK.toFixed(2)),
            d: parseFloat(currentD.toFixed(2)),
            signal,
            crossover
        };
    }

    /**
     * Calcule l'EMA 200 (filtre de tendance macro)
     * @param {Array} closes - Prix de clôture
     * @returns {Object} EMA200 value et position du prix
     */
    calculateEMA200(closes) {
        const period = this.config.ema.slow;
        
        if (closes.length < period) {
            return { value: 0, position: 'neutral', distance: 0, trend: 'neutral' };
        }

        const ema = this.calculateEMA(closes, period);
        const currentEMA = ema[ema.length - 1];
        const currentPrice = closes[closes.length - 1];
        const distance = ((currentPrice - currentEMA) / currentEMA) * 100;

        // Position du prix par rapport à l'EMA200
        let position = 'neutral';
        let trend = 'neutral';
        
        if (currentPrice > currentEMA * 1.02) {
            position = 'above';
            trend = 'bullish';
        } else if (currentPrice < currentEMA * 0.98) {
            position = 'below';
            trend = 'bearish';
        } else {
            position = 'near';
            trend = 'consolidation';
        }

        // Pente de l'EMA (tendance)
        const prevEMA = ema[ema.length - 5] || currentEMA;
        const slope = ((currentEMA - prevEMA) / prevEMA) * 100;
        
        let slopeDirection = 'flat';
        if (slope > 0.1) slopeDirection = 'rising';
        else if (slope < -0.1) slopeDirection = 'falling';

        return {
            value: parseFloat(currentEMA.toFixed(6)),
            position,
            distance: parseFloat(distance.toFixed(2)),
            trend,
            slope: parseFloat(slope.toFixed(4)),
            slopeDirection
        };
    }

    /**
     * Calcule l'OBV (On-Balance Volume) et détecte les divergences
     * @param {Array} closes - Prix de clôture
     * @param {Array} volumes - Volumes
     * @returns {Object} OBV et divergences
     */
    calculateOBV(closes, volumes) {
        if (closes.length < 20 || volumes.length < 20) {
            return { value: 0, trend: 'neutral', divergence: null };
        }

        // Calcul OBV
        const obvValues = [0];
        for (let i = 1; i < closes.length; i++) {
            const priceChange = closes[i] - closes[i - 1];
            if (priceChange > 0) {
                obvValues.push(obvValues[obvValues.length - 1] + volumes[i]);
            } else if (priceChange < 0) {
                obvValues.push(obvValues[obvValues.length - 1] - volumes[i]);
            } else {
                obvValues.push(obvValues[obvValues.length - 1]);
            }
        }

        const currentOBV = obvValues[obvValues.length - 1];
        
        // Tendance OBV (SMA 10)
        const recentOBV = obvValues.slice(-10);
        const obvSMA = recentOBV.reduce((a, b) => a + b, 0) / 10;
        
        let trend = 'neutral';
        if (currentOBV > obvSMA * 1.05) trend = 'bullish';
        else if (currentOBV < obvSMA * 0.95) trend = 'bearish';

        // Détection divergence (20 dernières périodes)
        const lookback = 20;
        const recentCloses = closes.slice(-lookback);
        const recentOBVs = obvValues.slice(-lookback);
        
        // Trouve les highs/lows
        const priceHigh1 = Math.max(...recentCloses.slice(0, 10));
        const priceHigh2 = Math.max(...recentCloses.slice(10));
        const obvHigh1 = Math.max(...recentOBVs.slice(0, 10));
        const obvHigh2 = Math.max(...recentOBVs.slice(10));
        
        const priceLow1 = Math.min(...recentCloses.slice(0, 10));
        const priceLow2 = Math.min(...recentCloses.slice(10));
        const obvLow1 = Math.min(...recentOBVs.slice(0, 10));
        const obvLow2 = Math.min(...recentOBVs.slice(10));

        let divergence = null;
        
        // Divergence baissière: prix fait higher high, OBV fait lower high
        if (priceHigh2 > priceHigh1 && obvHigh2 < obvHigh1) {
            divergence = 'bearish';
        }
        // Divergence haussière: prix fait lower low, OBV fait higher low
        else if (priceLow2 < priceLow1 && obvLow2 > obvLow1) {
            divergence = 'bullish';
        }

        return {
            value: currentOBV,
            trend,
            divergence
        };
    }

    /**
     * Calcule le VWAP (Volume Weighted Average Price)
     * Indicateur institutionnel clé pour le scalping
     * @param {Array} candles - Bougies OHLCV
     * @returns {Object} VWAP, bandes de déviation et signal
     */
    calculateVWAP(candles) {
        if (!candles || candles.length < 10) {
            return { 
                vwap: 0, 
                upperBand1: 0, 
                lowerBand1: 0,
                upperBand2: 0,
                lowerBand2: 0,
                position: 'neutral',
                signal: 'neutral',
                distance: 0
            };
        }

        let cumulativeTPV = 0;  // Typical Price * Volume
        let cumulativeVolume = 0;
        const vwapValues = [];
        const tpValues = [];

        // Calcul du VWAP cumulatif
        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            const typicalPrice = (candle.high + candle.low + candle.close) / 3;
            const volume = candle.volume || 1;
            
            cumulativeTPV += typicalPrice * volume;
            cumulativeVolume += volume;
            
            const vwap = cumulativeTPV / cumulativeVolume;
            vwapValues.push(vwap);
            tpValues.push(typicalPrice);
        }

        const currentVWAP = vwapValues[vwapValues.length - 1];
        const currentPrice = candles[candles.length - 1].close;

        // Calcul de la déviation standard pour les bandes
        let sumSquaredDiff = 0;
        for (let i = 0; i < tpValues.length; i++) {
            sumSquaredDiff += Math.pow(tpValues[i] - vwapValues[i], 2) * (candles[i].volume || 1);
        }
        const variance = sumSquaredDiff / cumulativeVolume;
        const stdDev = Math.sqrt(variance);

        // Bandes de déviation (1 et 2 écarts-types)
        const upperBand1 = currentVWAP + stdDev;
        const lowerBand1 = currentVWAP - stdDev;
        const upperBand2 = currentVWAP + (stdDev * 2);
        const lowerBand2 = currentVWAP - (stdDev * 2);

        // Distance du prix par rapport au VWAP (en %)
        const distance = ((currentPrice - currentVWAP) / currentVWAP) * 100;

        // Position du prix
        let position = 'at_vwap';
        if (currentPrice > upperBand2) position = 'far_above';
        else if (currentPrice > upperBand1) position = 'above_band1';
        else if (currentPrice > currentVWAP) position = 'above';
        else if (currentPrice < lowerBand2) position = 'far_below';
        else if (currentPrice < lowerBand1) position = 'below_band1';
        else if (currentPrice < currentVWAP) position = 'below';

        // Signal de trading basé sur VWAP
        let signal = 'neutral';
        
        // Mean reversion: prix éloigné du VWAP tend à revenir
        if (position === 'far_above') {
            signal = 'overbought_vwap'; // Potentiel short
        } else if (position === 'far_below') {
            signal = 'oversold_vwap'; // Potentiel long
        } else if (position === 'above' && distance < 0.5) {
            signal = 'bullish_vwap'; // Support VWAP
        } else if (position === 'below' && distance > -0.5) {
            signal = 'bearish_vwap'; // Résistance VWAP
        }

        // Pente du VWAP (tendance)
        let slope = 'flat';
        if (vwapValues.length >= 5) {
            const recentSlope = (vwapValues[vwapValues.length - 1] - vwapValues[vwapValues.length - 5]) / vwapValues[vwapValues.length - 5] * 100;
            if (recentSlope > 0.05) slope = 'rising';
            else if (recentSlope < -0.05) slope = 'falling';
        }

        return {
            vwap: parseFloat(currentVWAP.toFixed(6)),
            upperBand1: parseFloat(upperBand1.toFixed(6)),
            lowerBand1: parseFloat(lowerBand1.toFixed(6)),
            upperBand2: parseFloat(upperBand2.toFixed(6)),
            lowerBand2: parseFloat(lowerBand2.toFixed(6)),
            position,
            signal,
            distance: parseFloat(distance.toFixed(3)),
            slope,
            stdDev: parseFloat(stdDev.toFixed(6))
        };
    }

    /**
     * Calcule le CVD (Cumulative Volume Delta)
     * Mesure la pression acheteuse vs vendeuse
     * @param {Array} candles - Bougies OHLCV
     * @returns {Object} CVD, tendance et divergences
     */
    calculateCVD(candles) {
        if (!candles || candles.length < 20) {
            return { 
                value: 0, 
                trend: 'neutral', 
                divergence: null,
                strength: 0,
                history: []
            };
        }

        const cvdHistory = [];
        let cvd = 0;

        // Calcul du CVD
        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            const range = candle.high - candle.low;
            const volume = candle.volume || 0;
            
            if (range > 0) {
                // Position de la clôture dans la bougie (0 = bas, 1 = haut)
                const closePosition = (candle.close - candle.low) / range;
                
                // Delta = Volume * (2 * closePosition - 1)
                // Si close près du high: delta positif (acheteurs dominants)
                // Si close près du low: delta négatif (vendeurs dominants)
                const delta = volume * (2 * closePosition - 1);
                cvd += delta;
            }
            
            cvdHistory.push(cvd);
        }

        const currentCVD = cvdHistory[cvdHistory.length - 1];

        // Tendance CVD (SMA 10)
        const lookback = Math.min(10, cvdHistory.length);
        const recentCVD = cvdHistory.slice(-lookback);
        const cvdSMA = recentCVD.reduce((a, b) => a + b, 0) / lookback;
        
        let trend = 'neutral';
        if (currentCVD > cvdSMA * 1.05) trend = 'bullish';
        else if (currentCVD < cvdSMA * 0.95) trend = 'bearish';

        // Calcul de la force (momentum du CVD)
        let strength = 0;
        if (cvdHistory.length >= 5) {
            const cvdChange = (cvdHistory[cvdHistory.length - 1] - cvdHistory[cvdHistory.length - 5]);
            const avgVolume = candles.slice(-5).reduce((sum, c) => sum + (c.volume || 0), 0) / 5;
            strength = avgVolume > 0 ? Math.min(1, Math.abs(cvdChange) / (avgVolume * 2)) : 0;
        }

        // Détection de divergence CVD vs Prix
        let divergence = null;
        const divLookback = 15;
        
        if (candles.length >= divLookback && cvdHistory.length >= divLookback) {
            const half = Math.floor(divLookback / 2);
            
            const recentCandles = candles.slice(-divLookback);
            const recentCVDs = cvdHistory.slice(-divLookback);
            
            // Prix: highs et lows
            const priceHigh1 = Math.max(...recentCandles.slice(0, half).map(c => c.high));
            const priceHigh2 = Math.max(...recentCandles.slice(half).map(c => c.high));
            const priceLow1 = Math.min(...recentCandles.slice(0, half).map(c => c.low));
            const priceLow2 = Math.min(...recentCandles.slice(half).map(c => c.low));
            
            // CVD: highs et lows
            const cvdHigh1 = Math.max(...recentCVDs.slice(0, half));
            const cvdHigh2 = Math.max(...recentCVDs.slice(half));
            const cvdLow1 = Math.min(...recentCVDs.slice(0, half));
            const cvdLow2 = Math.min(...recentCVDs.slice(half));

            // Divergence haussière: prix lower low, CVD higher low
            if (priceLow2 < priceLow1 * 0.998 && cvdLow2 > cvdLow1) {
                divergence = 'bullish';
            }
            // Divergence baissière: prix higher high, CVD lower high
            else if (priceHigh2 > priceHigh1 * 1.002 && cvdHigh2 < cvdHigh1) {
                divergence = 'bearish';
            }
        }

        return {
            value: parseFloat(currentCVD.toFixed(2)),
            trend,
            divergence,
            strength: parseFloat(strength.toFixed(3)),
            history: cvdHistory.slice(-20) // Garde les 20 dernières valeurs
        };
    }

    /**
     * Calcule l'ATR (Average True Range) pour la volatilité
     * Utilisé pour des SL/TP dynamiques
     * @param {Array} candles - Bougies OHLCV
     * @param {number} period - Période (défaut: 14)
     * @returns {Object} ATR et niveaux suggérés
     */
    calculateATR(candles, period = 14) {
        if (!candles || candles.length < period + 1) {
            return { atr: 0, atrPercent: 0, volatility: 'unknown', slMultiplier: 1.5, tpMultiplier: 2 };
        }

        const trueRanges = [];
        
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            
            // True Range = max(high-low, |high-prevClose|, |low-prevClose|)
            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trueRanges.push(tr);
        }

        // ATR = moyenne mobile des True Ranges
        const recentTR = trueRanges.slice(-period);
        const atr = recentTR.reduce((a, b) => a + b, 0) / period;
        
        const currentPrice = candles[candles.length - 1].close;
        const atrPercent = (atr / currentPrice) * 100;

        // Détermine le niveau de volatilité
        let volatility = 'normal';
        let slMultiplier = 1.5;
        let tpMultiplier = 2;
        
        if (atrPercent > 3) {
            volatility = 'extreme';
            slMultiplier = 2.5;
            tpMultiplier = 3;
        } else if (atrPercent > 2) {
            volatility = 'high';
            slMultiplier = 2;
            tpMultiplier = 2.5;
        } else if (atrPercent < 0.5) {
            volatility = 'low';
            slMultiplier = 1;
            tpMultiplier = 1.5;
        }

        return {
            atr: parseFloat(atr.toFixed(6)),
            atrPercent: parseFloat(atrPercent.toFixed(3)),
            volatility,
            slMultiplier,
            tpMultiplier,
            suggestedSL: parseFloat((atr * slMultiplier).toFixed(6)),
            suggestedTP: parseFloat((atr * tpMultiplier).toFixed(6))
        };
    }

    /**
     * Calcule l'ADX (Average Directional Index) pour la force de tendance
     * @param {Array} candles - Bougies OHLCV
     * @param {number} period - Période (défaut: 14)
     * @returns {Object} ADX et force de tendance
     */
    calculateADX(candles, period = 14) {
        if (!candles || candles.length < period * 2) {
            return { adx: 0, plusDI: 0, minusDI: 0, trendStrength: 'unknown', trending: false };
        }

        const plusDM = [];
        const minusDM = [];
        const tr = [];

        // Calcul des +DM, -DM et TR
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevHigh = candles[i - 1].high;
            const prevLow = candles[i - 1].low;
            const prevClose = candles[i - 1].close;

            // +DM et -DM
            const upMove = high - prevHigh;
            const downMove = prevLow - low;
            
            plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
            
            // True Range
            tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        }

        // Smoothed averages (Wilder's smoothing)
        const smoothedPlusDM = this.wilderSmooth(plusDM, period);
        const smoothedMinusDM = this.wilderSmooth(minusDM, period);
        const smoothedTR = this.wilderSmooth(tr, period);

        // +DI et -DI (évite division par zéro)
        const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
        const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

        // DX (évite division par zéro)
        const diSum = plusDI + minusDI;
        const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

        // ADX (moyenne lissée du DX)
        // Note: Pour un vrai ADX, il faudrait lisser le DX sur plusieurs périodes
        // Ici on utilise une approximation simplifiée
        const adx = isNaN(dx) ? 0 : dx;

        // Interprétation
        let trendStrength = 'weak';
        let trending = false;
        
        if (adx >= 50) {
            trendStrength = 'very_strong';
            trending = true;
        } else if (adx >= 25) {
            trendStrength = 'strong';
            trending = true;
        } else if (adx >= 20) {
            trendStrength = 'moderate';
            trending = true;
        }

        // Direction de la tendance
        let trendDirection = 'neutral';
        if (plusDI > minusDI && adx >= 20) {
            trendDirection = 'bullish';
        } else if (minusDI > plusDI && adx >= 20) {
            trendDirection = 'bearish';
        }

        return {
            adx: parseFloat(adx.toFixed(2)),
            plusDI: parseFloat(plusDI.toFixed(2)),
            minusDI: parseFloat(minusDI.toFixed(2)),
            trendStrength,
            trending,
            trendDirection
        };
    }

    /**
     * Wilder's Smoothing (utilisé pour ADX)
     */
    wilderSmooth(data, period) {
        if (data.length < period) return 0;
        
        // Première valeur = SMA
        let smoothed = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        
        // Ensuite: smoothed = prev - (prev/period) + current
        for (let i = period; i < data.length; i++) {
            smoothed = smoothed - (smoothed / period) + data[i];
        }
        
        return smoothed;
    }

    /**
     * Calcule le Momentum (Rate of Change)
     * @param {Array} closes - Prix de clôture
     * @param {number} period - Période (défaut: 10)
     * @returns {Object} Momentum et signal
     */
    calculateMomentum(closes, period = 10) {
        if (closes.length < period + 1) {
            return { momentum: 0, momentumPercent: 0, signal: 'neutral', increasing: false };
        }

        const currentPrice = closes[closes.length - 1];
        const pastPrice = closes[closes.length - 1 - period];
        
        const momentum = currentPrice - pastPrice;
        const momentumPercent = ((currentPrice - pastPrice) / pastPrice) * 100;

        // Vérifie si le momentum augmente
        const prevMomentum = closes[closes.length - 2] - closes[closes.length - 2 - period];
        const increasing = momentum > prevMomentum;

        // Signal
        let signal = 'neutral';
        if (momentumPercent > 2) {
            signal = 'strong_bullish';
        } else if (momentumPercent > 0.5) {
            signal = 'bullish';
        } else if (momentumPercent < -2) {
            signal = 'strong_bearish';
        } else if (momentumPercent < -0.5) {
            signal = 'bearish';
        }

        return {
            momentum: parseFloat(momentum.toFixed(6)),
            momentumPercent: parseFloat(momentumPercent.toFixed(3)),
            signal,
            increasing
        };
    }

    /**
     * Vérifie la liquidité (volume suffisant pour trader)
     * @param {Array} candles - Bougies OHLCV
     * @returns {Object} Analyse de liquidité
     */
    checkLiquidity(candles) {
        if (!candles || candles.length < 20) {
            return { sufficient: false, ratio: 0, warning: 'Données insuffisantes' };
        }

        const volumes = candles.map(c => c.volume || 0);
        const recentVolumes = volumes.slice(-5);
        const avgVolume20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const currentVolume = volumes[volumes.length - 1];
        const avgRecentVolume = recentVolumes.reduce((a, b) => a + b, 0) / 5;

        const ratio = avgRecentVolume / avgVolume20;

        // Vérifie si le volume est suffisant
        let sufficient = true;
        let warning = null;

        if (ratio < 0.3) {
            sufficient = false;
            warning = 'Volume très faible - risque de slippage élevé';
        } else if (ratio < 0.5) {
            warning = 'Volume faible - prudence recommandée';
        }

        // Vérifie les bougies avec volume nul
        const zeroVolumeCandles = recentVolumes.filter(v => v === 0).length;
        if (zeroVolumeCandles >= 2) {
            sufficient = false;
            warning = 'Plusieurs bougies sans volume - marché illiquide';
        }

        return {
            sufficient,
            ratio: parseFloat(ratio.toFixed(2)),
            currentVolume,
            avgVolume20: parseFloat(avgVolume20.toFixed(2)),
            warning
        };
    }

    /**
     * Détecte les fakeouts potentiels (faux signaux)
     * Vérifie la cohérence du signal sur plusieurs bougies
     * @param {Array} candles - Bougies OHLCV
     * @param {string} signalDirection - 'bullish' ou 'bearish'
     * @returns {Object} Analyse anti-fakeout
     */
    detectFakeout(candles, signalDirection) {
        if (!candles || candles.length < 5) {
            return { isFakeout: false, confidence: 0, reason: null };
        }

        const recent = candles.slice(-5);
        let fakeoutScore = 0;
        const reasons = [];

        if (signalDirection === 'bullish') {
            // Pour un signal haussier, vérifie:
            
            // 1. Les 2-3 dernières bougies sont-elles vertes?
            const greenCandles = recent.slice(-3).filter(c => c.close > c.open).length;
            if (greenCandles < 2) {
                fakeoutScore += 30;
                reasons.push('Moins de 2 bougies vertes sur les 3 dernières');
            }

            // 2. Y a-t-il une longue mèche haute (rejet)?
            const lastCandle = recent[recent.length - 1];
            const bodySize = Math.abs(lastCandle.close - lastCandle.open);
            const upperWick = lastCandle.high - Math.max(lastCandle.close, lastCandle.open);
            if (upperWick > bodySize * 2) {
                fakeoutScore += 40;
                reasons.push('Longue mèche haute (rejet des acheteurs)');
            }

            // 3. Le volume diminue-t-il?
            const volumes = recent.map(c => c.volume || 0);
            if (volumes[4] < volumes[3] && volumes[3] < volumes[2]) {
                fakeoutScore += 20;
                reasons.push('Volume décroissant');
            }

            // 4. Prix en dessous de l'ouverture de la bougie précédente?
            if (lastCandle.close < recent[recent.length - 2].open) {
                fakeoutScore += 25;
                reasons.push('Clôture sous l\'ouverture précédente');
            }

        } else if (signalDirection === 'bearish') {
            // Pour un signal baissier, vérifie:
            
            // 1. Les 2-3 dernières bougies sont-elles rouges?
            const redCandles = recent.slice(-3).filter(c => c.close < c.open).length;
            if (redCandles < 2) {
                fakeoutScore += 30;
                reasons.push('Moins de 2 bougies rouges sur les 3 dernières');
            }

            // 2. Y a-t-il une longue mèche basse (rejet)?
            const lastCandle = recent[recent.length - 1];
            const bodySize = Math.abs(lastCandle.close - lastCandle.open);
            const lowerWick = Math.min(lastCandle.close, lastCandle.open) - lastCandle.low;
            if (lowerWick > bodySize * 2) {
                fakeoutScore += 40;
                reasons.push('Longue mèche basse (rejet des vendeurs)');
            }

            // 3. Le volume diminue-t-il?
            const volumes = recent.map(c => c.volume || 0);
            if (volumes[4] < volumes[3] && volumes[3] < volumes[2]) {
                fakeoutScore += 20;
                reasons.push('Volume décroissant');
            }

            // 4. Prix au-dessus de l'ouverture de la bougie précédente?
            if (lastCandle.close > recent[recent.length - 2].open) {
                fakeoutScore += 25;
                reasons.push('Clôture au-dessus de l\'ouverture précédente');
            }
        }

        const isFakeout = fakeoutScore >= 50;
        const confidence = Math.min(100, fakeoutScore);

        return {
            isFakeout,
            confidence,
            fakeoutScore,
            reasons: reasons.length > 0 ? reasons : null
        };
    }

    /**
     * Calcule les EMAs rapides pour le scalping (9 et 21)
     * @param {Array} closes - Prix de clôture
     * @returns {Object} EMAs et signal de croisement
     */
    calculateScalpingEMAs(closes) {
        if (closes.length < 21) {
            return { ema9: 0, ema21: 0, crossover: null, trend: 'neutral', distance: 0 };
        }

        const ema9 = this.calculateEMA(closes, 9);
        const ema21 = this.calculateEMA(closes, 21);
        
        const currentEMA9 = ema9[ema9.length - 1];
        const currentEMA21 = ema21[ema21.length - 1];
        const prevEMA9 = ema9[ema9.length - 2];
        const prevEMA21 = ema21[ema21.length - 2];
        const currentPrice = closes[closes.length - 1];

        // Détection de croisement
        let crossover = null;
        if (prevEMA9 <= prevEMA21 && currentEMA9 > currentEMA21) {
            crossover = 'bullish';
        } else if (prevEMA9 >= prevEMA21 && currentEMA9 < currentEMA21) {
            crossover = 'bearish';
        }

        // Tendance basée sur la position relative
        let trend = 'neutral';
        if (currentEMA9 > currentEMA21 && currentPrice > currentEMA9) {
            trend = 'strong_bullish';
        } else if (currentEMA9 > currentEMA21) {
            trend = 'bullish';
        } else if (currentEMA9 < currentEMA21 && currentPrice < currentEMA9) {
            trend = 'strong_bearish';
        } else if (currentEMA9 < currentEMA21) {
            trend = 'bearish';
        }

        // Distance entre les EMAs (en %)
        const distance = ((currentEMA9 - currentEMA21) / currentEMA21) * 100;

        return {
            ema9: parseFloat(currentEMA9.toFixed(6)),
            ema21: parseFloat(currentEMA21.toFixed(6)),
            crossover,
            trend,
            distance: parseFloat(distance.toFixed(3)),
            priceAboveEMA9: currentPrice > currentEMA9,
            priceAboveEMA21: currentPrice > currentEMA21
        };
    }

    /**
     * Détecte les divergences RSI
     * @param {Array} closes - Prix de clôture
     * @returns {Object} Divergence RSI
     */
    detectRSIDivergence(closes) {
        if (closes.length < 30) {
            return { divergence: null, strength: 0 };
        }

        // Calcule RSI pour les 30 dernières périodes
        const rsiValues = [];
        for (let i = 14; i <= closes.length; i++) {
            const slice = closes.slice(0, i);
            const rsi = this.calculateRSI(slice, 14);
            rsiValues.push(rsi.value);
        }

        const lookback = 15;
        const recentCloses = closes.slice(-lookback);
        const recentRSIs = rsiValues.slice(-lookback);

        // Trouve les highs/lows sur deux périodes
        const half = Math.floor(lookback / 2);
        
        const priceHigh1 = Math.max(...recentCloses.slice(0, half));
        const priceHigh2 = Math.max(...recentCloses.slice(half));
        const rsiHigh1 = Math.max(...recentRSIs.slice(0, half));
        const rsiHigh2 = Math.max(...recentRSIs.slice(half));
        
        const priceLow1 = Math.min(...recentCloses.slice(0, half));
        const priceLow2 = Math.min(...recentCloses.slice(half));
        const rsiLow1 = Math.min(...recentRSIs.slice(0, half));
        const rsiLow2 = Math.min(...recentRSIs.slice(half));

        let divergence = null;
        let strength = 0;

        // Divergence baissière: prix higher high, RSI lower high
        if (priceHigh2 > priceHigh1 * 1.001 && rsiHigh2 < rsiHigh1 * 0.95) {
            divergence = 'bearish';
            strength = (rsiHigh1 - rsiHigh2) / rsiHigh1;
        }
        // Divergence haussière: prix lower low, RSI higher low
        else if (priceLow2 < priceLow1 * 0.999 && rsiLow2 > rsiLow1 * 1.05) {
            divergence = 'bullish';
            strength = (rsiLow2 - rsiLow1) / rsiLow1;
        }

        return {
            divergence,
            strength: parseFloat(Math.min(1, Math.abs(strength)).toFixed(2))
        };
    }

    /**
     * Analyse le volume
     * @param {Array} volumes - Volumes
     * @param {Array} closes - Prix de clôture
     * @returns {Object} Volume analysis
     */
    analyzeVolume(volumes, closes) {
        const { maPeriod, spikeMultiplier } = this.config.volume;

        if (volumes.length < maPeriod) {
            return { current: 0, average: 0, ratio: 1, spike: false, trend: 'neutral' };
        }

        // Volume MA
        const recentVolumes = volumes.slice(-maPeriod);
        const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / maPeriod;
        const currentVolume = volumes[volumes.length - 1];
        const ratio = currentVolume / avgVolume;

        // Spike detection
        const spike = ratio >= spikeMultiplier;

        // Volume trend (croissant ou décroissant)
        let volumeTrend = 'neutral';
        if (volumes.length >= 5) {
            const recent5 = volumes.slice(-5);
            const older5 = volumes.slice(-10, -5);
            const recentAvg = recent5.reduce((a, b) => a + b, 0) / 5;
            const olderAvg = older5.length === 5 ? older5.reduce((a, b) => a + b, 0) / 5 : recentAvg;
            
            if (recentAvg > olderAvg * 1.2) volumeTrend = 'increasing';
            else if (recentAvg < olderAvg * 0.8) volumeTrend = 'decreasing';
        }

        // Price-Volume correlation
        let priceVolumeSignal = 'neutral';
        if (closes.length >= 2) {
            const priceChange = closes[closes.length - 1] - closes[closes.length - 2];
            if (priceChange > 0 && spike) {
                priceVolumeSignal = 'bullish_confirmation';
            } else if (priceChange < 0 && spike) {
                priceVolumeSignal = 'bearish_confirmation';
            } else if (priceChange > 0 && ratio < 0.7) {
                priceVolumeSignal = 'weak_rally';
            } else if (priceChange < 0 && ratio < 0.7) {
                priceVolumeSignal = 'weak_decline';
            }
        }

        return {
            current: currentVolume,
            average: parseFloat(avgVolume.toFixed(2)),
            ratio: parseFloat(ratio.toFixed(2)),
            spike,
            trend: volumeTrend,
            priceVolumeSignal
        };
    }

    /**
     * Analyse complète avec tous les indicateurs
     * Version améliorée avec VWAP, CVD et système de confluence pondéré
     * @param {Array} candles - Bougies OHLCV
     * @param {string} timeframe - Timeframe pour optimiser les réglages
     * @returns {Object} Analyse complète
     */
    analyzeAll(candles, timeframe = '1h') {
        if (!candles || candles.length < 30) {
            return null;
        }

        // Applique la configuration du timeframe
        this.setTimeframe(timeframe);

        const closes = candles.map(c => c.close);
        const volumes = candles.map(c => c.volume || 0);
        const currentPrice = closes[closes.length - 1];

        // ===== INDICATEURS DE BASE =====
        const rsi = this.calculateRSI(closes);
        const macd = this.calculateMACD(closes);
        const bollinger = this.calculateBollingerBands(closes);
        const volume = this.analyzeVolume(volumes, closes);
        
        // ===== INDICATEURS AVANCÉS =====
        const stochRsi = this.calculateStochRSI(closes);
        const ema200 = this.calculateEMA200(closes);
        const obv = this.calculateOBV(closes, volumes);
        const rsiDivergence = this.detectRSIDivergence(closes);
        
        // ===== NOUVEAUX INDICATEURS SCALPING =====
        const vwap = this.calculateVWAP(candles);
        const cvd = this.calculateCVD(candles);
        const scalpingEMAs = this.calculateScalpingEMAs(closes);
        
        // ===== INDICATEURS DE FILTRAGE AVANCÉS =====
        const atr = this.calculateATR(candles);
        const adx = this.calculateADX(candles);
        const momentum = this.calculateMomentum(closes);
        const liquidity = this.checkLiquidity(candles);
        
        // ===== NOUVEAUX INDICATEURS (Supertrend, Fibonacci) =====
        const supertrend = this.calculateSupertrend(candles, 10, 3);
        const fibonacci = this.calculateFibonacci(candles, 50);

        // ===== SYSTÈME DE CONFLUENCE PONDÉRÉ =====
        // Poids des indicateurs (total = 100)
        const weights = {
            rsi: 8,
            stochRsi: 10,
            macd: 12,
            ema200: 10,
            scalpingEMAs: 12,
            vwap: 15,
            cvd: 15,
            obv: 8,
            volume: 10
        };

        let weightedScore = 0;
        let totalWeight = 0;
        let signals = [];
        let bullishSignals = 0;
        let bearishSignals = 0;

        // ===== RSI (poids: 8) =====
        if (rsi.signal === 'oversold') {
            weightedScore += weights.rsi;
            signals.push({ indicator: 'RSI', signal: 'bullish', reason: `RSI survente (${rsi.value})`, weight: weights.rsi });
            bullishSignals++;
        } else if (rsi.signal === 'overbought') {
            weightedScore -= weights.rsi;
            signals.push({ indicator: 'RSI', signal: 'bearish', reason: `RSI surachat (${rsi.value})`, weight: weights.rsi });
            bearishSignals++;
        } else if (rsi.value > 50) {
            weightedScore += weights.rsi * 0.3;
            bullishSignals += 0.5;
        } else {
            weightedScore -= weights.rsi * 0.3;
            bearishSignals += 0.5;
        }
        totalWeight += weights.rsi;

        // Divergence RSI (bonus)
        if (rsiDivergence.divergence === 'bullish') {
            weightedScore += 15; // Bonus fort
            signals.push({ indicator: 'RSI_DIV', signal: 'bullish', reason: 'Divergence RSI haussière', weight: 15 });
            bullishSignals++;
        } else if (rsiDivergence.divergence === 'bearish') {
            weightedScore -= 15;
            signals.push({ indicator: 'RSI_DIV', signal: 'bearish', reason: 'Divergence RSI baissière', weight: 15 });
            bearishSignals++;
        }

        // ===== Stochastic RSI (poids: 10) =====
        if (stochRsi.signal === 'strong_buy') {
            weightedScore += weights.stochRsi;
            signals.push({ indicator: 'StochRSI', signal: 'bullish', reason: `Croisement haussier en survente (K=${stochRsi.k})`, weight: weights.stochRsi });
            bullishSignals++;
        } else if (stochRsi.signal === 'strong_sell') {
            weightedScore -= weights.stochRsi;
            signals.push({ indicator: 'StochRSI', signal: 'bearish', reason: `Croisement baissier en surachat (K=${stochRsi.k})`, weight: weights.stochRsi });
            bearishSignals++;
        } else if (stochRsi.crossover === 'bullish') {
            weightedScore += weights.stochRsi * 0.6;
            signals.push({ indicator: 'StochRSI', signal: 'bullish', reason: 'Croisement haussier', weight: weights.stochRsi * 0.6 });
            bullishSignals += 0.5;
        } else if (stochRsi.crossover === 'bearish') {
            weightedScore -= weights.stochRsi * 0.6;
            signals.push({ indicator: 'StochRSI', signal: 'bearish', reason: 'Croisement baissier', weight: weights.stochRsi * 0.6 });
            bearishSignals += 0.5;
        }
        totalWeight += weights.stochRsi;

        // ===== MACD (poids: 12) =====
        if (macd.crossover === 'bullish') {
            weightedScore += weights.macd;
            signals.push({ indicator: 'MACD', signal: 'bullish', reason: 'Croisement haussier', weight: weights.macd });
            bullishSignals++;
        } else if (macd.crossover === 'bearish') {
            weightedScore -= weights.macd;
            signals.push({ indicator: 'MACD', signal: 'bearish', reason: 'Croisement baissier', weight: weights.macd });
            bearishSignals++;
        }
        if (macd.trend === 'strong_bullish') {
            weightedScore += weights.macd * 0.4;
            bullishSignals += 0.3;
        } else if (macd.trend === 'strong_bearish') {
            weightedScore -= weights.macd * 0.4;
            bearishSignals += 0.3;
        }
        totalWeight += weights.macd;

        // ===== EMA 200 - Filtre tendance macro (poids: 10) =====
        if (ema200.position === 'above') {
            weightedScore += weights.ema200 * (ema200.slopeDirection === 'rising' ? 1 : 0.6);
            signals.push({ indicator: 'EMA200', signal: 'bullish', reason: `Prix au-dessus EMA200 (${ema200.distance}%)`, weight: weights.ema200 });
            bullishSignals++;
        } else if (ema200.position === 'below') {
            weightedScore -= weights.ema200 * (ema200.slopeDirection === 'falling' ? 1 : 0.6);
            signals.push({ indicator: 'EMA200', signal: 'bearish', reason: `Prix en-dessous EMA200 (${ema200.distance}%)`, weight: weights.ema200 });
            bearishSignals++;
        }
        totalWeight += weights.ema200;

        // ===== EMAs Scalping 9/21 (poids: 12) =====
        if (scalpingEMAs.crossover === 'bullish') {
            weightedScore += weights.scalpingEMAs;
            signals.push({ indicator: 'EMA9/21', signal: 'bullish', reason: 'Croisement EMA9 > EMA21', weight: weights.scalpingEMAs });
            bullishSignals++;
        } else if (scalpingEMAs.crossover === 'bearish') {
            weightedScore -= weights.scalpingEMAs;
            signals.push({ indicator: 'EMA9/21', signal: 'bearish', reason: 'Croisement EMA9 < EMA21', weight: weights.scalpingEMAs });
            bearishSignals++;
        } else if (scalpingEMAs.trend === 'strong_bullish') {
            weightedScore += weights.scalpingEMAs * 0.7;
            bullishSignals += 0.5;
        } else if (scalpingEMAs.trend === 'strong_bearish') {
            weightedScore -= weights.scalpingEMAs * 0.7;
            bearishSignals += 0.5;
        }
        totalWeight += weights.scalpingEMAs;

        // ===== VWAP (poids: 15) - Indicateur institutionnel clé =====
        if (vwap.signal === 'bullish_vwap' || vwap.position === 'above') {
            const vwapScore = vwap.slope === 'rising' ? weights.vwap : weights.vwap * 0.7;
            weightedScore += vwapScore;
            signals.push({ indicator: 'VWAP', signal: 'bullish', reason: `Prix au-dessus VWAP (${vwap.distance}%)`, weight: vwapScore });
            bullishSignals++;
        } else if (vwap.signal === 'bearish_vwap' || vwap.position === 'below') {
            const vwapScore = vwap.slope === 'falling' ? weights.vwap : weights.vwap * 0.7;
            weightedScore -= vwapScore;
            signals.push({ indicator: 'VWAP', signal: 'bearish', reason: `Prix en-dessous VWAP (${vwap.distance}%)`, weight: vwapScore });
            bearishSignals++;
        }
        // Mean reversion signals
        if (vwap.signal === 'oversold_vwap') {
            weightedScore += weights.vwap * 0.8;
            signals.push({ indicator: 'VWAP', signal: 'bullish', reason: 'Prix très éloigné sous VWAP (mean reversion)', weight: weights.vwap * 0.8 });
            bullishSignals++;
        } else if (vwap.signal === 'overbought_vwap') {
            weightedScore -= weights.vwap * 0.8;
            signals.push({ indicator: 'VWAP', signal: 'bearish', reason: 'Prix très éloigné au-dessus VWAP (mean reversion)', weight: weights.vwap * 0.8 });
            bearishSignals++;
        }
        totalWeight += weights.vwap;

        // ===== CVD - Cumulative Volume Delta (poids: 15) =====
        if (cvd.trend === 'bullish') {
            weightedScore += weights.cvd * 0.6;
            bullishSignals += 0.5;
        } else if (cvd.trend === 'bearish') {
            weightedScore -= weights.cvd * 0.6;
            bearishSignals += 0.5;
        }
        // Divergence CVD (signal très fort)
        if (cvd.divergence === 'bullish') {
            weightedScore += weights.cvd;
            signals.push({ indicator: 'CVD', signal: 'bullish', reason: 'Divergence CVD haussière (accumulation)', weight: weights.cvd });
            bullishSignals++;
        } else if (cvd.divergence === 'bearish') {
            weightedScore -= weights.cvd;
            signals.push({ indicator: 'CVD', signal: 'bearish', reason: 'Divergence CVD baissière (distribution)', weight: weights.cvd });
            bearishSignals++;
        }
        totalWeight += weights.cvd;

        // ===== OBV (poids: 8) =====
        if (obv.divergence === 'bullish') {
            weightedScore += weights.obv;
            signals.push({ indicator: 'OBV', signal: 'bullish', reason: 'Divergence OBV haussière', weight: weights.obv });
            bullishSignals++;
        } else if (obv.divergence === 'bearish') {
            weightedScore -= weights.obv;
            signals.push({ indicator: 'OBV', signal: 'bearish', reason: 'Divergence OBV baissière', weight: weights.obv });
            bearishSignals++;
        } else if (obv.trend === 'bullish') {
            weightedScore += weights.obv * 0.4;
            bullishSignals += 0.3;
        } else if (obv.trend === 'bearish') {
            weightedScore -= weights.obv * 0.4;
            bearishSignals += 0.3;
        }
        totalWeight += weights.obv;

        // ===== Volume (poids: 10) =====
        if (volume.spike && volume.priceVolumeSignal === 'bullish_confirmation') {
            weightedScore += weights.volume;
            signals.push({ indicator: 'Volume', signal: 'bullish', reason: `Spike volume haussier (${volume.ratio}x)`, weight: weights.volume });
            bullishSignals++;
        } else if (volume.spike && volume.priceVolumeSignal === 'bearish_confirmation') {
            weightedScore -= weights.volume;
            signals.push({ indicator: 'Volume', signal: 'bearish', reason: `Spike volume baissier (${volume.ratio}x)`, weight: weights.volume });
            bearishSignals++;
        } else if (volume.priceVolumeSignal === 'weak_rally') {
            weightedScore -= weights.volume * 0.5;
            signals.push({ indicator: 'Volume', signal: 'bearish', reason: 'Rallye faible (volume bas)', weight: weights.volume * 0.5 });
        } else if (volume.priceVolumeSignal === 'weak_decline') {
            weightedScore += weights.volume * 0.5;
            signals.push({ indicator: 'Volume', signal: 'bullish', reason: 'Baisse faible (volume bas)', weight: weights.volume * 0.5 });
        }
        totalWeight += weights.volume;

        // ===== Bollinger Bands (bonus) =====
        if (bollinger.signal === 'oversold') {
            weightedScore += 8;
            signals.push({ indicator: 'Bollinger', signal: 'bullish', reason: 'Prix sous bande inférieure', weight: 8 });
            bullishSignals += 0.5;
        } else if (bollinger.signal === 'overbought') {
            weightedScore -= 8;
            signals.push({ indicator: 'Bollinger', signal: 'bearish', reason: 'Prix sur bande supérieure', weight: 8 });
            bearishSignals += 0.5;
        }
        if (bollinger.squeeze) {
            signals.push({ indicator: 'Bollinger', signal: 'neutral', reason: 'Squeeze (breakout imminent)', weight: 0 });
        }

        // ===== CALCUL DU SCORE NORMALISÉ =====
        // Normalise le score pondéré sur une échelle de -100 à +100
        const normalizedScore = Math.max(-100, Math.min(100, weightedScore));
        
        // Confluence = nombre d'indicateurs alignés dans la même direction
        const confluence = Math.floor(Math.max(bullishSignals, bearishSignals));
        const totalIndicators = Math.floor(bullishSignals + bearishSignals);

        // ===== DÉTERMINER LA DIRECTION ET LA FORCE =====
        let direction = 'neutral';
        let strength = 'weak';
        
        if (normalizedScore >= 50) {
            direction = 'strong_buy';
            strength = 'strong';
        } else if (normalizedScore >= 25) {
            direction = 'buy';
            strength = confluence >= 4 ? 'strong' : 'medium';
        } else if (normalizedScore <= -50) {
            direction = 'strong_sell';
            strength = 'strong';
        } else if (normalizedScore <= -25) {
            direction = 'sell';
            strength = confluence >= 4 ? 'strong' : 'medium';
        }

        // ===== CALCUL DU SCORE DE QUALITÉ DU SIGNAL =====
        const signalQuality = this.calculateSignalQuality(
            confluence,
            normalizedScore,
            volume,
            cvd,
            vwap,
            rsiDivergence,
            bollinger
        );

        // Bonus confluence (plus d'indicateurs alignés = signal plus fiable)
        const confluenceBonus = confluence >= 5 ? 'excellent' : 
                               confluence >= 4 ? 'high' : 
                               confluence >= 3 ? 'medium' : 'low';

        // Liste des signaux formatée pour l'affichage
        const signalsList = signals.map(s => s.reason);

        // ===== DÉTECTION DE FAKEOUT =====
        const signalDirection = normalizedScore > 0 ? 'bullish' : 'bearish';
        const fakeout = this.detectFakeout(candles, signalDirection);
        
        // ===== FILTRES DE SÉCURITÉ =====
        const filters = {
            liquidityOK: liquidity.sufficient,
            momentumAligned: (normalizedScore > 0 && momentum.signal.includes('bullish')) ||
                            (normalizedScore < 0 && momentum.signal.includes('bearish')) ||
                            normalizedScore === 0,
            trendConfirmed: adx.trending && adx.trendDirection === signalDirection,
            noFakeout: !fakeout.isFakeout,
            volatilityOK: atr.volatility !== 'extreme'
        };
        
        // Compte les filtres passés
        const filtersPassed = Object.values(filters).filter(v => v).length;
        const filtersTotal = Object.keys(filters).length;
        
        // Ajuste la qualité selon les filtres
        if (!filters.liquidityOK) {
            signalQuality.score -= 15;
            signalQuality.factors.push('⚠️ Liquidité insuffisante');
        }
        if (!filters.momentumAligned) {
            signalQuality.score -= 10;
            signalQuality.factors.push('⚠️ Momentum non aligné');
        }
        if (fakeout.isFakeout) {
            signalQuality.score -= 20;
            signalQuality.factors.push(`⚠️ Fakeout détecté: ${fakeout.reasons?.[0] || 'signal incohérent'}`);
        }
        if (atr.volatility === 'extreme') {
            signalQuality.score -= 10;
            signalQuality.factors.push('⚠️ Volatilité extrême');
        }
        
        // Recalcule le grade après ajustements
        signalQuality.score = Math.max(0, signalQuality.score);
        if (signalQuality.score >= 80) {
            signalQuality.grade = 'A';
            signalQuality.tradeable = true;
        } else if (signalQuality.score >= 65) {
            signalQuality.grade = 'B';
            signalQuality.tradeable = true;
        } else if (signalQuality.score >= 50) {
            signalQuality.grade = 'C';
            signalQuality.tradeable = confluence >= 3 && filtersPassed >= 3;
        } else {
            signalQuality.grade = 'D';
            signalQuality.tradeable = false;
        }
        
        signalQuality.filtersPassed = filtersPassed;
        signalQuality.filtersTotal = filtersTotal;

        return {
            // Indicateurs de base
            rsi,
            macd,
            bollinger,
            volume,
            // Indicateurs avancés
            stochRsi,
            ema200,
            obv,
            rsiDivergence,
            // Nouveaux indicateurs scalping
            vwap,
            cvd,
            scalpingEMAs,
            // Indicateurs de filtrage
            atr,
            adx,
            momentum,
            liquidity,
            fakeout,
            // Nouveaux indicateurs (Supertrend, Fibonacci)
            supertrend,
            fibonacci,
            // Analyse globale
            score: normalizedScore,
            weightedScore,
            direction,
            strength,
            confluence,
            totalIndicators,
            confluenceBonus,
            // Qualité du signal (avec filtres)
            signalQuality,
            filters,
            filtersPassed,
            filtersTotal,
            // Signaux détaillés
            signals,
            signalsList,
            // Compteurs
            bullishSignals: Math.floor(bullishSignals),
            bearishSignals: Math.floor(bearishSignals),
            // Réglages Ichimoku recommandés pour ce timeframe
            ichimokuSettings: this.getIchimokuSettings(timeframe),
            timestamp: Date.now()
        };
    }

    /**
     * Calcule le score de qualité du signal (0-100)
     * Détermine si le signal est tradeable ou non
     */
    calculateSignalQuality(confluence, score, volume, cvd, vwap, rsiDivergence, bollinger) {
        let quality = 0;
        const factors = [];

        // 1. Confluence (max 35 points)
        if (confluence >= 5) {
            quality += 35;
            factors.push('Confluence excellente (5+ indicateurs)');
        } else if (confluence >= 4) {
            quality += 28;
            factors.push('Bonne confluence (4 indicateurs)');
        } else if (confluence >= 3) {
            quality += 20;
            factors.push('Confluence acceptable (3 indicateurs)');
        } else {
            quality += confluence * 5;
            factors.push(`Confluence faible (${confluence} indicateurs)`);
        }

        // 2. Force du score (max 25 points)
        const absScore = Math.abs(score);
        if (absScore >= 50) {
            quality += 25;
            factors.push('Signal très fort');
        } else if (absScore >= 35) {
            quality += 20;
            factors.push('Signal fort');
        } else if (absScore >= 20) {
            quality += 12;
            factors.push('Signal modéré');
        } else {
            quality += 5;
            factors.push('Signal faible');
        }

        // 3. Volume (max 15 points)
        if (volume.spike && volume.ratio >= 2.0) {
            quality += 15;
            factors.push('Volume spike fort');
        } else if (volume.spike) {
            quality += 10;
            factors.push('Volume au-dessus moyenne');
        } else if (volume.ratio >= 1.0) {
            quality += 5;
            factors.push('Volume normal');
        }

        // 4. CVD confirmation (max 10 points)
        if (cvd.divergence) {
            quality += 10;
            factors.push(`Divergence CVD ${cvd.divergence}`);
        } else if (cvd.strength > 0.5) {
            quality += 5;
            factors.push('CVD momentum fort');
        }

        // 5. VWAP position (max 10 points)
        if (vwap.position === 'above' || vwap.position === 'below') {
            if (Math.abs(vwap.distance) < 1) {
                quality += 10;
                factors.push('Prix proche du VWAP');
            } else {
                quality += 5;
                factors.push('Prix éloigné du VWAP');
            }
        }

        // 6. Divergences RSI/OBV (bonus 5 points)
        if (rsiDivergence.divergence) {
            quality += 5;
            factors.push(`Divergence RSI ${rsiDivergence.divergence}`);
        }

        // ===== GRADE ASSOUPLI POUR SCALPING 1m/5m =====
        // En scalping, on accepte des signaux de qualité moyenne car les mouvements sont rapides
        let grade = 'D';
        let tradeable = false;
        
        if (quality >= 70) {
            grade = 'A';
            tradeable = true;
        } else if (quality >= 55) {
            grade = 'B';
            tradeable = true;
        } else if (quality >= 40) {
            grade = 'C';
            tradeable = confluence >= 2; // Assoupli: 2 indicateurs suffisent en scalping
        } else if (quality >= 30) {
            grade = 'D';
            tradeable = confluence >= 3; // Grade D tradeable si bonne confluence
        }

        return {
            score: quality,
            maxScore: 100,
            percentage: quality,
            grade,
            tradeable,
            minimumMet: quality >= 35 && confluence >= 2, // Seuils assouplis
            factors
        };
    }

    /**
     * Vérifie si un signal Ichimoku est confirmé par les autres indicateurs
     * Version améliorée avec VWAP, CVD et EMAs scalping
     * @param {string} ichimokuSignal - 'long' ou 'short'
     * @param {Object} analysis - Résultat de analyzeAll()
     * @returns {Object} Confirmation et score
     */
    confirmIchimokuSignal(ichimokuSignal, analysis) {
        if (!analysis) return { confirmed: false, score: 0, reasons: [] };

        let confirmations = 0;
        let rejections = 0;
        const reasons = [];

        if (ichimokuSignal === 'long') {
            // ===== CONFIRMATIONS POUR LONG =====
            
            // RSI
            if (analysis.rsi.value < 70) { confirmations++; reasons.push('✓ RSI < 70'); }
            if (analysis.rsi.value < 30) { confirmations++; reasons.push('✓ RSI survente'); }
            
            // StochRSI
            if (analysis.stochRsi.signal === 'strong_buy' || analysis.stochRsi.crossover === 'bullish') {
                confirmations++; reasons.push('✓ StochRSI haussier');
            }
            
            // MACD
            if (analysis.macd.crossover === 'bullish' || analysis.macd.trend.includes('bullish')) {
                confirmations++; reasons.push('✓ MACD haussier');
            }
            
            // EMA200
            if (analysis.ema200.position === 'above') {
                confirmations++; reasons.push('✓ Prix > EMA200');
            }
            
            // EMAs Scalping (9/21)
            if (analysis.scalpingEMAs && (analysis.scalpingEMAs.crossover === 'bullish' || analysis.scalpingEMAs.trend.includes('bullish'))) {
                confirmations++; reasons.push('✓ EMA9 > EMA21');
            }
            
            // VWAP (nouveau)
            if (analysis.vwap && (analysis.vwap.position === 'above' || analysis.vwap.signal === 'bullish_vwap')) {
                confirmations++; reasons.push('✓ Prix > VWAP');
            }
            if (analysis.vwap && analysis.vwap.signal === 'oversold_vwap') {
                confirmations += 2; reasons.push('✓ VWAP mean reversion haussier');
            }
            
            // CVD (nouveau)
            if (analysis.cvd && analysis.cvd.trend === 'bullish') {
                confirmations++; reasons.push('✓ CVD haussier');
            }
            if (analysis.cvd && analysis.cvd.divergence === 'bullish') {
                confirmations += 2; reasons.push('✓ Divergence CVD haussière');
            }
            
            // OBV
            if (analysis.obv.trend === 'bullish' || analysis.obv.divergence === 'bullish') {
                confirmations++; reasons.push('✓ OBV haussier');
            }
            
            // Volume
            if (analysis.volume.spike && analysis.volume.priceVolumeSignal === 'bullish_confirmation') {
                confirmations++; reasons.push('✓ Volume spike haussier');
            } else if (analysis.volume.spike) {
                confirmations++; reasons.push('✓ Volume élevé');
            }
            
            // Divergences
            if (analysis.rsiDivergence.divergence === 'bullish') {
                confirmations += 2; reasons.push('✓ Divergence RSI haussière');
            }

            // ===== REJECTIONS POUR LONG =====
            if (analysis.rsi.value > 80) { rejections += 2; reasons.push('⚠️ RSI > 80 (surachat)'); }
            if (analysis.ema200.position === 'below' && analysis.ema200.slopeDirection === 'falling') {
                rejections++; reasons.push('⚠️ Tendance baissière EMA200');
            }
            if (analysis.scalpingEMAs && analysis.scalpingEMAs.trend === 'strong_bearish') {
                rejections++; reasons.push('⚠️ EMA9 < EMA21 fortement');
            }
            if (analysis.vwap && analysis.vwap.signal === 'overbought_vwap') {
                rejections++; reasons.push('⚠️ Prix très au-dessus VWAP');
            }
            if (analysis.cvd && analysis.cvd.divergence === 'bearish') {
                rejections += 2; reasons.push('⚠️ Divergence CVD baissière');
            }
            if (analysis.obv.divergence === 'bearish') {
                rejections += 2; reasons.push('⚠️ Divergence OBV baissière');
            }
            if (analysis.rsiDivergence.divergence === 'bearish') {
                rejections += 2; reasons.push('⚠️ Divergence RSI baissière');
            }

        } else if (ichimokuSignal === 'short') {
            // ===== CONFIRMATIONS POUR SHORT =====
            
            // RSI
            if (analysis.rsi.value > 30) { confirmations++; reasons.push('✓ RSI > 30'); }
            if (analysis.rsi.value > 70) { confirmations++; reasons.push('✓ RSI surachat'); }
            
            // StochRSI
            if (analysis.stochRsi.signal === 'strong_sell' || analysis.stochRsi.crossover === 'bearish') {
                confirmations++; reasons.push('✓ StochRSI baissier');
            }
            
            // MACD
            if (analysis.macd.crossover === 'bearish' || analysis.macd.trend.includes('bearish')) {
                confirmations++; reasons.push('✓ MACD baissier');
            }
            
            // EMA200
            if (analysis.ema200.position === 'below') {
                confirmations++; reasons.push('✓ Prix < EMA200');
            }
            
            // EMAs Scalping (9/21)
            if (analysis.scalpingEMAs && (analysis.scalpingEMAs.crossover === 'bearish' || analysis.scalpingEMAs.trend.includes('bearish'))) {
                confirmations++; reasons.push('✓ EMA9 < EMA21');
            }
            
            // VWAP (nouveau)
            if (analysis.vwap && (analysis.vwap.position === 'below' || analysis.vwap.signal === 'bearish_vwap')) {
                confirmations++; reasons.push('✓ Prix < VWAP');
            }
            if (analysis.vwap && analysis.vwap.signal === 'overbought_vwap') {
                confirmations += 2; reasons.push('✓ VWAP mean reversion baissier');
            }
            
            // CVD (nouveau)
            if (analysis.cvd && analysis.cvd.trend === 'bearish') {
                confirmations++; reasons.push('✓ CVD baissier');
            }
            if (analysis.cvd && analysis.cvd.divergence === 'bearish') {
                confirmations += 2; reasons.push('✓ Divergence CVD baissière');
            }
            
            // OBV
            if (analysis.obv.trend === 'bearish' || analysis.obv.divergence === 'bearish') {
                confirmations++; reasons.push('✓ OBV baissier');
            }
            
            // Volume
            if (analysis.volume.spike && analysis.volume.priceVolumeSignal === 'bearish_confirmation') {
                confirmations++; reasons.push('✓ Volume spike baissier');
            } else if (analysis.volume.spike) {
                confirmations++; reasons.push('✓ Volume élevé');
            }
            
            // Divergences
            if (analysis.rsiDivergence.divergence === 'bearish') {
                confirmations += 2; reasons.push('✓ Divergence RSI baissière');
            }

            // ===== REJECTIONS POUR SHORT =====
            if (analysis.rsi.value < 20) { rejections += 2; reasons.push('⚠️ RSI < 20 (survente)'); }
            if (analysis.ema200.position === 'above' && analysis.ema200.slopeDirection === 'rising') {
                rejections++; reasons.push('⚠️ Tendance haussière EMA200');
            }
            if (analysis.scalpingEMAs && analysis.scalpingEMAs.trend === 'strong_bullish') {
                rejections++; reasons.push('⚠️ EMA9 > EMA21 fortement');
            }
            if (analysis.vwap && analysis.vwap.signal === 'oversold_vwap') {
                rejections++; reasons.push('⚠️ Prix très en-dessous VWAP');
            }
            if (analysis.cvd && analysis.cvd.divergence === 'bullish') {
                rejections += 2; reasons.push('⚠️ Divergence CVD haussière');
            }
            if (analysis.obv.divergence === 'bullish') {
                rejections += 2; reasons.push('⚠️ Divergence OBV haussière');
            }
            if (analysis.rsiDivergence.divergence === 'bullish') {
                rejections += 2; reasons.push('⚠️ Divergence RSI haussière');
            }
        }

        const netScore = confirmations - rejections;
        const confirmed = netScore >= 3; // Augmenté à 3 pour plus de fiabilité

        return {
            confirmed,
            score: netScore,
            confirmations,
            rejections,
            reasons,
            confidence: confirmations >= 7 ? 'high' : confirmations >= 5 ? 'medium' : 'low'
        };
    }

    /**
     * Calcule l'indicateur Supertrend
     * Formule: Supertrend = (High + Low) / 2 ± (Multiplier × ATR)
     * @param {Array} candles - Bougies OHLCV
     * @param {number} period - Période ATR (défaut: 10)
     * @param {number} multiplier - Multiplicateur (défaut: 3)
     * @returns {Object} Supertrend value, direction et signal
     */
    calculateSupertrend(candles, period = 10, multiplier = 3) {
        if (!candles || candles.length < period + 1) {
            return { 
                value: 0, 
                direction: 'neutral', 
                signal: 'neutral',
                trend: 'neutral',
                trendStrength: 0
            };
        }

        // Calcul de l'ATR
        const atrData = this.calculateATR(candles, period);
        const atr = atrData.atr;

        const currentCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];
        
        // Calcul des bandes de base
        const hl2 = (currentCandle.high + currentCandle.low) / 2;
        const prevHl2 = (prevCandle.high + prevCandle.low) / 2;
        
        const basicUpperBand = hl2 + (multiplier * atr);
        const basicLowerBand = hl2 - (multiplier * atr);

        // Calcul des bandes finales (avec logique de continuation)
        // Pour simplifier, on utilise une approche basée sur les dernières bougies
        let upperBand = basicUpperBand;
        let lowerBand = basicLowerBand;
        
        // Détermine la direction basée sur la position du prix
        let direction = 'neutral';
        let supertrend = 0;
        
        // Si le prix clôture au-dessus de la bande supérieure précédente = tendance haussière
        // Si le prix clôture en-dessous de la bande inférieure précédente = tendance baissière
        const prevClose = prevCandle.close;
        const currentClose = currentCandle.close;
        
        // Logique Supertrend simplifiée mais efficace
        if (currentClose > basicLowerBand && prevClose > (prevHl2 - multiplier * atr)) {
            direction = 'bullish';
            supertrend = basicLowerBand;
        } else if (currentClose < basicUpperBand && prevClose < (prevHl2 + multiplier * atr)) {
            direction = 'bearish';
            supertrend = basicUpperBand;
        } else if (currentClose > hl2) {
            direction = 'bullish';
            supertrend = basicLowerBand;
        } else {
            direction = 'bearish';
            supertrend = basicUpperBand;
        }

        // Signal de trading
        let signal = 'neutral';
        if (direction === 'bullish' && currentClose > supertrend) {
            signal = 'buy';
        } else if (direction === 'bearish' && currentClose < supertrend) {
            signal = 'sell';
        }

        // Force de la tendance (distance par rapport au Supertrend)
        const distance = Math.abs(currentClose - supertrend);
        const trendStrength = Math.min(1, (distance / currentClose) * 100 / 2);

        return {
            value: parseFloat(supertrend.toFixed(6)),
            upperBand: parseFloat(basicUpperBand.toFixed(6)),
            lowerBand: parseFloat(basicLowerBand.toFixed(6)),
            direction,
            signal,
            trend: direction,
            trendStrength: parseFloat(trendStrength.toFixed(3)),
            atr: atr
        };
    }

    /**
     * Calcule les niveaux de Fibonacci Retracement
     * Niveaux: 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%
     * @param {Array} candles - Bougies OHLCV
     * @param {number} lookback - Période pour trouver high/low (défaut: 50)
     * @returns {Object} Niveaux Fibonacci et position du prix
     */
    calculateFibonacci(candles, lookback = 50) {
        if (!candles || candles.length < lookback) {
            return { 
                levels: {}, 
                trend: 'neutral', 
                currentLevel: null,
                nearestSupport: null,
                nearestResistance: null,
                retracement: 0
            };
        }

        const recentCandles = candles.slice(-lookback);
        
        // Trouve le high et low de la période
        let swingHigh = -Infinity;
        let swingLow = Infinity;
        let highIndex = 0;
        let lowIndex = 0;
        
        for (let i = 0; i < recentCandles.length; i++) {
            if (recentCandles[i].high > swingHigh) {
                swingHigh = recentCandles[i].high;
                highIndex = i;
            }
            if (recentCandles[i].low < swingLow) {
                swingLow = recentCandles[i].low;
                lowIndex = i;
            }
        }

        const range = swingHigh - swingLow;
        const currentPrice = candles[candles.length - 1].close;
        
        // Détermine si on est en tendance haussière ou baissière
        // Haussier: low avant high, Baissier: high avant low
        const isUptrend = lowIndex < highIndex;
        
        // Calcul des niveaux Fibonacci
        let levels = {};
        if (isUptrend) {
            // Retracement depuis le high (tendance haussière)
            levels = {
                '0': swingHigh,                           // 0% (sommet)
                '23.6': swingHigh - range * 0.236,
                '38.2': swingHigh - range * 0.382,
                '50': swingHigh - range * 0.5,
                '61.8': swingHigh - range * 0.618,
                '78.6': swingHigh - range * 0.786,
                '100': swingLow                           // 100% (creux)
            };
        } else {
            // Retracement depuis le low (tendance baissière)
            levels = {
                '0': swingLow,                            // 0% (creux)
                '23.6': swingLow + range * 0.236,
                '38.2': swingLow + range * 0.382,
                '50': swingLow + range * 0.5,
                '61.8': swingLow + range * 0.618,
                '78.6': swingLow + range * 0.786,
                '100': swingHigh                          // 100% (sommet)
            };
        }

        // Trouve le niveau actuel et les supports/résistances les plus proches
        const levelValues = Object.entries(levels).sort((a, b) => a[1] - b[1]);
        let nearestSupport = null;
        let nearestResistance = null;
        let currentLevel = null;

        for (let i = 0; i < levelValues.length; i++) {
            const [name, value] = levelValues[i];
            if (value < currentPrice) {
                nearestSupport = { level: name, price: value };
            } else if (value > currentPrice && !nearestResistance) {
                nearestResistance = { level: name, price: value };
            }
            
            // Vérifie si le prix est proche d'un niveau (±0.5%)
            if (Math.abs(currentPrice - value) / currentPrice < 0.005) {
                currentLevel = name;
            }
        }

        // Calcul du retracement actuel en %
        const retracement = isUptrend 
            ? ((swingHigh - currentPrice) / range) * 100
            : ((currentPrice - swingLow) / range) * 100;

        return {
            levels,
            trend: isUptrend ? 'bullish' : 'bearish',
            swingHigh,
            swingLow,
            currentLevel,
            nearestSupport,
            nearestResistance,
            retracement: parseFloat(retracement.toFixed(2)),
            isUptrend
        };
    }

    /**
     * Calcule les TP/SL basés sur Fibonacci
     * @param {number} entryPrice - Prix d'entrée
     * @param {string} direction - 'long' ou 'short'
     * @param {Object} fibData - Données Fibonacci
     * @returns {Object} TP et SL suggérés
     */
    calculateFibonacciTPSL(entryPrice, direction, fibData) {
        if (!fibData || !fibData.levels) {
            return { tp: null, sl: null, rrr: 0 };
        }

        const levels = fibData.levels;
        let tp = null;
        let sl = null;

        if (direction === 'long') {
            // LONG: SL sous le support, TP vers la résistance
            if (fibData.nearestSupport) {
                sl = fibData.nearestSupport.price * 0.998; // 0.2% sous le support
            } else {
                sl = entryPrice * 0.98; // Fallback 2%
            }
            
            // TP au niveau 0% (sommet) ou extension
            if (fibData.isUptrend) {
                tp = levels['0']; // Retour au sommet
            } else {
                tp = levels['100']; // Extension vers le haut
            }
            
            // Si le TP est trop proche, utilise l'extension 161.8%
            if (tp && (tp - entryPrice) / entryPrice < 0.01) {
                const range = fibData.swingHigh - fibData.swingLow;
                tp = fibData.swingHigh + range * 0.618; // Extension 161.8%
            }
        } else {
            // SHORT: SL au-dessus de la résistance, TP vers le support
            if (fibData.nearestResistance) {
                sl = fibData.nearestResistance.price * 1.002; // 0.2% au-dessus
            } else {
                sl = entryPrice * 1.02; // Fallback 2%
            }
            
            // TP au niveau 100% (creux) ou extension
            if (fibData.isUptrend) {
                tp = levels['100']; // Vers le creux
            } else {
                tp = levels['0']; // Retour au creux
            }
            
            // Si le TP est trop proche, utilise l'extension
            if (tp && (entryPrice - tp) / entryPrice < 0.01) {
                const range = fibData.swingHigh - fibData.swingLow;
                tp = fibData.swingLow - range * 0.618; // Extension 161.8%
            }
        }

        // Calcul du RRR
        const risk = Math.abs(entryPrice - sl);
        const reward = Math.abs(tp - entryPrice);
        const rrr = risk > 0 ? reward / risk : 0;

        return {
            tp: tp ? parseFloat(tp.toFixed(6)) : null,
            sl: sl ? parseFloat(sl.toFixed(6)) : null,
            tpPercent: tp ? parseFloat(((Math.abs(tp - entryPrice) / entryPrice) * 100).toFixed(2)) : 0,
            slPercent: sl ? parseFloat(((Math.abs(sl - entryPrice) / entryPrice) * 100).toFixed(2)) : 0,
            rrr: parseFloat(rrr.toFixed(2))
        };
    }

    /**
     * Détecte le Kumo Twist (changement de couleur du nuage Ichimoku)
     * @param {Object} ichimokuData - Données Ichimoku avec senkouA et senkouB
     * @param {number} lookback - Nombre de périodes à analyser
     * @returns {Object} Signal Kumo Twist
     */
    detectKumoTwist(ichimokuData, lookback = 5) {
        if (!ichimokuData || !ichimokuData.senkouA || !ichimokuData.senkouB) {
            return { twist: false, direction: 'neutral', strength: 0 };
        }

        const { senkouA, senkouB } = ichimokuData;
        
        // Couleur actuelle du nuage
        const currentCloudBullish = senkouA > senkouB;
        
        // Vérifie s'il y a eu un twist récent (changement de couleur)
        // On regarde si senkouA et senkouB se sont croisés récemment
        // Pour cela, on compare les valeurs actuelles avec les valeurs passées
        
        let twist = false;
        let direction = 'neutral';
        let strength = 0;

        // Distance entre les deux lignes (épaisseur du nuage)
        const cloudThickness = Math.abs(senkouA - senkouB);
        const avgPrice = (senkouA + senkouB) / 2;
        const thicknessPercent = (cloudThickness / avgPrice) * 100;

        // Si le nuage est très fin, un twist est probable
        if (thicknessPercent < 0.3) {
            twist = true;
            direction = currentCloudBullish ? 'bullish' : 'bearish';
            strength = 0.5;
        }

        // Force basée sur l'épaisseur du nuage après le twist
        if (currentCloudBullish) {
            direction = 'bullish';
            strength = Math.min(1, thicknessPercent / 2);
        } else {
            direction = 'bearish';
            strength = Math.min(1, thicknessPercent / 2);
        }

        return {
            twist,
            direction,
            cloudColor: currentCloudBullish ? 'green' : 'red',
            cloudThickness: parseFloat(thicknessPercent.toFixed(3)),
            strength: parseFloat(strength.toFixed(3)),
            senkouA,
            senkouB
        };
    }

    /**
     * Analyse la confirmation Chikou Span
     * Chikou au-dessus du prix passé = bullish, en-dessous = bearish
     * @param {Array} candles - Bougies OHLCV
     * @param {Object} ichimokuData - Données Ichimoku
     * @param {number} displacement - Décalage Chikou (défaut: 26)
     * @returns {Object} Signal Chikou
     */
    analyzeChikouConfirmation(candles, ichimokuData, displacement = 26) {
        if (!candles || candles.length < displacement + 5 || !ichimokuData || !ichimokuData.chikou) {
            return { 
                confirmed: false, 
                direction: 'neutral', 
                strength: 0,
                abovePrice: false,
                aboveCloud: false
            };
        }

        const chikou = ichimokuData.chikou;
        const currentPrice = candles[candles.length - 1].close;
        
        // Prix il y a 26 périodes (où le Chikou est tracé)
        const pastIndex = candles.length - 1 - displacement;
        if (pastIndex < 0) {
            return { confirmed: false, direction: 'neutral', strength: 0 };
        }
        
        const pastCandle = candles[pastIndex];
        const pastPrice = pastCandle.close;
        const pastHigh = pastCandle.high;
        const pastLow = pastCandle.low;

        // Chikou est le prix actuel tracé 26 périodes en arrière
        // On compare avec le prix passé
        const abovePrice = currentPrice > pastPrice;
        const belowPrice = currentPrice < pastPrice;
        
        // Distance par rapport au prix passé
        const distance = ((currentPrice - pastPrice) / pastPrice) * 100;

        let direction = 'neutral';
        let strength = 0;
        let confirmed = false;

        if (abovePrice && currentPrice > pastHigh) {
            // Chikou clairement au-dessus = confirmation haussière forte
            direction = 'bullish';
            strength = Math.min(1, Math.abs(distance) / 3);
            confirmed = true;
        } else if (belowPrice && currentPrice < pastLow) {
            // Chikou clairement en-dessous = confirmation baissière forte
            direction = 'bearish';
            strength = Math.min(1, Math.abs(distance) / 3);
            confirmed = true;
        } else if (abovePrice) {
            direction = 'bullish';
            strength = Math.min(0.7, Math.abs(distance) / 3);
            confirmed = Math.abs(distance) > 1;
        } else if (belowPrice) {
            direction = 'bearish';
            strength = Math.min(0.7, Math.abs(distance) / 3);
            confirmed = Math.abs(distance) > 1;
        }

        return {
            confirmed,
            direction,
            strength: parseFloat(strength.toFixed(3)),
            abovePrice,
            distance: parseFloat(distance.toFixed(2)),
            chikouValue: currentPrice,
            pastPrice
        };
    }
}

export default new TechnicalIndicators();
