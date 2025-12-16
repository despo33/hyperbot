/**
 * Routes d'administration
 * Gère les utilisateurs et les paramètres système
 */

import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../utils/auth.js';

const router = Router();

/**
 * Middleware pour vérifier le rôle admin
 */
const requireAdmin = async (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            error: 'Accès refusé. Droits administrateur requis.' 
        });
    }
    next();
};

/**
 * GET /api/admin/users
 * Liste tous les utilisateurs
 */
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', status = 'all' } = req.query;
        
        // Construit le filtre
        const filter = {};
        
        if (search) {
            filter.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status === 'active') {
            filter.isActive = true;
        } else if (status === 'inactive') {
            filter.isActive = false;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [users, total] = await Promise.all([
            User.find(filter)
                .select('-password -wallets.secretPhrase -resetPasswordToken')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(filter)
        ]);
        
        res.json({
            success: true,
            users: users.map(u => ({
                id: u._id,
                email: u.email,
                username: u.username,
                role: u.role || 'user',
                isActive: u.isActive !== false,
                isEmailVerified: u.isEmailVerified,
                walletsCount: u.wallets?.length || 0,
                createdAt: u.createdAt,
                lastLogin: u.lastLogin,
                stats: u.stats
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('[ADMIN] Erreur liste users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/users/:id
 * Détails d'un utilisateur
 */
router.get('/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password -wallets.secretPhrase -resetPasswordToken');
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                role: user.role || 'user',
                isActive: user.isActive !== false,
                isEmailVerified: user.isEmailVerified,
                wallets: user.wallets?.map(w => ({
                    id: w._id,
                    name: w.name,
                    address: w.address,
                    tradingAddress: w.tradingAddress,
                    isActive: w.isActive
                })) || [],
                botConfig: user.botConfig,
                stats: user.stats,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        console.error('[ADMIN] Erreur détails user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/admin/users/:id
 * Modifier un utilisateur
 */
router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { username, email, role, isActive } = req.body;
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        // Empêche de modifier son propre rôle
        if (req.user._id.toString() === user._id.toString() && role && role !== user.role) {
            return res.status(400).json({ 
                success: false, 
                error: 'Vous ne pouvez pas modifier votre propre rôle' 
            });
        }
        
        // Vérifie l'unicité du username
        if (username && username !== user.username) {
            const existing = await User.findOne({ username, _id: { $ne: user._id } });
            if (existing) {
                return res.status(400).json({ success: false, error: 'Ce nom d\'utilisateur est déjà pris' });
            }
            user.username = username;
        }
        
        // Vérifie l'unicité de l'email
        if (email && email !== user.email) {
            const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
            if (existing) {
                return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé' });
            }
            user.email = email.toLowerCase();
        }
        
        if (role && ['user', 'admin'].includes(role)) {
            user.role = role;
        }
        
        if (typeof isActive === 'boolean') {
            user.isActive = isActive;
        }
        
        await user.save();
        
        console.log(`[ADMIN] User modifié: ${user.username} par ${req.user.username}`);
        
        res.json({
            success: true,
            message: 'Utilisateur mis à jour',
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('[ADMIN] Erreur modification user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Supprimer un utilisateur
 */
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        // Empêche de se supprimer soi-même
        if (req.user._id.toString() === user._id.toString()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Vous ne pouvez pas supprimer votre propre compte' 
            });
        }
        
        await User.findByIdAndDelete(req.params.id);
        
        console.log(`[ADMIN] User supprimé: ${user.username} par ${req.user.username}`);
        
        res.json({
            success: true,
            message: 'Utilisateur supprimé'
        });
    } catch (error) {
        console.error('[ADMIN] Erreur suppression user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Réinitialiser le mot de passe d'un utilisateur
 */
router.post('/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ 
                success: false, 
                error: 'Le mot de passe doit contenir au moins 8 caractères' 
            });
        }
        
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        }
        
        user.password = newPassword;
        await user.save();
        
        console.log(`[ADMIN] Password reset pour: ${user.username} par ${req.user.username}`);
        
        res.json({
            success: true,
            message: 'Mot de passe réinitialisé'
        });
    } catch (error) {
        console.error('[ADMIN] Erreur reset password:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/stats
 * Statistiques globales
 */
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
        const [
            totalUsers,
            activeUsers,
            verifiedUsers,
            adminUsers
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isActive: true }),
            User.countDocuments({ isEmailVerified: true }),
            User.countDocuments({ role: 'admin' })
        ]);
        
        // Utilisateurs créés cette semaine
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: oneWeekAgo } });
        
        res.json({
            success: true,
            stats: {
                totalUsers,
                activeUsers,
                inactiveUsers: totalUsers - activeUsers,
                verifiedUsers,
                adminUsers,
                newUsersThisWeek
            }
        });
    } catch (error) {
        console.error('[ADMIN] Erreur stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/admin/create-admin
 * Créer le premier admin (uniquement s'il n'y a pas d'admin)
 */
router.post('/create-first-admin', async (req, res) => {
    try {
        // Vérifie s'il existe déjà un admin
        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            return res.status(400).json({ 
                success: false, 
                error: 'Un administrateur existe déjà' 
            });
        }
        
        const { email, username, password, secretKey } = req.body;
        
        // Clé secrète pour créer le premier admin (à définir dans .env)
        const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || 'hyperbot-admin-2024';
        if (secretKey !== ADMIN_SECRET) {
            return res.status(403).json({ 
                success: false, 
                error: 'Clé secrète invalide' 
            });
        }
        
        if (!email || !username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email, username et password requis' 
            });
        }
        
        const admin = new User({
            email: email.toLowerCase(),
            username,
            password,
            role: 'admin',
            isActive: true,
            isEmailVerified: true
        });
        
        await admin.save();
        
        console.log(`[ADMIN] Premier admin créé: ${username}`);
        
        res.json({
            success: true,
            message: 'Administrateur créé avec succès'
        });
    } catch (error) {
        console.error('[ADMIN] Erreur création admin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
