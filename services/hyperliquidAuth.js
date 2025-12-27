/**
 * Module d'authentification Hyperliquid
 * Gère la signature des requêtes, l'authentification via wallet Ethereum
 * et la gestion sécurisée des clés API
 * Support multi-wallet avec noms personnalisés
 */

import { ethers } from 'ethers';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Classe d'authentification Hyperliquid
 * Hyperliquid utilise un système d'authentification basé sur les signatures Ethereum
 * 
 * IMPORTANT: Hyperliquid n'utilise pas d'API Key traditionnelle mais une "secret phrase" 
 * qui est en réalité une clé privée Ethereum (ou seed phrase)
 * 
 * MULTI-WALLET: Supporte plusieurs wallets avec noms personnalisés
 */
class HyperliquidAuth {
    constructor() {
        this.wallet = null;
        this.address = null;
        this.tradingAddress = null; // Adresse du wallet de trading (Rabby/MetaMask)
        this.isAuthenticated = false;
        this.keysPath = path.join(__dirname, '..', 'storage', 'keys.json.enc');
        this.walletsPath = path.join(__dirname, '..', 'storage', 'wallets.json.enc');
        
        // Multi-wallet support
        this.wallets = {}; // { walletId: { name, secretPhrase, tradingAddress, apiKey } }
        this.activeWalletId = null;
    }
    
    /**
     * Définit l'adresse du wallet de trading (différente de l'API wallet)
     * @param {string} address 
     */
    setTradingAddress(address) {
        if (address && address.startsWith('0x') && address.length === 42) {
            this.tradingAddress = address;
            console.log(`[AUTH] Trading wallet défini: ${address}`);
        }
    }
    
    /**
     * Retourne l'adresse à utiliser pour les requêtes de solde
     * @returns {string}
     */
    getBalanceAddress() {
        return this.tradingAddress || this.address;
    }

    /**
     * Initialise l'authentification avec une clé privée ou seed phrase
     * @param {string} secretPhrase - Clé privée hex ou seed phrase mnémonique
     * @returns {Promise<boolean>}
     */
    async initialize(secretPhrase) {
        try {
            // Détermine si c'est une clé privée hex ou une seed phrase
            if (secretPhrase.startsWith('0x') && secretPhrase.length === 66) {
                // Clé privée hexadécimale
                this.wallet = new ethers.Wallet(secretPhrase);
            } else if (secretPhrase.split(' ').length >= 12) {
                // Seed phrase mnémonique
                this.wallet = ethers.Wallet.fromPhrase(secretPhrase);
            } else {
                throw new Error('Format de secret phrase invalide. Utilisez une clé privée hex (0x...) ou une seed phrase (12+ mots)');
            }

            this.address = this.wallet.address;
            this.isAuthenticated = true;
            
            console.log(`[AUTH] Wallet initialisé: ${this.address}`);
            return true;
        } catch (error) {
            console.error('[AUTH] Erreur d\'initialisation:', error.message);
            this.isAuthenticated = false;
            throw error;
        }
    }

    /**
     * Génère une signature pour une action Hyperliquid
     * Hyperliquid utilise EIP-712 pour signer les messages
     * @param {Object} action - L'action à signer
     * @param {number} timestamp - Timestamp en millisecondes
     * @param {number} vaultAddress - Adresse du vault (optionnel)
     * @returns {Promise<Object>} Signature et métadonnées
     */
    async signAction(action, timestamp = Date.now(), vaultAddress = null) {
        if (!this.wallet) {
            throw new Error('Wallet non initialisé. Appelez initialize() d\'abord.');
        }

        // Construction du message selon le format Hyperliquid
        const phantomAgent = {
            source: 'a', // 'a' pour API
            connectionId: this.generateConnectionId()
        };

        // Hash de l'action
        const actionHash = this.hashAction(action, timestamp, vaultAddress);

        // Domaine EIP-712 pour Hyperliquid
        const domain = {
            name: 'Exchange',
            version: '1',
            chainId: 42161, // Arbitrum
            verifyingContract: '0x0000000000000000000000000000000000000000'
        };

        // Types EIP-712
        const types = {
            Agent: [
                { name: 'source', type: 'string' },
                { name: 'connectionId', type: 'bytes32' }
            ]
        };

        // Signature du message
        const signature = await this.wallet.signTypedData(domain, types, phantomAgent);

        return {
            signature,
            timestamp,
            address: this.address,
            phantomAgent
        };
    }

    /**
     * Génère la signature pour un ordre
     * @param {Object} orderRequest - Détails de l'ordre
     * @returns {Promise<Object>}
     */
    async signOrder(orderRequest) {
        const timestamp = Date.now();
        
        // Format de l'action d'ordre Hyperliquid
        const action = {
            type: 'order',
            orders: [orderRequest],
            grouping: 'na' // normal order
        };

        // Création du hash pour signature L1
        const connectionId = this.generateConnectionId();
        
        // Message à signer selon le protocole Hyperliquid
        const message = {
            source: 'a',
            connectionId: ethers.hexlify(ethers.randomBytes(32))
        };

        // Hash keccak256 de l'action sérialisée
        const actionBytes = ethers.toUtf8Bytes(JSON.stringify(action));
        const actionHash = ethers.keccak256(actionBytes);

        // Signature EIP-191
        const signaturePayload = ethers.solidityPackedKeccak256(
            ['bytes32', 'uint64'],
            [actionHash, timestamp]
        );

        const signature = await this.wallet.signMessage(ethers.getBytes(signaturePayload));

        return {
            action,
            nonce: timestamp,
            signature,
            vaultAddress: null
        };
    }

    /**
     * Hash une action pour signature
     * @param {Object} action 
     * @param {number} timestamp 
     * @param {string|null} vaultAddress 
     * @returns {string}
     */
    hashAction(action, timestamp, vaultAddress = null) {
        const payload = JSON.stringify({
            action,
            nonce: timestamp,
            vaultAddress
        });
        return ethers.keccak256(ethers.toUtf8Bytes(payload));
    }

    /**
     * Génère un ID de connexion unique
     * @returns {string}
     */
    generateConnectionId() {
        return ethers.hexlify(ethers.randomBytes(32));
    }

    /**
     * Sauvegarde les clés de manière chiffrée
     * @param {string} secretPhrase 
     * @param {string} apiKey - Optionnel, pour compatibilité
     * @param {string} tradingAddr - Adresse du wallet de trading
     */
    saveKeys(secretPhrase, apiKey = '', tradingAddr = null) {
        const data = JSON.stringify({
            secretPhrase,
            apiKey,
            tradingAddress: tradingAddr || this.tradingAddress,
            savedAt: new Date().toISOString()
        });

        // Chiffrement AES-256 via module centralisé
        const encrypted = encryptSecret(data);

        // Assure que le dossier storage existe
        const storageDir = path.dirname(this.keysPath);
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }

        fs.writeFileSync(this.keysPath, encrypted);
        console.log('[AUTH] Clés sauvegardées de manière sécurisée');
    }

    /**
     * Charge les clés depuis le fichier chiffré
     * @returns {Object|null}
     */
    loadKeys() {
        try {
            if (!fs.existsSync(this.keysPath)) {
                console.log('[AUTH] Aucun fichier de clés trouvé');
                return null;
            }

            const encrypted = fs.readFileSync(this.keysPath, 'utf8');
            const decrypted = decryptSecret(encrypted);
            const data = JSON.parse(decrypted);

            // Charge l'adresse de trading si présente
            if (data.tradingAddress) {
                this.setTradingAddress(data.tradingAddress);
            }

            console.log('[AUTH] Clés chargées avec succès');
            return data;
        } catch (error) {
            console.error('[AUTH] Erreur lors du chargement des clés:', error.message);
            return null;
        }
    }

    /**
     * Teste la connexion à Hyperliquid
     * @returns {Promise<Object>}
     */
    async testConnection() {
        if (!this.isAuthenticated) {
            return { success: false, error: 'Non authentifié' };
        }

        try {
            // Requête info pour vérifier la connexion
            const response = await fetch('https://api.hyperliquid.xyz/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'clearinghouseState',
                    user: this.address
                })
            });

            const data = await response.json();
            
            return {
                success: true,
                address: this.address,
                data
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Retourne l'adresse du wallet
     * @returns {string|null}
     */
    getAddress() {
        return this.address;
    }

    /**
     * Vérifie si l'authentification est active
     * @returns {boolean}
     */
    isReady() {
        return this.isAuthenticated && this.wallet !== null;
    }

    // ==================== MULTI-WALLET METHODS ====================

    /**
     * Génère un ID unique pour un wallet
     * @returns {string}
     */
    generateWalletId() {
        return `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Ajoute un nouveau wallet
     * @param {string} name - Nom personnalisé du wallet
     * @param {string} secretPhrase - Clé privée ou seed phrase
     * @param {string} tradingAddress - Adresse de trading (optionnel)
     * @param {string} apiKey - API Key optionnelle
     * @returns {Object} { success, walletId, address, error }
     */
    async addWallet(name, secretPhrase, tradingAddress = null, apiKey = '') {
        try {
            // Valide la clé
            let testWallet;
            if (secretPhrase.startsWith('0x') && secretPhrase.length === 66) {
                testWallet = new ethers.Wallet(secretPhrase);
            } else if (secretPhrase.split(' ').length >= 12) {
                testWallet = ethers.Wallet.fromPhrase(secretPhrase);
            } else {
                throw new Error('Format de clé invalide');
            }

            const walletId = this.generateWalletId();
            const address = testWallet.address;

            // Vérifie si ce wallet existe déjà
            for (const [id, w] of Object.entries(this.wallets)) {
                if (w.address === address) {
                    return { success: false, error: 'Ce wallet existe déjà', existingId: id };
                }
            }

            this.wallets[walletId] = {
                name: name || `Wallet ${Object.keys(this.wallets).length + 1}`,
                secretPhrase,
                tradingAddress: tradingAddress || address,
                apiKey,
                address,
                createdAt: new Date().toISOString()
            };

            // Sauvegarde tous les wallets
            this.saveAllWallets();

            console.log(`[AUTH] Wallet ajouté: ${name} (${address.slice(0, 10)}...)`);
            
            return { 
                success: true, 
                walletId, 
                address,
                name: this.wallets[walletId].name
            };
        } catch (error) {
            console.error('[AUTH] Erreur ajout wallet:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Supprime un wallet
     * @param {string} walletId 
     * @returns {Object}
     */
    removeWallet(walletId) {
        if (!this.wallets[walletId]) {
            return { success: false, error: 'Wallet non trouvé' };
        }

        const name = this.wallets[walletId].name;
        delete this.wallets[walletId];

        // Si c'était le wallet actif, déconnecte
        if (this.activeWalletId === walletId) {
            this.activeWalletId = null;
            this.wallet = null;
            this.address = null;
            this.tradingAddress = null;
            this.isAuthenticated = false;
        }

        this.saveAllWallets();
        console.log(`[AUTH] Wallet supprimé: ${name}`);
        
        return { success: true, name };
    }

    /**
     * Renomme un wallet
     * @param {string} walletId 
     * @param {string} newName 
     * @returns {Object}
     */
    renameWallet(walletId, newName) {
        if (!this.wallets[walletId]) {
            return { success: false, error: 'Wallet non trouvé' };
        }

        const oldName = this.wallets[walletId].name;
        this.wallets[walletId].name = newName;
        this.saveAllWallets();

        console.log(`[AUTH] Wallet renommé: ${oldName} → ${newName}`);
        return { success: true, oldName, newName };
    }

    /**
     * Active un wallet spécifique
     * @param {string} walletId 
     * @returns {Promise<Object>}
     */
    async switchWallet(walletId) {
        if (!this.wallets[walletId]) {
            return { success: false, error: 'Wallet non trouvé' };
        }

        try {
            const walletData = this.wallets[walletId];
            await this.initialize(walletData.secretPhrase);
            
            if (walletData.tradingAddress) {
                this.setTradingAddress(walletData.tradingAddress);
            }

            this.activeWalletId = walletId;
            
            console.log(`[AUTH] Wallet activé: ${walletData.name}`);
            return { 
                success: true, 
                walletId,
                name: walletData.name,
                address: this.address,
                tradingAddress: this.tradingAddress
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Retourne la liste de tous les wallets (sans les clés sensibles)
     * @returns {Array}
     */
    listWallets() {
        return Object.entries(this.wallets).map(([id, w]) => ({
            id,
            name: w.name,
            address: w.address,
            tradingAddress: w.tradingAddress,
            isActive: id === this.activeWalletId,
            createdAt: w.createdAt
        }));
    }

    /**
     * Retourne les infos du wallet actif
     * @returns {Object|null}
     */
    getActiveWallet() {
        if (!this.activeWalletId || !this.wallets[this.activeWalletId]) {
            return null;
        }
        const w = this.wallets[this.activeWalletId];
        return {
            id: this.activeWalletId,
            name: w.name,
            address: w.address,
            tradingAddress: w.tradingAddress
        };
    }

    /**
     * Sauvegarde tous les wallets de manière chiffrée
     */
    saveAllWallets() {
        try {
            const data = JSON.stringify({
                wallets: this.wallets,
                activeWalletId: this.activeWalletId,
                savedAt: new Date().toISOString()
            });

            const encrypted = encryptSecret(data);

            const storageDir = path.dirname(this.walletsPath);
            if (!fs.existsSync(storageDir)) {
                fs.mkdirSync(storageDir, { recursive: true });
            }

            fs.writeFileSync(this.walletsPath, encrypted);
            console.log(`[AUTH] ${Object.keys(this.wallets).length} wallet(s) sauvegardé(s)`);
        } catch (error) {
            console.error('[AUTH] Erreur sauvegarde wallets:', error.message);
        }
    }

    /**
     * Charge tous les wallets depuis le fichier chiffré
     * @returns {Object}
     */
    loadAllWallets() {
        try {
            if (!fs.existsSync(this.walletsPath)) {
                console.log('[AUTH] Aucun fichier de wallets trouvé');
                
                // Migration: charge l'ancien format si présent
                const oldKeys = this.loadKeys();
                if (oldKeys && oldKeys.secretPhrase) {
                    console.log('[AUTH] Migration de l\'ancien format...');
                    this.addWallet('Wallet Principal', oldKeys.secretPhrase, oldKeys.tradingAddress, oldKeys.apiKey);
                }
                
                return { success: true, count: Object.keys(this.wallets).length };
            }

            const encrypted = fs.readFileSync(this.walletsPath, 'utf8');
            const decrypted = decryptSecret(encrypted);
            const data = JSON.parse(decrypted);

            this.wallets = data.wallets || {};
            
            // Active automatiquement le dernier wallet actif
            if (data.activeWalletId && this.wallets[data.activeWalletId]) {
                this.switchWallet(data.activeWalletId);
            }

            console.log(`[AUTH] ${Object.keys(this.wallets).length} wallet(s) chargé(s)`);
            return { success: true, count: Object.keys(this.wallets).length };
        } catch (error) {
            console.error('[AUTH] Erreur chargement wallets:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Met à jour l'adresse de trading d'un wallet
     * @param {string} walletId 
     * @param {string} tradingAddress 
     * @returns {Object}
     */
    updateTradingAddress(walletId, tradingAddress) {
        if (!this.wallets[walletId]) {
            return { success: false, error: 'Wallet non trouvé' };
        }

        if (!tradingAddress.startsWith('0x') || tradingAddress.length !== 42) {
            return { success: false, error: 'Adresse invalide' };
        }

        this.wallets[walletId].tradingAddress = tradingAddress;
        
        // Met à jour si c'est le wallet actif
        if (walletId === this.activeWalletId) {
            this.setTradingAddress(tradingAddress);
        }

        this.saveAllWallets();
        return { success: true };
    }
}

// Instance singleton
const auth = new HyperliquidAuth();
export default auth;
export { HyperliquidAuth };
