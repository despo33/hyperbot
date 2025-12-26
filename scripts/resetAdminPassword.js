/**
 * Script pour réinitialiser le mot de passe admin
 * Usage: node scripts/resetAdminPassword.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const NEW_PASSWORD = 'Admin123!';

async function resetAdminPassword() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperbot';
        console.log('Connexion à MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connecté à MongoDB');

        // Trouve le compte admin
        const admin = await User.findOne({ role: 'admin' });
        
        if (!admin) {
            console.log('❌ Aucun compte admin trouvé');
            await mongoose.disconnect();
            return;
        }

        console.log(`📧 Compte admin trouvé: ${admin.email}`);
        
        // Réinitialise le mot de passe
        admin.password = NEW_PASSWORD;
        await admin.save();

        console.log('');
        console.log('═'.repeat(50));
        console.log('✅ Mot de passe réinitialisé avec succès!');
        console.log('');
        console.log('📧 Email:    ', admin.email);
        console.log('🔑 Password: ', NEW_PASSWORD);
        console.log('═'.repeat(50));
        console.log('');
        console.log('📍 Accès admin: /ctrl-panel-x7k.html');

        await mongoose.disconnect();
        console.log('✅ Déconnecté de MongoDB');

    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

resetAdminPassword();
