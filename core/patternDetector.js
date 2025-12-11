/**
 * Module de Détection de Patterns Chartistes
 * Double Top/Bottom, Head & Shoulders, Triangles, etc.
 */

class PatternDetector {
    constructor() {
        this.config = {
            // Tolérance pour la détection (en %)
            tolerance: 2,
            // Nombre minimum de bougies pour un pattern
            minCandles: 20,
            // Lookback pour trouver les pivots
            pivotLookback: 5
        };
    }

    /**
     * Trouve les points pivots (hauts et bas locaux)
     * @param {Array} candles - Bougies OHLCV
     * @param {number} lookback - Nombre de bougies à regarder de chaque côté
     * @returns {Object} Pivots hauts et bas
     */
    findPivots(candles, lookback = this.config.pivotLookback) {
        const pivotHighs = [];
        const pivotLows = [];

        for (let i = lookback; i < candles.length - lookback; i++) {
            let isHigh = true;
            let isLow = true;

            for (let j = 1; j <= lookback; j++) {
                if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
                    isHigh = false;
                }
                if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
                    isLow = false;
                }
            }

            if (isHigh) {
                pivotHighs.push({ index: i, price: candles[i].high, time: candles[i].time });
            }
            if (isLow) {
                pivotLows.push({ index: i, price: candles[i].low, time: candles[i].time });
            }
        }

        return { pivotHighs, pivotLows };
    }

    /**
     * Vérifie si deux prix sont proches (dans la tolérance)
     * @param {number} price1 
     * @param {number} price2 
     * @param {number} tolerance - Tolérance en %
     * @returns {boolean}
     */
    pricesAreClose(price1, price2, tolerance = this.config.tolerance) {
        const diff = Math.abs(price1 - price2) / Math.max(price1, price2) * 100;
        return diff <= tolerance;
    }

    /**
     * Détecte un Double Top (pattern baissier)
     * @param {Array} candles - Bougies OHLCV
     * @returns {Object|null} Pattern détecté ou null
     */
    detectDoubleTop(candles) {
        const { pivotHighs, pivotLows } = this.findPivots(candles);

        if (pivotHighs.length < 2 || pivotLows.length < 1) return null;

        // Cherche deux sommets proches avec un creux entre
        for (let i = pivotHighs.length - 1; i >= 1; i--) {
            const top2 = pivotHighs[i];
            const top1 = pivotHighs[i - 1];

            // Les deux sommets doivent être proches en prix
            if (!this.pricesAreClose(top1.price, top2.price, 3)) continue;

            // Cherche un creux entre les deux sommets
            const valleyBetween = pivotLows.find(
                low => low.index > top1.index && low.index < top2.index
            );

            if (!valleyBetween) continue;

            // Le creux doit être significativement plus bas
            const neckline = valleyBetween.price;
            const avgTop = (top1.price + top2.price) / 2;
            const depth = (avgTop - neckline) / avgTop * 100;

            if (depth < 2) continue; // Pattern trop faible

            // Vérifie si le prix actuel casse la neckline
            const currentPrice = candles[candles.length - 1].close;
            const breakdown = currentPrice < neckline;

            return {
                type: 'double_top',
                signal: 'bearish',
                top1: top1.price,
                top2: top2.price,
                neckline,
                depth: parseFloat(depth.toFixed(2)),
                target: neckline - (avgTop - neckline), // Target = neckline - hauteur du pattern
                breakdown,
                confidence: breakdown ? 85 : 60,
                description: `Double Top @ ${avgTop.toFixed(4)}, neckline @ ${neckline.toFixed(4)}`
            };
        }

        return null;
    }

    /**
     * Détecte un Double Bottom (pattern haussier)
     * @param {Array} candles - Bougies OHLCV
     * @returns {Object|null} Pattern détecté ou null
     */
    detectDoubleBottom(candles) {
        const { pivotHighs, pivotLows } = this.findPivots(candles);

        if (pivotLows.length < 2 || pivotHighs.length < 1) return null;

        // Cherche deux creux proches avec un sommet entre
        for (let i = pivotLows.length - 1; i >= 1; i--) {
            const bottom2 = pivotLows[i];
            const bottom1 = pivotLows[i - 1];

            // Les deux creux doivent être proches en prix
            if (!this.pricesAreClose(bottom1.price, bottom2.price, 3)) continue;

            // Cherche un sommet entre les deux creux
            const peakBetween = pivotHighs.find(
                high => high.index > bottom1.index && high.index < bottom2.index
            );

            if (!peakBetween) continue;

            // Le sommet doit être significativement plus haut
            const neckline = peakBetween.price;
            const avgBottom = (bottom1.price + bottom2.price) / 2;
            const depth = (neckline - avgBottom) / avgBottom * 100;

            if (depth < 2) continue; // Pattern trop faible

            // Vérifie si le prix actuel casse la neckline
            const currentPrice = candles[candles.length - 1].close;
            const breakout = currentPrice > neckline;

            return {
                type: 'double_bottom',
                signal: 'bullish',
                bottom1: bottom1.price,
                bottom2: bottom2.price,
                neckline,
                depth: parseFloat(depth.toFixed(2)),
                target: neckline + (neckline - avgBottom), // Target = neckline + hauteur du pattern
                breakout,
                confidence: breakout ? 85 : 60,
                description: `Double Bottom @ ${avgBottom.toFixed(4)}, neckline @ ${neckline.toFixed(4)}`
            };
        }

        return null;
    }

    /**
     * Détecte un Head & Shoulders (pattern baissier)
     * @param {Array} candles - Bougies OHLCV
     * @returns {Object|null} Pattern détecté ou null
     */
    detectHeadAndShoulders(candles) {
        const { pivotHighs, pivotLows } = this.findPivots(candles);

        if (pivotHighs.length < 3 || pivotLows.length < 2) return null;

        // Cherche 3 sommets avec le milieu plus haut (head)
        for (let i = pivotHighs.length - 1; i >= 2; i--) {
            const rightShoulder = pivotHighs[i];
            const head = pivotHighs[i - 1];
            const leftShoulder = pivotHighs[i - 2];

            // La tête doit être plus haute que les épaules
            if (head.price <= leftShoulder.price || head.price <= rightShoulder.price) continue;

            // Les épaules doivent être à peu près au même niveau
            if (!this.pricesAreClose(leftShoulder.price, rightShoulder.price, 5)) continue;

            // Cherche les creux pour la neckline
            const leftValley = pivotLows.find(
                low => low.index > leftShoulder.index && low.index < head.index
            );
            const rightValley = pivotLows.find(
                low => low.index > head.index && low.index < rightShoulder.index
            );

            if (!leftValley || !rightValley) continue;

            // Neckline = moyenne des deux creux
            const neckline = (leftValley.price + rightValley.price) / 2;
            const headHeight = head.price - neckline;

            // Vérifie si le prix actuel casse la neckline
            const currentPrice = candles[candles.length - 1].close;
            const breakdown = currentPrice < neckline;

            return {
                type: 'head_and_shoulders',
                signal: 'bearish',
                leftShoulder: leftShoulder.price,
                head: head.price,
                rightShoulder: rightShoulder.price,
                neckline,
                target: neckline - headHeight,
                breakdown,
                confidence: breakdown ? 90 : 70,
                description: `H&S: Head @ ${head.price.toFixed(4)}, Neckline @ ${neckline.toFixed(4)}`
            };
        }

        return null;
    }

    /**
     * Détecte un Inverse Head & Shoulders (pattern haussier)
     * @param {Array} candles - Bougies OHLCV
     * @returns {Object|null} Pattern détecté ou null
     */
    detectInverseHeadAndShoulders(candles) {
        const { pivotHighs, pivotLows } = this.findPivots(candles);

        if (pivotLows.length < 3 || pivotHighs.length < 2) return null;

        // Cherche 3 creux avec le milieu plus bas (head)
        for (let i = pivotLows.length - 1; i >= 2; i--) {
            const rightShoulder = pivotLows[i];
            const head = pivotLows[i - 1];
            const leftShoulder = pivotLows[i - 2];

            // La tête doit être plus basse que les épaules
            if (head.price >= leftShoulder.price || head.price >= rightShoulder.price) continue;

            // Les épaules doivent être à peu près au même niveau
            if (!this.pricesAreClose(leftShoulder.price, rightShoulder.price, 5)) continue;

            // Cherche les sommets pour la neckline
            const leftPeak = pivotHighs.find(
                high => high.index > leftShoulder.index && high.index < head.index
            );
            const rightPeak = pivotHighs.find(
                high => high.index > head.index && high.index < rightShoulder.index
            );

            if (!leftPeak || !rightPeak) continue;

            // Neckline = moyenne des deux sommets
            const neckline = (leftPeak.price + rightPeak.price) / 2;
            const headDepth = neckline - head.price;

            // Vérifie si le prix actuel casse la neckline
            const currentPrice = candles[candles.length - 1].close;
            const breakout = currentPrice > neckline;

            return {
                type: 'inverse_head_and_shoulders',
                signal: 'bullish',
                leftShoulder: leftShoulder.price,
                head: head.price,
                rightShoulder: rightShoulder.price,
                neckline,
                target: neckline + headDepth,
                breakout,
                confidence: breakout ? 90 : 70,
                description: `Inverse H&S: Head @ ${head.price.toFixed(4)}, Neckline @ ${neckline.toFixed(4)}`
            };
        }

        return null;
    }

    /**
     * Détecte un Triangle (symétrique, ascendant ou descendant)
     * @param {Array} candles - Bougies OHLCV
     * @returns {Object|null} Pattern détecté ou null
     */
    detectTriangle(candles) {
        const { pivotHighs, pivotLows } = this.findPivots(candles);

        if (pivotHighs.length < 2 || pivotLows.length < 2) return null;

        // Prend les 4 derniers pivots (2 hauts, 2 bas)
        const recentHighs = pivotHighs.slice(-3);
        const recentLows = pivotLows.slice(-3);

        if (recentHighs.length < 2 || recentLows.length < 2) return null;

        // Calcule les pentes des lignes de tendance
        const highSlope = (recentHighs[recentHighs.length - 1].price - recentHighs[0].price) / 
                          (recentHighs[recentHighs.length - 1].index - recentHighs[0].index);
        const lowSlope = (recentLows[recentLows.length - 1].price - recentLows[0].price) / 
                         (recentLows[recentLows.length - 1].index - recentLows[0].index);

        // Détermine le type de triangle
        let triangleType = null;
        let signal = 'neutral';
        let confidence = 50;

        if (highSlope < -0.0001 && lowSlope > 0.0001) {
            // Triangle symétrique (convergent)
            triangleType = 'symmetrical';
            signal = 'neutral'; // Peut casser dans les deux sens
            confidence = 60;
        } else if (Math.abs(highSlope) < 0.0001 && lowSlope > 0.0001) {
            // Triangle ascendant (résistance horizontale, supports montants)
            triangleType = 'ascending';
            signal = 'bullish';
            confidence = 70;
        } else if (highSlope < -0.0001 && Math.abs(lowSlope) < 0.0001) {
            // Triangle descendant (support horizontal, résistances descendantes)
            triangleType = 'descending';
            signal = 'bearish';
            confidence = 70;
        }

        if (!triangleType) return null;

        // Calcule les niveaux actuels
        const currentIndex = candles.length - 1;
        const resistance = recentHighs[0].price + highSlope * (currentIndex - recentHighs[0].index);
        const support = recentLows[0].price + lowSlope * (currentIndex - recentLows[0].index);
        const currentPrice = candles[candles.length - 1].close;

        // Vérifie si breakout
        const breakoutUp = currentPrice > resistance * 1.01;
        const breakoutDown = currentPrice < support * 0.99;

        if (breakoutUp && (triangleType === 'ascending' || triangleType === 'symmetrical')) {
            confidence = 85;
            signal = 'bullish';
        } else if (breakoutDown && (triangleType === 'descending' || triangleType === 'symmetrical')) {
            confidence = 85;
            signal = 'bearish';
        }

        return {
            type: `triangle_${triangleType}`,
            signal,
            resistance: parseFloat(resistance.toFixed(6)),
            support: parseFloat(support.toFixed(6)),
            apex: parseFloat(((resistance + support) / 2).toFixed(6)),
            breakoutUp,
            breakoutDown,
            confidence,
            description: `${triangleType.charAt(0).toUpperCase() + triangleType.slice(1)} Triangle: R=${resistance.toFixed(4)}, S=${support.toFixed(4)}`
        };
    }

    /**
     * Détecte tous les patterns
     * @param {Array} candles - Bougies OHLCV
     * @returns {Object} Tous les patterns détectés
     */
    detectAll(candles) {
        if (!candles || candles.length < this.config.minCandles) {
            return { patterns: [], dominantSignal: 'neutral', confidence: 0 };
        }

        const patterns = [];

        // Détecte chaque type de pattern
        const doubleTop = this.detectDoubleTop(candles);
        if (doubleTop) patterns.push(doubleTop);

        const doubleBottom = this.detectDoubleBottom(candles);
        if (doubleBottom) patterns.push(doubleBottom);

        const headAndShoulders = this.detectHeadAndShoulders(candles);
        if (headAndShoulders) patterns.push(headAndShoulders);

        const inverseHS = this.detectInverseHeadAndShoulders(candles);
        if (inverseHS) patterns.push(inverseHS);

        const triangle = this.detectTriangle(candles);
        if (triangle) patterns.push(triangle);

        // Détermine le signal dominant
        let bullishScore = 0;
        let bearishScore = 0;
        let maxConfidence = 0;

        for (const pattern of patterns) {
            if (pattern.signal === 'bullish') {
                bullishScore += pattern.confidence;
            } else if (pattern.signal === 'bearish') {
                bearishScore += pattern.confidence;
            }
            maxConfidence = Math.max(maxConfidence, pattern.confidence);
        }

        let dominantSignal = 'neutral';
        if (bullishScore > bearishScore && bullishScore > 50) {
            dominantSignal = 'bullish';
        } else if (bearishScore > bullishScore && bearishScore > 50) {
            dominantSignal = 'bearish';
        }

        return {
            patterns,
            dominantSignal,
            confidence: maxConfidence,
            bullishScore,
            bearishScore
        };
    }
}

export default new PatternDetector();
