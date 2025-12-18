/**
 * Module Bollinger Squeeze Strategy
 * Détecte les périodes de faible volatilité (squeeze) et anticipe les breakouts
 * 
 * PRINCIPE:
 * - Quand les bandes Bollinger se resserrent (squeeze), la volatilité est faible
 * - Un breakout explosif suit généralement un squeeze
 * - On utilise le Keltner Channel pour confirmer le squeeze
 * - Direction déterminée par le momentum (histogramme)
 */

import indicators from './indicators.js';

class BollingerSqueezeStrategy {
    constructor() {
        // Configuration par défaut
        this.config = {
            // Bollinger Bands
            bbPeriod: 20,
            bbStdDev: 2,
            // Keltner Channel (pour confirmer le squeeze)
            kcPeriod: 20,
            kcMultiplier: 1.5,
            // Momentum
            momentumPeriod: 12,
            // Seuils
            squeezeThreshold: 4,      // Bandwidth < 4% = squeeze
            breakoutConfirmation: 2,  // Nombre de bougies pour confirmer
            minMomentum: 0.5          // Momentum minimum pour signal
        };

        // État du squeeze
        this.squeezeHistory = [];
        this.maxHistory = 50;
    }

    /**
     * Configure la stratégie
     */
    configure(config) {
        this.config = { ...this.config, ...config };
    }

    /**
     * Calcule l'ATR (Average True Range)
     */
    calculateATR(candles, period = 14) {
        if (candles.length < period + 1) return 0;

        const trueRanges = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            
            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trueRanges.push(tr);
        }

        // ATR = moyenne des TR sur la période
        const recentTR = trueRanges.slice(-period);
        return recentTR.reduce((a, b) => a + b, 0) / recentTR.length;
    }

    /**
     * Calcule le Keltner Channel
     */
    calculateKeltnerChannel(candles, period = 20, multiplier = 1.5) {
        if (candles.length < period) {
            return { upper: 0, middle: 0, lower: 0 };
        }

        const closes = candles.map(c => c.close);
        const recentCloses = closes.slice(-period);
        
        // EMA comme ligne centrale
        const ema = this.calculateEMA(closes, period);
        
        // ATR pour les bandes
        const atr = this.calculateATR(candles, period);

        return {
            upper: ema + (atr * multiplier),
            middle: ema,
            lower: ema - (atr * multiplier)
        };
    }

    /**
     * Calcule l'EMA
     */
    calculateEMA(data, period) {
        if (data.length < period) return data[data.length - 1] || 0;

        const multiplier = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

        for (let i = period; i < data.length; i++) {
            ema = (data[i] - ema) * multiplier + ema;
        }

        return ema;
    }

    /**
     * Calcule le momentum (rate of change)
     */
    calculateMomentum(closes, period = 12) {
        if (closes.length < period + 1) return { value: 0, histogram: [] };

        const histogram = [];
        for (let i = period; i < closes.length; i++) {
            const momentum = ((closes[i] - closes[i - period]) / closes[i - period]) * 100;
            histogram.push(momentum);
        }

        return {
            value: histogram[histogram.length - 1] || 0,
            histogram,
            increasing: histogram.length >= 2 && histogram[histogram.length - 1] > histogram[histogram.length - 2],
            positive: (histogram[histogram.length - 1] || 0) > 0
        };
    }

    /**
     * Détecte le squeeze (Bollinger inside Keltner)
     */
    detectSqueeze(candles) {
        const closes = candles.map(c => c.close);
        
        // Bollinger Bands
        const bb = this.calculateBollingerBands(closes);
        
        // Keltner Channel
        const kc = this.calculateKeltnerChannel(candles, this.config.kcPeriod, this.config.kcMultiplier);

        // Squeeze = Bollinger Bands inside Keltner Channel
        const isSqueezing = bb.lower > kc.lower && bb.upper < kc.upper;
        
        // Squeeze off = Bollinger Bands outside Keltner Channel (breakout imminent)
        const squeezeOff = bb.lower < kc.lower || bb.upper > kc.upper;

        // Historique du squeeze
        this.squeezeHistory.push(isSqueezing);
        if (this.squeezeHistory.length > this.maxHistory) {
            this.squeezeHistory.shift();
        }

        // Compte le nombre de bougies en squeeze
        let squeezeCount = 0;
        for (let i = this.squeezeHistory.length - 1; i >= 0; i--) {
            if (this.squeezeHistory[i]) squeezeCount++;
            else break;
        }

        // Détecte la sortie de squeeze (signal potentiel)
        const wasSqueezing = this.squeezeHistory.length >= 2 && 
                            this.squeezeHistory[this.squeezeHistory.length - 2] === true;
        const squeezeRelease = wasSqueezing && !isSqueezing;

        return {
            isSqueezing,
            squeezeOff,
            squeezeRelease,
            squeezeCount,
            bandwidth: bb.bandwidth,
            bollingerBands: bb,
            keltnerChannel: kc
        };
    }

    /**
     * Calcule les Bollinger Bands
     */
    calculateBollingerBands(closes) {
        const period = this.config.bbPeriod;
        const stdDev = this.config.bbStdDev;

        if (closes.length < period) {
            return { upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 50 };
        }

        const recentCloses = closes.slice(-period);
        const sma = recentCloses.reduce((a, b) => a + b, 0) / period;

        const squaredDiffs = recentCloses.map(c => Math.pow(c - sma, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const standardDeviation = Math.sqrt(variance);

        const upper = sma + (standardDeviation * stdDev);
        const lower = sma - (standardDeviation * stdDev);
        const currentPrice = closes[closes.length - 1];

        const bandwidth = ((upper - lower) / sma) * 100;
        const percentB = ((currentPrice - lower) / (upper - lower)) * 100;

        return {
            upper,
            middle: sma,
            lower,
            bandwidth,
            percentB,
            standardDeviation
        };
    }

    /**
     * Analyse complète Bollinger Squeeze
     * @param {Array} candles - Données OHLCV
     * @returns {Object} Résultat de l'analyse
     */
    analyze(candles) {
        if (!candles || candles.length < 30) {
            return {
                success: false,
                error: 'Pas assez de données (minimum 30 candles)',
                signal: null
            };
        }

        const closes = candles.map(c => c.close);
        const currentPrice = closes[closes.length - 1];

        // Détection du squeeze
        const squeeze = this.detectSqueeze(candles);

        // Calcul du momentum
        const momentum = this.calculateMomentum(closes, this.config.momentumPeriod);

        // Détermination du signal
        let signal = null;
        let direction = null;
        let strength = 0;
        let description = '';

        // Signal de sortie de squeeze
        if (squeeze.squeezeRelease) {
            if (momentum.positive && momentum.increasing) {
                direction = 'bullish';
                signal = 'BUY';
                strength = Math.min(1, Math.abs(momentum.value) / 2);
                description = `Sortie de squeeze haussière (momentum: +${momentum.value.toFixed(2)}%)`;
            } else if (!momentum.positive && !momentum.increasing) {
                direction = 'bearish';
                signal = 'SELL';
                strength = Math.min(1, Math.abs(momentum.value) / 2);
                description = `Sortie de squeeze baissière (momentum: ${momentum.value.toFixed(2)}%)`;
            }
        }

        // Signal pendant le squeeze (anticipation)
        if (squeeze.isSqueezing && squeeze.squeezeCount >= 3) {
            if (momentum.positive && momentum.increasing && !signal) {
                direction = 'bullish_pending';
                description = `Squeeze en cours (${squeeze.squeezeCount} bougies) - Breakout haussier probable`;
                strength = 0.3;
            } else if (!momentum.positive && !momentum.increasing && !signal) {
                direction = 'bearish_pending';
                description = `Squeeze en cours (${squeeze.squeezeCount} bougies) - Breakout baissier probable`;
                strength = 0.3;
            }
        }

        // Signal de breakout confirmé (prix sort des bandes)
        if (!squeeze.isSqueezing && squeeze.squeezeOff) {
            const bb = squeeze.bollingerBands;
            
            if (currentPrice > bb.upper && momentum.positive) {
                direction = 'bullish';
                signal = 'BUY';
                strength = Math.min(1, 0.6 + Math.abs(momentum.value) / 5);
                description = `Breakout haussier confirmé (prix > bande supérieure)`;
            } else if (currentPrice < bb.lower && !momentum.positive) {
                direction = 'bearish';
                signal = 'SELL';
                strength = Math.min(1, 0.6 + Math.abs(momentum.value) / 5);
                description = `Breakout baissier confirmé (prix < bande inférieure)`;
            }
        }

        // Calcul du score (0-7 comme Ichimoku)
        let score = 0;
        const scoreDetails = [];

        // +1 si squeeze récent
        if (squeeze.squeezeCount > 0 || squeeze.squeezeRelease) {
            score += 1;
            scoreDetails.push('Squeeze détecté');
        }

        // +1 si momentum positif/négatif fort
        if (Math.abs(momentum.value) > 1) {
            score += 1;
            scoreDetails.push(`Momentum fort (${momentum.value.toFixed(2)}%)`);
        }

        // +1 si momentum croissant
        if (momentum.increasing) {
            score += 1;
            scoreDetails.push('Momentum croissant');
        }

        // +1 si breakout confirmé
        if (signal) {
            score += 2;
            scoreDetails.push('Signal de breakout');
        }

        // +1 si bandes très serrées (volatilité très faible)
        if (squeeze.bandwidth < 3) {
            score += 1;
            scoreDetails.push('Volatilité très faible');
        }

        // Ajuste le score selon la direction
        if (direction === 'bearish' || direction === 'bearish_pending') {
            score = -score;
        }

        return {
            success: true,
            timestamp: Date.now(),
            currentPrice,
            signal,
            direction,
            strength,
            description,
            score,
            scoreDetails,
            squeeze: {
                isSqueezing: squeeze.isSqueezing,
                squeezeRelease: squeeze.squeezeRelease,
                squeezeCount: squeeze.squeezeCount,
                bandwidth: squeeze.bandwidth
            },
            momentum: {
                value: momentum.value,
                positive: momentum.positive,
                increasing: momentum.increasing
            },
            bollingerBands: squeeze.bollingerBands,
            keltnerChannel: squeeze.keltnerChannel,
            levels: {
                upper: squeeze.bollingerBands.upper,
                middle: squeeze.bollingerBands.middle,
                lower: squeeze.bollingerBands.lower
            }
        };
    }

    /**
     * Génère un signal de trading formaté
     */
    generateSignal(analysis, symbol, timeframe) {
        if (!analysis.success || !analysis.signal) {
            return null;
        }

        return {
            type: 'bollinger_squeeze',
            symbol,
            timeframe,
            action: analysis.signal,
            direction: analysis.direction,
            price: analysis.currentPrice,
            strength: analysis.strength,
            score: analysis.score,
            description: analysis.description,
            levels: analysis.levels,
            squeeze: analysis.squeeze,
            momentum: analysis.momentum,
            timestamp: analysis.timestamp
        };
    }
}

// Singleton
const bollingerSqueeze = new BollingerSqueezeStrategy();
export default bollingerSqueeze;
