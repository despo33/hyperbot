# 🏗️ Architecture du Trading Bot Hyperliquid

> **Document de référence pour les développeurs et l'IA assistant**
> Dernière mise à jour: 27 Décembre 2024

---

## 📋 Vue d'ensemble

Bot de trading automatisé pour **Hyperliquid DEX** avec trois stratégies:
1. **Ichimoku Kinko Hyo** - Stratégie par défaut (signaux TK Cross, Kumo, Chikou)
2. **Smart Money Concepts (SMC)** - Order Blocks, FVG, BOS (simplifié)
3. **Bollinger Squeeze** - Breakout après compression de volatilité

### Stack Technique
- **Backend**: Node.js 18+ (ES Modules `type: "module"`)
- **Framework**: Express.js
- **WebSocket**: `ws` (temps réel)
- **Base de données**: MongoDB (optionnel, via Mongoose)
- **Authentification**: JWT + bcrypt
- **Blockchain**: ethers.js (signature EIP-712)
- **Chiffrement**: AES-256 (crypto-js)

---

## 📁 Structure des Fichiers

```
bot/
├── server.js                 # Point d'entrée - Initialise le bot
├── webserver.js              # Serveur Express + WebSocket
├── routes.js                 # Routes API REST (~1700 lignes)
├── package.json              # Dépendances npm
│
├── core/                     # 🧠 LOGIQUE MÉTIER
│   ├── tradeEngine.js        # ⭐ MOTEUR PRINCIPAL (~2400 lignes)
│   ├── signalDetector.js     # Détection signaux Ichimoku + Bollinger
│   ├── smcSignalDetector.js  # Détection signaux SMC (Order Blocks, FVG, BOS)
│   ├── smartMoney.js         # Analyse SMC (structure, swings, zones)
│   ├── bollingerSqueeze.js   # Stratégie Bollinger Squeeze
│   ├── ichimoku.js           # Calculs Ichimoku
│   ├── indicators.js         # RSI, MACD, EMA200, Bollinger, etc.
│   ├── riskManager.js        # Gestion du risque, calcul SL/TP
│   ├── priceFetcher.js       # Récupération prix via API
│   ├── positionManager.js    # Gestion positions ouvertes
│   ├── backtester.js         # Backtesting des stratégies
│   ├── scanner.js            # Scanner multi-crypto
│   ├── multiTimeframe.js     # Analyse MTF
│   ├── correlationManager.js # Corrélation entre cryptos
│   ├── patternDetector.js    # Détection de patterns
│   └── config.js             # Constantes et presets
│
├── services/                 # 🔌 SERVICES EXTERNES
│   ├── hyperliquidApi.js     # Client API Hyperliquid (avec cache)
│   ├── hyperliquidAuth.js    # Auth (clé privée, signature EIP-712)
│   ├── database.js           # Connexion MongoDB
│   ├── connectionManager.js  # Gestion connexions
│   ├── rateLimiter.js        # Rate limiting API
│   └── emailService.js       # Service email
│
├── routes/                   # 🛣️ ROUTES ADDITIONNELLES
│   ├── authRoutes.js         # Auth (inscription, login, reset)
│   └── walletRoutes.js       # Gestion wallets utilisateur
│
├── models/                   # 📊 MODÈLES MONGODB
│   ├── User.js               # Utilisateurs
│   ├── Trade.js              # Historique trades
│   └── Config.js             # Configuration
│
├── utils/                    # 🔧 UTILITAIRES
│   └── validation.js         # Schémas Joi pour validation API
│
├── storage/                  # 💾 DONNÉES PERSISTANTES
│   ├── risk.json             # Config risk management (fallback)
│   ├── profiles.json         # Profils de configuration (legacy)
│   ├── keys.json.enc         # Clés API chiffrées AES-256
│   └── state.json            # État du bot
│
└── web/                      # 🖥️ FRONTEND
    ├── dashboard.html        # Page principale
    ├── dashboard.css         # Styles
    ├── dashboard.js          # Logique frontend (~4300 lignes)
    ├── login.html            # Page connexion
    └── reset-password.html   # Reset mot de passe
```

---

## 🔄 Flux de Données Principal

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUX DE TRADING                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. TradeEngine.start()                                         │
│     └── Démarre boucle d'analyse (intervalle configurable)      │
│                                                                 │
│  2. Pour chaque symbole configuré:                              │
│     └── priceFetcher.getCandles(symbol, timeframe, 250)         │
│         └── hyperliquidApi.getCandles() [avec cache 5s]         │
│                                                                 │
│  3. Analyse selon stratégie:                                    │
│     ├── strategy='ichimoku' → signalDetector.analyze()          │
│     └── strategy='smc' → smcSignalDetector.analyze()            │
│                                                                 │
│  4. Filtres appliqués (selon stratégie):                        │
│     ├── Ichimoku: EMA200, RSI, MACD, Supertrend, Chikou         │
│     ├── SMC: RSI uniquement (filtres assouplis)                 │
│     └── Bollinger: RSI, Volume                                  │
│                                                                 │
│  5. riskManager.canTrade() vérifie:                             │
│     ├── Limite trades/jour                                      │
│     ├── Perte journalière max                                   │
│     ├── Drawdown max                                            │
│     ├── Pertes consécutives                                     │
│     └── RRR minimum                                             │
│                                                                 │
│  6. Si validé + mode='auto':                                    │
│     └── hyperliquidApi.placeOrderWithTPSL()                     │
│         └── Signature EIP-712 + envoi à Hyperliquid             │
│                                                                 │
│  7. WebSocket broadcast vers dashboard                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Fichiers Clés à Connaître

### 1. `core/tradeEngine.js` (~2400 lignes) ⭐
**Le cœur du bot** - Orchestre tout le système

```javascript
// Fonctions principales:
class TradeEngine {
    start()                    // Démarre le bot
    stop()                     // Arrête le bot
    analyzeSymbol(symbol)      // Analyse un symbole
    analyzeSymbolOnTimeframe() // Analyse sur timeframe spécifique
    getTradeDetails(symbol)    // Détails pour modal trade (SL/TP, Ichimoku)
    manualTrade(params)        // Exécute un trade manuel
    updateConfig(config)       // Met à jour la configuration
    getStatus()                // Retourne l'état actuel
}
```

**Configuration importante** (lignes ~37-82):
```javascript
this.config = {
    symbols: ['BTC', 'ETH', ...],  // 20 cryptos par défaut
    timeframes: ['15m'],           // Peut être un array si multiTFTrading
    multiTFTrading: false,         // Trading sur plusieurs TF en parallèle
    mode: 'auto' | 'manual',
    leverage: 5,
    strategy: 'ichimoku' | 'smc' | 'bollinger',
    // Signaux Ichimoku
    enabledSignals: { tkCross, kumoBreakout, kumoTwist, kijunBounce },
    // Signaux SMC (simplifiés)
    smcSignals: { orderBlocks: true, fvg: true, bos: true },
    // MTF (confirmation)
    useMTF: true,
    mtfPrimary: '15m',
    mtfHigher: '4h'
}
```

### 2. `core/signalDetector.js`
Détection des signaux Ichimoku avec scoring

```javascript
// Score de -7 à +7
analyze(candles, options, timeframe) → {
    ichimokuScore: { score, direction },
    signals: { tkCross, kumoBreakout, kumoTwist, kijunBounce },
    indicators: { rsi, macd, ema200, adx, supertrend },
    finalSignal: { action: 'BUY'|'SELL', confidence }
}
```

### 3. `core/riskManager.js`
Gestion du risque et calcul SL/TP

```javascript
// Fonctions clés:
canTrade(balance, options)           // Vérifie si trade autorisé
calculatePositionSize(...)           // Calcule taille position
calculateSLTP(price, direction, options) // Calcule SL/TP
    // Modes: 'percent', 'atr', 'ichimoku_pure', 'auto'
```

### 4. `services/hyperliquidApi.js`
Client API avec cache intelligent

```javascript
// Cache ajouté récemment:
- cachedMids (2s)      // Prix
- candleCache (5s)     // Candles par symbole/timeframe
- cachedMeta (60s)     // Métadonnées marchés

// Fonctions principales:
getCandles(symbol, interval, startTime)
placeOrderWithTPSL({ symbol, isBuy, size, takeProfit, stopLoss })
getOpenPositions()
closePosition(symbol)
```

### 5. `routes.js` (~1700 lignes)
API REST principale

```javascript
// Routes importantes:
GET  /api/status              // État du bot
POST /api/start               // Démarre le bot
POST /api/stop                // Arrête le bot
GET  /api/config/trading      // Config trading
POST /api/config/trading      // Sauvegarde config
GET  /api/trade-details/:symbol  // Détails trade (modal)
POST /api/trade               // Exécute un trade
GET  /api/scanner/results     // Résultats scanner
POST /api/backtest/run        // Lance backtest
GET  /api/profiles            // Liste profils
POST /api/profiles            // Crée profil
```

### 6. `web/dashboard.js` (~4300 lignes)
Frontend complet

```javascript
// Sections principales:
- Authentification (lignes 20-100)
- WebSocket (lignes 380-420)
- Chargement config (loadTradingConfig ~1500-1600)
- Sauvegarde config (saveTradingConfig ~3850-3950)
- Modal trade details (showTradeDetails ~2316-2462)
- Exécution trade (executeTrade ~2467-2528)
- Profils (loadProfiles, deleteProfile ~3640-3800)
```

---

## 🔧 Points d'Attention pour les Modifications

### ⚠️ Validation API
Le fichier `utils/validation.js` contient les schémas Joi avec `.unknown(false)`.
**Tout nouveau champ dans la config doit être ajouté au schéma** sinon erreur 400.

```javascript
// Exemple: Ajouter un nouveau champ
export const tradingConfigSchema = Joi.object({
    // ... champs existants ...
    nouveauChamp: Joi.boolean(),  // ← Ajouter ici
}).unknown(false);
```

### ⚠️ Synchronisation Frontend/Backend
Quand on ajoute un paramètre:
1. Ajouter dans `tradeEngine.js` (config)
2. Ajouter dans `routes.js` (route POST)
3. Ajouter dans `validation.js` (schéma)
4. Ajouter dans `dashboard.html` (input)
5. Ajouter dans `dashboard.js` (load + save)

### ⚠️ IDs HTML
Les IDs des éléments HTML doivent correspondre exactement dans:
- `dashboard.html` (définition)
- `dashboard.js` (getElementById)

### ⚠️ ES Modules
Le projet utilise ES Modules (`"type": "module"` dans package.json).
- Utiliser `import/export` (pas `require`)
- Extensions `.js` requises dans les imports

---

## 📊 Presets par Timeframe

### Configuration Ichimoku
| Timeframe | Tenkan | Kijun | Senkou | Usage |
|-----------|--------|-------|--------|-------|
| 1m, 5m    | 6      | 13    | 26     | Scalping |
| 15m       | 9      | 26    | 52     | Day trading |
| 1h        | 10     | 30    | 60     | Standard |
| 4h        | 20     | 60    | 120    | Swing |

### TP/SL par Timeframe (`TIMEFRAME_TPSL` dans config.js)
| Timeframe | TP %  | SL %  |
|-----------|-------|-------|
| 1m        | 0.3   | 0.15  |
| 5m        | 0.5   | 0.25  |
| 15m       | 1.0   | 0.5   |
| 1h        | 2.0   | 1.0   |
| 4h        | 4.0   | 2.0   |

---

## 🔐 Sécurité

### Clés API
- Stockées chiffrées AES-256 dans `storage/keys.json.enc`
- Jamais en clair dans le code

### Authentification
- JWT pour les sessions
- bcrypt pour les mots de passe
- Rate limiting (100 req/min)

### Variables d'environnement
```bash
PORT=3002
JWT_SECRET=xxx
ENCRYPTION_KEY=xxx
MONGODB_URI=xxx  # Optionnel
```

---

## 🚀 Déploiement

### Local (Windows)
```powershell
cd "C:\Users\33666\Desktop\PROJET IA\robot\analyse"
npm start
# Dashboard: http://localhost:3002
```

### Production (VPS avec PM2)
```bash
ssh root@srv1195545
cd /var/www/hyperbot
git pull
pm2 restart hyperbot
pm2 logs hyperbot
```

---

## 📝 Historique des Modifications Récentes

### 27 Décembre 2024
- ✅ **Simplification SMC**: Garde uniquement Order Blocks, FVG, BOS
- ✅ **Suppression filtres SMC restrictifs**: Session, Volume, MACD, Premium/Discount
- ✅ **Multi-TF Trading**: Option pour trader sur plusieurs timeframes en parallèle
- ✅ **Synchronisation Backtesting/Trading**: Mêmes paramètres SMC
- ✅ **Nettoyage web-vue**: Suppression du frontend Vue.js non utilisé

### Décembre 2024 (avant)
- ✅ Ajout stratégie SMC (Smart Money Concepts)
- ✅ Ajout stratégie Bollinger Squeeze
- ✅ Filtres dynamiques selon stratégie
- ✅ Cache API intelligent (prix 2s, candles 5s)
- ✅ Correction modal trade details (SL/TP, niveaux Ichimoku)
- ✅ Système de profils de configuration

---

## 🐛 Problèmes Connus et Solutions

### Erreur "Validation échouée" (400)
**Cause**: Nouveau champ non déclaré dans `validation.js`
**Solution**: Ajouter le champ au schéma Joi

### Erreur "toFixed is not a function"
**Cause**: Variable peut être string au lieu de number
**Solution**: Vérifier le type avant d'appeler toFixed

### Données modal à 0 ou erronées
**Cause**: `getTradeDetails` ne récupère pas les bonnes données
**Solution**: Appeler `signalDetector.analyze()` pour avoir les niveaux Ichimoku

### Redémarrages fréquents PM2 (↺ élevé)
**Cause**: Crashes non gérés
**Solution**: `pm2 logs hyperbot --err` pour identifier

---

## 📞 Contact

Pour toute question sur l'architecture, consulter ce document ou les commentaires dans le code.
