/**
 * Serveur Web avec WebSocket pour le dashboard
 * Fournit l'interface d'administration et les logs en temps réel
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes.js';
import authRoutes from './routes/authRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import tradeEngine from './core/tradeEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limiting simple (en mémoire)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requêtes par minute

function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    } else {
        const data = rateLimitMap.get(ip);
        if (now > data.resetTime) {
            data.count = 1;
            data.resetTime = now + RATE_LIMIT_WINDOW;
        } else {
            data.count++;
            if (data.count > RATE_LIMIT_MAX) {
                return res.status(429).json({ error: 'Trop de requêtes. Réessayez plus tard.' });
            }
        }
    }
    next();
}

// Nettoyage périodique du rate limit map
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of rateLimitMap.entries()) {
        if (now > data.resetTime) {
            rateLimitMap.delete(ip);
        }
    }
}, 60000);

/**
 * Crée et configure le serveur web
 * @param {number} port 
 * @returns {Object}
 */
export function createWebServer(port = 3000) {
    const app = express();
    const server = createServer(app);
    const wss = new WebSocketServer({ server });

    // ===== SÉCURITÉ: Headers HTTP =====
    app.use((req, res, next) => {
        // Protection XSS
        res.setHeader('X-XSS-Protection', '1; mode=block');
        // Empêche le sniffing MIME
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Clickjacking protection
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        // Referrer policy
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        // Permissions policy
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        // Content Security Policy (CSP) - Protection XSS avancée
        // Note: CSP désactivée temporairement pour compatibilité avec les CDN
        // À réactiver avec une configuration plus permissive si nécessaire
        /*
        if (process.env.NODE_ENV === 'production') {
            res.setHeader('Content-Security-Policy', 
                "default-src 'self'; " +
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; " +
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
                "font-src 'self' https://fonts.gstatic.com data:; " +
                "img-src 'self' data: https: blob:; " +
                "connect-src 'self' wss: ws: https:; " +
                "frame-ancestors 'none';"
            );
        }
        */
        // Strict Transport Security (HTTPS only)
        if (process.env.NODE_ENV === 'production') {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        next();
    });

    // Rate limiting
    app.use(rateLimit);

    // Middleware
    app.use(express.json({ limit: '1mb' })); // Limite la taille des requêtes
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // CORS configuré selon l'environnement
    const corsOrigin = process.env.CORS_ORIGIN || '*';
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', corsOrigin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.header('Access-Control-Allow-Credentials', 'true');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    });

    // Fichiers statiques (dashboard) - avec options de sécurité
    app.use(express.static(path.join(__dirname, 'web'), {
        dotfiles: 'deny',        // Refuse l'accès aux fichiers .xxx
        index: false,            // Pas d'index automatique
        maxAge: '1d'             // Cache 1 jour en production
    }));

    // Routes API
    app.use('/api', routes);
    app.use('/api/auth', authRoutes);
    app.use('/api/wallets', walletRoutes);

    // Route par défaut - redirige vers login ou dashboard
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

    // Gestion des erreurs
    app.use((err, req, res, next) => {
        console.error('[SERVER] Erreur:', err.message);
        res.status(500).json({ error: 'Erreur serveur interne' });
    });

    // WebSocket - Connexions en temps réel
    const clients = new Set();
    const MAX_WS_CLIENTS = 50; // Limite de connexions simultanées

    wss.on('connection', (ws, req) => {
        // Limite le nombre de connexions
        if (clients.size >= MAX_WS_CLIENTS) {
            console.log('[WS] Connexion refusée - limite atteinte');
            ws.close(1013, 'Trop de connexions');
            return;
        }

        console.log('[WS] Nouvelle connexion');
        clients.add(ws);
        console.log(`[WS] Client connecté (total: ${clients.size})`);

        // Envoie l'état initial
        ws.send(JSON.stringify({
            type: 'connected',
            timestamp: Date.now(),
            message: 'Connecté au serveur de trading'
        }));

        // Gestion des messages entrants
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                handleWebSocketMessage(ws, data);
            } catch (e) {
                console.error('[WS] Erreur parsing message:', e.message);
            }
        });

        // Déconnexion
        ws.on('close', () => {
            clients.delete(ws);
            console.log(`[WS] Client déconnecté (restant: ${clients.size})`);
        });

        ws.on('error', (error) => {
            console.error('[WS] Erreur:', error.message);
            clients.delete(ws);
        });
    });

    /**
     * Gère les messages WebSocket entrants
     * @param {WebSocket} ws 
     * @param {Object} data 
     */
    function handleWebSocketMessage(ws, data) {
        switch (data.type) {
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;

            case 'subscribe':
                // Abonnement à un type d'événement spécifique
                ws.subscriptions = ws.subscriptions || new Set();
                ws.subscriptions.add(data.channel);
                ws.send(JSON.stringify({ 
                    type: 'subscribed', 
                    channel: data.channel 
                }));
                break;

            case 'unsubscribe':
                if (ws.subscriptions) {
                    ws.subscriptions.delete(data.channel);
                }
                break;

            default:
                console.log('[WS] Message non géré:', data.type);
        }
    }

    /**
     * Broadcast un message à tous les clients connectés
     * @param {string} type 
     * @param {Object} data 
     * @param {string} channel - Optionnel, pour filtrer par abonnement
     */
    function broadcast(type, data, channel = null) {
        const message = JSON.stringify({
            type,
            timestamp: Date.now(),
            data
        });

        clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                // Si un channel est spécifié, vérifie l'abonnement
                if (channel && client.subscriptions && !client.subscriptions.has(channel)) {
                    return;
                }
                client.send(message);
            }
        });
    }

    // Abonne aux événements du trade engine
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

    // Ping périodique pour maintenir les connexions
    setInterval(() => {
        clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
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
