/**
 * Middleware de sécurité centralisé
 * Gère HTTPS, HSTS, CSRF, rate limiting renforcé, et headers de sécurité
 */

import crypto from 'crypto';

// ==================== CONFIGURATION ====================

const SECURITY_CONFIG = {
    // Rate limiting renforcé
    rateLimit: {
        windowMs: 60000,           // 1 minute
        maxRequests: 60,           // 60 req/min pour les routes normales
        maxAuthRequests: 10,       // 10 tentatives de login/min
        maxApiRequests: 100,       // 100 req/min pour les routes API authentifiées
        blockDuration: 300000      // 5 minutes de blocage si dépassement
    },
    // CORS
    cors: {
        // En production, définir CORS_ORIGINS dans .env (séparés par virgule)
        // Ex: CORS_ORIGINS=https://monsite.com,https://app.monsite.com
        allowedOrigins: process.env.CORS_ORIGINS 
            ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
            : null, // null = même origine uniquement en production
        allowCredentials: true
    },
    // CSRF
    csrf: {
        tokenLength: 32,
        cookieName: '_csrf',
        headerName: 'x-csrf-token'
    }
};

// ==================== RATE LIMITING AVANCÉ ====================

const rateLimitStore = new Map();
const blockedIPs = new Map();

/**
 * Nettoie les entrées expirées
 */
function cleanupRateLimitStore() {
    const now = Date.now();
    for (const [ip, data] of rateLimitStore.entries()) {
        if (now > data.resetTime + 60000) {
            rateLimitStore.delete(ip);
        }
    }
    for (const [ip, blockUntil] of blockedIPs.entries()) {
        if (now > blockUntil) {
            blockedIPs.delete(ip);
        }
    }
}

// Nettoyage périodique
setInterval(cleanupRateLimitStore, 60000);

/**
 * Rate limiter configurable
 * @param {string} type - 'default', 'auth', 'api'
 */
export function rateLimiter(type = 'default') {
    const limits = {
        default: SECURITY_CONFIG.rateLimit.maxRequests,
        auth: SECURITY_CONFIG.rateLimit.maxAuthRequests,
        api: SECURITY_CONFIG.rateLimit.maxApiRequests
    };
    const maxRequests = limits[type] || limits.default;

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();

        // Vérifie si l'IP est bloquée
        if (blockedIPs.has(ip)) {
            const blockUntil = blockedIPs.get(ip);
            if (now < blockUntil) {
                const remainingSeconds = Math.ceil((blockUntil - now) / 1000);
                res.set('Retry-After', remainingSeconds);
                return res.status(429).json({ 
                    error: 'Trop de requêtes. Réessayez plus tard.',
                    retryAfter: remainingSeconds
                });
            }
            blockedIPs.delete(ip);
        }

        const key = `${ip}_${type}`;
        
        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, { 
                count: 1, 
                resetTime: now + SECURITY_CONFIG.rateLimit.windowMs 
            });
        } else {
            const data = rateLimitStore.get(key);
            if (now > data.resetTime) {
                data.count = 1;
                data.resetTime = now + SECURITY_CONFIG.rateLimit.windowMs;
            } else {
                data.count++;
                if (data.count > maxRequests) {
                    // Bloque l'IP temporairement si dépassement important
                    if (data.count > maxRequests * 2) {
                        blockedIPs.set(ip, now + SECURITY_CONFIG.rateLimit.blockDuration);
                        console.warn(`[SECURITY] IP bloquée pour abus: ${ip}`);
                    }
                    res.set('Retry-After', Math.ceil((data.resetTime - now) / 1000));
                    return res.status(429).json({ 
                        error: 'Trop de requêtes. Réessayez plus tard.' 
                    });
                }
            }
        }

        // Headers de rate limit
        const data = rateLimitStore.get(key);
        res.set('X-RateLimit-Limit', maxRequests);
        res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - data.count));
        res.set('X-RateLimit-Reset', Math.ceil(data.resetTime / 1000));

        next();
    };
}

// ==================== CSRF PROTECTION ====================

const csrfTokens = new Map();

/**
 * Génère un token CSRF
 */
export function generateCSRFToken() {
    return crypto.randomBytes(SECURITY_CONFIG.csrf.tokenLength).toString('hex');
}

/**
 * Middleware CSRF - génère et valide les tokens
 */
export function csrfProtection(req, res, next) {
    // Skip pour les requêtes GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        // Génère un token pour les requêtes GET
        const token = generateCSRFToken();
        const sessionId = req.sessionID || req.ip || 'default';
        csrfTokens.set(sessionId, { token, expires: Date.now() + 3600000 }); // 1h
        res.cookie(SECURITY_CONFIG.csrf.cookieName, token, {
            httpOnly: false, // Doit être lisible par JS
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600000
        });
        req.csrfToken = () => token;
        return next();
    }

    // Valide le token pour les requêtes mutantes
    const tokenFromHeader = req.headers[SECURITY_CONFIG.csrf.headerName];
    const tokenFromBody = req.body?._csrf;
    const tokenFromCookie = req.cookies?.[SECURITY_CONFIG.csrf.cookieName];
    const submittedToken = tokenFromHeader || tokenFromBody;

    if (!submittedToken) {
        return res.status(403).json({ error: 'Token CSRF manquant' });
    }

    // Vérifie que le token correspond
    const sessionId = req.sessionID || req.ip || 'default';
    const storedData = csrfTokens.get(sessionId);

    if (!storedData || storedData.token !== submittedToken || Date.now() > storedData.expires) {
        return res.status(403).json({ error: 'Token CSRF invalide ou expiré' });
    }

    next();
}

// Nettoyage des tokens expirés
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of csrfTokens.entries()) {
        if (now > data.expires) {
            csrfTokens.delete(key);
        }
    }
}, 300000); // 5 min

// ==================== CORS SÉCURISÉ ====================

/**
 * Middleware CORS sécurisé
 */
export function secureCors(req, res, next) {
    const origin = req.headers.origin;
    const isProduction = process.env.NODE_ENV === 'production';

    // En développement, autorise tout
    if (!isProduction) {
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');
        res.header('Access-Control-Allow-Credentials', 'true');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        return next();
    }

    // En production, vérifie l'origine
    const allowedOrigins = SECURITY_CONFIG.cors.allowedOrigins;
    
    if (allowedOrigins && allowedOrigins.length > 0) {
        if (origin && allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        } else if (!origin) {
            // Requêtes same-origin (pas de header Origin)
            res.header('Access-Control-Allow-Origin', req.protocol + '://' + req.get('host'));
        } else {
            // Origine non autorisée
            return res.status(403).json({ error: 'Origine non autorisée' });
        }
    } else {
        // Pas d'origines configurées = même origine uniquement
        if (origin) {
            const host = req.get('host');
            const expectedOrigins = [
                `http://${host}`,
                `https://${host}`
            ];
            if (!expectedOrigins.includes(origin)) {
                return res.status(403).json({ error: 'Origine non autorisée' });
            }
            res.header('Access-Control-Allow-Origin', origin);
        }
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24h cache preflight

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
}

// ==================== HTTPS REDIRECT ====================

/**
 * Force HTTPS en production (seulement si ENABLE_HTTPS_REDIRECT=true)
 * Par défaut désactivé pour permettre HTTP sans certificat SSL
 */
export function forceHTTPS(req, res, next) {
    // Désactivé par défaut - activer avec ENABLE_HTTPS_REDIRECT=true
    if (process.env.ENABLE_HTTPS_REDIRECT !== 'true') {
        return next();
    }

    if (process.env.NODE_ENV !== 'production') {
        return next();
    }

    // Vérifie si derrière un proxy (Cloudflare, nginx, etc.)
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    
    if (proto !== 'https') {
        // Redirige vers HTTPS
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
}

// ==================== HEADERS DE SÉCURITÉ ADDITIONNELS ====================

/**
 * Headers de sécurité supplémentaires
 */
export function securityHeaders(req, res, next) {
    // Empêche le MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Protection XSS (legacy, CSP est préféré)
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Empêche le clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions policy (remplace Feature-Policy)
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // HSTS en production (force HTTPS pendant 1 an)
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_HSTS === 'true') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    next();
}

// ==================== VALIDATION IP ====================

/**
 * Liste blanche d'IPs (optionnel)
 * Définir IP_WHITELIST dans .env (séparées par virgule)
 */
export function ipWhitelist(req, res, next) {
    const whitelist = process.env.IP_WHITELIST;
    if (!whitelist) {
        return next(); // Pas de whitelist = tout autorisé
    }

    const allowedIPs = whitelist.split(',').map(ip => ip.trim());
    const clientIP = req.ip || req.connection.remoteAddress;

    // Normalise l'IP (IPv6 localhost)
    const normalizedIP = clientIP === '::1' ? '127.0.0.1' : clientIP.replace('::ffff:', '');

    if (!allowedIPs.includes(normalizedIP) && !allowedIPs.includes('*')) {
        console.warn(`[SECURITY] Accès refusé pour IP: ${normalizedIP}`);
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    next();
}

// ==================== LOGGING SÉCURITÉ ====================

/**
 * Log les tentatives suspectes
 */
export function securityLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const ip = req.ip || req.connection.remoteAddress;
        
        // Log les erreurs 4xx/5xx
        if (res.statusCode >= 400) {
            const logLevel = res.statusCode >= 500 ? 'error' : 'warn';
            console[logLevel](`[SECURITY] ${req.method} ${req.path} - ${res.statusCode} - ${ip} - ${duration}ms`);
        }
        
        // Log les tentatives d'auth échouées
        if (req.path.includes('/auth/login') && res.statusCode === 401) {
            console.warn(`[SECURITY] Tentative de connexion échouée depuis ${ip}`);
        }
    });

    next();
}

// ==================== EXPORT PAR DÉFAUT ====================

export default {
    rateLimiter,
    csrfProtection,
    generateCSRFToken,
    secureCors,
    forceHTTPS,
    securityHeaders,
    ipWhitelist,
    securityLogger,
    SECURITY_CONFIG
};
