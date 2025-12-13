/**
 * BotManager - Gestionnaire de bots multi-utilisateurs
 * Gère une instance de bot par utilisateur
 */

import UserBotInstance from './UserBotInstance.js';

class BotManager {
    constructor() {
        // Map des instances de bot par userId
        this.bots = new Map();
        
        // Callbacks globaux pour le broadcast WebSocket
        this.globalCallbacks = {
            onLog: [],
            onSignal: [],
            onTrade: [],
            onAnalysis: [],
            onStatusChange: []
        };

        console.log('[BotManager] Initialisé - Prêt pour multi-utilisateurs');
    }

    /**
     * Récupère ou crée une instance de bot pour un utilisateur
     * @param {string} userId - ID de l'utilisateur
     * @param {Object} userConfig - Configuration du bot (optionnel)
     * @returns {UserBotInstance}
     */
    getOrCreateBot(userId, userConfig = {}) {
        const userIdStr = userId.toString();
        
        if (!this.bots.has(userIdStr)) {
            console.log(`[BotManager] Création d'une nouvelle instance pour l'utilisateur ${userIdStr.substring(0, 8)}...`);
            
            const bot = new UserBotInstance(userIdStr, userConfig);
            
            // Connecte les événements au broadcast global
            bot.on('onLog', (data) => this.broadcast('onLog', { ...data, userId: userIdStr }));
            bot.on('onSignal', (data) => this.broadcast('onSignal', { ...data, userId: userIdStr }));
            bot.on('onTrade', (data) => this.broadcast('onTrade', { ...data, userId: userIdStr }));
            bot.on('onAnalysis', (data) => this.broadcast('onAnalysis', { ...data, userId: userIdStr }));
            
            this.bots.set(userIdStr, bot);
        }
        
        return this.bots.get(userIdStr);
    }

    /**
     * Récupère le bot d'un utilisateur (sans le créer)
     * @param {string} userId 
     * @returns {UserBotInstance|null}
     */
    getBot(userId) {
        return this.bots.get(userId.toString()) || null;
    }

    /**
     * Vérifie si un utilisateur a un bot actif
     * @param {string} userId 
     * @returns {boolean}
     */
    hasBot(userId) {
        return this.bots.has(userId.toString());
    }

    /**
     * Vérifie si le bot d'un utilisateur est en cours d'exécution
     * @param {string} userId 
     * @returns {boolean}
     */
    isBotRunning(userId) {
        const bot = this.getBot(userId);
        return bot ? bot.state.isRunning : false;
    }

    /**
     * Démarre le bot d'un utilisateur
     * @param {string} userId 
     * @param {Object} wallet - Wallet actif de l'utilisateur
     * @param {Object} config - Configuration optionnelle
     * @returns {Promise<boolean>}
     */
    async startBot(userId, wallet, config = {}) {
        const bot = this.getOrCreateBot(userId, config);
        
        // Initialise avec le wallet
        await bot.initializeWithWallet(wallet);
        
        // Met à jour la config si fournie
        if (Object.keys(config).length > 0) {
            bot.updateConfig(config);
        }
        
        // Démarre
        const result = await bot.start();
        
        if (result) {
            this.broadcast('onStatusChange', {
                userId: userId.toString(),
                status: 'started',
                config: bot.config
            });
        }
        
        return result;
    }

    /**
     * Arrête le bot d'un utilisateur
     * @param {string} userId 
     * @returns {boolean}
     */
    stopBot(userId) {
        const bot = this.getBot(userId);
        if (!bot) return false;
        
        const result = bot.stop();
        
        if (result) {
            this.broadcast('onStatusChange', {
                userId: userId.toString(),
                status: 'stopped'
            });
        }
        
        return result;
    }

    /**
     * Met à jour la configuration du bot d'un utilisateur
     * @param {string} userId 
     * @param {Object} config 
     */
    updateBotConfig(userId, config) {
        const bot = this.getBot(userId);
        if (bot) {
            bot.updateConfig(config);
            return true;
        }
        return false;
    }

    /**
     * Récupère le statut du bot d'un utilisateur
     * @param {string} userId 
     * @returns {Object|null}
     */
    getBotStatus(userId) {
        const bot = this.getBot(userId);
        return bot ? bot.getStatus() : null;
    }

    /**
     * Récupère les logs du bot d'un utilisateur
     * @param {string} userId 
     * @param {number} limit 
     * @returns {Array}
     */
    getBotLogs(userId, limit = 50) {
        const bot = this.getBot(userId);
        return bot ? bot.getLogs(limit) : [];
    }

    /**
     * Supprime l'instance de bot d'un utilisateur
     * @param {string} userId 
     */
    destroyBot(userId) {
        const userIdStr = userId.toString();
        const bot = this.bots.get(userIdStr);
        
        if (bot) {
            bot.destroy();
            this.bots.delete(userIdStr);
            console.log(`[BotManager] Instance supprimée pour l'utilisateur ${userIdStr.substring(0, 8)}...`);
        }
    }

    /**
     * Retourne les statistiques globales
     * @returns {Object}
     */
    getGlobalStats() {
        const stats = {
            totalBots: this.bots.size,
            runningBots: 0,
            stoppedBots: 0,
            totalAnalyses: 0,
            bots: []
        };

        for (const [userId, bot] of this.bots) {
            if (bot.state.isRunning) {
                stats.runningBots++;
            } else {
                stats.stoppedBots++;
            }
            stats.totalAnalyses += bot.state.analysisCount;
            
            stats.bots.push({
                userId: userId.substring(0, 8) + '...',
                isRunning: bot.state.isRunning,
                analysisCount: bot.state.analysisCount,
                symbols: bot.config.symbols,
                mode: bot.config.mode
            });
        }

        return stats;
    }

    /**
     * Broadcast un événement à tous les listeners globaux
     * @param {string} event 
     * @param {Object} data 
     */
    broadcast(event, data) {
        if (this.globalCallbacks[event]) {
            this.globalCallbacks[event].forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`[BotManager] Erreur broadcast ${event}:`, e);
                }
            });
        }
    }

    /**
     * Enregistre un callback global
     * @param {string} event 
     * @param {Function} callback 
     */
    on(event, callback) {
        if (this.globalCallbacks[event]) {
            this.globalCallbacks[event].push(callback);
        }
    }

    /**
     * Supprime un callback global
     * @param {string} event 
     * @param {Function} callback 
     */
    off(event, callback) {
        if (this.globalCallbacks[event]) {
            this.globalCallbacks[event] = this.globalCallbacks[event].filter(cb => cb !== callback);
        }
    }

    /**
     * Arrête tous les bots (pour shutdown propre)
     */
    stopAllBots() {
        console.log('[BotManager] Arrêt de tous les bots...');
        for (const [userId, bot] of this.bots) {
            bot.stop();
        }
    }

    /**
     * Nettoie toutes les instances
     */
    destroyAll() {
        console.log('[BotManager] Destruction de toutes les instances...');
        for (const [userId, bot] of this.bots) {
            bot.destroy();
        }
        this.bots.clear();
    }
}

// Singleton
const botManager = new BotManager();
export default botManager;
