#!/bin/bash

# ============================================
# Script de déploiement - Hyperliquid Trading Bot
# Pour VPS Ubuntu (Hostinger)
# ============================================

set -e  # Arrête le script en cas d'erreur

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     DÉPLOIEMENT HYPERLIQUID TRADING BOT                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Variables
APP_DIR="/var/www/bot"
NODE_VERSION="20"

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# ===== ÉTAPE 1: Mise à jour système =====
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ÉTAPE 1: Mise à jour du système"
echo "═══════════════════════════════════════════════════════════════"
apt update && apt upgrade -y
print_step "Système mis à jour"

# ===== ÉTAPE 2: Installation Node.js =====
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ÉTAPE 2: Installation de Node.js $NODE_VERSION"
echo "═══════════════════════════════════════════════════════════════"

if command -v node &> /dev/null; then
    CURRENT_NODE=$(node -v)
    print_warning "Node.js déjà installé: $CURRENT_NODE"
else
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
    print_step "Node.js installé: $(node -v)"
fi

# ===== ÉTAPE 3: Installation PM2 =====
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ÉTAPE 3: Installation de PM2"
echo "═══════════════════════════════════════════════════════════════"

if command -v pm2 &> /dev/null; then
    print_warning "PM2 déjà installé"
else
    npm install -g pm2
    print_step "PM2 installé"
fi

# ===== ÉTAPE 4: Création du dossier =====
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ÉTAPE 4: Préparation du dossier application"
echo "═══════════════════════════════════════════════════════════════"

mkdir -p $APP_DIR
print_step "Dossier $APP_DIR prêt"

# ===== ÉTAPE 5: Configuration Firewall =====
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ÉTAPE 5: Configuration du Firewall"
echo "═══════════════════════════════════════════════════════════════"

ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3002/tcp  # Bot
ufw --force enable
print_step "Firewall configuré (ports 22, 80, 443, 3002)"

# ===== ÉTAPE 6: Installation des dépendances de l'app =====
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ÉTAPE 6: Installation des dépendances Node.js"
echo "═══════════════════════════════════════════════════════════════"

cd $APP_DIR

if [ -f "package.json" ]; then
    npm install --production
    print_step "Dépendances installées"
else
    print_error "package.json non trouvé dans $APP_DIR"
    print_warning "Transférez d'abord vos fichiers avec:"
    echo "  scp -r C:\\Users\\33666\\Desktop\\robot\\analyse\\bot\\* root@72.62.25.146:$APP_DIR/"
    exit 1
fi

# ===== ÉTAPE 7: Configuration .env =====
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ÉTAPE 7: Configuration environnement"
echo "═══════════════════════════════════════════════════════════════"

if [ ! -f ".env" ]; then
    # Génération de clés aléatoires
    JWT_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -hex 16)
    
    cat > .env << EOF
# Configuration générée automatiquement
PORT=3002
NODE_ENV=production

# Clés de sécurité (générées automatiquement)
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

# MongoDB (à configurer si nécessaire)
# MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/tradingbot
EOF
    
    print_step "Fichier .env créé avec clés sécurisées"
    print_warning "Éditez .env pour ajouter MONGODB_URI si nécessaire: nano .env"
else
    print_warning "Fichier .env existant conservé"
fi

# ===== ÉTAPE 8: Démarrage avec PM2 =====
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "ÉTAPE 8: Démarrage de l'application"
echo "═══════════════════════════════════════════════════════════════"

# Arrête l'ancienne instance si elle existe
pm2 delete trading-bot 2>/dev/null || true

# Démarre l'application
pm2 start server.js --name "trading-bot" --env production

# Sauvegarde pour redémarrage auto
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

print_step "Application démarrée avec PM2"

# ===== RÉSUMÉ =====
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    DÉPLOIEMENT TERMINÉ !                      ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Dashboard: http://72.62.25.146:3002"
echo ""
echo "📋 Commandes utiles:"
echo "   pm2 status          - Voir l'état"
echo "   pm2 logs trading-bot - Voir les logs"
echo "   pm2 restart trading-bot - Redémarrer"
echo "   pm2 monit           - Monitoring temps réel"
echo ""
echo "⚠️  N'oubliez pas de configurer votre clé API Hyperliquid"
echo "   via le dashboard!"
echo ""
