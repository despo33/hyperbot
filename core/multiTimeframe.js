/**
 * Module Multi-Timeframe Analysis
 * Confirme les signaux sur plusieurs timeframes (15m, 1h, 4h)
 */

import indicators from './indicators.js';
import ichimoku from './ichimoku.js';
import patternDetector from './patternDetector.js';

class MultiTimeframeAnalyzer {
    constructor() {
        this.config = {
            timeframes: ['15m', '1h', '4h'],
            weights: {
                '15m': 0.3,  // Signal d'entrée
                '1h': 0.4,   // Confirmation
                '4h': 0.3    // Tendance de fond
            },
            minConfirmation: 2, // Minimum 2 timeframes en accord
            cacheTimeout: 60000 // Cache 1 minute
        };
        
        this.cache = new Map();
    }

    /**
     * Convertit les bougies d'un timeframe à un autre
     * @param {Array} candles - Bougies source (ex: 15m)
     * @param {string} sourceTimeframe - Timeframe source
     * @param {string} targetTimeframe - Timeframe cible
     * @returns {Array} Bougies converties
     */
    convertTimeframe(candles, sourceTimeframe, targetTimeframe) {
        const ratios = {
            '15m_1h': 4,
            '15m_4h': 16,
            '1h_4h': 4,
            '5m_15m': 3,
            '5m_1h': 12,
            '5m_4h': 48
        };

        const key = `${sourceTimeframe}_${targetTimeframe}`;
        const ratio = ratios[key];

        if (!ratio || ratio <= 1) return candles;

        const converted = [];
        for (let i = 0; i < candles.length; i += ratio) {
            const group = candles.slice(i, i + ratio);
            if (group.length < ratio) break;

            converted.push({
                time: group[0].time,
                open: group[0].open,
                high: Math.max(...group.map(c => c.high)),
                low: Math.min(...group.map(c => c.low)),
                close: group[group.length - 1].close,
                volume: group.reduce((sum, c) => sum + (c.volume || 0), 0)
            });
        }

        return converted;
    }

    /**
     * Analyse un timeframe spécifique
     * @param {Array} candles - Bougies
     * @param {string} timeframe - Timeframe
     * @returns {Object} Analyse du timeframe
     */
    analyzeTimeframe(candles, timeframe) {
        if (!candles || candles.length < 30) {
            return { timeframe, valid: false };
        }

        // Indicateurs techniques
        const technicalAnalysis = indicators.analyzeAll(candles);

        // Ichimoku - utilise calculateIchimoku et calculateIchimokuScore
        const ichimokuData = ichimoku.calculateIchimoku(candles);
        const ichimokuScore = ichimokuData ? ichimoku.calculateIchimokuScore(ichimokuData) : null;

        // Patterns
        const patternAnalysis = patternDetector.detectAll(candles);

        // Score combiné
        let score = 0;
        let signals = [];

        // Contribution des indicateurs techniques
        if (technicalAnalysis) {
            score += technicalAnalysis.score * 0.4;
            signals.push(...technicalAnalysis.signals);
        }

        // Contribution Ichimoku
        if (ichimokuScore) {
            const ichimokuContrib = ichimokuScore.direction === 'bullish' ? ichimokuScore.score * 5 : 
                                    ichimokuScore.direction === 'bearish' ? -ichimokuScore.score * 5 : 0;
            score += ichimokuContrib * 0.4;
            if (ichimokuScore.direction !== 'neutral') {
                signals.push(`Ichimoku ${ichimokuScore.direction.toUpperCase()} (${ichimokuScore.score}/${ichimokuScore.maxScore})`);
            }
        }

        // Contribution des patterns
        if (patternAnalysis && patternAnalysis.patterns.length > 0) {
            const patternScore = patternAnalysis.dominantSignal === 'bullish' ? 20 :
                                patternAnalysis.dominantSignal === 'bearish' ? -20 : 0;
            score += patternScore * 0.2;
            for (const pattern of patternAnalysis.patterns) {
                signals.push(pattern.description);
            }
        }

        // Détermine la direction
        let direction = 'neutral';
        if (score >= 25) direction = 'strong_buy';
        else if (score >= 10) direction = 'buy';
        else if (score <= -25) direction = 'strong_sell';
        else if (score <= -10) direction = 'sell';

        return {
            timeframe,
            valid: true,
            score: parseFloat(score.toFixed(2)),
            direction,
            signals,
            technical: technicalAnalysis,
            ichimoku: ichimokuData,
            ichimokuScore: ichimokuScore,
            patterns: patternAnalysis,
            timestamp: Date.now()
        };
    }

    /**
     * Analyse multi-timeframe complète
     * @param {Array} candles15m - Bougies 15 minutes
     * @param {string} symbol - Symbole
     * @returns {Object} Analyse MTF complète
     */
    analyze(candles15m, symbol) {
        // Vérifie le cache
        const cacheKey = `${symbol}_mtf`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
            return cached.data;
        }

        const analyses = {};

        // Analyse 15m (données brutes)
        analyses['15m'] = this.analyzeTimeframe(candles15m, '15m');

        // Convertit et analyse 1h
        const candles1h = this.convertTimeframe(candles15m, '15m', '1h');
        analyses['1h'] = this.analyzeTimeframe(candles1h, '1h');

        // Convertit et analyse 4h
        const candles4h = this.convertTimeframe(candles15m, '15m', '4h');
        analyses['4h'] = this.analyzeTimeframe(candles4h, '4h');

        // Calcule le score pondéré
        let weightedScore = 0;
        let totalWeight = 0;
        let confirmations = { buy: 0, sell: 0, neutral: 0 };

        for (const [tf, analysis] of Object.entries(analyses)) {
            if (!analysis.valid) continue;

            const weight = this.config.weights[tf] || 0.33;
            weightedScore += analysis.score * weight;
            totalWeight += weight;

            // Compte les confirmations
            if (analysis.direction.includes('buy')) confirmations.buy++;
            else if (analysis.direction.includes('sell')) confirmations.sell++;
            else confirmations.neutral++;
        }

        if (totalWeight > 0) {
            weightedScore /= totalWeight;
        }

        // Détermine le signal final
        let finalSignal = 'NEUTRAL';
        let confidence = 0;
        let aligned = false;

        if (confirmations.buy >= this.config.minConfirmation) {
            finalSignal = weightedScore >= 20 ? 'STRONG_BUY' : 'BUY';
            confidence = (confirmations.buy / 3) * 100;
            aligned = confirmations.buy === 3;
        } else if (confirmations.sell >= this.config.minConfirmation) {
            finalSignal = weightedScore <= -20 ? 'STRONG_SELL' : 'SELL';
            confidence = (confirmations.sell / 3) * 100;
            aligned = confirmations.sell === 3;
        } else {
            confidence = 30;
        }

        // Bonus si tous les timeframes sont alignés
        if (aligned) {
            confidence = Math.min(100, confidence + 20);
        }

        const result = {
            symbol,
            signal: finalSignal,
            score: parseFloat(weightedScore.toFixed(2)),
            confidence: parseFloat(confidence.toFixed(0)),
            aligned,
            confirmations,
            analyses,
            recommendation: this.getRecommendation(finalSignal, confidence, aligned),
            timestamp: Date.now()
        };

        // Met en cache
        this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

        return result;
    }

    /**
     * Génère une recommandation basée sur l'analyse
     * @param {string} signal 
     * @param {number} confidence 
     * @param {boolean} aligned 
     * @returns {Object} Recommandation
     */
    getRecommendation(signal, confidence, aligned) {
        if (signal === 'NEUTRAL') {
            return {
                action: 'WAIT',
                reason: 'Pas de consensus entre les timeframes',
                riskLevel: 'low'
            };
        }

        if (confidence < 50) {
            return {
                action: 'WAIT',
                reason: 'Confiance insuffisante',
                riskLevel: 'medium'
            };
        }

        const isBuy = signal.includes('BUY');
        const isStrong = signal.includes('STRONG');

        if (aligned && isStrong) {
            return {
                action: isBuy ? 'BUY' : 'SELL',
                reason: 'Tous les timeframes alignés avec signal fort',
                riskLevel: 'low',
                positionSize: 'full' // 100% de la taille normale
            };
        }

        if (aligned) {
            return {
                action: isBuy ? 'BUY' : 'SELL',
                reason: 'Tous les timeframes alignés',
                riskLevel: 'low',
                positionSize: 'normal' // 100% de la taille normale
            };
        }

        if (isStrong) {
            return {
                action: isBuy ? 'BUY' : 'SELL',
                reason: 'Signal fort mais timeframes non alignés',
                riskLevel: 'medium',
                positionSize: 'reduced' // 75% de la taille normale
            };
        }

        return {
            action: isBuy ? 'BUY' : 'SELL',
            reason: 'Signal modéré',
            riskLevel: 'medium',
            positionSize: 'reduced' // 50% de la taille normale
        };
    }

    /**
     * Vérifie si un signal est confirmé par les timeframes supérieurs
     * @param {string} signal15m - Signal 15m (BUY/SELL)
     * @param {Array} candles15m - Bougies 15m
     * @param {string} symbol - Symbole
     * @returns {Object} Confirmation
     */
    confirmSignal(signal15m, candles15m, symbol) {
        const mtfAnalysis = this.analyze(candles15m, symbol);

        const signalDirection = signal15m.toUpperCase().includes('BUY') ? 'buy' : 
                               signal15m.toUpperCase().includes('SELL') ? 'sell' : 'neutral';

        // Vérifie si le signal 15m est confirmé
        let confirmed = false;
        let confirmationLevel = 0;

        if (signalDirection === 'buy') {
            confirmed = mtfAnalysis.signal.includes('BUY');
            confirmationLevel = mtfAnalysis.confirmations.buy;
        } else if (signalDirection === 'sell') {
            confirmed = mtfAnalysis.signal.includes('SELL');
            confirmationLevel = mtfAnalysis.confirmations.sell;
        }

        return {
            confirmed,
            confirmationLevel,
            mtfSignal: mtfAnalysis.signal,
            confidence: mtfAnalysis.confidence,
            aligned: mtfAnalysis.aligned,
            recommendation: mtfAnalysis.recommendation,
            details: {
                '15m': mtfAnalysis.analyses['15m']?.direction,
                '1h': mtfAnalysis.analyses['1h']?.direction,
                '4h': mtfAnalysis.analyses['4h']?.direction
            }
        };
    }

    /**
     * Nettoie le cache
     */
    clearCache() {
        this.cache.clear();
    }
}

export default new MultiTimeframeAnalyzer();
