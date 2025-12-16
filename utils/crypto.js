/**
 * Utilitaires de chiffrement centralisés
 * Évite la duplication de code entre routes.js et walletRoutes.js
 */

import CryptoJS from 'crypto-js';

// Validation stricte des variables d'environnement en production
if (process.env.NODE_ENV === 'production' && !process.env.ENCRYPTION_KEY) {
    console.error('[FATAL] ❌ ENCRYPTION_KEY non définie en production!');
    console.error('[FATAL] Définissez ENCRYPTION_KEY dans vos variables d\'environnement.');
    process.exit(1);
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dev-only-encryption-key-32chars!';

// Avertissement en développement
if (!process.env.ENCRYPTION_KEY) {
    console.warn('[SECURITY] ⚠️ ENCRYPTION_KEY non définie - utilisation de la clé de développement');
}

// Vérifie la longueur minimale de la clé
if (ENCRYPTION_KEY.length < 16) {
    console.error('[SECURITY] ⚠️ ENCRYPTION_KEY trop courte (minimum 16 caractères)');
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

/**
 * Chiffre une clé secrète avec AES-256
 * @param {string} secret - La clé à chiffrer
 * @returns {string} - La clé chiffrée
 */
export function encryptSecret(secret) {
    if (!secret) return '';
    return CryptoJS.AES.encrypt(secret, ENCRYPTION_KEY).toString();
}

/**
 * Déchiffre une clé secrète
 * @param {string} encrypted - La clé chiffrée
 * @returns {string} - La clé déchiffrée
 */
export function decryptSecret(encrypted) {
    if (!encrypted) return '';
    try {
        const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
        return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error('[CRYPTO] Erreur déchiffrement:', e.message);
        return '';
    }
}

/**
 * Génère un token aléatoire sécurisé
 * @param {number} length - Longueur en bytes (défaut: 32)
 * @returns {string} - Token en hexadécimal
 */
export function generateToken(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash un token avec SHA-256
 * @param {string} token - Le token à hasher
 * @returns {string} - Le hash en hexadécimal
 */
export function hashToken(token) {
    return CryptoJS.SHA256(token).toString();
}

export default {
    encryptSecret,
    decryptSecret,
    generateToken,
    hashToken
};
