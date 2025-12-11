/**
 * Script de test de connexion MongoDB
 */

import dotenv from 'dotenv';
import database from './services/database.js';

dotenv.config();

async function testConnection() {
    const uri = process.env.MONGODB_URI;
    
    console.log('=== TEST CONNEXION MONGODB ===');
    console.log('URI présente:', !!uri);
    console.log('URI (masquée):', uri ? uri.replace(/:[^@]+@/, ':****@') : 'VIDE');
    console.log('');
    
    if (!uri) {
        console.log('❌ MONGODB_URI non définie dans .env');
        process.exit(1);
    }
    
    console.log('Connexion en cours...');
    const result = await database.connect(uri);
    
    if (result) {
        console.log('✅ Connexion réussie!');
        
        const stats = await database.getStats();
        console.log('\nStatistiques:');
        console.log('  Host:', stats.host);
        console.log('  Database:', stats.name);
        console.log('  Collections:', stats.collections?.length || 0);
        
        await database.disconnect();
        console.log('\n✅ Test terminé avec succès!');
    } else {
        console.log('❌ Échec de la connexion');
    }
    
    process.exit(0);
}

testConnection().catch(err => {
    console.error('Erreur:', err.message);
    process.exit(1);
});
