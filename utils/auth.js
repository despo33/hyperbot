/**
 * Utilitaires d'authentification centralisés
 * Middlewares JWT réutilisables
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Validation stricte des variables d'environnement en production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('[FATAL] ❌ JWT_SECRET non défini en production!');
    console.error('[FATAL] Définissez JWT_SECRET dans vos variables d\'environnement.');
    process.exit(1);
}

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-jwt-secret-key-32chars';
export const JWT_EXPIRES_IN = '7d';

// Avertissement en développement
if (!process.env.JWT_SECRET) {
    console.warn('[SECURITY] ⚠️ JWT_SECRET non défini - utilisation de la clé de développement');
}

/**
 * Middleware optionnel - récupère l'utilisateur si token présent
 * Ne bloque pas si pas de token
 * Supporte: cookie httpOnly (priorité) OU header Authorization
 */
export async function optionalAuth(req, res, next) {
    // Priorité: cookie httpOnly > header Authorization
    const tokenFromCookie = req.cookies?.authToken;
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    
    const token = tokenFromCookie || tokenFromHeader;
    
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = await User.findById(decoded.userId).select('-password');
        } catch (e) {
            // Token invalide, continue sans user
            req.user = null;
        }
    }
    next();
}

/**
 * Middleware requis - bloque si pas de token valide
 * Supporte: cookie httpOnly (priorité) OU header Authorization
 */
export async function requireAuth(req, res, next) {
    // Priorité: cookie httpOnly > header Authorization
    const tokenFromCookie = req.cookies?.authToken;
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    
    const token = tokenFromCookie || tokenFromHeader;
    
    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Note: On ne peut pas utiliser lean() ici car on a besoin des méthodes Mongoose
        // (getActiveWallet, addProfile, etc.)
        req.user = await User.findById(decoded.userId).select('-password');
        
        if (!req.user) {
            return res.status(401).json({ error: 'Utilisateur non trouvé' });
        }
        next();
    } catch (e) {
        return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
}

/**
 * Génère un token JWT pour un utilisateur
 * @param {Object} user - L'utilisateur
 * @returns {string} - Le token JWT
 */
export function generateJWT(user) {
    return jwt.sign(
        { 
            userId: user._id,
            email: user.email,
            username: user.username
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Vérifie un token JWT
 * @param {string} token - Le token à vérifier
 * @returns {Object|null} - Les données décodées ou null
 */
export function verifyJWT(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

export default {
    optionalAuth,
    requireAuth,
    generateJWT,
    verifyJWT,
    JWT_SECRET,
    JWT_EXPIRES_IN
};
