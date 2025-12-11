/**
 * Module de calcul Ichimoku Kinko Hyo
 * 
 * L'Ichimoku est un système d'analyse technique complet qui comprend:
 * - Tenkan-sen (ligne de conversion): moyenne des plus hauts/bas sur 9 périodes
 * - Kijun-sen (ligne de base): moyenne des plus hauts/bas sur 26 périodes
 * - Senkou Span A (SSA): moyenne de Tenkan et Kijun, projetée 26 périodes en avant
 * - Senkou Span B (SSB): moyenne des plus hauts/bas sur 52 périodes, projetée 26 périodes en avant
 * - Chikou Span: prix de clôture, décalé 26 périodes en arrière
 * 
 * Le nuage (Kumo) est formé entre SSA et SSB
 */

/**
 * Calcule la moyenne des plus hauts et plus bas sur une période donnée
 * @param {Array<{high: number, low: number}>} candles 
 * @param {number} period 
 * @returns {number|null}
 */
function calculateMidpoint(candles, period) {
    if (candles.length < period) return null;
    
    const slice = candles.slice(-period);
    const highestHigh = Math.max(...slice.map(c => c.high));
    const lowestLow = Math.min(...slice.map(c => c.low));
    
    return (highestHigh + lowestLow) / 2;
}

/**
 * Calcule tous les composants Ichimoku pour un ensemble de candles
 * @param {Array<Object>} candles - Tableau de candles {timestamp, open, high, low, close, volume}
 * @param {Object} params - Paramètres personnalisés
 * @param {number} params.tenkanPeriod - Période Tenkan (défaut: 9)
 * @param {number} params.kijunPeriod - Période Kijun (défaut: 26)
 * @param {number} params.senkouPeriod - Période Senkou B (défaut: 52)
 * @param {number} params.displacement - Décalage du nuage (défaut: 26)
 * @returns {Object} Tous les composants Ichimoku
 */
export function calculateIchimoku(candles, params = {}) {
    const {
        tenkanPeriod = 9,
        kijunPeriod = 26,
        senkouPeriod = 52,
        displacement = 26
    } = params;

    if (candles.length < senkouPeriod + displacement) {
        console.warn('[ICHIMOKU] Pas assez de données pour un calcul complet');
        return null;
    }

    const results = {
        tenkan: [],
        kijun: [],
        senkouA: [],
        senkouB: [],
        chikou: [],
        kumo: []
    };

    // Calcul pour chaque candle
    for (let i = 0; i < candles.length; i++) {
        const candlesUpToNow = candles.slice(0, i + 1);
        
        // Tenkan-sen (9 périodes)
        const tenkan = calculateMidpoint(candlesUpToNow, tenkanPeriod);
        
        // Kijun-sen (26 périodes)
        const kijun = calculateMidpoint(candlesUpToNow, kijunPeriod);
        
        // Senkou Span B (52 périodes)
        const senkouB = calculateMidpoint(candlesUpToNow, senkouPeriod);

        results.tenkan.push(tenkan);
        results.kijun.push(kijun);
        results.senkouB.push(senkouB);

        // Senkou Span A = (Tenkan + Kijun) / 2
        if (tenkan !== null && kijun !== null) {
            results.senkouA.push((tenkan + kijun) / 2);
        } else {
            results.senkouA.push(null);
        }

        // Chikou Span = prix de clôture actuel (sera affiché 26 périodes en arrière)
        results.chikou.push(candles[i].close);
    }

    // Le nuage actuel est SSA et SSB décalés de 26 périodes
    // Pour le nuage futur (projeté), on utilise les valeurs actuelles
    const currentIndex = candles.length - 1;
    
    // Valeurs actuelles (pour le prix actuel)
    const current = {
        timestamp: candles[currentIndex].timestamp,
        price: candles[currentIndex].close,
        tenkan: results.tenkan[currentIndex],
        kijun: results.kijun[currentIndex],
        // Le nuage actuel = SSA et SSB calculés il y a 26 périodes
        senkouA: results.senkouA[currentIndex - displacement] || results.senkouA[currentIndex],
        senkouB: results.senkouB[currentIndex - displacement] || results.senkouB[currentIndex],
        // Chikou = prix actuel, comparé aux données de 26 périodes en arrière
        chikou: results.chikou[currentIndex],
        chikouReference: candles[currentIndex - displacement]?.close || null
    };

    // Nuage futur (projeté 26 périodes en avant)
    const futureKumo = {
        senkouA: results.senkouA[currentIndex],
        senkouB: results.senkouB[currentIndex]
    };

    // Détermine la couleur du nuage actuel
    current.kumoColor = current.senkouA > current.senkouB ? 'green' : 'red';
    current.kumoTop = Math.max(current.senkouA, current.senkouB);
    current.kumoBottom = Math.min(current.senkouA, current.senkouB);
    current.kumoThickness = current.kumoTop - current.kumoBottom;

    // Position du prix par rapport au nuage
    if (current.price > current.kumoTop) {
        current.pricePosition = 'above';
    } else if (current.price < current.kumoBottom) {
        current.pricePosition = 'below';
    } else {
        current.pricePosition = 'inside';
    }

    return {
        current,
        futureKumo,
        history: {
            tenkan: results.tenkan.slice(-50),
            kijun: results.kijun.slice(-50),
            senkouA: results.senkouA.slice(-50),
            senkouB: results.senkouB.slice(-50),
            chikou: results.chikou.slice(-50)
        },
        params: { tenkanPeriod, kijunPeriod, senkouPeriod, displacement }
    };
}

/**
 * Détecte un croisement Tenkan/Kijun (TK Cross)
 * @param {Array<number>} tenkanHistory 
 * @param {Array<number>} kijunHistory 
 * @returns {Object} {signal: 'bullish'|'bearish'|null, strength: number}
 */
export function detectTKCross(tenkanHistory, kijunHistory) {
    if (tenkanHistory.length < 2 || kijunHistory.length < 2) {
        return { signal: null, strength: 0 };
    }

    const len = tenkanHistory.length;
    const currentTenkan = tenkanHistory[len - 1];
    const currentKijun = kijunHistory[len - 1];
    const prevTenkan = tenkanHistory[len - 2];
    const prevKijun = kijunHistory[len - 2];

    if (currentTenkan === null || currentKijun === null || 
        prevTenkan === null || prevKijun === null) {
        return { signal: null, strength: 0 };
    }

    // Croisement haussier: Tenkan passe au-dessus de Kijun
    if (prevTenkan <= prevKijun && currentTenkan > currentKijun) {
        const strength = Math.abs(currentTenkan - currentKijun) / currentKijun * 100;
        return { signal: 'bullish', strength, type: 'tk_cross' };
    }

    // Croisement baissier: Tenkan passe en-dessous de Kijun
    if (prevTenkan >= prevKijun && currentTenkan < currentKijun) {
        const strength = Math.abs(currentTenkan - currentKijun) / currentKijun * 100;
        return { signal: 'bearish', strength, type: 'tk_cross' };
    }

    return { signal: null, strength: 0 };
}

/**
 * Détecte un breakout du Kumo (cassure du nuage)
 * @param {Array<Object>} candles 
 * @param {Object} ichimokuData 
 * @returns {Object}
 */
export function detectKumoBreakout(candles, ichimokuData) {
    if (!ichimokuData || candles.length < 2) {
        return { signal: null, strength: 0 };
    }

    const current = ichimokuData.current;
    const prevCandle = candles[candles.length - 2];
    const currentCandle = candles[candles.length - 1];

    // Récupère le nuage pour la période précédente
    const prevSenkouA = ichimokuData.history.senkouA[ichimokuData.history.senkouA.length - 2];
    const prevSenkouB = ichimokuData.history.senkouB[ichimokuData.history.senkouB.length - 2];
    const prevKumoTop = Math.max(prevSenkouA, prevSenkouB);
    const prevKumoBottom = Math.min(prevSenkouA, prevSenkouB);

    // Breakout haussier: le prix était dans ou sous le nuage et sort par le haut
    if (prevCandle.close <= prevKumoTop && currentCandle.close > current.kumoTop) {
        const strength = (currentCandle.close - current.kumoTop) / current.kumoTop * 100;
        return { signal: 'bullish', strength, type: 'kumo_breakout' };
    }

    // Breakout baissier: le prix était dans ou au-dessus du nuage et sort par le bas
    if (prevCandle.close >= prevKumoBottom && currentCandle.close < current.kumoBottom) {
        const strength = (current.kumoBottom - currentCandle.close) / current.kumoBottom * 100;
        return { signal: 'bearish', strength, type: 'kumo_breakout' };
    }

    return { signal: null, strength: 0 };
}

/**
 * Détecte un Kumo Twist (changement de couleur du nuage)
 * @param {Object} ichimokuData 
 * @returns {Object}
 */
export function detectKumoTwist(ichimokuData) {
    if (!ichimokuData) {
        return { signal: null, strength: 0 };
    }

    const { senkouA, senkouB } = ichimokuData.history;
    const len = senkouA.length;

    if (len < 2) {
        return { signal: null, strength: 0 };
    }

    const currentSSA = senkouA[len - 1];
    const currentSSB = senkouB[len - 1];
    const prevSSA = senkouA[len - 2];
    const prevSSB = senkouB[len - 2];

    if (currentSSA === null || currentSSB === null || 
        prevSSA === null || prevSSB === null) {
        return { signal: null, strength: 0 };
    }

    // Twist haussier: SSA passe au-dessus de SSB (nuage devient vert)
    if (prevSSA <= prevSSB && currentSSA > currentSSB) {
        const strength = Math.abs(currentSSA - currentSSB) / currentSSB * 100;
        return { signal: 'bullish', strength, type: 'kumo_twist' };
    }

    // Twist baissier: SSA passe en-dessous de SSB (nuage devient rouge)
    if (prevSSA >= prevSSB && currentSSA < currentSSB) {
        const strength = Math.abs(currentSSA - currentSSB) / currentSSB * 100;
        return { signal: 'bearish', strength, type: 'kumo_twist' };
    }

    return { signal: null, strength: 0 };
}

/**
 * Détecte un rebond sur Kijun-sen
 * @param {Array<Object>} candles 
 * @param {Array<number>} kijunHistory 
 * @param {number} tolerance - Tolérance en % pour considérer un "toucher"
 * @returns {Object}
 */
export function detectKijunBounce(candles, kijunHistory, tolerance = 0.5) {
    if (candles.length < 3 || kijunHistory.length < 3) {
        return { signal: null, strength: 0 };
    }

    const len = candles.length;
    const currentCandle = candles[len - 1];
    const prevCandle = candles[len - 2];
    const prevPrevCandle = candles[len - 3];

    const currentKijun = kijunHistory[kijunHistory.length - 1];
    const prevKijun = kijunHistory[kijunHistory.length - 2];

    if (currentKijun === null || prevKijun === null) {
        return { signal: null, strength: 0 };
    }

    const toleranceValue = currentKijun * (tolerance / 100);

    // Rebond haussier: 
    // 1. Le prix précédent a touché/approché la Kijun par le haut
    // 2. Le prix actuel rebondit vers le haut
    const prevTouchedKijun = Math.abs(prevCandle.low - prevKijun) <= toleranceValue;
    const priceWasAbove = prevPrevCandle.close > prevKijun;
    const bouncedUp = currentCandle.close > prevCandle.close && currentCandle.close > currentKijun;

    if (prevTouchedKijun && priceWasAbove && bouncedUp) {
        const strength = (currentCandle.close - currentKijun) / currentKijun * 100;
        return { signal: 'bullish', strength, type: 'kijun_bounce' };
    }

    // Rebond baissier:
    // 1. Le prix précédent a touché/approché la Kijun par le bas
    // 2. Le prix actuel rebondit vers le bas
    const prevTouchedKijunFromBelow = Math.abs(prevCandle.high - prevKijun) <= toleranceValue;
    const priceWasBelow = prevPrevCandle.close < prevKijun;
    const bouncedDown = currentCandle.close < prevCandle.close && currentCandle.close < currentKijun;

    if (prevTouchedKijunFromBelow && priceWasBelow && bouncedDown) {
        const strength = (currentKijun - currentCandle.close) / currentKijun * 100;
        return { signal: 'bearish', strength, type: 'kijun_bounce' };
    }

    return { signal: null, strength: 0 };
}

/**
 * Vérifie la confirmation Chikou Span
 * Le signal est confirmé si Chikou est au-dessus/en-dessous du prix de 26 périodes
 * @param {Object} ichimokuData 
 * @returns {Object}
 */
export function checkChikouConfirmation(ichimokuData) {
    if (!ichimokuData || !ichimokuData.current.chikouReference) {
        return { confirmed: false, direction: null };
    }

    const { chikou, chikouReference } = ichimokuData.current;

    if (chikou > chikouReference) {
        return { confirmed: true, direction: 'bullish' };
    } else if (chikou < chikouReference) {
        return { confirmed: true, direction: 'bearish' };
    }

    return { confirmed: false, direction: null };
}

/**
 * Calcule le score global Ichimoku (force du signal)
 * @param {Object} ichimokuData 
 * @param {Array<Object>} candles 
 * @returns {Object}
 */
export function calculateIchimokuScore(ichimokuData, candles) {
    if (!ichimokuData) {
        return { score: 0, signals: [], direction: null };
    }

    let bullishScore = 0;
    let bearishScore = 0;
    const signals = [];

    const { current } = ichimokuData;

    // 1. Position du prix par rapport au nuage (+2/-2)
    if (current.pricePosition === 'above') {
        bullishScore += 2;
        signals.push({ name: 'Prix au-dessus du Kumo', weight: 2, direction: 'bullish' });
    } else if (current.pricePosition === 'below') {
        bearishScore += 2;
        signals.push({ name: 'Prix en-dessous du Kumo', weight: 2, direction: 'bearish' });
    }

    // 2. Position Tenkan vs Kijun (+1/-1)
    if (current.tenkan > current.kijun) {
        bullishScore += 1;
        signals.push({ name: 'Tenkan > Kijun', weight: 1, direction: 'bullish' });
    } else if (current.tenkan < current.kijun) {
        bearishScore += 1;
        signals.push({ name: 'Tenkan < Kijun', weight: 1, direction: 'bearish' });
    }

    // 3. Couleur du nuage (+1/-1)
    if (current.kumoColor === 'green') {
        bullishScore += 1;
        signals.push({ name: 'Kumo vert (haussier)', weight: 1, direction: 'bullish' });
    } else {
        bearishScore += 1;
        signals.push({ name: 'Kumo rouge (baissier)', weight: 1, direction: 'bearish' });
    }

    // 4. Confirmation Chikou (+2/-2)
    const chikouConf = checkChikouConfirmation(ichimokuData);
    if (chikouConf.confirmed) {
        if (chikouConf.direction === 'bullish') {
            bullishScore += 2;
            signals.push({ name: 'Chikou confirme haussier', weight: 2, direction: 'bullish' });
        } else {
            bearishScore += 2;
            signals.push({ name: 'Chikou confirme baissier', weight: 2, direction: 'bearish' });
        }
    }

    // 5. Prix par rapport à Kijun (+1/-1)
    if (current.price > current.kijun) {
        bullishScore += 1;
        signals.push({ name: 'Prix > Kijun', weight: 1, direction: 'bullish' });
    } else if (current.price < current.kijun) {
        bearishScore += 1;
        signals.push({ name: 'Prix < Kijun', weight: 1, direction: 'bearish' });
    }

    // Score final (-7 à +7)
    const score = bullishScore - bearishScore;
    const maxScore = 7;
    const normalizedScore = score / maxScore; // -1 à +1

    let direction = null;
    if (score >= 3) direction = 'bullish';
    else if (score <= -3) direction = 'bearish';

    return {
        score,
        normalizedScore,
        maxScore,
        direction,
        bullishScore,
        bearishScore,
        signals
    };
}

/**
 * Calcule les niveaux de support/résistance basés sur Ichimoku
 * @param {Object} ichimokuData 
 * @returns {Object}
 */
export function getIchimokuLevels(ichimokuData) {
    if (!ichimokuData) return null;

    const { current, futureKumo } = ichimokuData;
    
    // Ajoute currentPrice pour référence
    const currentPrice = current.price;
    
    return {
        currentPrice,
        supports: [
            { level: current.kumoBottom, type: 'kumo_bottom', name: 'Kumo Bottom', strength: 'strong' },
            { level: current.kijun, type: 'kijun', name: 'Kijun-sen', strength: 'medium' },
            { level: current.tenkan, type: 'tenkan', name: 'Tenkan-sen', strength: 'weak' }
        ].filter(s => s.level && s.level < currentPrice).sort((a, b) => b.level - a.level),
        
        resistances: [
            { level: current.kumoTop, type: 'kumo_top', name: 'Kumo Top', strength: 'strong' },
            { level: current.kijun, type: 'kijun', name: 'Kijun-sen', strength: 'medium' },
            { level: current.tenkan, type: 'tenkan', name: 'Tenkan-sen', strength: 'weak' }
        ].filter(r => r.level && r.level > currentPrice).sort((a, b) => a.level - b.level),

        futureKumo: futureKumo ? {
            top: Math.max(futureKumo.senkouA, futureKumo.senkouB),
            bottom: Math.min(futureKumo.senkouA, futureKumo.senkouB)
        } : null
    };
}

export default {
    calculateIchimoku,
    detectTKCross,
    detectKumoBreakout,
    detectKumoTwist,
    detectKijunBounce,
    checkChikouConfirmation,
    calculateIchimokuScore,
    getIchimokuLevels
};
