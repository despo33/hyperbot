/**
 * Position Manager
 * Surveille les positions pour détecter les fermetures (TP/SL atteint)
 * et libérer les slots pour de nouveaux trades
 */

import api from '../services/hyperliquidApi.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PositionManager {
    constructor() {
        this.config = {
            checkInterval: 30000 // Vérifie toutes les 30 secondes
        };

        this.positions = new Map();
        this.isRunning = false;
        this.intervalId = null;
        this.storagePath = path.join(__dirname, '../storage/positions.json');
        
        // Callback pour notifier les fermetures de positions
        this.onPositionClosed = null;
        
        this.loadState();
    }
    
    /**
     * Définit le callback pour les fermetures de positions
     * @param {Function} callback - (symbol, pnl, exitReason) => void
     */
    setOnPositionClosed(callback) {
        this.onPositionClosed = callback;
    }

    /**
     * Charge l'état sauvegardé
     */
    loadState() {
        try {
            if (fs.existsSync(this.storagePath)) {
                const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
                this.positions = new Map(Object.entries(data.positions || {}));
                console.log(`[POSITION] ${this.positions.size} positions chargées`);
            }
        } catch (e) {
            console.error('[POSITION] Erreur chargement état:', e.message);
        }
    }

    /**
     * Sauvegarde l'état
     */
    saveState() {
        try {
            const data = {
                positions: Object.fromEntries(this.positions),
                lastUpdate: Date.now()
            };
            fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('[POSITION] Erreur sauvegarde:', e.message);
        }
    }

    /**
     * Ajoute une position à suivre
     * @param {Object} position - Position à suivre
     */
    trackPosition(position) {
        const { symbol, side, entryPrice, size, stopLoss, takeProfit } = position;
        
        this.positions.set(symbol, {
            symbol,
            side,
            entryPrice: parseFloat(entryPrice),
            size: parseFloat(size),
            stopLoss: parseFloat(stopLoss),
            takeProfit: parseFloat(takeProfit),
            createdAt: Date.now()
        });
        
        this.saveState();
        console.log(`[POSITION] Tracking ${symbol} ${side} @ ${entryPrice} | SL: ${stopLoss} | TP: ${takeProfit}`);
    }

    /**
     * Retire une position du suivi
     * @param {string} symbol 
     */
    untrackPosition(symbol) {
        if (this.positions.has(symbol)) {
            this.positions.delete(symbol);
            this.saveState();
            console.log(`[POSITION] Untracked ${symbol}`);
        }
    }

    /**
     * Vérifie toutes les positions pour détecter les fermetures (TP/SL atteint)
     */
    async checkAllPositions() {
        if (this.positions.size === 0) return;

        try {
            // Récupère les positions actuelles sur l'exchange
            const currentPositions = await api.getPositions();
            const positionMap = new Map(
                currentPositions.map(p => [p.coin, p])
            );

            for (const [symbol, tracked] of this.positions) {
                // Vérifie si la position existe encore (fermée par TP/SL)
                const livePosition = positionMap.get(symbol);
                if (!livePosition || parseFloat(livePosition.szi) === 0) {
                    // Calcule le P&L approximatif
                    let pnl = 0;
                    let exitReason = 'unknown';
                    
                    if (tracked.entryPrice && tracked.size) {
                        // Récupère le prix actuel pour estimer le P&L
                        try {
                            const currentPrice = livePosition?.markPx || tracked.entryPrice;
                            if (tracked.side === 'long') {
                                pnl = (currentPrice - tracked.entryPrice) * tracked.size;
                            } else {
                                pnl = (tracked.entryPrice - currentPrice) * tracked.size;
                            }
                            
                            // Détermine si c'était un TP ou SL
                            if (pnl > 0) {
                                exitReason = 'tp_hit';
                            } else {
                                exitReason = 'sl_hit';
                            }
                        } catch (e) {
                            console.error(`[POSITION] Erreur calcul P&L ${symbol}:`, e.message);
                        }
                    }
                    
                    console.log(`[POSITION] ✅ Position ${symbol} fermée (${exitReason}) | P&L: $${pnl.toFixed(2)}`);
                    
                    // Notifie le callback si défini
                    if (this.onPositionClosed) {
                        try {
                            this.onPositionClosed(symbol, pnl, exitReason);
                        } catch (e) {
                            console.error('[POSITION] Erreur callback onPositionClosed:', e.message);
                        }
                    }
                    
                    this.untrackPosition(symbol);
                }
            }
            
            // Sauvegarde si des changements
            this.saveState();
        } catch (e) {
            console.error('[POSITION] Erreur vérification positions:', e.message);
        }
    }

    /**
     * Démarre le gestionnaire de positions
     * Surveille les positions pour détecter les fermetures (TP/SL atteint)
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        console.log('[POSITION] 🚀 Position Manager démarré (surveillance des fermetures)');

        // Vérifie immédiatement puis à intervalle régulier
        this.checkAllPositions();
        this.intervalId = setInterval(() => {
            this.checkAllPositions();
        }, this.config.checkInterval);
    }

    /**
     * Arrête le gestionnaire de positions
     */
    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.saveState();
        console.log('[POSITION] ⏹️ Position Manager arrêté');
    }

    /**
     * Retourne le statut actuel
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            trackedPositions: this.positions.size,
            positions: Array.from(this.positions.values()),
            config: this.config
        };
    }

    /**
     * Met à jour la configuration
     * @param {Object} newConfig 
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[POSITION] Configuration mise à jour');
    }
}

export default new PositionManager();
