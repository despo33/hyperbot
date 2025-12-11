/**
 * Module de détection des signaux de trading
 * Analyse les données Ichimoku, indicateurs techniques et multi-timeframe
 */

import ichimoku from './ichimoku.js';
import indicators from './indicators.js';
import patternDetector from './patternDetector.js';
import multiTimeframe from './multiTimeframe.js';

/**
 * Classe principale de détection des signaux
 */
class SignalDetector {
    constructor() {
        // Configuration par défaut des signaux activés
        this.enabledSignals = {
            tkCross: true,        // Croisement Tenkan/Kijun
            kumoBreakout: true,   // Cassure du nuage
            kumoTwist: true,      // Changement de couleur du nuage
            kijunBounce: true,    // Rebond sur Kijun
            // Nouveaux indicateurs
            rsi: true,            // RSI
            macd: true,           // MACD
            bollinger: true,      // Bollinger Bands
            volume: true,         // Volume analysis
            patterns: true,       // Pattern detection
            multiTimeframe: true  // Multi-timeframe confirmation
        };

        // Seuils de force minimum pour valider un signal
        this.thresholds = {
            minStrength: 0.1,      // Force minimum du signal
            minIchimokuScore: 3,   // Score Ichimoku minimum
            confirmationRequired: true, // Requiert confirmation Chikou
            // Nouveaux seuils
            rsiOverbought: 70,
            rsiOversold: 30,
            minVolumeRatio: 1.2,   // Volume minimum vs moyenne
            mtfConfirmation: 2     // Minimum 2 timeframes en accord
        };

        this.lastSignal = null;
        this.signalHistory = [];
    }

    /**
     * Configure les signaux activés
     * @param {Object} config 
     */
    configure(config) {
        if (config.enabledSignals) {
            this.enabledSignals = { ...this.enabledSignals, ...config.enabledSignals };
        }
        if (config.thresholds) {
            this.thresholds = { ...this.thresholds, ...config.thresholds };
        }
    }

    /**
     * Analyse complète et génère des signaux
     * @param {Array<Object>} candles - Données OHLCV
     * @param {Object} ichimokuParams - Paramètres Ichimoku personnalisés
     * @param {string} timeframe - Timeframe pour optimiser les réglages ('1m', '5m', '15m', '1h', '4h', '1d')
     * @returns {Object} Résultat de l'analyse avec signaux
     */
    analyze(candles, ichimokuParams = {}, timeframe = '1h') {
        if (!candles || candles.length < 60) {
            return {
                success: false,
                error: 'Pas assez de données (minimum 60 candles requis)',
                signals: []
            };
        }

        // Récupère les réglages Ichimoku optimisés pour ce timeframe
        const optimizedSettings = indicators.getIchimokuSettings(timeframe);
        const finalIchimokuParams = {
            tenkanPeriod: ichimokuParams.tenkanPeriod || optimizedSettings.tenkan,
            kijunPeriod: ichimokuParams.kijunPeriod || optimizedSettings.kijun,
            senkouPeriod: ichimokuParams.senkouPeriod || optimizedSettings.senkou,
            displacement: ichimokuParams.displacement || optimizedSettings.displacement
        };

        // Calcul Ichimoku avec réglages optimisés
        const ichimokuData = ichimoku.calculateIchimoku(candles, finalIchimokuParams);
        
        if (!ichimokuData) {
            return {
                success: false,
                error: 'Erreur de calcul Ichimoku',
                signals: []
            };
        }

        const detectedSignals = [];
        const timestamp = Date.now();

        // 1. Détection TK Cross
        if (this.enabledSignals.tkCross) {
            const tkSignal = ichimoku.detectTKCross(
                ichimokuData.history.tenkan,
                ichimokuData.history.kijun
            );
            if (tkSignal.signal && tkSignal.strength >= this.thresholds.minStrength) {
                detectedSignals.push({
                    ...tkSignal,
                    name: 'TK Cross',
                    description: tkSignal.signal === 'bullish' 
                        ? 'Tenkan croise Kijun à la hausse' 
                        : 'Tenkan croise Kijun à la baisse',
                    timestamp
                });
            }
        }

        // 2. Détection Kumo Breakout
        if (this.enabledSignals.kumoBreakout) {
            const breakoutSignal = ichimoku.detectKumoBreakout(candles, ichimokuData);
            if (breakoutSignal.signal && breakoutSignal.strength >= this.thresholds.minStrength) {
                detectedSignals.push({
                    ...breakoutSignal,
                    name: 'Kumo Breakout',
                    description: breakoutSignal.signal === 'bullish'
                        ? 'Prix casse le nuage par le haut'
                        : 'Prix casse le nuage par le bas',
                    timestamp
                });
            }
        }

        // 3. Détection Kumo Twist
        if (this.enabledSignals.kumoTwist) {
            const twistSignal = ichimoku.detectKumoTwist(ichimokuData);
            if (twistSignal.signal && twistSignal.strength >= this.thresholds.minStrength) {
                detectedSignals.push({
                    ...twistSignal,
                    name: 'Kumo Twist',
                    description: twistSignal.signal === 'bullish'
                        ? 'Le nuage devient haussier (vert)'
                        : 'Le nuage devient baissier (rouge)',
                    timestamp
                });
            }
        }

        // 4. Détection Kijun Bounce
        if (this.enabledSignals.kijunBounce) {
            const bounceSignal = ichimoku.detectKijunBounce(candles, ichimokuData.history.kijun);
            if (bounceSignal.signal && bounceSignal.strength >= this.thresholds.minStrength) {
                detectedSignals.push({
                    ...bounceSignal,
                    name: 'Kijun Bounce',
                    description: bounceSignal.signal === 'bullish'
                        ? 'Rebond haussier sur la Kijun'
                        : 'Rebond baissier sur la Kijun',
                    timestamp
                });
            }
        }

        // Calcul du score global Ichimoku
        const ichimokuScore = ichimoku.calculateIchimokuScore(ichimokuData, candles);

        // Vérification de la confirmation Chikou
        const chikouConfirmation = ichimoku.checkChikouConfirmation(ichimokuData);

        // Détermination du signal final
        const finalSignal = this.determineFinalSignal(
            detectedSignals,
            ichimokuScore,
            chikouConfirmation
        );

        // Niveaux de support/résistance
        const levels = ichimoku.getIchimokuLevels(ichimokuData);

        // Analyse des indicateurs avancés (RSI, MACD, StochRSI, EMA200, OBV, etc.)
        const advancedAnalysis = indicators.analyzeAll(candles, timeframe);
        
        // Confirmation du signal Ichimoku par les autres indicateurs
        let indicatorConfirmation = null;
        if (finalSignal && finalSignal.action) {
            const signalDirection = finalSignal.action === 'BUY' ? 'long' : 'short';
            indicatorConfirmation = indicators.confirmIchimokuSignal(signalDirection, advancedAnalysis);
            
            // Ajuste la confiance du signal final selon la confirmation
            if (indicatorConfirmation.confirmed) {
                finalSignal.confidence = indicatorConfirmation.confidence;
                finalSignal.indicatorScore = indicatorConfirmation.score;
                finalSignal.confirmationReasons = indicatorConfirmation.reasons;
            } else if (indicatorConfirmation.rejections > indicatorConfirmation.confirmations) {
                // Les indicateurs rejettent le signal
                finalSignal.confidence = 'low';
                finalSignal.warning = 'Signal non confirmé par les indicateurs';
                finalSignal.rejectionReasons = indicatorConfirmation.reasons.filter(r => r.includes('⚠️'));
            }
        }

        // Sauvegarde dans l'historique
        if (finalSignal) {
            this.lastSignal = finalSignal;
            this.signalHistory.push(finalSignal);
            // Garde seulement les 100 derniers signaux
            if (this.signalHistory.length > 100) {
                this.signalHistory.shift();
            }
        }

        return {
            success: true,
            timestamp,
            timeframe,
            currentPrice: ichimokuData.current.price,
            ichimoku: {
                tenkan: ichimokuData.current.tenkan,
                kijun: ichimokuData.current.kijun,
                senkouA: ichimokuData.current.senkouA,
                senkouB: ichimokuData.current.senkouB,
                chikou: ichimokuData.current.chikou,
                kumoColor: ichimokuData.current.kumoColor,
                pricePosition: ichimokuData.current.pricePosition,
                kumoThickness: ichimokuData.current.kumoThickness,
                settings: finalIchimokuParams // Réglages utilisés
            },
            ichimokuScore,
            chikouConfirmation,
            detectedSignals,
            finalSignal,
            levels,
            // Indicateurs avancés (incluant VWAP, CVD, EMAs scalping)
            indicators: advancedAnalysis ? {
                // Indicateurs de base
                rsi: advancedAnalysis.rsi,
                stochRsi: advancedAnalysis.stochRsi,
                macd: advancedAnalysis.macd,
                bollinger: advancedAnalysis.bollinger,
                volume: advancedAnalysis.volume,
                // Indicateurs de tendance
                ema200: advancedAnalysis.ema200,
                scalpingEMAs: advancedAnalysis.scalpingEMAs,
                // Nouveaux indicateurs scalping
                vwap: advancedAnalysis.vwap,
                cvd: advancedAnalysis.cvd,
                // Divergences
                obv: advancedAnalysis.obv,
                rsiDivergence: advancedAnalysis.rsiDivergence,
                // Scores et confluence
                score: advancedAnalysis.score,
                weightedScore: advancedAnalysis.weightedScore,
                confluence: advancedAnalysis.confluence,
                confluenceBonus: advancedAnalysis.confluenceBonus,
                // Qualité du signal
                signalQuality: advancedAnalysis.signalQuality,
                // Signaux détaillés
                signals: advancedAnalysis.signals,
                signalsList: advancedAnalysis.signalsList,
                bullishSignals: advancedAnalysis.bullishSignals,
                bearishSignals: advancedAnalysis.bearishSignals
            } : null,
            indicatorConfirmation,
            recommendation: this.generateRecommendation(finalSignal, ichimokuScore, levels, advancedAnalysis)
        };
    }

    /**
     * Détermine le signal final basé sur tous les critères
     * @param {Array<Object>} signals 
     * @param {Object} score 
     * @param {Object} chikouConf 
     * @returns {Object|null}
     */
    determineFinalSignal(signals, score, chikouConf) {
        if (signals.length === 0) {
            return null;
        }

        // Compte les signaux par direction
        const bullishSignals = signals.filter(s => s.signal === 'bullish');
        const bearishSignals = signals.filter(s => s.signal === 'bearish');

        // Pas de signal clair si signaux contradictoires
        if (bullishSignals.length > 0 && bearishSignals.length > 0) {
            // Garde la direction dominante
            if (bullishSignals.length === bearishSignals.length) {
                return null; // Trop ambigu
            }
        }

        const dominantSignals = bullishSignals.length >= bearishSignals.length 
            ? bullishSignals 
            : bearishSignals;
        const direction = dominantSignals[0].signal;

        // Vérifie le score Ichimoku minimum
        if (Math.abs(score.score) < this.thresholds.minIchimokuScore) {
            // Score trop faible, signal non confirmé
            return {
                action: null,
                direction,
                confidence: 'low',
                reason: 'Score Ichimoku insuffisant',
                signals: dominantSignals
            };
        }

        // Vérifie la cohérence avec le score Ichimoku
        if ((direction === 'bullish' && score.score < 0) ||
            (direction === 'bearish' && score.score > 0)) {
            return {
                action: null,
                direction,
                confidence: 'low',
                reason: 'Signal contradictoire avec le contexte Ichimoku',
                signals: dominantSignals
            };
        }

        // Vérifie la confirmation Chikou si requise
        if (this.thresholds.confirmationRequired && chikouConf.confirmed) {
            if (chikouConf.direction !== direction) {
                return {
                    action: null,
                    direction,
                    confidence: 'medium',
                    reason: 'Chikou ne confirme pas le signal',
                    signals: dominantSignals
                };
            }
        }

        // Signal validé
        const confidence = this.calculateConfidence(dominantSignals, score, chikouConf);

        return {
            action: direction === 'bullish' ? 'BUY' : 'SELL',
            direction,
            confidence,
            score: score.score,
            normalizedScore: score.normalizedScore,
            signals: dominantSignals,
            chikouConfirmed: chikouConf.confirmed && chikouConf.direction === direction,
            timestamp: Date.now()
        };
    }

    /**
     * Calcule le niveau de confiance du signal
     * @param {Array<Object>} signals 
     * @param {Object} score 
     * @param {Object} chikouConf 
     * @returns {string}
     */
    calculateConfidence(signals, score, chikouConf) {
        let points = 0;

        // Points pour le nombre de signaux concordants
        points += signals.length * 1;

        // Points pour le score Ichimoku
        if (Math.abs(score.score) >= 5) points += 2;
        else if (Math.abs(score.score) >= 3) points += 1;

        // Points pour la confirmation Chikou
        if (chikouConf.confirmed) points += 2;

        // Points pour la force moyenne des signaux
        const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
        if (avgStrength >= 0.5) points += 1;

        // Détermination du niveau de confiance
        if (points >= 6) return 'high';
        if (points >= 4) return 'medium';
        return 'low';
    }

    /**
     * Génère une recommandation de trading
     * @param {Object} finalSignal 
     * @param {Object} score 
     * @param {Object} levels 
     * @param {Object} advancedAnalysis - Analyse des indicateurs avancés
     * @returns {Object}
     */
    generateRecommendation(finalSignal, score, levels, advancedAnalysis = null) {
        if (!finalSignal || !finalSignal.action) {
            return {
                action: 'WAIT',
                reason: finalSignal?.reason || 'Aucun signal clair détecté',
                suggestedEntry: null,
                suggestedSL: null,
                suggestedTP: null,
                indicatorSummary: advancedAnalysis ? advancedAnalysis.signals : []
            };
        }

        const { action, direction, confidence } = finalSignal;

        // Calcul des niveaux SL/TP basés sur les indicateurs techniques
        const technicalLevels = this.calculateTechnicalSLTP(
            direction, 
            finalSignal.signals[0]?.price || levels.currentPrice,
            levels, 
            advancedAnalysis
        );
        
        const { suggestedSL, suggestedTP, slSource, tpSource } = technicalLevels;

        // Résumé des indicateurs (incluant les nouveaux)
        const indicatorSummary = [];
        if (advancedAnalysis) {
            // RSI
            if (advancedAnalysis.rsi) {
                indicatorSummary.push(`RSI: ${advancedAnalysis.rsi.value} (${advancedAnalysis.rsi.signal})`);
            }
            // StochRSI
            if (advancedAnalysis.stochRsi) {
                indicatorSummary.push(`StochRSI: K=${advancedAnalysis.stochRsi.k} D=${advancedAnalysis.stochRsi.d}`);
            }
            // MACD
            if (advancedAnalysis.macd && advancedAnalysis.macd.crossover) {
                indicatorSummary.push(`MACD: ${advancedAnalysis.macd.crossover} crossover`);
            }
            // EMA200
            if (advancedAnalysis.ema200) {
                indicatorSummary.push(`EMA200: prix ${advancedAnalysis.ema200.position} (${advancedAnalysis.ema200.distance}%)`);
            }
            // EMAs Scalping 9/21
            if (advancedAnalysis.scalpingEMAs) {
                const emaStatus = advancedAnalysis.scalpingEMAs.crossover 
                    ? `crossover ${advancedAnalysis.scalpingEMAs.crossover}` 
                    : advancedAnalysis.scalpingEMAs.trend;
                indicatorSummary.push(`EMA9/21: ${emaStatus}`);
            }
            // VWAP (nouveau)
            if (advancedAnalysis.vwap) {
                indicatorSummary.push(`VWAP: ${advancedAnalysis.vwap.position} (${advancedAnalysis.vwap.distance}%)`);
            }
            // CVD (nouveau)
            if (advancedAnalysis.cvd) {
                const cvdInfo = advancedAnalysis.cvd.divergence 
                    ? `divergence ${advancedAnalysis.cvd.divergence}` 
                    : advancedAnalysis.cvd.trend;
                indicatorSummary.push(`CVD: ${cvdInfo}`);
            }
            // Divergences
            if (advancedAnalysis.rsiDivergence && advancedAnalysis.rsiDivergence.divergence) {
                indicatorSummary.push(`Divergence RSI: ${advancedAnalysis.rsiDivergence.divergence}`);
            }
            if (advancedAnalysis.obv && advancedAnalysis.obv.divergence) {
                indicatorSummary.push(`Divergence OBV: ${advancedAnalysis.obv.divergence}`);
            }
            // Volume
            if (advancedAnalysis.volume && advancedAnalysis.volume.spike) {
                indicatorSummary.push(`Volume: spike ${advancedAnalysis.volume.ratio}x`);
            }
        }

        // Qualité du signal basée sur le nouveau système
        let signalQuality = 'standard';
        if (advancedAnalysis?.signalQuality) {
            signalQuality = advancedAnalysis.signalQuality.grade;
        } else if (advancedAnalysis && advancedAnalysis.confluence >= 5) {
            signalQuality = 'A';
        } else if (advancedAnalysis && advancedAnalysis.confluence >= 4) {
            signalQuality = 'B';
        } else if (advancedAnalysis && advancedAnalysis.confluence >= 3) {
            signalQuality = 'C';
        } else if (finalSignal.warning) {
            signalQuality = 'D';
        }

        // Détermine si le signal est tradeable
        const isTradeable = advancedAnalysis?.signalQuality?.tradeable || 
                          (advancedAnalysis?.confluence >= 3 && Math.abs(advancedAnalysis?.score || 0) >= 25);

        return {
            action,
            direction,
            confidence,
            signalQuality,
            isTradeable,
            reason: `${finalSignal.signals.length} signal(s) ${direction} détecté(s)`,
            suggestedSL,
            suggestedTP,
            slSource,
            tpSource,
            scoreContext: {
                ichimokuScore: score.score,
                indicatorScore: advancedAnalysis?.score || 0,
                weightedScore: advancedAnalysis?.weightedScore || 0,
                confluence: advancedAnalysis?.confluence || 0,
                confluenceBonus: advancedAnalysis?.confluenceBonus || 'low',
                qualityScore: advancedAnalysis?.signalQuality?.score || 0,
                qualityGrade: advancedAnalysis?.signalQuality?.grade || 'D',
                interpretation: score.score >= 4 ? 'Contexte très haussier' :
                               score.score >= 2 ? 'Contexte haussier' :
                               score.score <= -4 ? 'Contexte très baissier' :
                               score.score <= -2 ? 'Contexte baissier' : 'Contexte neutre'
            },
            indicatorSummary,
            qualityFactors: advancedAnalysis?.signalQuality?.factors || [],
            confirmationReasons: finalSignal.confirmationReasons || [],
            warnings: finalSignal.rejectionReasons || []
        };
    }

    /**
     * Calcule les niveaux SL/TP optimaux basés sur les indicateurs techniques
     * Priorité: Ichimoku > EMA200 > Bollinger > Pourcentage par défaut
     * @param {string} direction - 'bullish' ou 'bearish'
     * @param {number} entryPrice - Prix d'entrée
     * @param {Object} levels - Niveaux Ichimoku (supports/résistances)
     * @param {Object} analysis - Analyse des indicateurs avancés
     * @returns {Object} { suggestedSL, suggestedTP, slSource, tpSource }
     */
    calculateTechnicalSLTP(direction, entryPrice, levels, analysis) {
        let suggestedSL = null;
        let suggestedTP = null;
        let slSource = 'default';
        let tpSource = 'default';
        
        const buffer = 0.001; // 0.1% de marge de sécurité (réduit)

        // Contraintes de distance assouplies pour crypto
        const minDistance = entryPrice * 0.003; // Min 0.3% (au lieu de 0.5%)
        const maxDistance = entryPrice * 0.08;  // Max 8% (au lieu de 5%)

        if (direction === 'bullish') {
            // ===== CALCUL DU STOP LOSS POUR LONG =====
            const slCandidates = [];
            
            // 1. Support Ichimoku (Kijun, Senkou B, bas du Kumo)
            if (levels.supports && levels.supports.length > 0) {
                for (const support of levels.supports) {
                    if (support.level && support.level < entryPrice) {
                        slCandidates.push({
                            level: support.level * (1 - buffer),
                            source: `ichimoku_${support.type || 'support'}`,
                            priority: 1,
                            distance: entryPrice - support.level
                        });
                    }
                }
            }
            
            // 2. EMA 200 (si prix au-dessus)
            if (analysis?.ema200?.value && analysis.ema200.position === 'above') {
                slCandidates.push({
                    level: analysis.ema200.value * (1 - buffer),
                    source: 'ema200',
                    priority: 2,
                    distance: entryPrice - analysis.ema200.value
                });
            }
            
            // 3. Bollinger inférieure
            if (analysis?.bollinger?.lower && analysis.bollinger.lower < entryPrice) {
                slCandidates.push({
                    level: analysis.bollinger.lower * (1 - buffer),
                    source: 'bollinger_lower',
                    priority: 3,
                    distance: entryPrice - analysis.bollinger.lower
                });
            }
            
            // Filtre et trie les candidats
            const validSLs = slCandidates.filter(sl => {
                return sl.distance >= minDistance && sl.distance <= maxDistance;
            }).sort((a, b) => {
                // Trie par priorité, puis par distance (plus proche = mieux)
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.distance - b.distance;
            });
            
            if (validSLs.length > 0) {
                suggestedSL = validSLs[0].level;
                slSource = validSLs[0].source;
            } else if (slCandidates.length > 0) {
                // Si aucun valide, prend le meilleur candidat quand même (avec priorité)
                const sorted = slCandidates.sort((a, b) => a.priority - b.priority);
                suggestedSL = sorted[0].level;
                slSource = sorted[0].source + '_extended';
            }
            
            // ===== CALCUL DU TAKE PROFIT POUR LONG =====
            const tpCandidates = [];
            
            // 1. Résistance Ichimoku
            if (levels.resistances && levels.resistances.length > 0) {
                for (const resistance of levels.resistances) {
                    if (resistance.level && resistance.level > entryPrice) {
                        tpCandidates.push({
                            level: resistance.level * (1 - buffer/2),
                            source: `ichimoku_${resistance.type || 'resistance'}`,
                            priority: 1,
                            distance: resistance.level - entryPrice
                        });
                    }
                }
            }
            
            // 2. Bollinger supérieure
            if (analysis?.bollinger?.upper && analysis.bollinger.upper > entryPrice) {
                tpCandidates.push({
                    level: analysis.bollinger.upper * (1 - buffer/2),
                    source: 'bollinger_upper',
                    priority: 2,
                    distance: analysis.bollinger.upper - entryPrice
                });
            }
            
            // Sélectionne le TP - RRR minimum réduit à 1.0 pour plus de flexibilité
            if (tpCandidates.length > 0) {
                const risk = suggestedSL ? (entryPrice - suggestedSL) : (entryPrice * 0.02);
                const validTPs = tpCandidates.filter(tp => {
                    const reward = tp.level - entryPrice;
                    const rrr = reward / risk;
                    return rrr >= 1.0; // Minimum 1.0 RRR (assoupli)
                }).sort((a, b) => {
                    if (a.priority !== b.priority) return a.priority - b.priority;
                    return a.distance - b.distance; // Plus proche en premier
                });
                
                if (validTPs.length > 0) {
                    suggestedTP = validTPs[0].level;
                    tpSource = validTPs[0].source;
                } else if (tpCandidates.length > 0) {
                    // Fallback: prend le premier candidat par priorité
                    const sorted = tpCandidates.sort((a, b) => a.priority - b.priority);
                    suggestedTP = sorted[0].level;
                    tpSource = sorted[0].source + '_extended';
                }
            }
            
        } else if (direction === 'bearish') {
            // ===== CALCUL DU STOP LOSS POUR SHORT =====
            const slCandidates = [];
            
            // 1. Résistance Ichimoku
            if (levels.resistances && levels.resistances.length > 0) {
                for (const resistance of levels.resistances) {
                    if (resistance.level && resistance.level > entryPrice) {
                        slCandidates.push({
                            level: resistance.level * (1 + buffer),
                            source: `ichimoku_${resistance.type || 'resistance'}`,
                            priority: 1,
                            distance: resistance.level - entryPrice
                        });
                    }
                }
            }
            
            // 2. EMA 200 (si prix en-dessous)
            if (analysis?.ema200?.value && analysis.ema200.position === 'below') {
                slCandidates.push({
                    level: analysis.ema200.value * (1 + buffer),
                    source: 'ema200',
                    priority: 2,
                    distance: analysis.ema200.value - entryPrice
                });
            }
            
            // 3. Bollinger supérieure
            if (analysis?.bollinger?.upper && analysis.bollinger.upper > entryPrice) {
                slCandidates.push({
                    level: analysis.bollinger.upper * (1 + buffer),
                    source: 'bollinger_upper',
                    priority: 3,
                    distance: analysis.bollinger.upper - entryPrice
                });
            }
            
            // Sélectionne le meilleur SL pour SHORT
            const validSLs = slCandidates.filter(sl => {
                return sl.distance >= minDistance && sl.distance <= maxDistance;
            }).sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.distance - b.distance;
            });
            
            if (validSLs.length > 0) {
                suggestedSL = validSLs[0].level;
                slSource = validSLs[0].source;
            } else if (slCandidates.length > 0) {
                // Fallback: prend le meilleur candidat
                const sorted = slCandidates.sort((a, b) => a.priority - b.priority);
                suggestedSL = sorted[0].level;
                slSource = sorted[0].source + '_extended';
            }
            
            // ===== CALCUL DU TAKE PROFIT POUR SHORT =====
            const tpCandidates = [];
            
            // 1. Support Ichimoku
            if (levels.supports && levels.supports.length > 0) {
                for (const support of levels.supports) {
                    if (support.level && support.level < entryPrice) {
                        tpCandidates.push({
                            level: support.level * (1 + buffer/2),
                            source: `ichimoku_${support.type || 'support'}`,
                            priority: 1,
                            distance: entryPrice - support.level
                        });
                    }
                }
            }
            
            // 2. Bollinger inférieure
            if (analysis?.bollinger?.lower && analysis.bollinger.lower < entryPrice) {
                tpCandidates.push({
                    level: analysis.bollinger.lower * (1 + buffer/2),
                    source: 'bollinger_lower',
                    priority: 2,
                    distance: entryPrice - analysis.bollinger.lower
                });
            }
            
            // Sélectionne le TP - RRR minimum réduit à 1.0
            if (tpCandidates.length > 0) {
                const risk = suggestedSL ? (suggestedSL - entryPrice) : (entryPrice * 0.02);
                const validTPs = tpCandidates.filter(tp => {
                    const reward = entryPrice - tp.level;
                    const rrr = reward / risk;
                    return rrr >= 1.0; // Assoupli
                }).sort((a, b) => {
                    if (a.priority !== b.priority) return a.priority - b.priority;
                    return a.distance - b.distance;
                });
                
                if (validTPs.length > 0) {
                    suggestedTP = validTPs[0].level;
                    tpSource = validTPs[0].source;
                } else if (tpCandidates.length > 0) {
                    // Fallback
                    const sorted = tpCandidates.sort((a, b) => a.priority - b.priority);
                    suggestedTP = sorted[0].level;
                    tpSource = sorted[0].source + '_extended';
                }
            }
        }
        
        return {
            suggestedSL: suggestedSL ? parseFloat(suggestedSL.toFixed(6)) : null,
            suggestedTP: suggestedTP ? parseFloat(suggestedTP.toFixed(6)) : null,
            slSource,
            tpSource
        };
    }

    /**
     * Retourne le dernier signal détecté
     * @returns {Object|null}
     */
    getLastSignal() {
        return this.lastSignal;
    }

    /**
     * Retourne l'historique des signaux
     * @param {number} limit 
     * @returns {Array<Object>}
     */
    getSignalHistory(limit = 20) {
        return this.signalHistory.slice(-limit);
    }

    /**
     * Réinitialise l'historique des signaux
     */
    clearHistory() {
        this.signalHistory = [];
        this.lastSignal = null;
    }

    /**
     * Analyse rapide pour vérifier les conditions de marché
     * @param {Array<Object>} candles 
     * @returns {Object}
     */
    quickAnalysis(candles) {
        const ichimokuData = ichimoku.calculateIchimoku(candles);
        
        if (!ichimokuData) {
            return { trend: 'unknown', strength: 0 };
        }

        const score = ichimoku.calculateIchimokuScore(ichimokuData, candles);

        let trend = 'neutral';
        if (score.score >= 3) trend = 'bullish';
        else if (score.score <= -3) trend = 'bearish';

        return {
            trend,
            strength: Math.abs(score.normalizedScore),
            pricePosition: ichimokuData.current.pricePosition,
            kumoColor: ichimokuData.current.kumoColor
        };
    }

    /**
     * Analyse avancée avec tous les indicateurs
     * @param {Array<Object>} candles - Données OHLCV
     * @param {string} symbol - Symbole de la crypto
     * @param {string} timeframe - Timeframe pour optimiser les réglages
     * @returns {Object} Analyse complète
     */
    analyzeAdvanced(candles, symbol, timeframe = '1h') {
        if (!candles || candles.length < 60) {
            return {
                success: false,
                error: 'Pas assez de données',
                signals: []
            };
        }

        const timestamp = Date.now();
        const result = {
            success: true,
            timestamp,
            symbol,
            timeframe,
            analyses: {},
            signals: [],
            score: 0,
            confidence: 0
        };

        // 1. Analyse Ichimoku (base) avec timeframe
        const ichimokuAnalysis = this.analyze(candles, {}, timeframe);
        result.analyses.ichimoku = ichimokuAnalysis;
        
        if (ichimokuAnalysis.finalSignal?.action) {
            result.signals.push({
                source: 'ichimoku',
                signal: ichimokuAnalysis.finalSignal.action,
                confidence: ichimokuAnalysis.finalSignal.confidence,
                score: ichimokuAnalysis.ichimokuScore?.score || 0
            });
        }

        // 2. Indicateurs techniques (RSI, MACD, Bollinger) avec timeframe
        if (this.enabledSignals.rsi || this.enabledSignals.macd || this.enabledSignals.bollinger) {
            const technicalAnalysis = indicators.analyzeAll(candles, timeframe);
            result.analyses.technical = technicalAnalysis;

            if (technicalAnalysis) {
                result.signals.push({
                    source: 'technical',
                    signal: technicalAnalysis.direction.includes('buy') ? 'BUY' : 
                           technicalAnalysis.direction.includes('sell') ? 'SELL' : 'NEUTRAL',
                    confidence: Math.abs(technicalAnalysis.score) > 30 ? 'high' : 
                               Math.abs(technicalAnalysis.score) > 15 ? 'medium' : 'low',
                    score: technicalAnalysis.score,
                    details: technicalAnalysis.signals
                });
            }
        }

        // 3. Détection de patterns
        if (this.enabledSignals.patterns) {
            const patternAnalysis = patternDetector.detectAll(candles);
            result.analyses.patterns = patternAnalysis;

            if (patternAnalysis.patterns.length > 0) {
                result.signals.push({
                    source: 'patterns',
                    signal: patternAnalysis.dominantSignal === 'bullish' ? 'BUY' :
                           patternAnalysis.dominantSignal === 'bearish' ? 'SELL' : 'NEUTRAL',
                    confidence: patternAnalysis.confidence > 70 ? 'high' : 
                               patternAnalysis.confidence > 50 ? 'medium' : 'low',
                    score: patternAnalysis.bullishScore - patternAnalysis.bearishScore,
                    patterns: patternAnalysis.patterns.map(p => p.type)
                });
            }
        }

        // 4. Multi-timeframe confirmation
        if (this.enabledSignals.multiTimeframe) {
            const mtfAnalysis = multiTimeframe.analyze(candles, symbol);
            result.analyses.multiTimeframe = mtfAnalysis;

            result.signals.push({
                source: 'multiTimeframe',
                signal: mtfAnalysis.signal.includes('BUY') ? 'BUY' :
                       mtfAnalysis.signal.includes('SELL') ? 'SELL' : 'NEUTRAL',
                confidence: mtfAnalysis.confidence > 70 ? 'high' : 
                           mtfAnalysis.confidence > 50 ? 'medium' : 'low',
                score: mtfAnalysis.score,
                aligned: mtfAnalysis.aligned,
                confirmations: mtfAnalysis.confirmations
            });
        }

        // 5. Calcul du score final pondéré
        let totalScore = 0;
        let totalWeight = 0;
        const weights = {
            ichimoku: 0.35,
            technical: 0.25,
            patterns: 0.15,
            multiTimeframe: 0.25
        };

        for (const sig of result.signals) {
            const weight = weights[sig.source] || 0.2;
            totalScore += sig.score * weight;
            totalWeight += weight;
        }

        result.score = totalWeight > 0 ? totalScore / totalWeight : 0;

        // 6. Détermination du signal final
        let buySignals = result.signals.filter(s => s.signal === 'BUY').length;
        let sellSignals = result.signals.filter(s => s.signal === 'SELL').length;

        if (buySignals >= 3 && result.score > 10) {
            result.finalSignal = {
                action: 'BUY',
                confidence: buySignals === result.signals.length ? 'high' : 'medium',
                score: result.score,
                confirmations: buySignals
            };
        } else if (sellSignals >= 3 && result.score < -10) {
            result.finalSignal = {
                action: 'SELL',
                confidence: sellSignals === result.signals.length ? 'high' : 'medium',
                score: result.score,
                confirmations: sellSignals
            };
        } else {
            result.finalSignal = {
                action: 'NEUTRAL',
                confidence: 'low',
                score: result.score,
                reason: 'Pas assez de confirmations'
            };
        }

        // 7. Calcul de la confiance globale
        const highConfidence = result.signals.filter(s => s.confidence === 'high').length;
        const mediumConfidence = result.signals.filter(s => s.confidence === 'medium').length;
        result.confidence = (highConfidence * 30 + mediumConfidence * 15) / result.signals.length;

        // 8. Niveaux suggérés
        if (ichimokuAnalysis.levels) {
            result.levels = ichimokuAnalysis.levels;
        }

        return result;
    }

    /**
     * Vérifie si un signal est confirmé par multi-timeframe
     * @param {string} signal - Signal à confirmer (BUY/SELL)
     * @param {Array} candles - Bougies 15m
     * @param {string} symbol - Symbole
     * @returns {Object} Confirmation
     */
    confirmWithMTF(signal, candles, symbol) {
        if (!this.enabledSignals.multiTimeframe) {
            return { confirmed: true, reason: 'MTF disabled' };
        }

        return multiTimeframe.confirmSignal(signal, candles, symbol);
    }
}

// Export singleton
const signalDetector = new SignalDetector();
export default signalDetector;
