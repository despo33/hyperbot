/**
 * Utilitaires d'authentification centralisés
 * Middlewares JWT réutilisables
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hyperliquid-bot-jwt-secret-key';
const JWT_EXPIRES_IN = '7d';

/**
 * Middleware optionnel - récupère l'utilisateur si token présent
 * Ne bloque pas si pas de token
 */
export async function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
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
 */
export async function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
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
