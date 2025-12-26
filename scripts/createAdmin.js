/**
 * Script pour créer un compte administrateur
 * Usage: node scripts/createAdmin.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const ADMIN_EMAIL = 'admin@hyperbot.com';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin123!';

async function createAdmin() {
    try {
        // Connexion à MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hyperbot';
        console.log('Connexion à MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connecté à MongoDB');

        // Vérifie si un admin existe déjà
        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            console.log(`⚠️ Un compte admin existe déjà: ${existingAdmin.email}`);
            console.log('Pour créer un nouvel admin, supprimez d\'abord l\'existant ou modifiez ce script.');
            await mongoose.disconnect();
            return;
        }

        // Vérifie si l'email existe déjà
        const existingUser = await User.findOne({ email: ADMIN_EMAIL });
        if (existingUser) {
            // Met à jour l'utilisateur existant en admin
            existingUser.role = 'admin';
            existingUser.isActive = true;
            existingUser.isEmailVerified = true;
            await existingUser.save();
            console.log(`✅ Utilisateur existant promu admin: ${ADMIN_EMAIL}`);
        } else {
            // Crée un nouvel utilisateur admin
            const admin = new User({
                email: ADMIN_EMAIL,
                username: ADMIN_USERNAME,
                password: ADMIN_PASSWORD,
                role: 'admin',
                isActive: true,
                isEmailVerified: true
            });

            await admin.save();
            console.log('✅ Compte administrateur créé avec succès!');
        }

        console.log('');
        console.log('═'.repeat(50));
        console.log('📧 Email:    ', ADMIN_EMAIL);
        console.log('👤 Username: ', ADMIN_USERNAME);
        console.log('🔑 Password: ', ADMIN_PASSWORD);
        console.log('═'.repeat(50));
        console.log('');
        console.log('⚠️ IMPORTANT: Changez le mot de passe après la première connexion!');
        console.log('📍 Accès admin: /admin.html');

        await mongoose.disconnect();
        console.log('✅ Déconnecté de MongoDB');

    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

createAdmin();
