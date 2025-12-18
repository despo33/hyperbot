# 🤖 Hyperliquid Trading Bot

Robot de trading automatisé pour **Hyperliquid DEX** avec stratégie **Ichimoku Kinko Hyo**, indicateurs techniques avancés et interface d'administration web complète.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 📋 Table des matières

- [Fonctionnalités](#-fonctionnalités)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Utilisation](#-utilisation)
- [Architecture](#-architecture)
- [API Hyperliquid](#-api-hyperliquid)
- [Stratégie Ichimoku](#-stratégie-ichimoku)
- [Indicateurs Techniques](#-indicateurs-techniques)
- [Risk Management](#-risk-management)
- [Exemples](#-exemples)
- [Sécurité](#-sécurité)

---

## ✨ Fonctionnalités

### Trading
- ✅ Connexion à Hyperliquid via clé privée/seed phrase
- ✅ Récupération des prix en temps réel
- ✅ Analyse Ichimoku complète avec réglages optimisés par timeframe
- ✅ Indicateurs techniques avancés (RSI, MACD, StochRSI, EMA200, OBV, Bollinger)
- ✅ Détection automatique des signaux avec confirmation multi-indicateurs
- ✅ Détection des divergences RSI et OBV
- ✅ Placement d'ordres avec Take Profit et Stop Loss basés sur niveaux techniques
- ✅ Mode automatique ou manuel
- ✅ Multi-crypto trading simultané

### Risk Management
- ✅ Risque par trade configurable (% du capital)
- ✅ Limite de perte journalière (0 = désactivé)
- ✅ Nombre max de trades par jour (jusqu'à 500 ou illimité)
- ✅ Contrôle du drawdown
- ✅ Ratio risque/rendement minimum avec presets (Scalping, Day Trading, Swing)
- ✅ Arrêt après X pertes consécutives (jusqu'à 20 ou désactivé)
- ✅ SL/TP calculés sur niveaux techniques (Ichimoku > EMA200 > Bollinger > %)

### Interface
- ✅ Dashboard web moderne et responsive
- ✅ Authentification sécurisée
- ✅ Logs en temps réel via WebSocket
- ✅ Configuration complète via l'interface
- ✅ Visualisation des positions et du PnL
- ✅ Graphiques TradingView intégrés (Binance Futures)
- ✅ Affichage des indicateurs et signaux en temps réel

---

## 🚀 Installation

### Prérequis

- **Node.js** 18 ou supérieur
- **npm** ou **yarn**

### Étapes

```bash
# 1. Accédez au dossier du projet
cd bot

# 2. Installez les dépendances
npm install

# 3. (Optionnel) Créez un fichier .env pour les variables d'environnement
echo "PORT=3002" > .env
echo "JWT_SECRET=votre-secret-jwt-securise" >> .env
echo "ENCRYPTION_KEY=cle-chiffrement-32-caracteres!" >> .env

# 4. Démarrez le bot
npm start
```

### Commandes disponibles

```bash
npm start      # Démarre le bot
npm run dev    # Démarre en mode développement (auto-reload)
```

---

## 🖥️ Commandes Terminal (Invite de Commande)

### Ouvrir le terminal dans le bon dossier

```powershell
# Option 1: Naviguer vers le dossier
cd C:\Users\33666\Desktop\analyse\bot

# Option 2: Ouvrir directement PowerShell dans le dossier
# Clic droit sur le dossier "bot" → "Ouvrir dans le terminal"
```

### Commandes principales

| Commande | Description |
|----------|-------------|
| `npm start` | 🚀 Démarre le serveur |
| `npm run dev` | 🔄 Démarre en mode dev (auto-reload) |
| `npm install` | 📦 Installe les dépendances |

### Gestion du serveur

```powershell
# ===== DÉMARRER LE SERVEUR =====
npm start

# ===== ARRÊTER LE SERVEUR =====
# Appuyez sur Ctrl + C dans le terminal

# ===== REDÉMARRER LE SERVEUR =====
# 1. Arrêtez avec Ctrl + C
# 2. Relancez avec:
npm start

# ===== FORCER L'ARRÊT (si bloqué) =====
# Tue tous les processus Node.js
taskkill /F /IM node.exe

# Puis redémarrez:
npm start
```

### Vérifier si le serveur tourne

```powershell
# Voir les processus Node.js actifs
tasklist | findstr node

# Voir quel processus utilise le port 3002
netstat -ano | findstr :3002
```

### Résolution de problèmes

```powershell
# ===== ERREUR: Port déjà utilisé =====
# Trouvez le PID du processus sur le port 3002
netstat -ano | findstr :3002
# Tuez le processus (remplacez XXXX par le PID)
taskkill /F /PID XXXX

# ===== ERREUR: Modules manquants =====
npm install

# ===== RÉINSTALLER TOUT =====
# Supprimez node_modules et réinstallez
rmdir /s /q node_modules
npm install

# ===== VOIR LES LOGS EN TEMPS RÉEL =====
# Les logs s'affichent directement dans le terminal
# Ou consultez le fichier:
type storage\logs.log
```

### Accès au Dashboard

Une fois le serveur démarré:
- **URL:** http://localhost:3002
- **WebSocket:** ws://localhost:3002

### Raccourcis utiles

| Raccourci | Action |
|-----------|--------|
| `Ctrl + C` | Arrêter le serveur |
| `Ctrl + L` | Effacer le terminal |
| `↑` (flèche haut) | Rappeler la dernière commande |
| `Tab` | Auto-complétion |

### Script de démarrage rapide

Créez un fichier `start.bat` dans le dossier `bot`:

```batch
@echo off
echo ====================================
echo   Hyperliquid Trading Bot
echo ====================================
echo.
cd /d C:\Users\33666\Desktop\analyse\bot
npm start
pause
```

Double-cliquez sur `start.bat` pour lancer le bot!

---

## ⚙️ Configuration

### Accès au Dashboard

1. Ouvrez votre navigateur à `http://localhost:3002`
2. Le dashboard s'affiche directement (pas de login requis)
3. Configurez votre **clé API Hyperliquid** dans l'onglet "Configuration API"
4. Les données du compte (balance, positions) s'afficheront une fois la clé configurée

### Configuration API Hyperliquid

1. Allez dans **Configuration API**
2. Entrez votre **clé privée** (format `0x...`) ou **seed phrase** (12+ mots)
3. Cliquez sur **Sauvegarder et Connecter**
4. Testez la connexion

### Configuration Trading

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| Symbole | Paire à trader (BTC, ETH, etc.) | BTC |
| Timeframe | Période d'analyse (5m, 15m, 1h, 4h, 1d) | 1h |
| Intervalle | Fréquence d'analyse en secondes | 60 |
| Levier | Multiplicateur de levier | 5 |
| Mode | `auto` (exécution automatique) ou `manual` | manual |

### Configuration Risk Management

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| Risque par trade | % du capital risqué par position | 1% |
| Limite perte journalière | Arrêt si perte > X% | 5% |
| Max trades/jour | Nombre maximum de trades | 10 |
| Max drawdown | Arrêt si drawdown > X% | 20% |
| Taille position max | % max du capital par position | 10% |
| RRR minimum | Ratio risque/rendement minimum | 1.5 |
| Max pertes consécutives | Arrêt après X pertes de suite | 3 |

---

## 📁 Architecture

```
/bot
├── server.js                # Point d'entrée principal
├── webserver.js             # Serveur Express + WebSocket
├── routes.js                # Routes API REST
├── package.json             # Dépendances
│
├── /core                    # Modules métier
│   ├── ichimoku.js          # Calculs Ichimoku (réglages dynamiques)
│   ├── indicators.js        # Indicateurs techniques (RSI, MACD, StochRSI, EMA200, OBV, Bollinger)
│   ├── signalDetector.js    # Détection des signaux + confirmation multi-indicateurs
│   ├── riskManager.js       # Gestion du risque + calcul SL/TP techniques
│   ├── tradeEngine.js       # Moteur de trading principal
│   ├── priceFetcher.js      # Récupération des prix
│   ├── positionManager.js   # Gestion des positions ouvertes
│   ├── correlationManager.js # Gestion corrélation entre cryptos
│   ├── multiTimeframe.js    # Analyse multi-timeframe
│   └── patternDetector.js   # Détection de patterns
│
├── /services                # Services externes
│   ├── hyperliquidApi.js    # Client API Hyperliquid
│   └── hyperliquidAuth.js   # Authentification Hyperliquid
│
├── /storage                 # Données persistantes (JSON)
│   ├── risk.json            # Configuration risk management (fallback)
│   ├── state.json           # État du bot
│   ├── keys.json.enc        # Clés API chiffrées
│   └── logs.log             # Fichier de logs
│
└── /web                     # Interface utilisateur
    ├── dashboard.html       # Page principale
    ├── dashboard.css        # Styles
    └── dashboard.js         # Logique frontend
```

---

## 🔐 API Hyperliquid

### Authentification

Hyperliquid utilise un système d'authentification basé sur **Ethereum**. Vous avez besoin d'une:

1. **Clé privée hexadécimale** (format `0x` + 64 caractères)
2. **Ou seed phrase mnémonique** (12 ou 24 mots)

### Comment obtenir vos identifiants

1. Connectez-vous à [Hyperliquid](https://app.hyperliquid.xyz)
2. Allez dans **Settings → API**
3. Exportez votre clé privée

### Signature des ordres

Le bot signe automatiquement chaque ordre avec EIP-712:

```javascript
// Exemple de signature d'ordre
const signedOrder = await auth.signOrder({
    type: 'order',
    orders: [{
        a: 0,        // Asset index (BTC = 0)
        b: true,     // true = buy, false = sell
        p: '50000',  // Prix
        s: '0.001',  // Taille
        r: false,    // Reduce only
        t: { limit: { tif: 'Gtc' } }
    }],
    grouping: 'na'
});
```

### Endpoints utilisés

| Endpoint | Description |
|----------|-------------|
| `POST /info` | Requêtes d'information (prix, positions, etc.) |
| `POST /exchange` | Requêtes d'exécution (ordres) |

---

## 📊 Stratégie Ichimoku

### Réglages Optimisés par Timeframe

Le bot ajuste automatiquement les paramètres Ichimoku selon le timeframe choisi :

| Timeframe | Tenkan | Kijun | Senkou | Displacement | Usage |
|-----------|--------|-------|--------|--------------|-------|
| **1m, 5m** | 6 | 13 | 26 | 13 | Scalping ultra-rapide |
| **15m** | 9 | 26 | 52 | 26 | Day trading standard |
| **1h** | 10 | 30 | 60 | 30 | Crypto 24/7 optimisé |
| **4h** | 20 | 60 | 120 | 30 | Swing trading |
| **1d** | 9 | 26 | 52 | 26 | Position trading |

### Composants calculés

| Composant | Formule | Description |
|-----------|---------|-------------|
| **Tenkan-sen** | (Plus haut + Plus bas) / 2 | Ligne de conversion (signal rapide) |
| **Kijun-sen** | (Plus haut + Plus bas) / 2 | Ligne de base (signal lent) |
| **Senkou Span A** | (Tenkan + Kijun) / 2 | Bord du nuage (projeté) |
| **Senkou Span B** | (Plus haut + Plus bas) / 2 | Bord du nuage (projeté) |
| **Chikou Span** | Prix de clôture | Confirmation (décalé) |

### Signaux détectés

#### 1. TK Cross (Croisement Tenkan/Kijun)
```
BULLISH: Tenkan croise Kijun vers le HAUT
BEARISH: Tenkan croise Kijun vers le BAS
```

#### 2. Kumo Breakout (Cassure du nuage)
```
BULLISH: Prix sort du nuage par le HAUT
BEARISH: Prix sort du nuage par le BAS
```

#### 3. Kumo Twist (Changement de couleur)
```
BULLISH: SSA passe au-dessus de SSB (nuage devient vert)
BEARISH: SSA passe en-dessous de SSB (nuage devient rouge)
```

#### 4. Kijun Bounce (Rebond sur Kijun)
```
BULLISH: Prix rebondit sur Kijun vers le HAUT
BEARISH: Prix rebondit sur Kijun vers le BAS
```

### Score Ichimoku

Le bot calcule un score de -7 à +7 basé sur:

| Critère | Points |
|---------|--------|
| Prix au-dessus/en-dessous du nuage | ±2 |
| Tenkan vs Kijun | ±1 |
| Couleur du nuage | ±1 |
| Confirmation Chikou | ±2 |
| Prix vs Kijun | ±1 |

**Interprétation:**
- Score ≥ 3 : Signal haussier
- Score ≤ -3 : Signal baissier
- Entre -3 et 3 : Neutre

---

## 📈 Indicateurs Techniques

### Indicateurs Implémentés

| Indicateur | Paramètres | Usage |
|------------|------------|-------|
| **RSI** | Période 14, Survente 30, Surachat 70 | Momentum |
| **Stochastic RSI** | 14/14/3/3 | Scalping, signaux rapides |
| **MACD** | 8/17/9 (optimisé crypto) | Tendance et momentum |
| **EMA 200** | Période 200 | Filtre de tendance macro |
| **OBV** | On-Balance Volume | Confirmation par volume |
| **Bollinger Bands** | Période 20, Écart-type 2 | Volatilité et niveaux |

### Détection des Divergences

Le bot détecte automatiquement les divergences :

#### Divergence RSI
```
BULLISH: Prix fait un plus bas, RSI fait un plus haut → Retournement haussier
BEARISH: Prix fait un plus haut, RSI fait un plus bas → Retournement baissier
```

#### Divergence OBV
```
BULLISH: Prix baisse, OBV monte → Accumulation cachée
BEARISH: Prix monte, OBV baisse → Distribution cachée
```

### Système de Confluence

Chaque signal Ichimoku est **confirmé ou rejeté** par les autres indicateurs :

| Confluence | Qualité du Signal |
|------------|-------------------|
| ≥ 4 indicateurs alignés | **Excellent** |
| 3 indicateurs alignés | **Good** |
| 2 indicateurs alignés | **Standard** |
| < 2 indicateurs | **Weak** |

### Confirmation des Signaux

Pour un signal **LONG**, le bot vérifie :
- ✅ RSI < 70 (pas en surachat)
- ✅ StochRSI croisement haussier
- ✅ MACD haussier
- ✅ Prix > EMA200
- ✅ OBV en hausse
- ✅ Volume élevé

Pour un signal **SHORT**, le bot vérifie :
- ✅ RSI > 30 (pas en survente)
- ✅ StochRSI croisement baissier
- ✅ MACD baissier
- ✅ Prix < EMA200
- ✅ OBV en baisse
- ✅ Volume élevé

---

## 💰 Risk Management

### Calcul de la taille de position

```javascript
// Exemple de calcul
const balance = 10000;        // USD
const riskPercent = 1;        // 1%
const entryPrice = 50000;     // BTC à 50k
const stopLoss = 49000;       // SL à 49k

// Montant risqué
const riskAmount = balance * (riskPercent / 100);  // = 100 USD

// Distance au SL
const slDistance = Math.abs(entryPrice - stopLoss) / entryPrice;  // = 2%

// Taille de position
const size = riskAmount / (slDistance * entryPrice);  // = 0.001 BTC
```

### Calcul automatique SL/TP (Niveaux Techniques)

Le bot utilise une **hiérarchie de priorités** pour calculer les SL/TP :

#### Priorité pour le Stop Loss

| Priorité | Source | Description |
|----------|--------|-------------|
| **1** | Ichimoku | Kijun, Kumo Bottom/Top, Tenkan |
| **2** | EMA 200 | Niveau dynamique de tendance |
| **3** | Bollinger | Bande inférieure/supérieure |
| **4** | Pourcentage | % par défaut (fallback) |

#### Exemple de calcul SL/TP

```
LONG BTC à $50,000:
├── SL candidats:
│   ├── Kijun: $49,200 (priorité 1) ✅ Sélectionné
│   ├── EMA200: $48,500 (priorité 2)
│   └── Bollinger: $48,000 (priorité 3)
├── TP candidats:
│   ├── Kumo Top: $52,000 (priorité 1) ✅ Sélectionné
│   └── Bollinger Upper: $53,000 (priorité 2)
└── RRR: 2.5 (validé)
```

Les logs affichent la source utilisée :
```
BTC: SL basé sur ichimoku_kijun, TP basé sur ichimoku_kumo_top
```

### Presets Risk/Reward Ratio

| Preset | RRR | Description |
|--------|-----|-------------|
| **Scalping** | 1.0 | Trades rapides, petits gains |
| **Day Trading** | 1.5 | Équilibre risque/gain |
| **Swing** | 2.0 | Trades plus longs, gains plus importants |
| **Conservative** | 3.0 | Peu de trades, haute qualité |

### Règles de protection

```
✗ Trade refusé si:
  - Limite de trades journaliers atteinte (0 = illimité)
  - Perte journalière > limite (0 = désactivé)
  - Drawdown > maximum
  - Pertes consécutives ≥ max (0 = désactivé)
  - RRR < minimum configuré
  - Signal non confirmé par les indicateurs
```

---

## 📝 Exemples

### Exemple d'ordre avec TP/SL

```javascript
import api from './services/hyperliquidApi.js';

// Ordre LONG BTC avec TP et SL
const order = await api.placeOrderWithTPSL({
    symbol: 'BTC',
    isBuy: true,          // LONG
    size: 0.001,          // 0.001 BTC
    price: null,          // Market order
    takeProfit: 52000,    // TP à 52k
    stopLoss: 49000       // SL à 49k
});

console.log('Ordre exécuté:', order);
```

### Exemple d'analyse complète

```javascript
import priceFetcher from './core/priceFetcher.js';
import signalDetector from './core/signalDetector.js';

// Récupère les candles (250 pour EMA200)
const candles = await priceFetcher.getCandles('BTC', '1h', 250);

// Analyse avec réglages Ichimoku optimisés pour le timeframe
const analysis = signalDetector.analyze(candles, {}, '1h');

console.log('Prix actuel:', analysis.currentPrice);
console.log('Timeframe:', analysis.timeframe);

// Ichimoku
console.log('Score Ichimoku:', analysis.ichimokuScore.score);
console.log('Réglages utilisés:', analysis.ichimoku.settings);
console.log('Signal:', analysis.finalSignal?.action || 'AUCUN');

// Indicateurs techniques
console.log('RSI:', analysis.indicators.rsi.value);
console.log('StochRSI K/D:', analysis.indicators.stochRsi.k, '/', analysis.indicators.stochRsi.d);
console.log('MACD:', analysis.indicators.macd.crossover);
console.log('EMA200:', analysis.indicators.ema200.position, '(', analysis.indicators.ema200.distance, '%)');

// Divergences
if (analysis.indicators.rsiDivergence.divergence) {
    console.log('Divergence RSI:', analysis.indicators.rsiDivergence.divergence);
}
if (analysis.indicators.obv.divergence) {
    console.log('Divergence OBV:', analysis.indicators.obv.divergence);
}

// Confluence et qualité du signal
console.log('Confluence:', analysis.indicators.confluence, 'indicateurs alignés');
console.log('Qualité:', analysis.recommendation.signalQuality);

// Niveaux SL/TP suggérés
console.log('SL suggéré:', analysis.recommendation.suggestedSL, '(source:', analysis.recommendation.slSource, ')');
console.log('TP suggéré:', analysis.recommendation.suggestedTP, '(source:', analysis.recommendation.tpSource, ')');
```

### Exemple de validation Risk Management

```javascript
import riskManager from './core/riskManager.js';

const balance = 10000;

// Vérifie si on peut trader
const check = riskManager.canTrade(balance, {
    riskRewardRatio: 2.0
});

if (check.allowed) {
    console.log('✅ Trade autorisé');
    
    // Calcule la taille de position
    const position = riskManager.calculatePositionSize(
        balance,      // Solde
        50000,        // Prix d'entrée
        49000,        // Stop loss
        5             // Levier
    );
    
    console.log('Taille:', position.size);
    console.log('Risque:', position.riskAmount, 'USD');
} else {
    console.log('❌ Trade refusé:');
    check.checks.filter(c => !c.passed).forEach(c => {
        console.log(`  - ${c.check}: ${c.reason}`);
    });
}
```

---

## 🔒 Sécurité

### Bonnes pratiques

1. **Utilisez un wallet dédié** avec des fonds limités
2. **Changez le mot de passe admin** immédiatement
3. **Définissez un `JWT_SECRET`** personnalisé dans `.env`
4. **Ne partagez jamais** votre clé privée
5. **Commencez en mode manuel** pour tester

### Chiffrement des clés

Les clés API sont stockées chiffrées en AES-256:

```
/storage/keys.json.enc  ← Fichier chiffré
```

### Variables d'environnement

```bash
# .env
PORT=3000
JWT_SECRET=votre-secret-jwt-tres-long-et-securise
ENCRYPTION_KEY=cle-de-32-caracteres-minimum!!!
```

---

## ⚠️ Avertissement

**Ce bot est fourni à des fins éducatives.**

- Le trading de cryptomonnaies comporte des risques significatifs
- Les performances passées ne garantissent pas les résultats futurs
- N'investissez que ce que vous pouvez vous permettre de perdre
- Testez toujours en mode manuel avant d'activer le mode automatique
- L'auteur décline toute responsabilité pour les pertes financières

---

## 📄 License

MIT License - Voir [LICENSE](LICENSE) pour plus de détails.

---

## 🤝 Support

Pour toute question ou problème:
1. Vérifiez la documentation ci-dessus
2. Consultez les logs dans le dashboard
3. Vérifiez la configuration de vos clés API

---

**Bon trading! 🚀**
