/**
 * Serveur Web avec WebSocket pour le dashboard
 * Fournit l'interface d'administration et les logs en temps réel
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import routes from './routes.js';
import authRoutes from './routes/authRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import tradeEngine from './core/tradeEngine.js';
import botManager from './core/BotManager.js';
import logger from './services/logger.js';
import { verifyJWT } from './utils/auth.js';
import { 
    rateLimiter, 
    secureCors, 
    forceHTTPS, 
    securityHeaders, 
    securityLogger 
} from './utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limiting géré par utils/security.js

/**
 * Crée et configure le serveur web
 * @param {number} port 
 * @returns {Object}
 */
export function createWebServer(port = 3000) {
    const app = express();
    const server = createServer(app);
    const wss = new WebSocketServer({ server });

    // ===== SÉCURITÉ: Force HTTPS en production =====
    app.use(forceHTTPS);

    // ===== SÉCURITÉ: Headers HTTP avec Helmet =====
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://s3.tradingview.com"],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
                imgSrc: ["'self'", "data:", "https:", "blob:"],
                connectSrc: ["'self'", "wss:", "ws:", "https:", "http:"],
                frameSrc: ["'self'", "https://s.tradingview.com", "https://s3.tradingview.com", "https://*.tradingview.com"],
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: null
            }
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
        // HSTS activé si ENABLE_HSTS=true dans .env
        hsts: process.env.ENABLE_HSTS === 'true' ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        } : false
    }));

    // ===== SÉCURITÉ: Headers additionnels =====
    app.use(securityHeaders);

    // ===== SÉCURITÉ: Logging des requêtes suspectes =====
    app.use(securityLogger);

    // ===== SÉCURITÉ: Rate limiting renforcé =====
    app.use(rateLimiter('default'));

    // Middleware
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(cookieParser());

    // ===== SÉCURITÉ: CORS sécurisé =====
    // En production, définir CORS_ORIGINS dans .env
    app.use(secureCors);

    // Choix du frontend: 'vue' pour le nouveau, 'legacy' pour l'ancien
    const frontendMode = process.env.FRONTEND_MODE || 'legacy';
    const webDir = frontendMode === 'vue' ? 'web-vue' : 'web';
    
    // Fichiers statiques (dashboard) - avec options de sécurité
    app.use(express.static(path.join(__dirname, webDir), {
        dotfiles: 'deny',        // Refuse l'accès aux fichiers .xxx
        index: false,            // Pas d'index automatique
        maxAge: '1d'             // Cache 1 jour en production
    }));
    
    // Ancien frontend (legacy) - toujours accessible sur /legacy
    app.use('/legacy', express.static(path.join(__dirname, 'web'), {
        dotfiles: 'deny',
        index: false,
        maxAge: '1d'
    }));

    // Routes API
    app.use('/api', routes);
    app.use('/api/auth', authRoutes);
    app.use('/api/wallets', walletRoutes);
    app.use('/api/admin', adminRoutes);

    // Routes pour le nouveau frontend Vue.js (SPA)
    if (frontendMode === 'vue') {
        // Toutes les routes non-API renvoient index.html (SPA routing)
        app.get('*', (req, res, next) => {
            // Skip API routes
            if (req.path.startsWith('/api') || req.path.startsWith('/legacy')) {
                return next();
            }
            res.sendFile(path.join(__dirname, webDir, 'index.html'));
        });
    } else {
        // Route par défaut - redirige vers login ou dashboard (legacy)
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'web', 'login.html'));
        });
        
        // Route dashboard (protégée côté client)
        app.get('/dashboard', (req, res) => {
            res.sendFile(path.join(__dirname, 'web', 'dashboard.html'));
        });
        
        // Route reset password
        app.get('/reset-password', (req, res) => {
            res.sendFile(path.join(__dirname, 'web', 'reset-password.html'));
        });
    }

    // Gestion des erreurs
    app.use((err, req, res, next) => {
        console.error('[SERVER] Erreur:', err.message);
        res.status(500).json({ error: 'Erreur serveur interne' });
    });

    // ===== WebSocket SÉCURISÉ avec authentification JWT =====
    const clients = new Map(); // Map<ws, { userId, authenticated, subscriptions }>
    const MAX_WS_CLIENTS = 50;
    const WS_AUTH_TIMEOUT = 10000; // 10s pour s'authentifier

    wss.on('connection', (ws, req) => {
        // Limite le nombre de connexions
        if (clients.size >= MAX_WS_CLIENTS) {
            console.log('[WS] Connexion refusée - limite atteinte');
            ws.close(1013, 'Trop de connexions');
            return;
        }

        // Extrait le token du query string ou des headers
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        
        // Initialise le client comme non authentifié
        const clientData = {
            authenticated: false,
            userId: null,
            subscriptions: new Set(),
            ip: req.socket.remoteAddress
        };
        clients.set(ws, clientData);

        console.log(`[WS] Nouvelle connexion depuis ${clientData.ip} (total: ${clients.size})`);

        // Si token fourni dans l'URL, authentifie immédiatement
        if (token) {
            const decoded = verifyJWT(token);
            if (decoded) {
                clientData.authenticated = true;
                clientData.userId = decoded.userId;
                console.log(`[WS] Client authentifié: ${decoded.userId}`);
            }
        }

        // Timeout d'authentification - déconnecte si pas authentifié après 10s
        // (Désactivé en développement pour faciliter les tests)
        let authTimeout = null;
        if (process.env.NODE_ENV === 'production' && process.env.WS_REQUIRE_AUTH === 'true') {
            authTimeout = setTimeout(() => {
                if (!clientData.authenticated) {
                    console.log(`[WS] Client non authentifié déconnecté: ${clientData.ip}`);
                    ws.close(4001, 'Authentification requise');
                }
            }, WS_AUTH_TIMEOUT);
        }

        // Envoie l'état initial
        ws.send(JSON.stringify({
            type: 'connected',
            timestamp: Date.now(),
            authenticated: clientData.authenticated,
            message: clientData.authenticated 
                ? 'Connecté et authentifié' 
                : 'Connecté - Authentification requise pour les données sensibles'
        }));

        // Gestion des messages entrants
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                handleWebSocketMessage(ws, data, clientData);
            } catch (e) {
                console.error('[WS] Erreur parsing message:', e.message);
            }
        });

        // Déconnexion
        ws.on('close', () => {
            if (authTimeout) clearTimeout(authTimeout);
            clients.delete(ws);
            console.log(`[WS] Client déconnecté (restant: ${clients.size})`);
        });

        ws.on('error', (error) => {
            console.error('[WS] Erreur:', error.message);
            if (authTimeout) clearTimeout(authTimeout);
            clients.delete(ws);
        });
    });

    /**
     * Gère les messages WebSocket entrants
     * @param {WebSocket} ws 
     * @param {Object} data 
     * @param {Object} clientData - Données du client (auth, userId, etc.)
     */
    function handleWebSocketMessage(ws, data, clientData) {
        switch (data.type) {
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;

            case 'auth':
                // Authentification via JWT
                if (data.token) {
                    const decoded = verifyJWT(data.token);
                    if (decoded) {
                        clientData.authenticated = true;
                        clientData.userId = decoded.userId;
                        ws.send(JSON.stringify({ 
                            type: 'authenticated', 
                            success: true,
                            userId: decoded.userId 
                        }));
                        console.log(`[WS] Client authentifié via message: ${decoded.userId}`);
                    } else {
                        ws.send(JSON.stringify({ 
                            type: 'authenticated', 
                            success: false,
                            error: 'Token invalide' 
                        }));
                    }
                }
                break;

            case 'subscribe':
                // Vérifie l'authentification pour les channels sensibles
                const sensitiveChannels = ['trades', 'signals', 'logs', 'analysis', 'status'];
                const requiresAuth = sensitiveChannels.includes(data.channel);
                
                if (requiresAuth && !clientData.authenticated && process.env.NODE_ENV === 'production') {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        error: 'Authentification requise pour ce channel',
                        channel: data.channel
                    }));
                    return;
                }
                
                clientData.subscriptions.add(data.channel);
                ws.send(JSON.stringify({ 
                    type: 'subscribed', 
                    channel: data.channel 
                }));
                break;

            case 'unsubscribe':
                clientData.subscriptions.delete(data.channel);
                ws.send(JSON.stringify({ 
                    type: 'unsubscribed', 
                    channel: data.channel 
                }));
                break;

            default:
                console.log('[WS] Message non géré:', data.type);
        }
    }

    /**
     * Broadcast un message à tous les clients connectés et authentifiés
     * @param {string} type 
     * @param {Object} data 
     * @param {string} channel - Optionnel, pour filtrer par abonnement
     * @param {boolean} requireAuth - Si true, n'envoie qu'aux clients authentifiés
     */
    function broadcast(type, data, channel = null, requireAuth = true) {
        const message = JSON.stringify({
            type,
            timestamp: Date.now(),
            data
        });

        // En production, les données sensibles ne sont envoyées qu'aux clients authentifiés
        const isProduction = process.env.NODE_ENV === 'production';
        const sensitiveChannels = ['trades', 'signals', 'logs', 'analysis', 'status'];
        const isSensitive = sensitiveChannels.includes(channel);

        clients.forEach((clientData, ws) => {
            if (ws.readyState !== 1) return; // WebSocket.OPEN
            
            // Vérifie l'authentification pour les données sensibles en production
            if (isProduction && isSensitive && requireAuth && !clientData.authenticated) {
                return;
            }
            
            // Vérifie l'abonnement au channel
            if (channel && !clientData.subscriptions.has(channel)) {
                return;
            }
            
            ws.send(message);
        });
    }

    // Abonne aux événements du trade engine (ancien système - fallback)
    tradeEngine.on('onLog', (log) => {
        broadcast('log', log, 'logs');
    });

    tradeEngine.on('onSignal', (signal) => {
        broadcast('signal', signal, 'signals');
    });

    tradeEngine.on('onTrade', (trade) => {
        broadcast('trade', trade, 'trades');
    });

    tradeEngine.on('onAnalysis', (analysis) => {
        broadcast('analysis', analysis, 'analysis');
    });

    // Abonne aux événements du BotManager (multi-utilisateurs)
    botManager.on('onLog', (log) => {
        console.log('[WS] Broadcasting log:', log.message?.substring(0, 50));
        broadcast('log', log, 'logs');
    });

    botManager.on('onSignal', (signal) => {
        broadcast('signal', signal, 'signals');
    });

    botManager.on('onTrade', (trade) => {
        broadcast('trade', trade, 'trades');
    });

    botManager.on('onAnalysis', (analysis) => {
        broadcast('analysis', analysis, 'analysis');
    });

    botManager.on('onStatusChange', (status) => {
        broadcast('botStatus', status, 'status');
    });

    // Ping périodique pour maintenir les connexions
    setInterval(() => {
        clients.forEach((clientData, ws) => {
            if (ws.readyState === 1) {
                ws.send(JSON.stringify({ 
                    type: 'heartbeat', 
                    timestamp: Date.now(),
                    authenticated: clientData.authenticated
                }));
            }
        });
    }, 30000);

    /**
     * Démarre le serveur
     */
    function start() {
        return new Promise((resolve) => {
            server.listen(port, () => {
                console.log(`[SERVER] 🚀 Serveur démarré sur http://localhost:${port}`);
                console.log(`[SERVER] 📊 Dashboard: http://localhost:${port}`);
                console.log(`[SERVER] 🔌 WebSocket: ws://localhost:${port}`);
                resolve({ port, url: `http://localhost:${port}` });
            });
        });
    }

    /**
     * Arrête le serveur
     */
    function stop() {
        return new Promise((resolve) => {
            // Ferme toutes les connexions WebSocket
            clients.forEach(client => {
                client.close(1000, 'Serveur arrêté');
            });
            clients.clear();

            server.close(() => {
                console.log('[SERVER] Serveur arrêté');
                resolve();
            });
        });
    }

    return {
        app,
        server,
        wss,
        start,
        stop,
        broadcast,
        getClients: () => clients.size
    };
}

export default createWebServer;
