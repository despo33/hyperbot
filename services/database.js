/**
 * Service de connexion MongoDB
 * Gère la connexion à la base de données et les modèles
 */

import mongoose from 'mongoose';

class DatabaseService {
    constructor() {
        this.isConnected = false;
        this.connection = null;
    }

    /**
     * Connecte à MongoDB
     * @param {string} connectionString - URI de connexion MongoDB
     * @returns {Promise<boolean>}
     */
    async connect(connectionString) {
        if (this.isConnected) {
            console.log('[MongoDB] Déjà connecté');
            return true;
        }

        if (!connectionString) {
            console.error('[MongoDB] ❌ Connection string manquante');
            return false;
        }

        try {
            console.log('[MongoDB] Connexion en cours...');
            
            this.connection = await mongoose.connect(connectionString, {
                // Options recommandées pour MongoDB Atlas
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000,
                maxPoolSize: 10,
                retryWrites: true,
            });

            this.isConnected = true;
            console.log('[MongoDB] ✅ Connecté avec succès');
            
            // Gestion des événements de connexion
            mongoose.connection.on('error', (err) => {
                console.error('[MongoDB] ❌ Erreur de connexion:', err.message);
                this.isConnected = false;
            });

            mongoose.connection.on('disconnected', () => {
                console.log('[MongoDB] ⚠️ Déconnecté');
                this.isConnected = false;
            });

            mongoose.connection.on('reconnected', () => {
                console.log('[MongoDB] ✅ Reconnecté');
                this.isConnected = true;
            });

            return true;
        } catch (error) {
            console.error('[MongoDB] ❌ Erreur de connexion:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Déconnecte de MongoDB
     */
    async disconnect() {
        if (!this.isConnected) {
            return;
        }

        try {
            await mongoose.disconnect();
            this.isConnected = false;
            console.log('[MongoDB] Déconnecté proprement');
        } catch (error) {
            console.error('[MongoDB] Erreur lors de la déconnexion:', error.message);
        }
    }

    /**
     * Vérifie l'état de la connexion
     * @returns {boolean}
     */
    checkConnection() {
        return this.isConnected && mongoose.connection.readyState === 1;
    }

    /**
     * Retourne les statistiques de la base de données
     * @returns {Object}
     */
    async getStats() {
        if (!this.checkConnection()) {
            return { connected: false };
        }

        try {
            const admin = mongoose.connection.db.admin();
            const serverStatus = await admin.serverStatus();
            
            return {
                connected: true,
                host: mongoose.connection.host,
                name: mongoose.connection.name,
                collections: await mongoose.connection.db.listCollections().toArray(),
                uptime: serverStatus.uptime,
                version: serverStatus.version
            };
        } catch (error) {
            return {
                connected: true,
                host: mongoose.connection.host,
                name: mongoose.connection.name,
                error: error.message
            };
        }
    }
}

// Export singleton
const database = new DatabaseService();
export default database;
