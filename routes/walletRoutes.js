/**
 * Routes de gestion des wallets
 * CRUD pour les wallets Hyperliquid de l'utilisateur
 */

import { Router } from 'express';
import { authenticateToken } from './authRoutes.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

const router = Router();

/**
 * GET /api/wallets
 * Liste tous les wallets de l'utilisateur
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const wallets = req.user.wallets.map(w => ({
            id: w._id,
            name: w.name,
            address: w.address,
            tradingAddress: w.tradingAddress,
            isActive: w.isActive,
            addedAt: w.addedAt
        }));

        res.json({
            success: true,
            wallets,
            activeIndex: req.user.activeWalletIndex
        });

    } catch (error) {
        console.error('[WALLET] Erreur liste wallets:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération des wallets' 
        });
    }
});

/**
 * POST /api/wallets
 * Ajoute un nouveau wallet
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, secretPhrase, tradingAddress } = req.body;

        if (!secretPhrase) {
            return res.status(400).json({ 
                success: false, 
                error: 'La phrase secrète est requise' 
            });
        }

        // Valide et génère l'adresse à partir de la phrase secrète ou clé privée
        let address = '';
        try {
            const { ethers } = await import('ethers');
            let wallet;
            
            // Détecte si c'est une clé privée (commence par 0x) ou une seed phrase
            if (secretPhrase.startsWith('0x')) {
                // Clé privée
                wallet = new ethers.Wallet(secretPhrase);
            } else {
                // Seed phrase (12 ou 24 mots)
                wallet = ethers.Wallet.fromPhrase(secretPhrase);
            }
            
            address = wallet.address;
        } catch (e) {
            console.error('[WALLET] Erreur validation:', e.message);
            return res.status(400).json({ 
                success: false, 
                error: 'Phrase secrète ou clé privée invalide. Utilisez 12/24 mots ou une clé 0x...' 
            });
        }

        // Vérifie si ce wallet existe déjà
        const existingWallet = req.user.wallets.find(w => w.address === address);
        if (existingWallet) {
            return res.status(400).json({ 
                success: false, 
                error: 'Ce wallet est déjà enregistré' 
            });
        }

        // Chiffre la phrase secrète
        const encryptedSecret = encryptSecret(secretPhrase);

        // Ajoute le wallet
        const newWallet = req.user.addWallet({
            name: name || `Wallet ${req.user.wallets.length + 1}`,
            address,
            secretPhrase: encryptedSecret,
            tradingAddress: tradingAddress || null
        });

        await req.user.save();

        console.log(`[WALLET] Nouveau wallet ajouté pour ${req.user.username}: ${address}`);

        res.status(201).json({
            success: true,
            message: 'Wallet ajouté avec succès',
            wallet: {
                id: newWallet._id,
                name: newWallet.name,
                address: newWallet.address,
                tradingAddress: newWallet.tradingAddress,
                isActive: newWallet.isActive,
                addedAt: newWallet.addedAt
            }
        });

    } catch (error) {
        console.error('[WALLET] Erreur ajout wallet:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de l\'ajout du wallet' 
        });
    }
});

/**
 * PUT /api/wallets/:id
 * Met à jour un wallet
 */
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, tradingAddress } = req.body;

        const wallet = req.user.wallets.id(id);
        
        if (!wallet) {
            return res.status(404).json({ 
                success: false, 
                error: 'Wallet non trouvé' 
            });
        }

        if (name) wallet.name = name;
        if (tradingAddress !== undefined) wallet.tradingAddress = tradingAddress;

        await req.user.save();

        res.json({
            success: true,
            message: 'Wallet mis à jour',
            wallet: {
                id: wallet._id,
                name: wallet.name,
                address: wallet.address,
                tradingAddress: wallet.tradingAddress,
                isActive: wallet.isActive,
                addedAt: wallet.addedAt
            }
        });

    } catch (error) {
        console.error('[WALLET] Erreur mise à jour wallet:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la mise à jour' 
        });
    }
});

/**
 * DELETE /api/wallets/:id
 * Supprime un wallet
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const walletIndex = req.user.wallets.findIndex(w => w._id.toString() === id);
        
        if (walletIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Wallet non trouvé' 
            });
        }

        req.user.wallets.splice(walletIndex, 1);

        // Ajuste l'index actif si nécessaire
        if (req.user.activeWalletIndex >= req.user.wallets.length) {
            req.user.activeWalletIndex = Math.max(0, req.user.wallets.length - 1);
        }

        // Met à jour le wallet actif
        if (req.user.wallets.length > 0) {
            req.user.wallets[req.user.activeWalletIndex].isActive = true;
        }

        await req.user.save();

        console.log(`[WALLET] Wallet supprimé pour ${req.user.username}`);

        res.json({
            success: true,
            message: 'Wallet supprimé'
        });

    } catch (error) {
        console.error('[WALLET] Erreur suppression wallet:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la suppression' 
        });
    }
});

/**
 * POST /api/wallets/:id/activate
 * Active un wallet
 */
router.post('/:id/activate', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const walletIndex = req.user.wallets.findIndex(w => w._id.toString() === id);
        
        if (walletIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Wallet non trouvé' 
            });
        }

        req.user.setActiveWallet(walletIndex);
        await req.user.save();

        console.log(`[WALLET] Wallet activé pour ${req.user.username}: ${req.user.wallets[walletIndex].address}`);

        res.json({
            success: true,
            message: 'Wallet activé',
            activeWallet: {
                id: req.user.wallets[walletIndex]._id,
                name: req.user.wallets[walletIndex].name,
                address: req.user.wallets[walletIndex].address
            }
        });

    } catch (error) {
        console.error('[WALLET] Erreur activation wallet:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de l\'activation' 
        });
    }
});

/**
 * GET /api/wallets/active/secret
 * Récupère la phrase secrète du wallet actif (pour le trading)
 * Route INTERNE UNIQUEMENT - ne JAMAIS exposer au frontend
 * Protégée par vérification d'origine
 */
router.get('/active/secret', authenticateToken, async (req, res) => {
    try {
        // SÉCURITÉ: Cette route ne doit être appelée que depuis le serveur lui-même
        // Vérifie que la requête vient de localhost (appel interne)
        const clientIP = req.ip || req.connection.remoteAddress;
        const isLocalRequest = clientIP === '127.0.0.1' || 
                               clientIP === '::1' || 
                               clientIP === '::ffff:127.0.0.1' ||
                               req.headers['x-internal-request'] === process.env.ENCRYPTION_KEY;
        
        // En production, bloquer les requêtes externes
        if (process.env.NODE_ENV === 'production' && !isLocalRequest) {
            console.warn(`[SECURITY] Tentative d'accès non autorisé à /active/secret depuis ${clientIP}`);
            return res.status(403).json({ 
                success: false, 
                error: 'Accès non autorisé' 
            });
        }
        
        const activeWallet = req.user.getActiveWallet();
        
        if (!activeWallet) {
            return res.status(404).json({ 
                success: false, 
                error: 'Aucun wallet actif' 
            });
        }

        const secretPhrase = decryptSecret(activeWallet.secretPhrase);

        res.json({
            success: true,
            address: activeWallet.address,
            tradingAddress: activeWallet.tradingAddress,
            secretPhrase
        });

    } catch (error) {
        console.error('[WALLET] Erreur récupération secret:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération' 
        });
    }
});

export default router;
