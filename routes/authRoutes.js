/**
 * Routes d'authentification
 * Gère inscription, connexion, vérification email, reset password
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import emailService from '../services/emailService.js';
import database from '../services/database.js';
import { requireAuth, JWT_SECRET, JWT_EXPIRES_IN } from '../utils/auth.js';

const router = Router();

// Avertissement si secret par défaut en production
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'hyperliquid-bot-jwt-secret-key') {
    console.error('[SECURITY] ⚠️ ATTENTION: JWT_SECRET par défaut utilisé en production!');
    console.error('[SECURITY] Définissez JWT_SECRET dans vos variables d\'environnement.');
}

// ===== FONCTIONS DE VALIDATION =====

/**
 * Valide le format d'un email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

/**
 * Valide le format d'un username (alphanumeric + underscore)
 */
function isValidUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    return usernameRegex.test(username) && username.length >= 3 && username.length <= 30;
}

/**
 * Sanitize une chaîne pour éviter les injections
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '');
}

/**
 * Protection contre les injections NoSQL
 * Rejette les objets et opérateurs MongoDB
 */
function sanitizeMongoInput(input) {
    if (typeof input !== 'string') return '';
    // Supprime les caractères spéciaux MongoDB
    return input.replace(/[${}]/g, '');
}

// ===== PROTECTION BRUTE FORCE =====
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

function checkBruteForce(ip) {
    const now = Date.now();
    const attempts = loginAttempts.get(ip);
    
    if (!attempts) return { blocked: false };
    
    // Reset si le temps de blocage est passé
    if (attempts.lockedUntil && now > attempts.lockedUntil) {
        loginAttempts.delete(ip);
        return { blocked: false };
    }
    
    if (attempts.lockedUntil) {
        const remainingTime = Math.ceil((attempts.lockedUntil - now) / 60000);
        return { blocked: true, remainingMinutes: remainingTime };
    }
    
    return { blocked: false, attempts: attempts.count };
}

function recordLoginAttempt(ip, success) {
    const now = Date.now();
    
    if (success) {
        loginAttempts.delete(ip);
        return;
    }
    
    const attempts = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
    attempts.count++;
    
    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
        attempts.lockedUntil = now + LOCKOUT_TIME;
        console.log(`[SECURITY] IP ${ip} bloquée pour ${LOCKOUT_TIME/60000} minutes après ${attempts.count} tentatives`);
    }
    
    loginAttempts.set(ip, attempts);
}

// Nettoyage périodique
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of loginAttempts.entries()) {
        if (data.lockedUntil && now > data.lockedUntil) {
            loginAttempts.delete(ip);
        }
    }
}, 60000);

// NOTE: Le middleware authenticateToken a été remplacé par requireAuth de utils/auth.js
// pour éviter la duplication de code. Exporter requireAuth pour compatibilité.
export { requireAuth as authenticateToken } from '../utils/auth.js';

/**
 * POST /api/auth/register
 * Inscription d'un nouvel utilisateur
 */
router.post('/register', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // Sanitize inputs (protection XSS + NoSQL injection)
        const cleanEmail = sanitizeMongoInput(sanitizeString(email));
        const cleanUsername = sanitizeMongoInput(sanitizeString(username));

        // Validation
        if (!cleanEmail || !cleanUsername || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email, nom d\'utilisateur et mot de passe requis' 
            });
        }

        if (!isValidEmail(cleanEmail)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Format d\'email invalide' 
            });
        }

        if (!isValidUsername(cleanUsername)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Le nom d\'utilisateur doit contenir entre 3 et 30 caractères (lettres, chiffres, underscore)' 
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ 
                success: false, 
                error: 'Le mot de passe doit contenir au moins 8 caractères' 
            });
        }

        // Vérifie si l'email existe déjà
        const existingEmail = await User.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cet email est déjà utilisé' 
            });
        }

        // Vérifie si le username existe déjà
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({ 
                success: false, 
                error: 'Ce nom d\'utilisateur est déjà pris' 
            });
        }

        // Crée l'utilisateur
        const user = new User({
            email: email.toLowerCase(),
            username,
            password
        });

        // Génère le code de vérification
        const verificationCode = user.generateEmailVerificationCode();
        await user.save();

        // Prépare les données pour l'envoi d'email (côté client)
        const emailData = emailService.getVerificationEmailData(
            user.email,
            user.username,
            verificationCode
        );

        console.log(`[AUTH] Nouvel utilisateur inscrit: ${username} (${email})`);

        res.status(201).json({
            success: true,
            message: 'Compte créé avec succès. Veuillez vérifier votre email.',
            userId: user._id,
            emailData // Le frontend utilisera ces données pour envoyer l'email via EmailJS
        });

    } catch (error) {
        console.error('[AUTH] Erreur inscription:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de l\'inscription' 
        });
    }
});

/**
 * POST /api/auth/verify-email
 * Vérifie le code de vérification email
 */
router.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email et code requis' 
            });
        }

        const user = await User.findOne({ 
            email: email.toLowerCase(),
            emailVerificationCode: code,
            emailVerificationExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                error: 'Code invalide ou expiré' 
            });
        }

        user.isEmailVerified = true;
        user.emailVerificationCode = null;
        user.emailVerificationExpires = null;
        await user.save();

        console.log(`[AUTH] Email vérifié: ${user.username}`);

        res.json({
            success: true,
            message: 'Email vérifié avec succès. Vous pouvez maintenant vous connecter.'
        });

    } catch (error) {
        console.error('[AUTH] Erreur vérification email:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la vérification' 
        });
    }
});

/**
 * POST /api/auth/resend-verification
 * Renvoie le code de vérification
 */
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'Utilisateur non trouvé' 
            });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email déjà vérifié' 
            });
        }

        const verificationCode = user.generateEmailVerificationCode();
        await user.save();

        const emailData = emailService.getVerificationEmailData(
            user.email,
            user.username,
            verificationCode
        );

        res.json({
            success: true,
            message: 'Nouveau code envoyé',
            emailData
        });

    } catch (error) {
        console.error('[AUTH] Erreur renvoi code:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors du renvoi du code' 
        });
    }
});

/**
 * POST /api/auth/login
 * Connexion utilisateur
 */
router.post('/login', async (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress;
        
        // Vérification brute force
        const bruteCheck = checkBruteForce(ip);
        if (bruteCheck.blocked) {
            return res.status(429).json({ 
                success: false, 
                error: `Trop de tentatives. Réessayez dans ${bruteCheck.remainingMinutes} minutes.` 
            });
        }

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email et mot de passe requis' 
            });
        }

        // Sanitize email
        const cleanEmail = sanitizeMongoInput(sanitizeString(email));

        // Trouve l'utilisateur
        const user = await User.findOne({ email: cleanEmail.toLowerCase() });
        
        if (!user) {
            recordLoginAttempt(ip, false);
            return res.status(401).json({ 
                success: false, 
                error: 'Email ou mot de passe incorrect' 
            });
        }

        // Vérifie le mot de passe
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            recordLoginAttempt(ip, false);
            return res.status(401).json({ 
                success: false, 
                error: 'Email ou mot de passe incorrect' 
            });
        }
        
        // Login réussi - reset les tentatives
        recordLoginAttempt(ip, true);

        // Vérifie si l'email est vérifié
        if (!user.isEmailVerified) {
            const verificationCode = user.generateEmailVerificationCode();
            await user.save();
            
            const emailData = emailService.getVerificationEmailData(
                user.email,
                user.username,
                verificationCode
            );

            return res.status(403).json({ 
                success: false, 
                error: 'Email non vérifié',
                needsVerification: true,
                emailData
            });
        }

        // Vérifie si le compte est actif
        if (!user.isActive) {
            return res.status(403).json({ 
                success: false, 
                error: 'Compte désactivé' 
            });
        }

        // Met à jour la dernière connexion
        user.lastLogin = new Date();
        await user.save();

        // Génère le token JWT
        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        console.log(`[AUTH] Connexion réussie: ${user.username}`);

        res.json({
            success: true,
            message: 'Connexion réussie',
            token,
            user: user.toPublicJSON()
        });

    } catch (error) {
        console.error('[AUTH] Erreur connexion:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la connexion' 
        });
    }
});

/**
 * GET /api/auth/me
 * Récupère les infos de l'utilisateur connecté
 */
router.get('/me', requireAuth, async (req, res) => {
    try {
        res.json({
            success: true,
            user: req.user.toPublicJSON()
        });
    } catch (error) {
        console.error('[AUTH] Erreur récupération profil:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération du profil' 
        });
    }
});

/**
 * PUT /api/auth/profile
 * Met à jour le profil utilisateur
 */
router.put('/profile', requireAuth, async (req, res) => {
    try {
        const { username } = req.body;
        const user = req.user;

        if (username && username !== user.username) {
            const existingUsername = await User.findOne({ username, _id: { $ne: user._id } });
            if (existingUsername) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Ce nom d\'utilisateur est déjà pris' 
                });
            }
            user.username = username;
        }

        await user.save();

        res.json({
            success: true,
            message: 'Profil mis à jour',
            user: user.toPublicJSON()
        });

    } catch (error) {
        console.error('[AUTH] Erreur mise à jour profil:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la mise à jour' 
        });
    }
});

/**
 * PUT /api/auth/password
 * Change le mot de passe
 */
router.put('/password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = req.user;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'Mot de passe actuel et nouveau requis' 
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ 
                success: false, 
                error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' 
            });
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                error: 'Mot de passe actuel incorrect' 
            });
        }

        user.password = newPassword;
        await user.save();

        console.log(`[AUTH] Mot de passe changé: ${user.username}`);

        res.json({
            success: true,
            message: 'Mot de passe mis à jour avec succès'
        });

    } catch (error) {
        console.error('[AUTH] Erreur changement mot de passe:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors du changement de mot de passe' 
        });
    }
});

/**
 * POST /api/auth/forgot-password
 * Demande de reset password
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            // Ne pas révéler si l'email existe ou non
            return res.json({
                success: true,
                message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
            });
        }

        const resetToken = user.generateResetPasswordToken();
        await user.save();

        const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;
        const emailData = emailService.getResetPasswordEmailData(
            user.email,
            user.username,
            resetLink
        );

        res.json({
            success: true,
            message: 'Si cet email existe, un lien de réinitialisation a été envoyé',
            emailData
        });

    } catch (error) {
        console.error('[AUTH] Erreur forgot password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la demande' 
        });
    }
});

/**
 * POST /api/auth/reset-password
 * Reset le mot de passe avec le token
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'Token et nouveau mot de passe requis' 
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ 
                success: false, 
                error: 'Le mot de passe doit contenir au moins 8 caractères' 
            });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                error: 'Token invalide ou expiré' 
            });
        }

        user.password = newPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        console.log(`[AUTH] Mot de passe réinitialisé: ${user.username}`);

        res.json({
            success: true,
            message: 'Mot de passe réinitialisé avec succès'
        });

    } catch (error) {
        console.error('[AUTH] Erreur reset password:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la réinitialisation' 
        });
    }
});

/**
 * GET /api/auth/emailjs-config
 * Retourne la config EmailJS pour le frontend
 */
router.get('/emailjs-config', (req, res) => {
    res.json({
        success: true,
        config: emailService.getConfig()
    });
});

export default router;
