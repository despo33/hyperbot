/**
 * SMC Signal Detector
 * 
 * Détecteur de signaux basé sur Smart Money Concepts
 * Alternative à la stratégie Ichimoku
 */

import smartMoney from './smartMoney.js';
import indicators from './indicators.js';

class SMCSignalDetector {
    constructor() {
        this.name = 'Smart Money Concepts';
        this.shortName = 'SMC';
        
        this.config = {
            // Score minimum pour un signal valide (assoupli)
            minScore: 3,
            minConfluence: 2,
            
            // Filtres additionnels (simplifiés)
            useRSIFilter: true,
            useMACDFilter: false,  // Désactivé - bloque trop de SHORT
            useVolumeFilter: false, // Désactivé - trop restrictif
            useSessionFilter: false, // Désactivé - permet de trader 24/7
            
            // RSI (assoupli)
            rsiOverbought: 75,
            rsiOversold: 25,
            
            // Volume (non utilisé)
            minVolumeRatio: 0.5
        };
    }

    /**
     * Analyse les candles et génère un signal SMC
     */
    analyze(candles, customConfig = {}, timeframe = '15m') {
        if (!candles || candles.length < 100) {
            return {
                strategy: 'SMC',
                signal: null,
                tradeable: false,
                reason: 'Données insuffisantes'
            };
        }

        const config = { ...this.config, ...customConfig };
        
        // Récupère les signaux activés par l'utilisateur
        const smcSignals = customConfig.smcSignals || {
            orderBlocks: true,
            fvg: true,
            bos: true
        };

        // 1. Analyse SMC principale avec les signaux activés
        const smcAnalysis = smartMoney.analyze(candles, { smcSignals });
        
        if (!smcAnalysis || !smcAnalysis.signal) {
            return {
                strategy: 'SMC',
                signal: null,
                tradeable: false,
                reason: 'Analyse SMC échouée'
            };
        }

        const smcSignal = smcAnalysis.signal;

        // 2. Indicateurs techniques additionnels pour confirmation
        const technicalAnalysis = indicators.analyzeAll(candles, timeframe);
        
        // 3. Applique les filtres
        let tradeable = smcSignal.direction !== null;
        let rejectReason = null;

        // Filtre Score minimum
        if (smcSignal.absScore < config.minScore) {
            tradeable = false;
            rejectReason = `Score insuffisant (${smcSignal.absScore}/${config.minScore})`;
        }

        // Filtre Confluence minimum
        if (tradeable && smcSignal.confluenceCount < config.minConfluence) {
            tradeable = false;
            rejectReason = `Confluence insuffisante (${smcSignal.confluenceCount}/${config.minConfluence})`;
        }

        // Filtre RSI
        if (tradeable && config.useRSIFilter && technicalAnalysis?.rsi) {
            const rsi = technicalAnalysis.rsi.value;
            
            if (smcSignal.direction === 'long' && rsi > config.rsiOverbought) {
                tradeable = false;
                rejectReason = `RSI en surachat (${rsi.toFixed(1)})`;
            } else if (smcSignal.direction === 'short' && rsi < config.rsiOversold) {
                tradeable = false;
                rejectReason = `RSI en survente (${rsi.toFixed(1)})`;
            }
        }

        // Filtre MACD - ASSOUPLI POUR SHORT
        // En bull market, le MACD est souvent positif, on ne bloque pas les SHORT pour autant
        if (tradeable && config.useMACDFilter && technicalAnalysis?.macd) {
            const macd = technicalAnalysis.macd;
            
            if (smcSignal.direction === 'long' && macd.histogram < -2.0) {
                tradeable = false;
                rejectReason = 'MACD très négatif';
            }
            // NOTE: On ne bloque plus les SHORT basé sur MACD positif
            // car en bull market le MACD est souvent positif même lors de corrections légitimes
        }

        // Filtre Volume
        if (tradeable && config.useVolumeFilter && technicalAnalysis?.volume) {
            if (technicalAnalysis.volume.ratio < config.minVolumeRatio) {
                tradeable = false;
                rejectReason = `Volume insuffisant (${(technicalAnalysis.volume.ratio * 100).toFixed(0)}%)`;
            }
        }

        // Filtre Session
        if (tradeable && config.useSessionFilter) {
            if (!smcSignal.session.isTradingSession) {
                tradeable = false;
                rejectReason = 'Hors session de trading (London/NY)';
            }
        }

        // 4. Calcul de la probabilité de gain
        let winProbability = 0.5;
        
        if (smcSignal.direction) {
            // Base sur le score
            winProbability += smcSignal.absScore * 0.03;
            
            // Bonus pour confluence élevée
            winProbability += smcSignal.confluenceCount * 0.02;
            
            // Bonus pour bonne session
            if (smcSignal.session.isHighVolume) {
                winProbability += 0.05;
            }
            
            // Bonus pour zone discount/premium correcte
            if (smcAnalysis.premiumDiscount) {
                if (smcSignal.direction === 'long' && smcAnalysis.premiumDiscount.currentZone === 'discount') {
                    winProbability += 0.05;
                } else if (smcSignal.direction === 'short' && smcAnalysis.premiumDiscount.currentZone === 'premium') {
                    winProbability += 0.05;
                }
            }
            
            // Cap à 85%
            winProbability = Math.min(winProbability, 0.85);
        }

        // 5. Prépare le résultat
        const currentPrice = candles[candles.length - 1].close;
        const atr = smartMoney.calculateATR(candles, 14);

        return {
            strategy: 'SMC',
            
            // Signal principal
            signal: smcSignal.direction ? {
                direction: smcSignal.direction,
                score: smcSignal.score,
                absScore: smcSignal.absScore,
                confidence: smcSignal.confidence,
                reasons: smcSignal.reasons
            } : null,
            
            // Tradeable
            tradeable,
            rejectReason,
            
            // Score SMC (équivalent à ichimokuScore)
            smcScore: {
                score: smcSignal.score,
                absScore: smcSignal.absScore,
                direction: smcSignal.direction,
                signals: smcSignal.confluences
            },
            
            // Confluence
            confluence: smcSignal.confluenceCount,
            
            // Probabilité
            winProbability,
            
            // Niveaux TP/SL suggérés
            suggestedTP: smcSignal.takeProfit,
            suggestedSL: smcSignal.stopLoss,
            suggestedTPPercent: smcSignal.tpPercent,
            suggestedSLPercent: smcSignal.slPercent,
            suggestedRRR: smcSignal.rrr,
            
            // Données SMC détaillées
            smcData: {
                structure: smcAnalysis.structure,
                orderBlocks: smcAnalysis.orderBlocks.slice(0, 3),
                fvgs: smcAnalysis.fvgs.slice(0, 3),
                bos: smcAnalysis.bos.slice(0, 3),
                liquiditySweeps: smcAnalysis.liquiditySweeps.slice(0, 3),
                premiumDiscount: smcAnalysis.premiumDiscount,
                session: smcAnalysis.currentSession
            },
            
            // Indicateurs techniques
            indicators: {
                rsi: technicalAnalysis?.rsi,
                macd: technicalAnalysis?.macd,
                ema200: technicalAnalysis?.ema200,
                adx: technicalAnalysis?.adx,
                volume: technicalAnalysis?.volume,
                atr: atr ? { value: atr, percent: (atr / currentPrice) * 100 } : null
            },
            
            // Meta
            currentPrice,
            timestamp: candles[candles.length - 1].timestamp,
            timeframe
        };
    }

    /**
     * Génère une recommandation de trade
     */
    generateRecommendation(analysis) {
        if (!analysis || !analysis.tradeable || !analysis.signal) {
            return null;
        }

        const { signal, smcData, indicators, currentPrice } = analysis;

        // Calcul TP/SL
        let stopLoss = analysis.suggestedSL;
        let takeProfit = analysis.suggestedTP;
        let slPercent = analysis.suggestedSLPercent;
        let tpPercent = analysis.suggestedTPPercent;

        // Si pas de niveaux SMC, utilise ATR
        if (!stopLoss && indicators.atr) {
            const atrValue = indicators.atr.value;
            
            if (signal.direction === 'long') {
                stopLoss = currentPrice - (atrValue * 1.5);
                takeProfit = currentPrice + (atrValue * 3);
            } else {
                stopLoss = currentPrice + (atrValue * 1.5);
                takeProfit = currentPrice - (atrValue * 3);
            }
            
            slPercent = (Math.abs(currentPrice - stopLoss) / currentPrice) * 100;
            tpPercent = (Math.abs(takeProfit - currentPrice) / currentPrice) * 100;
        }

        const rrr = tpPercent && slPercent ? tpPercent / slPercent : 2;

        return {
            action: signal.direction === 'long' ? 'BUY' : 'SELL',
            direction: signal.direction,
            entryPrice: currentPrice,
            stopLoss,
            takeProfit,
            slPercent,
            tpPercent,
            rrr,
            confidence: signal.confidence,
            score: signal.absScore,
            confluence: analysis.confluence,
            winProbability: analysis.winProbability,
            reasons: signal.reasons,
            
            // Contexte SMC
            marketStructure: smcData.structure.trend,
            currentZone: smcData.premiumDiscount?.currentZone,
            session: smcData.session.activeSessions.join(', ') || 'None',
            isHighVolume: smcData.session.isHighVolume
        };
    }
}

// Export singleton
const smcSignalDetector = new SMCSignalDetector();
export default smcSignalDetector;
