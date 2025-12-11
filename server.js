/**
 * Hyperliquid Trading Bot - Point d'entrée principal
 * 
 * Ce fichier initialise tous les composants du bot:
 * - Serveur web avec WebSocket
 * - Authentification Hyperliquid
 * - Moteur de trading
 * 
 * Usage: node server.js
 */

import dotenv from 'dotenv';
import createWebServer from './webserver.js';
import auth from './services/hyperliquidAuth.js';
import tradeEngine from './core/tradeEngine.js';
import database from './services/database.js';

// Charge les variables d'environnement
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3002;

// Bannière ASCII
const banner = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ██╗     ██╗ ██████╗║
║   ██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██║     ██║██╔═══██╗
║   ███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║     ██║██║   ██║
║   ██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗██║     ██║██║▄▄ ██║
║   ██║  ██║   ██║   ██║     ███████╗██║  ██║███████╗██║╚██████╔╝
║   ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝ ╚═▀▀═╝ ║
║                                                               ║
║              TRADING BOT v1.0 - Ichimoku Strategy             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

/**
 * Fonction principale de démarrage
 */
async function main() {
    console.log(banner);
    console.log('🚀 Démarrage du Hyperliquid Trading Bot...\n');

    try {
        // 0. Connexion à MongoDB (optionnel)
        const mongoUri = process.env.MONGODB_URI;
        if (mongoUri) {
            console.log('[INIT] Connexion à MongoDB...');
            const dbConnected = await database.connect(mongoUri);
            if (!dbConnected) {
                console.log('[INIT] ⚠️  MongoDB non connecté. Le bot fonctionnera sans base de données.');
            }
        } else {
            console.log('[INIT] ℹ️  MongoDB non configuré (MONGODB_URI manquant). Utilisation du stockage local.');
        }

        // 1. Tente de charger les clés sauvegardées
        console.log('[INIT] Chargement des clés API...');
        const savedKeys = auth.loadKeys();
        
        if (savedKeys && savedKeys.secretPhrase) {
            try {
                await auth.initialize(savedKeys.secretPhrase);
                console.log(`[INIT] ✅ Authentification réussie: ${auth.getAddress()}`);
            } catch (e) {
                console.log('[INIT] ⚠️  Clés sauvegardées invalides. Configurez-les via le dashboard.');
            }
        } else {
            console.log('[INIT] ⚠️  Aucune clé API configurée. Configurez-les via le dashboard.');
        }

        // 2. Démarre le serveur web
        console.log('\n[INIT] Démarrage du serveur web...');
        const webServer = createWebServer(PORT);
        await webServer.start();

        // 3. Affiche les informations de connexion
        console.log('\n' + '═'.repeat(60));
        console.log('📊 DASHBOARD');
        console.log('═'.repeat(60));
        console.log(`   URL:        http://localhost:${PORT}`);
        console.log(`   WebSocket:  ws://localhost:${PORT}`);
        console.log('═'.repeat(60));
        // N'affiche les identifiants par défaut qu'en développement
        if (process.env.NODE_ENV !== 'production') {
            console.log('🔐 MODE DÉVELOPPEMENT');
            console.log('═'.repeat(60));
            console.log('   Créez un compte via l\'interface de connexion');
            console.log('═'.repeat(60) + '\n');
        }

        // 4. Gestion de l'arrêt propre
        process.on('SIGINT', async () => {
            console.log('\n[SHUTDOWN] Signal d\'arrêt reçu...');
            
            // Arrête le bot s'il est en cours
            if (tradeEngine.state.isRunning) {
                console.log('[SHUTDOWN] Arrêt du moteur de trading...');
                tradeEngine.stop();
            }

            // Arrête le serveur
            await webServer.stop();
            
            // Déconnecte MongoDB
            if (database.isConnected) {
                console.log('[SHUTDOWN] Déconnexion de MongoDB...');
                await database.disconnect();
            }
            
            console.log('[SHUTDOWN] ✅ Arrêt propre terminé');
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            process.emit('SIGINT');
        });

        // 5. Log de démarrage réussi
        console.log('[INIT] ✅ Bot prêt! Ouvrez le dashboard pour configurer et démarrer.\n');

    } catch (error) {
        console.error('[FATAL] Erreur lors du démarrage:', error);
        process.exit(1);
    }
}

// Démarre l'application
main();
