/**
 * Smart Money Concepts (SMC) Module
 * 
 * Implémente les concepts de trading institutionnel:
 * - Order Blocks (OB) - Zones d'accumulation/distribution institutionnelle
 * - Fair Value Gaps (FVG) - Déséquilibres de prix à combler
 * - Break of Structure (BOS) - Changements de tendance confirmés
 * - Change of Character (CHoCH) - Premiers signes de retournement
 * - Liquidity Sweeps - Chasse aux stops avant retournement
 * - Premium/Discount Zones - Zones optimales d'entrée
 */

class SmartMoney {
    constructor() {
        this.config = {
            // Order Blocks
            obLookback: 50,           // Nombre de candles pour chercher les OB
            obMinSize: 0.3,           // Taille minimum de l'OB en % du prix
            obMaxAge: 100,            // Age maximum d'un OB valide (en candles)
            
            // Fair Value Gaps
            fvgMinSize: 0.1,          // Taille minimum du FVG en %
            fvgMaxAge: 50,            // Age maximum d'un FVG non comblé
            
            // Structure
            swingLookback: 5,         // Candles pour identifier swing high/low
            bosConfirmation: 2,       // Candles de confirmation après BOS
            
            // Liquidity
            liquidityThreshold: 0.5,  // Distance en % pour considérer un sweep
            
            // Sessions (UTC)
            sessions: {
                london: { start: 7, end: 16 },
                newYork: { start: 13, end: 22 },
                asia: { start: 0, end: 9 }
            }
        };
    }

    /**
     * Analyse complète SMC
     */
    analyze(candles, options = {}) {
        if (!candles || candles.length < 100) {
            return null;
        }

        const config = { ...this.config, ...options };
        
        // 1. Identifier la structure du marché
        const swings = this.identifySwings(candles, config.swingLookback);
        const structure = this.analyzeMarketStructure(candles, swings);
        
        // 2. Détecter les Order Blocks
        const orderBlocks = this.detectOrderBlocks(candles, swings, config);
        
        // 3. Détecter les Fair Value Gaps
        const fvgs = this.detectFVGs(candles, config);
        
        // 4. Détecter Break of Structure
        const bos = this.detectBOS(candles, swings, structure);
        
        // 5. Détecter les Liquidity Sweeps
        const liquiditySweeps = this.detectLiquiditySweeps(candles, swings, config);
        
        // 6. Calculer les zones Premium/Discount
        const premiumDiscount = this.calculatePremiumDiscount(candles, swings);
        
        // 7. Identifier la session actuelle
        const currentSession = this.getCurrentSession(candles[candles.length - 1].timestamp);
        
        // 8. Générer le signal SMC
        const signal = this.generateSignal(candles, {
            swings,
            structure,
            orderBlocks,
            fvgs,
            bos,
            liquiditySweeps,
            premiumDiscount,
            currentSession
        });

        return {
            swings,
            structure,
            orderBlocks,
            fvgs,
            bos,
            liquiditySweeps,
            premiumDiscount,
            currentSession,
            signal
        };
    }

    /**
     * Identifie les Swing Highs et Swing Lows
     */
    identifySwings(candles, lookback = 5) {
        const swingHighs = [];
        const swingLows = [];

        for (let i = lookback; i < candles.length - lookback; i++) {
            const current = candles[i];
            let isSwingHigh = true;
            let isSwingLow = true;

            // Vérifie si c'est un swing high
            for (let j = i - lookback; j <= i + lookback; j++) {
                if (j !== i) {
                    if (candles[j].high >= current.high) {
                        isSwingHigh = false;
                    }
                    if (candles[j].low <= current.low) {
                        isSwingLow = false;
                    }
                }
            }

            if (isSwingHigh) {
                swingHighs.push({
                    index: i,
                    price: current.high,
                    timestamp: current.timestamp,
                    broken: false
                });
            }

            if (isSwingLow) {
                swingLows.push({
                    index: i,
                    price: current.low,
                    timestamp: current.timestamp,
                    broken: false
                });
            }
        }

        return { highs: swingHighs, lows: swingLows };
    }

    /**
     * Analyse la structure du marché (tendance)
     */
    analyzeMarketStructure(candles, swings) {
        const { highs, lows } = swings;
        
        if (highs.length < 2 || lows.length < 2) {
            return { trend: 'neutral', strength: 0 };
        }

        // Analyse des 4 derniers swings
        const recentHighs = highs.slice(-4);
        const recentLows = lows.slice(-4);

        let higherHighs = 0;
        let lowerHighs = 0;
        let higherLows = 0;
        let lowerLows = 0;

        // Compare les highs consécutifs
        for (let i = 1; i < recentHighs.length; i++) {
            if (recentHighs[i].price > recentHighs[i - 1].price) {
                higherHighs++;
            } else {
                lowerHighs++;
            }
        }

        // Compare les lows consécutifs
        for (let i = 1; i < recentLows.length; i++) {
            if (recentLows[i].price > recentLows[i - 1].price) {
                higherLows++;
            } else {
                lowerLows++;
            }
        }

        // Détermine la tendance
        let trend = 'neutral';
        let strength = 0;

        if (higherHighs >= 2 && higherLows >= 2) {
            trend = 'bullish';
            strength = (higherHighs + higherLows) / 6;
        } else if (lowerHighs >= 2 && lowerLows >= 2) {
            trend = 'bearish';
            strength = (lowerHighs + lowerLows) / 6;
        }

        // Dernier swing pour la direction immédiate
        const lastHigh = highs[highs.length - 1];
        const lastLow = lows[lows.length - 1];
        const lastSwing = lastHigh.index > lastLow.index ? 'high' : 'low';

        return {
            trend,
            strength: Math.min(strength, 1),
            higherHighs,
            lowerHighs,
            higherLows,
            lowerLows,
            lastSwing,
            lastSwingHigh: lastHigh,
            lastSwingLow: lastLow
        };
    }

    /**
     * Détecte les Order Blocks
     * Un OB est la dernière bougie opposée avant un mouvement impulsif
     */
    detectOrderBlocks(candles, swings, config) {
        const orderBlocks = [];
        const currentPrice = candles[candles.length - 1].close;
        const { highs, lows } = swings;

        // Cherche les OB bullish (dernière bougie baissière avant mouvement haussier)
        for (let i = 0; i < lows.length; i++) {
            const swingLow = lows[i];
            const swingIndex = swingLow.index;
            
            // Cherche la dernière bougie baissière avant le swing low
            for (let j = swingIndex; j >= Math.max(0, swingIndex - 10); j--) {
                const candle = candles[j];
                if (candle.close < candle.open) { // Bougie baissière
                    // Vérifie qu'il y a eu un mouvement impulsif après
                    const moveAfter = this.calculateMove(candles, j, swingIndex + 10);
                    
                    if (moveAfter > config.obMinSize) {
                        const age = candles.length - 1 - j;
                        if (age <= config.obMaxAge) {
                            // Vérifie si l'OB n'a pas été invalidé (prix n'a pas traversé)
                            const obLow = candle.low;
                            const obHigh = candle.high;
                            let valid = true;
                            
                            for (let k = j + 1; k < candles.length; k++) {
                                if (candles[k].close < obLow) {
                                    valid = false;
                                    break;
                                }
                            }
                            
                            if (valid && currentPrice > obLow) {
                                orderBlocks.push({
                                    type: 'bullish',
                                    high: obHigh,
                                    low: obLow,
                                    index: j,
                                    timestamp: candle.timestamp,
                                    age,
                                    strength: moveAfter,
                                    tested: currentPrice <= obHigh && currentPrice >= obLow
                                });
                            }
                        }
                    }
                    break;
                }
            }
        }

        // Cherche les OB bearish (dernière bougie haussière avant mouvement baissier)
        for (let i = 0; i < highs.length; i++) {
            const swingHigh = highs[i];
            const swingIndex = swingHigh.index;
            
            for (let j = swingIndex; j >= Math.max(0, swingIndex - 10); j--) {
                const candle = candles[j];
                if (candle.close > candle.open) { // Bougie haussière
                    const moveAfter = this.calculateMove(candles, j, swingIndex + 10);
                    
                    if (moveAfter > config.obMinSize) {
                        const age = candles.length - 1 - j;
                        if (age <= config.obMaxAge) {
                            const obLow = candle.low;
                            const obHigh = candle.high;
                            let valid = true;
                            
                            for (let k = j + 1; k < candles.length; k++) {
                                if (candles[k].close > obHigh) {
                                    valid = false;
                                    break;
                                }
                            }
                            
                            if (valid && currentPrice < obHigh) {
                                orderBlocks.push({
                                    type: 'bearish',
                                    high: obHigh,
                                    low: obLow,
                                    index: j,
                                    timestamp: candle.timestamp,
                                    age,
                                    strength: moveAfter,
                                    tested: currentPrice <= obHigh && currentPrice >= obLow
                                });
                            }
                        }
                    }
                    break;
                }
            }
        }

        // Trie par proximité au prix actuel
        orderBlocks.sort((a, b) => {
            const distA = Math.min(Math.abs(currentPrice - a.high), Math.abs(currentPrice - a.low));
            const distB = Math.min(Math.abs(currentPrice - b.high), Math.abs(currentPrice - b.low));
            return distA - distB;
        });

        return orderBlocks.slice(0, 10); // Garde les 10 plus proches
    }

    /**
     * Détecte les Fair Value Gaps (FVG)
     * Un FVG est un gap entre le high de la bougie N-2 et le low de la bougie N
     */
    detectFVGs(candles, config) {
        const fvgs = [];
        const currentPrice = candles[candles.length - 1].close;

        for (let i = 2; i < candles.length; i++) {
            const candle1 = candles[i - 2];
            const candle2 = candles[i - 1];
            const candle3 = candles[i];

            // FVG Bullish: low de candle3 > high de candle1
            if (candle3.low > candle1.high) {
                const gapSize = ((candle3.low - candle1.high) / candle1.high) * 100;
                
                if (gapSize >= config.fvgMinSize) {
                    const age = candles.length - 1 - i;
                    
                    // Vérifie si le FVG a été comblé
                    let filled = false;
                    for (let j = i + 1; j < candles.length; j++) {
                        if (candles[j].low <= candle1.high) {
                            filled = true;
                            break;
                        }
                    }
                    
                    if (!filled && age <= config.fvgMaxAge) {
                        fvgs.push({
                            type: 'bullish',
                            high: candle3.low,
                            low: candle1.high,
                            midpoint: (candle3.low + candle1.high) / 2,
                            index: i,
                            timestamp: candle2.timestamp,
                            age,
                            size: gapSize,
                            filled: false
                        });
                    }
                }
            }

            // FVG Bearish: high de candle3 < low de candle1
            if (candle3.high < candle1.low) {
                const gapSize = ((candle1.low - candle3.high) / candle1.low) * 100;
                
                if (gapSize >= config.fvgMinSize) {
                    const age = candles.length - 1 - i;
                    
                    let filled = false;
                    for (let j = i + 1; j < candles.length; j++) {
                        if (candles[j].high >= candle1.low) {
                            filled = true;
                            break;
                        }
                    }
                    
                    if (!filled && age <= config.fvgMaxAge) {
                        fvgs.push({
                            type: 'bearish',
                            high: candle1.low,
                            low: candle3.high,
                            midpoint: (candle1.low + candle3.high) / 2,
                            index: i,
                            timestamp: candle2.timestamp,
                            age,
                            size: gapSize,
                            filled: false
                        });
                    }
                }
            }
        }

        // Trie par proximité
        fvgs.sort((a, b) => {
            const distA = Math.abs(currentPrice - a.midpoint);
            const distB = Math.abs(currentPrice - b.midpoint);
            return distA - distB;
        });

        return fvgs.slice(0, 10);
    }

    /**
     * Détecte les Break of Structure (BOS) et Change of Character (CHoCH)
     */
    detectBOS(candles, swings, structure) {
        const { highs, lows } = swings;
        const currentPrice = candles[candles.length - 1].close;
        const results = [];

        // Vérifie les cassures récentes de swing highs
        for (let i = highs.length - 1; i >= Math.max(0, highs.length - 5); i--) {
            const swingHigh = highs[i];
            
            // Cherche si le prix a cassé ce high
            for (let j = swingHigh.index + 1; j < candles.length; j++) {
                if (candles[j].close > swingHigh.price && !swingHigh.broken) {
                    swingHigh.broken = true;
                    
                    // C'est un BOS bullish ou CHoCH selon la tendance précédente
                    const type = structure.trend === 'bearish' ? 'choch' : 'bos';
                    
                    results.push({
                        type,
                        direction: 'bullish',
                        level: swingHigh.price,
                        breakIndex: j,
                        breakTimestamp: candles[j].timestamp,
                        age: candles.length - 1 - j
                    });
                    break;
                }
            }
        }

        // Vérifie les cassures récentes de swing lows
        for (let i = lows.length - 1; i >= Math.max(0, lows.length - 5); i--) {
            const swingLow = lows[i];
            
            for (let j = swingLow.index + 1; j < candles.length; j++) {
                if (candles[j].close < swingLow.price && !swingLow.broken) {
                    swingLow.broken = true;
                    
                    const type = structure.trend === 'bullish' ? 'choch' : 'bos';
                    
                    results.push({
                        type,
                        direction: 'bearish',
                        level: swingLow.price,
                        breakIndex: j,
                        breakTimestamp: candles[j].timestamp,
                        age: candles.length - 1 - j
                    });
                    break;
                }
            }
        }

        // Trie par récence
        results.sort((a, b) => a.age - b.age);

        return results.slice(0, 5);
    }

    /**
     * Détecte les Liquidity Sweeps (chasse aux stops)
     */
    detectLiquiditySweeps(candles, swings, config) {
        const sweeps = [];
        const { highs, lows } = swings;

        // Cherche les sweeps de highs (prix dépasse puis revient)
        for (let i = 0; i < highs.length; i++) {
            const swingHigh = highs[i];
            
            for (let j = swingHigh.index + 1; j < candles.length - 1; j++) {
                const candle = candles[j];
                const nextCandle = candles[j + 1];
                
                // Le prix a dépassé le high puis est revenu en dessous
                if (candle.high > swingHigh.price && nextCandle.close < swingHigh.price) {
                    const sweepSize = ((candle.high - swingHigh.price) / swingHigh.price) * 100;
                    
                    if (sweepSize <= config.liquidityThreshold) {
                        sweeps.push({
                            type: 'bearish', // Sweep de liquidité = signal bearish
                            level: swingHigh.price,
                            sweepHigh: candle.high,
                            index: j,
                            timestamp: candle.timestamp,
                            age: candles.length - 1 - j,
                            size: sweepSize
                        });
                    }
                    break;
                }
            }
        }

        // Cherche les sweeps de lows
        for (let i = 0; i < lows.length; i++) {
            const swingLow = lows[i];
            
            for (let j = swingLow.index + 1; j < candles.length - 1; j++) {
                const candle = candles[j];
                const nextCandle = candles[j + 1];
                
                if (candle.low < swingLow.price && nextCandle.close > swingLow.price) {
                    const sweepSize = ((swingLow.price - candle.low) / swingLow.price) * 100;
                    
                    if (sweepSize <= config.liquidityThreshold) {
                        sweeps.push({
                            type: 'bullish',
                            level: swingLow.price,
                            sweepLow: candle.low,
                            index: j,
                            timestamp: candle.timestamp,
                            age: candles.length - 1 - j,
                            size: sweepSize
                        });
                    }
                    break;
                }
            }
        }

        // Garde les sweeps récents
        return sweeps.filter(s => s.age <= 20).sort((a, b) => a.age - b.age);
    }

    /**
     * Calcule les zones Premium et Discount
     */
    calculatePremiumDiscount(candles, swings) {
        const { highs, lows } = swings;
        
        if (highs.length === 0 || lows.length === 0) {
            return null;
        }

        // Utilise le dernier swing range significatif
        const recentHighs = highs.slice(-3);
        const recentLows = lows.slice(-3);
        
        const rangeHigh = Math.max(...recentHighs.map(h => h.price));
        const rangeLow = Math.min(...recentLows.map(l => l.price));
        const rangeSize = rangeHigh - rangeLow;
        
        const equilibrium = (rangeHigh + rangeLow) / 2;
        const currentPrice = candles[candles.length - 1].close;

        // Premium = au-dessus de l'équilibre (zone de vente)
        // Discount = en-dessous de l'équilibre (zone d'achat)
        const premiumZone = {
            high: rangeHigh,
            low: equilibrium + (rangeSize * 0.1), // 10% au-dessus de l'équilibre
            type: 'premium'
        };

        const discountZone = {
            high: equilibrium - (rangeSize * 0.1), // 10% en-dessous de l'équilibre
            low: rangeLow,
            type: 'discount'
        };

        let currentZone = 'equilibrium';
        if (currentPrice >= premiumZone.low) {
            currentZone = 'premium';
        } else if (currentPrice <= discountZone.high) {
            currentZone = 'discount';
        }

        return {
            rangeHigh,
            rangeLow,
            equilibrium,
            premiumZone,
            discountZone,
            currentZone,
            currentPrice
        };
    }

    /**
     * Identifie la session de trading actuelle
     */
    getCurrentSession(timestamp) {
        const date = new Date(timestamp);
        const hour = date.getUTCHours();

        const { sessions } = this.config;
        const activeSessions = [];

        if (hour >= sessions.london.start && hour < sessions.london.end) {
            activeSessions.push('london');
        }
        if (hour >= sessions.newYork.start && hour < sessions.newYork.end) {
            activeSessions.push('newYork');
        }
        if (hour >= sessions.asia.start && hour < sessions.asia.end) {
            activeSessions.push('asia');
        }

        // Overlap London-NY est la meilleure période
        const isHighVolume = activeSessions.includes('london') && activeSessions.includes('newYork');

        return {
            activeSessions,
            isHighVolume,
            isTradingSession: activeSessions.includes('london') || activeSessions.includes('newYork'),
            hour
        };
    }

    /**
     * Génère le signal de trading SMC
     */
    generateSignal(candles, analysis) {
        const {
            structure,
            orderBlocks,
            fvgs,
            bos,
            liquiditySweeps,
            premiumDiscount,
            currentSession
        } = analysis;

        const currentPrice = candles[candles.length - 1].close;
        const currentCandle = candles[candles.length - 1];
        
        let direction = null;
        let score = 0;
        let confidence = 0;
        const reasons = [];
        const confluences = [];

        // 1. Structure du marché (+2)
        if (structure.trend === 'bullish' && structure.strength > 0.5) {
            score += 2;
            reasons.push('Structure haussière');
            confluences.push({ name: 'Market Structure', direction: 'bullish', weight: 2 });
        } else if (structure.trend === 'bearish' && structure.strength > 0.5) {
            score -= 2;
            reasons.push('Structure baissière');
            confluences.push({ name: 'Market Structure', direction: 'bearish', weight: 2 });
        }

        // 2. Break of Structure récent (+2)
        const recentBOS = bos.find(b => b.age <= 5);
        if (recentBOS) {
            if (recentBOS.direction === 'bullish') {
                score += 2;
                reasons.push(`BOS/CHoCH bullish (${recentBOS.type})`);
                confluences.push({ name: 'BOS', direction: 'bullish', weight: 2 });
            } else {
                score -= 2;
                reasons.push(`BOS/CHoCH bearish (${recentBOS.type})`);
                confluences.push({ name: 'BOS', direction: 'bearish', weight: 2 });
            }
        }

        // 3. Prix dans un Order Block (+2)
        const activeOB = orderBlocks.find(ob => ob.tested);
        if (activeOB) {
            if (activeOB.type === 'bullish') {
                score += 2;
                reasons.push('Prix dans Order Block bullish');
                confluences.push({ name: 'Order Block', direction: 'bullish', weight: 2 });
            } else {
                score -= 2;
                reasons.push('Prix dans Order Block bearish');
                confluences.push({ name: 'Order Block', direction: 'bearish', weight: 2 });
            }
        }

        // 4. FVG proche (+1)
        const nearestFVG = fvgs[0];
        if (nearestFVG) {
            const distToFVG = Math.abs(currentPrice - nearestFVG.midpoint) / currentPrice * 100;
            if (distToFVG < 0.5) { // Très proche du FVG
                if (nearestFVG.type === 'bullish') {
                    score += 1;
                    reasons.push('Proche FVG bullish');
                    confluences.push({ name: 'FVG', direction: 'bullish', weight: 1 });
                } else {
                    score -= 1;
                    reasons.push('Proche FVG bearish');
                    confluences.push({ name: 'FVG', direction: 'bearish', weight: 1 });
                }
            }
        }

        // 5. Liquidity Sweep récent (+2)
        const recentSweep = liquiditySweeps.find(s => s.age <= 3);
        if (recentSweep) {
            if (recentSweep.type === 'bullish') {
                score += 2;
                reasons.push('Liquidity sweep bullish');
                confluences.push({ name: 'Liquidity Sweep', direction: 'bullish', weight: 2 });
            } else {
                score -= 2;
                reasons.push('Liquidity sweep bearish');
                confluences.push({ name: 'Liquidity Sweep', direction: 'bearish', weight: 2 });
            }
        }

        // 6. Zone Premium/Discount (+1)
        if (premiumDiscount) {
            if (premiumDiscount.currentZone === 'discount' && score > 0) {
                score += 1;
                reasons.push('Prix en zone Discount (achat optimal)');
                confluences.push({ name: 'Discount Zone', direction: 'bullish', weight: 1 });
            } else if (premiumDiscount.currentZone === 'premium' && score < 0) {
                score -= 1;
                reasons.push('Prix en zone Premium (vente optimal)');
                confluences.push({ name: 'Premium Zone', direction: 'bearish', weight: 1 });
            }
        }

        // 7. Session de trading (+1 si bonne session)
        if (currentSession.isHighVolume) {
            // Bonus pour overlap London-NY
            if (score > 0) score += 1;
            if (score < 0) score -= 1;
            reasons.push('Session haute volatilité (London-NY)');
        } else if (!currentSession.isTradingSession) {
            // Pénalité pour session asiatique
            score = Math.round(score * 0.7);
            reasons.push('Session basse volatilité (Asie)');
        }

        // Détermine la direction finale
        if (score >= 4) {
            direction = 'long';
            confidence = Math.min(score / 10, 1);
        } else if (score <= -4) {
            direction = 'short';
            confidence = Math.min(Math.abs(score) / 10, 1);
        }

        // Calcul des niveaux TP/SL basés sur la structure
        let stopLoss = null;
        let takeProfit = null;
        let slPercent = null;
        let tpPercent = null;

        if (direction === 'long' && structure.lastSwingLow) {
            stopLoss = structure.lastSwingLow.price * 0.998; // Légèrement sous le swing low
            slPercent = ((currentPrice - stopLoss) / currentPrice) * 100;
            
            // TP au prochain swing high ou 2x le risque
            if (structure.lastSwingHigh && structure.lastSwingHigh.price > currentPrice) {
                takeProfit = structure.lastSwingHigh.price;
            } else {
                takeProfit = currentPrice + (currentPrice - stopLoss) * 2;
            }
            tpPercent = ((takeProfit - currentPrice) / currentPrice) * 100;
        } else if (direction === 'short' && structure.lastSwingHigh) {
            stopLoss = structure.lastSwingHigh.price * 1.002;
            slPercent = ((stopLoss - currentPrice) / currentPrice) * 100;
            
            if (structure.lastSwingLow && structure.lastSwingLow.price < currentPrice) {
                takeProfit = structure.lastSwingLow.price;
            } else {
                takeProfit = currentPrice - (stopLoss - currentPrice) * 2;
            }
            tpPercent = ((currentPrice - takeProfit) / currentPrice) * 100;
        }

        return {
            direction,
            score,
            absScore: Math.abs(score),
            confidence,
            reasons,
            confluences,
            confluenceCount: confluences.length,
            stopLoss,
            takeProfit,
            slPercent,
            tpPercent,
            rrr: slPercent && tpPercent ? tpPercent / slPercent : null,
            structure: structure.trend,
            session: currentSession
        };
    }

    /**
     * Calcule le mouvement de prix entre deux indices
     */
    calculateMove(candles, startIndex, endIndex) {
        const end = Math.min(endIndex, candles.length - 1);
        const startPrice = candles[startIndex].close;
        
        let maxMove = 0;
        for (let i = startIndex + 1; i <= end; i++) {
            const move = Math.abs(candles[i].close - startPrice) / startPrice * 100;
            maxMove = Math.max(maxMove, move);
        }
        
        return maxMove;
    }

    /**
     * Calcule l'ATR pour le trailing stop
     */
    calculateATR(candles, period = 14) {
        if (candles.length < period + 1) return null;

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

        const recentTRs = trueRanges.slice(-period);
        return recentTRs.reduce((a, b) => a + b, 0) / period;
    }
}

// Export singleton
const smartMoney = new SmartMoney();
export default smartMoney;
