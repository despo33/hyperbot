# 🔒 Guide de Sécurité - Hyperliquid Trading Bot

> **Document de référence pour la configuration sécurisée du bot**
> Dernière mise à jour: Décembre 2024

---

## 📋 Résumé des Mesures de Sécurité

| Mesure | Status | Description |
|--------|--------|-------------|
| HTTPS/HSTS | ✅ Configurable | Redirection HTTPS + HSTS en production |
| Authentification API | ✅ Implémenté | Toutes les routes sensibles protégées par JWT |
| Authentification WebSocket | ✅ Implémenté | JWT requis pour les channels sensibles |
| CORS sécurisé | ✅ Implémenté | Origines configurables, strict en production |
| Rate Limiting | ✅ Renforcé | 60 req/min + blocage temporaire si abus |
| Headers de sécurité | ✅ Implémenté | Helmet + headers additionnels |
| Chiffrement clés | ✅ Implémenté | AES-256 pour les wallets |
| Protection CSRF | ✅ Disponible | Tokens CSRF pour les formulaires |

---

## 🚀 Configuration Production

### 1. Variables d'Environnement Requises

Créez un fichier `.env` sur votre serveur :

```bash
# OBLIGATOIRE
NODE_ENV=production
PORT=3002

# SÉCURITÉ - Générez des clés uniques!
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)

# Base de données
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/tradingbot

# HTTPS (si vous avez un certificat SSL)
ENABLE_HSTS=true

# CORS - Remplacez par votre domaine
CORS_ORIGINS=https://votre-domaine.com

# WebSocket - Force l'authentification
WS_REQUIRE_AUTH=true
```

### 2. Configuration HTTPS

#### Option A: Reverse Proxy (Recommandé)

Utilisez **nginx** ou **Cloudflare** devant votre application :

```nginx
# /etc/nginx/sites-available/tradingbot
server {
    listen 443 ssl http2;
    server_name votre-domaine.com;

    ssl_certificate /etc/letsencrypt/live/votre-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votre-domaine.com/privkey.pem;

    # Headers de sécurité
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name votre-domaine.com;
    return 301 https://$server_name$request_uri;
}
```

#### Option B: Cloudflare (Plus simple)

1. Ajoutez votre domaine à Cloudflare
2. Activez "Full (strict)" SSL/TLS
3. Activez "Always Use HTTPS"
4. Configurez `CORS_ORIGINS=https://votre-domaine.com`

### 3. Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (redirect)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable

# N'exposez PAS le port 3002 directement!
```

---

## 🔐 Authentification

### Routes API Protégées

Toutes les routes sensibles nécessitent un token JWT :

```javascript
// Header requis
Authorization: Bearer <votre_token_jwt>
```

**Routes publiques** (sans auth) :
- `GET /api/price/:symbol` - Prix publics
- `GET /api/candles/:symbol` - Candles publics
- `POST /api/auth/login` - Connexion
- `POST /api/auth/register` - Inscription

**Routes protégées** (auth requise) :
- Toutes les autres routes `/api/*`

### WebSocket Authentifié

```javascript
// Option 1: Token dans l'URL
const ws = new WebSocket('wss://votre-domaine.com?token=JWT_TOKEN');

// Option 2: Authentification après connexion
ws.send(JSON.stringify({ type: 'auth', token: 'JWT_TOKEN' }));
```

**Channels sensibles** (auth requise en production) :
- `trades` - Trades en temps réel
- `signals` - Signaux de trading
- `logs` - Logs du bot
- `analysis` - Analyses
- `status` - Statut du bot

---

## 🛡️ Protection contre les Attaques

### Rate Limiting

| Type | Limite | Blocage |
|------|--------|---------|
| Routes normales | 60 req/min | 5 min si x2 dépassement |
| Routes auth | 10 req/min | 5 min si x2 dépassement |
| Routes API auth | 100 req/min | 5 min si x2 dépassement |

### Headers de Sécurité

```
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Security-Policy: default-src 'self'; ...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### CORS

En production, seules les origines configurées dans `CORS_ORIGINS` sont autorisées.

---

## 🔑 Gestion des Clés API

### Stockage Sécurisé

Les clés API Hyperliquid sont :
1. Chiffrées en AES-256 avant stockage
2. Stockées dans MongoDB (par utilisateur)
3. Jamais exposées en clair dans les logs ou réponses API

### Bonnes Pratiques

1. **Utilisez un wallet dédié** avec des fonds limités
2. **Activez l'authentification 2FA** sur Hyperliquid
3. **Limitez les permissions** du wallet si possible
4. **Surveillez les activités** inhabituelles

---

## 📊 Monitoring

### Logs de Sécurité

Les événements suivants sont loggés :
- Tentatives de connexion échouées
- Requêtes bloquées par rate limiting
- IPs bloquées temporairement
- Erreurs 4xx/5xx

### Commandes Utiles

```bash
# Voir les logs en temps réel
pm2 logs trading-bot

# Voir les erreurs uniquement
pm2 logs trading-bot --err

# Statistiques du processus
pm2 monit
```

---

## ⚠️ Checklist Déploiement Production

- [ ] `NODE_ENV=production` configuré
- [ ] `JWT_SECRET` unique et aléatoire (32+ caractères)
- [ ] `ENCRYPTION_KEY` unique et aléatoire (32 caractères)
- [ ] HTTPS configuré (nginx/Cloudflare)
- [ ] `ENABLE_HSTS=true` si HTTPS
- [ ] `CORS_ORIGINS` configuré avec votre domaine
- [ ] `WS_REQUIRE_AUTH=true` pour forcer l'auth WebSocket
- [ ] Firewall configuré (ports 80, 443 uniquement)
- [ ] MongoDB avec authentification
- [ ] Backups automatiques configurés
- [ ] Monitoring/alertes en place

---

## 🐛 Dépannage

### "Token manquant" (401)

Le token JWT n'est pas envoyé. Vérifiez :
```javascript
headers: { 'Authorization': `Bearer ${token}` }
```

### "Origine non autorisée" (403)

Ajoutez votre domaine à `CORS_ORIGINS` dans `.env`.

### "Trop de requêtes" (429)

Attendez quelques minutes. Si persistant, vérifiez qu'il n'y a pas de boucle dans votre code.

### WebSocket déconnecté après 10s

En production avec `WS_REQUIRE_AUTH=true`, authentifiez-vous dans les 10 secondes :
```javascript
ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token: 'JWT_TOKEN' }));
};
```

---

## 📞 Support

Pour signaler une vulnérabilité de sécurité, contactez directement le mainteneur du projet.
