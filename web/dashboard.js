/**
 * Hyperliquid Trading Bot - Dashboard JavaScript
 * Gère l'interface utilisateur et les communications avec le serveur
 */

// ==================== CONFIGURATION ====================

const API_BASE = window.location.origin + '/api';
let WS_URL = `ws://${window.location.host}`;
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Utilisateur connecté
let currentUser = null;

// ==================== AUTHENTIFICATION ====================

/**
 * Récupère le token d'authentification
 */
function getAuthToken() {
    return localStorage.getItem('authToken');
}

/**
 * Effectue une requête API authentifiée
 */
async function authApiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (response.status === 401 || response.status === 403) {
            // Token invalide, déconnexion
            logout();
            return null;
        }

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error.message);
        throw error;
    }
}

/**
 * Déconnexion
 */
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

/**
 * Charge les infos utilisateur
 */
async function loadUserInfo() {
    try {
        const stored = localStorage.getItem('user');
        if (stored) {
            currentUser = JSON.parse(stored);
            updateUserDisplay();
        }
        
        // Rafraîchit depuis le serveur
        const data = await authApiRequest('/auth/me');
        if (data && data.success) {
            currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(currentUser));
            updateUserDisplay();
        }
    } catch (error) {
        console.error('Erreur chargement utilisateur:', error);
    }
}

/**
 * Met à jour l'affichage utilisateur
 */
function updateUserDisplay() {
    if (currentUser) {
        const usernameEl = document.getElementById('usernameDisplay');
        if (usernameEl) {
            usernameEl.textContent = currentUser.username || 'Utilisateur';
        }
    }
}

// ==================== UTILS ====================

/**
 * Effectue une requête API avec token d'authentification
 */
async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    // Ajoute le token d'authentification si disponible
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error.message);
        throw error;
    }
}

/**
 * Affiche une notification toast
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Formate un nombre avec séparateurs
 */
function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return parseFloat(num).toLocaleString('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Formate un timestamp en heure locale
 */
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// ==================== WEBSOCKET ====================

/**
 * Connecte au WebSocket pour les mises à jour en temps réel
 */
function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('[WS] Connecté');
        reconnectAttempts = 0;
        updateConnectionStatus(true);
        
        // S'abonne aux événements
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'logs' }));
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'signals' }));
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'trades' }));
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'analysis' }));
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        } catch (e) {
            console.error('[WS] Parse error:', e);
        }
    };

    ws.onclose = () => {
        console.log('[WS] Déconnecté');
        updateConnectionStatus(false);
        
        // Reconnexion automatique
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(connectWebSocket, 2000 * reconnectAttempts);
        }
    };

    ws.onerror = (error) => {
        console.error('[WS] Erreur:', error);
    };
}

/**
 * Gère les messages WebSocket
 */
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'log':
            addLogEntry(message.data);
            break;
        case 'signal':
            updateSignalDisplay(message.data);
            showToast(`Signal détecté: ${message.data.action}`, 'warning');
            break;
        case 'trade':
            showToast('Nouveau trade exécuté!', 'success');
            refreshStatus();
            break;
        case 'analysis':
            updateAnalysisDisplay(message.data);
            break;
        case 'heartbeat':
            // Ping/pong pour maintenir la connexion
            break;
    }
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');
    
    if (connected) {
        dot.classList.add('connected');
        text.textContent = 'Connecté';
    } else {
        dot.classList.remove('connected');
        text.textContent = 'Déconnecté';
    }
}

// ==================== DATA LOADING ====================

/**
 * Charge les données initiales
 */
async function loadInitialData() {
    await Promise.all([
        refreshStatus(),
        loadTradingConfig(),
        loadRiskConfig(),
        checkApiStatus(),
        loadLogs(),
        loadAccountStats()
    ]);
}

/**
 * Charge les statistiques du compte depuis Hyperliquid
 * @param {string} period - Période de filtrage: 'day', 'week', 'month'
 */
async function loadAccountStats(period = null) {
    try {
        const data = await apiRequest('/account/stats');
        updateStatsDisplay(data);
        
        // Si pas de période spécifiée, récupère celle du bouton actif
        if (!period) {
            const activeBtn = document.querySelector('.chart-controls .btn.active');
            period = activeBtn?.dataset?.period || 'day';
        }
        
        // Filtre l'historique selon la période
        const filteredHistory = filterPnLByPeriod(data.pnlHistory, period);
        updatePnLChart(filteredHistory, period);
    } catch (error) {
        console.error('Erreur chargement stats:', error);
    }
}

/**
 * Met à jour l'affichage des statistiques
 */
function updateStatsDisplay(stats) {
    if (!stats) return;
    
    // Stats du jour
    const todayTradesEl = document.getElementById('todayTrades');
    const todayWinRateEl = document.getElementById('todayWinRate');
    const todayPnLEl = document.getElementById('todayPnL');
    
    if (todayTradesEl) todayTradesEl.textContent = stats.todayTrades || 0;
    if (todayWinRateEl) todayWinRateEl.textContent = `${(stats.todayWinRate || 0).toFixed(0)}%`;
    if (todayPnLEl) {
        const pnl = stats.todayPnL || 0;
        todayPnLEl.textContent = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
        todayPnLEl.className = `stat-value ${pnl >= 0 ? 'positive' : 'negative'}`;
    }
    
    // Statistiques avancées
    const totalWinsEl = document.getElementById('totalWins');
    const totalLossesEl = document.getElementById('totalLosses');
    const avgWinEl = document.getElementById('avgWin');
    const avgLossEl = document.getElementById('avgLoss');
    const profitFactorEl = document.getElementById('profitFactor');
    const maxDrawdownEl = document.getElementById('currentMaxDrawdown');
    const winStreakEl = document.getElementById('winStreak');
    const lossStreakEl = document.getElementById('lossStreak');
    
    if (totalWinsEl) totalWinsEl.textContent = stats.wins || 0;
    if (totalLossesEl) totalLossesEl.textContent = stats.losses || 0;
    if (avgWinEl) avgWinEl.textContent = `+$${(stats.avgWin || 0).toFixed(2)}`;
    if (avgLossEl) avgLossEl.textContent = `-$${(stats.avgLoss || 0).toFixed(2)}`;
    if (profitFactorEl) profitFactorEl.textContent = (stats.profitFactor || 0).toFixed(2);
    if (maxDrawdownEl) maxDrawdownEl.textContent = `${(stats.maxDrawdown || 0).toFixed(1)}%`;
    if (winStreakEl) winStreakEl.textContent = stats.winStreak || 0;
    if (lossStreakEl) lossStreakEl.textContent = stats.lossStreak || 0;
    
    // Drawdown actuel
    const currentDrawdownEl = document.getElementById('currentDrawdown');
    if (currentDrawdownEl) {
        currentDrawdownEl.textContent = `${(stats.maxDrawdown || 0).toFixed(1)}%`;
    }
}

// Variable globale pour le graphique P&L
let pnlChartInstance = null;

/**
 * Met à jour le graphique P&L
 * @param {Array} pnlHistory - Historique P&L filtré
 * @param {string} period - Période sélectionnée
 */
function updatePnLChart(pnlHistory, period = 'day') {
    const canvas = document.getElementById('pnlChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Détruit l'ancien graphique s'il existe
    if (pnlChartInstance) {
        pnlChartInstance.destroy();
        pnlChartInstance = null;
    }
    
    // Si pas de données, affiche un message
    if (!pnlHistory || pnlHistory.length === 0) {
        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '14px Inter';
        ctx.fillStyle = '#6b7280';
        ctx.textAlign = 'center';
        const periodText = period === 'day' ? 'aujourd\'hui' : period === 'week' ? 'cette semaine' : 'ce mois';
        ctx.fillText(`Aucun trade ${periodText}`, canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Prépare les labels selon la période
    const labels = pnlHistory.map((p, i) => {
        const date = new Date(p.time);
        if (period === 'day') {
            // Pour le jour: affiche l'heure
            return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        } else if (period === 'week') {
            // Pour la semaine: affiche jour + heure
            return date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
        } else {
            // Pour le mois: affiche jour/mois
            return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        }
    });
    
    const cumulativeData = pnlHistory.map(p => p.cumulative);
    const tradeData = pnlHistory.map(p => p.pnl);
    
    // Couleurs selon le P&L
    const lastPnL = cumulativeData[cumulativeData.length - 1] || 0;
    const lineColor = lastPnL >= 0 ? '#10b981' : '#ef4444';
    const bgColor = lastPnL >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    
    pnlChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'P&L Cumulé',
                data: cumulativeData,
                borderColor: lineColor,
                backgroundColor: bgColor,
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const trade = pnlHistory[context.dataIndex];
                            return [
                                `P&L Cumulé: $${context.raw.toFixed(2)}`,
                                `Trade: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`,
                                `Coin: ${trade.coin}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#6b7280',
                        maxTicksLimit: 10
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#6b7280',
                        callback: (value) => `$${value.toFixed(0)}`
                    }
                }
            }
        }
    });
}

/**
 * Rafraîchit le statut du bot
 */
async function refreshStatus() {
    try {
        const data = await apiRequest('/status');
        updateDashboard(data);
    } catch (error) {
        console.error('Erreur chargement statut:', error);
    }
}

/**
 * Met à jour le dashboard avec les nouvelles données
 */
function updateDashboard(data) {
    // Statut du bot
    const botStatus = document.querySelector('#botStatus .status-badge');
    if (data.bot.isRunning) {
        botStatus.textContent = 'EN COURS';
        botStatus.className = 'status-badge online';
        document.getElementById('startBotBtn').classList.add('hidden');
        document.getElementById('stopBotBtn').classList.remove('hidden');
    } else {
        botStatus.textContent = 'ARRÊTÉ';
        botStatus.className = 'status-badge offline';
        document.getElementById('startBotBtn').classList.remove('hidden');
        document.getElementById('stopBotBtn').classList.add('hidden');
    }

    document.getElementById('botMode').textContent = data.bot.mode?.toUpperCase() || '-';
    document.getElementById('botSymbol').textContent = data.bot.symbol || '-';
    document.getElementById('analysisCount').textContent = data.bot.analysisCount || 0;

    // Balance - affiche selon le statut de connexion
    if (data.authenticated && data.balance) {
        document.getElementById('totalBalance').textContent = `$${formatNumber(data.balance.totalEquity)}`;
        document.getElementById('freeMargin').textContent = `$${formatNumber(data.balance.freeMargin)}`;
        document.getElementById('unrealizedPnl').textContent = `$${formatNumber(data.balance.unrealizedPnl)}`;
    } else if (data.authenticated) {
        document.getElementById('totalBalance').textContent = '$0.00';
        document.getElementById('freeMargin').textContent = '$0.00';
        document.getElementById('unrealizedPnl').textContent = '$0.00';
    } else {
        document.getElementById('totalBalance').textContent = 'Non connecté';
        document.getElementById('freeMargin').textContent = '-';
        document.getElementById('unrealizedPnl').textContent = '-';
    }
    
    // Affiche l'adresse du wallet si connecté
    if (data.address) {
        const shortAddr = data.address.slice(0, 6) + '...' + data.address.slice(-4);
        document.getElementById('botSymbol').textContent = (data.bot.symbol || '-') + ` (${shortAddr})`;
    }

    // Stats journalières
    if (data.risk?.daily) {
        document.getElementById('todayTrades').textContent = data.risk.daily.tradesCount;
        document.getElementById('todayWinRate').textContent = data.risk.daily.winRate;
        document.getElementById('todayPnL').textContent = `$${formatNumber(data.risk.daily.totalPnL)}`;
        document.getElementById('currentDrawdown').textContent = `${formatNumber(data.risk.daily.currentDrawdown, 1)}%`;
    }

    // Positions
    updatePositionsDisplay(data.positions);

    // Dernière analyse
    if (data.bot.lastAnalysis) {
        updateAnalysisDisplay(data.bot.lastAnalysis);
    }

    // Dernier signal
    if (data.bot.lastSignal) {
        updateSignalDisplay(data.bot.lastSignal);
    }
}

/**
 * Met à jour l'affichage de l'analyse
 */
function updateAnalysisDisplay(analysis) {
    if (!analysis) return;

    // Prix
    const priceEl = document.getElementById('currentPrice');
    const changeEl = document.getElementById('priceChange');
    
    if (analysis.price) {
        priceEl.textContent = `$${formatNumber(analysis.price)}`;
    }

    // Ichimoku
    if (analysis.ichimoku) {
        document.getElementById('tenkan').textContent = formatNumber(analysis.ichimoku.tenkan);
        document.getElementById('kijun').textContent = formatNumber(analysis.ichimoku.kijun);
        document.getElementById('senkouA').textContent = formatNumber(analysis.ichimoku.senkouA);
        document.getElementById('senkouB').textContent = formatNumber(analysis.ichimoku.senkouB);
        document.getElementById('kumoColor').textContent = analysis.ichimoku.kumoColor === 'green' ? '🟢 Haussier' : '🔴 Baissier';
        document.getElementById('pricePosition').textContent = {
            'above': '⬆️ Au-dessus',
            'below': '⬇️ En-dessous',
            'inside': '➡️ Dans le nuage'
        }[analysis.ichimoku.pricePosition] || '-';
    }

    if (analysis.ichimokuScore) {
        document.getElementById('ichimokuScore').textContent = 
            `${analysis.ichimokuScore.score}/${analysis.ichimokuScore.maxScore} (${analysis.ichimokuScore.direction || 'neutre'})`;
    }
    
    // Indicateurs techniques avancés
    updateTechnicalIndicators(analysis);
}

/**
 * Met à jour les indicateurs techniques
 */
function updateTechnicalIndicators(analysis) {
    // RSI
    if (analysis.indicators?.rsi !== undefined) {
        const rsi = analysis.indicators.rsi;
        const rsiBar = document.getElementById('rsiBar');
        const rsiValue = document.getElementById('rsiValue');
        if (rsiBar) rsiBar.style.width = `${rsi}%`;
        if (rsiValue) rsiValue.textContent = Math.round(rsi);
    }
    
    // MACD
    const macdEl = document.getElementById('macdSignal');
    if (macdEl && analysis.indicators?.macd) {
        const macd = analysis.indicators.macd;
        if (macd.histogram > 0) {
            macdEl.textContent = '📈 Haussier';
            macdEl.className = 'indicator-signal bullish';
        } else if (macd.histogram < 0) {
            macdEl.textContent = '📉 Baissier';
            macdEl.className = 'indicator-signal bearish';
        } else {
            macdEl.textContent = '➡️ Neutre';
            macdEl.className = 'indicator-signal neutral';
        }
    }
    
    // Bollinger
    const bollingerEl = document.getElementById('bollingerSignal');
    if (bollingerEl && analysis.indicators?.bollinger) {
        const bb = analysis.indicators.bollinger;
        if (bb.position === 'above') {
            bollingerEl.textContent = '⬆️ Surachat';
            bollingerEl.className = 'indicator-signal bearish';
        } else if (bb.position === 'below') {
            bollingerEl.textContent = '⬇️ Survente';
            bollingerEl.className = 'indicator-signal bullish';
        } else {
            bollingerEl.textContent = '➡️ Normal';
            bollingerEl.className = 'indicator-signal neutral';
        }
    }
    
    // Volume
    const volumeEl = document.getElementById('volumeSignal');
    if (volumeEl && analysis.indicators?.volume) {
        const vol = analysis.indicators.volume;
        if (vol.trend === 'increasing') {
            volumeEl.textContent = '📊 En hausse';
            volumeEl.className = 'indicator-signal bullish';
        } else if (vol.trend === 'decreasing') {
            volumeEl.textContent = '📉 En baisse';
            volumeEl.className = 'indicator-signal bearish';
        } else {
            volumeEl.textContent = '➡️ Stable';
            volumeEl.className = 'indicator-signal neutral';
        }
    }
    
    // MTF Confirmation
    const mtfEl = document.getElementById('mtfSignal');
    if (mtfEl && analysis.mtfConfirmation !== undefined) {
        if (analysis.mtfConfirmation) {
            mtfEl.textContent = '✅ Confirmé';
            mtfEl.className = 'indicator-signal bullish';
        } else {
            mtfEl.textContent = '❌ Non confirmé';
            mtfEl.className = 'indicator-signal bearish';
        }
    }
    
    // Pattern
    const patternEl = document.getElementById('patternSignal');
    if (patternEl && analysis.patterns?.length > 0) {
        const pattern = analysis.patterns[0];
        patternEl.textContent = pattern.name || pattern.type;
        patternEl.className = `indicator-signal ${pattern.direction === 'bullish' ? 'bullish' : 'bearish'}`;
    }
}

/**
 * Met à jour l'affichage du signal
 */
function updateSignalDisplay(signal) {
    const badgeEl = document.querySelector('#lastSignal .signal-badge');
    const detailsEl = document.getElementById('signalDetails');

    if (!signal || !signal.action) {
        badgeEl.textContent = 'AUCUN';
        badgeEl.className = 'signal-badge neutral';
        detailsEl.innerHTML = '<p class="no-signal">En attente d\'analyse...</p>';
        return;
    }

    badgeEl.textContent = signal.action;
    badgeEl.className = `signal-badge ${signal.action.toLowerCase()}`;

    let details = `<p><strong>Confiance:</strong> ${signal.confidence}</p>`;
    if (signal.signals && signal.signals.length > 0) {
        details += '<p><strong>Signaux:</strong></p><ul>';
        signal.signals.forEach(s => {
            details += `<li>${s.name}: ${s.description || s.signal}</li>`;
        });
        details += '</ul>';
    }
    detailsEl.innerHTML = details;
}

/**
 * Met à jour l'affichage des positions
 */
function updatePositionsDisplay(positions) {
    const container = document.getElementById('positionsList');
    const countEl = document.getElementById('positionsCount');

    if (!container) return;

    if (!positions || positions.length === 0) {
        container.innerHTML = '<p class="no-position">Aucune position ouverte</p>';
        if (countEl) countEl.textContent = '0';
        return;
    }

    if (countEl) countEl.textContent = positions.length;

    let html = '';
    positions.forEach(pos => {
        const direction = parseFloat(pos.size || pos.szi) > 0 ? 'long' : 'short';
        const size = Math.abs(parseFloat(pos.size || pos.szi || 0));
        const entryPrice = parseFloat(pos.entryPrice || pos.entryPx || 0);
        const pnl = parseFloat(pos.unrealizedPnl || 0);
        const pnlClass = pnl >= 0 ? 'positive' : 'negative';
        const pnlSign = pnl >= 0 ? '+' : '';
        const leverage = pos.leverage || '-';
        
        html += `
            <div class="position-item ${direction}">
                <div class="position-header">
                    <div class="position-symbol">
                        <span class="symbol">${pos.symbol || pos.coin}</span>
                        <span class="direction ${direction}">${direction.toUpperCase()}</span>
                    </div>
                    <span class="position-pnl ${pnlClass}">${pnlSign}$${formatNumber(pnl)}</span>
                </div>
                <div class="position-details">
                    <div class="position-detail">
                        <span class="label">Taille</span>
                        <span class="value">${formatNumber(size, 4)}</span>
                    </div>
                    <div class="position-detail">
                        <span class="label">Entrée</span>
                        <span class="value">$${formatNumber(entryPrice)}</span>
                    </div>
                    <div class="position-detail">
                        <span class="label">Levier</span>
                        <span class="value">${leverage}x</span>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Charge les logs existants
 */
async function loadLogs() {
    try {
        const data = await apiRequest('/logs?limit=50');
        const container = document.getElementById('logsContainer');
        container.innerHTML = '';
        
        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => addLogEntry(log, false));
        } else {
            container.innerHTML = '<p class="log-placeholder">En attente de logs...</p>';
        }
    } catch (error) {
        console.error('Erreur chargement logs:', error);
    }
}

// ==================== LOGS AMÉLIORÉS ====================

let logsPaused = false;
let allLogs = [];
let logStats = { total: 0, error: 0, trade: 0 };

/**
 * Initialise les contrôles de logs
 */
function initLogsControls() {
    // Clear logs
    document.getElementById('clearLogs')?.addEventListener('click', () => {
        allLogs = [];
        logStats = { total: 0, error: 0, trade: 0 };
        updateLogStats();
        const container = document.getElementById('logsContainer');
        if (container) container.innerHTML = '<p class="log-placeholder">Logs effacés</p>';
    });

    // Pause/Resume
    document.getElementById('pauseLogs')?.addEventListener('click', () => {
        logsPaused = !logsPaused;
        const btn = document.getElementById('pauseLogs');
        const icon = btn?.querySelector('i');
        const logsCard = document.querySelector('.logs-card');
        
        if (logsPaused) {
            icon?.setAttribute('data-lucide', 'play');
            logsCard?.classList.add('logs-paused');
        } else {
            icon?.setAttribute('data-lucide', 'pause');
            logsCard?.classList.remove('logs-paused');
        }
        lucide.createIcons();
    });

    // Filter
    document.getElementById('logFilter')?.addEventListener('change', filterLogs);

    // Search
    document.getElementById('logSearch')?.addEventListener('input', filterLogs);

    // Download
    document.getElementById('downloadLogs')?.addEventListener('click', downloadLogs);
}

/**
 * Filtre les logs selon le type et la recherche
 */
function filterLogs() {
    const filter = document.getElementById('logFilter')?.value || 'all';
    const search = document.getElementById('logSearch')?.value?.toLowerCase() || '';
    const entries = document.querySelectorAll('.log-entry');

    entries.forEach(entry => {
        const level = entry.classList.contains('trade') ? 'trade' :
                      entry.classList.contains('signal') ? 'signal' :
                      entry.classList.contains('error') ? 'error' :
                      entry.classList.contains('warn') ? 'warn' :
                      entry.classList.contains('success') ? 'success' : 'info';
        
        const message = entry.querySelector('.message')?.textContent?.toLowerCase() || '';
        
        const matchesFilter = filter === 'all' || level === filter;
        const matchesSearch = !search || message.includes(search);
        
        if (matchesFilter && matchesSearch) {
            entry.classList.remove('filtered');
        } else {
            entry.classList.add('filtered');
        }
    });
}

/**
 * Met à jour les statistiques de logs
 */
function updateLogStats() {
    document.getElementById('logCountTotal').textContent = `Total: ${logStats.total}`;
    document.getElementById('logCountError').textContent = `Erreurs: ${logStats.error}`;
    document.getElementById('logCountTrade').textContent = `Trades: ${logStats.trade}`;
}

/**
 * Télécharge les logs en fichier texte
 */
function downloadLogs() {
    if (allLogs.length === 0) {
        showToast('Aucun log à télécharger', 'warning');
        return;
    }

    const content = allLogs.map(log => 
        `[${formatTime(log.timestamp)}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trading-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Logs téléchargés', 'success');
}

/**
 * Ajoute une entrée de log
 */
function addLogEntry(log, scroll = true) {
    // Si en pause, stocke mais n'affiche pas
    if (logsPaused) {
        allLogs.push(log);
        return;
    }

    const container = document.getElementById('logsContainer');
    if (!container) return;
    
    // Supprime le placeholder
    const placeholder = container.querySelector('.log-placeholder');
    if (placeholder) placeholder.remove();

    // Détermine le type de log
    let logType = log.level || 'info';
    const msg = log.message?.toLowerCase() || '';
    
    if (msg.includes('trade') || msg.includes('position') || msg.includes('ordre')) {
        logType = 'trade';
        logStats.trade++;
    } else if (msg.includes('signal') || msg.includes('opportunité')) {
        logType = 'signal';
    } else if (log.level === 'error') {
        logStats.error++;
    }
    
    logStats.total++;
    allLogs.push({ ...log, type: logType });
    updateLogStats();

    const entry = document.createElement('div');
    entry.className = `log-entry ${logType} new`;
    entry.innerHTML = `
        <span class="time">${formatTime(log.timestamp)}</span>
        <span class="level">${logType.toUpperCase()}</span>
        <span class="message">${escapeHtml(log.message)}</span>
    `;
    container.appendChild(entry);

    // Retire la classe 'new' après l'animation
    setTimeout(() => entry.classList.remove('new'), 1000);

    // Limite le nombre de logs affichés
    while (container.children.length > 300) {
        container.removeChild(container.firstChild);
    }

    // Applique les filtres actuels
    filterLogs();

    // Scroll vers le bas
    if (scroll) {
        container.scrollTop = container.scrollHeight;
    }
}

/**
 * Échappe les caractères HTML pour éviter XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== TRADING CONFIG ====================

/**
 * Charge la configuration trading
 */
async function loadTradingConfig() {
    try {
        const data = await apiRequest('/config/trading');
        const config = data.config;

        // Mode (toujours auto)
        const modeEl = document.getElementById('configMode');
        if (modeEl) modeEl.value = 'auto';
        
        // Timeframe (radio buttons)
        const tf = config.timeframes?.[0] || '15m';
        const tfRadio = document.querySelector(`input[name="configTimeframe"][value="${tf}"]`);
        if (tfRadio) {
            tfRadio.checked = true;
            updateTimeframeInfo(tf);
            updateTPSLPreview(tf);
        }
        
        // Intervalle et Levier
        const intervalEl = document.getElementById('configInterval');
        if (intervalEl) intervalEl.value = (config.analysisInterval || 60000) / 1000;
        
        const leverageEl = document.getElementById('configLeverage');
        if (leverageEl) leverageEl.value = config.leverage || 5;

        // Multi-Crypto
        const maxTradesEl = document.getElementById('maxConcurrentTrades');
        if (maxTradesEl) maxTradesEl.value = config.maxConcurrentTrades || 3;
        
        const winProbEl = document.getElementById('minWinProbability');
        const winProbValueEl = document.getElementById('minWinProbabilityValue');
        if (winProbEl) {
            winProbEl.value = (config.minWinProbability || 0.65) * 100;
            if (winProbValueEl) winProbValueEl.textContent = winProbEl.value + '%';
        }
        
        const minScoreEl = document.getElementById('minScore');
        const minScoreValueEl = document.getElementById('minScoreValue');
        if (minScoreEl) {
            minScoreEl.value = config.minScore || 3;
            if (minScoreValueEl) minScoreValueEl.textContent = config.minScore || 3;
        }
        
        const cryptosEl = document.getElementById('cryptosList');
        if (cryptosEl) cryptosEl.value = (config.symbols || ['BTC', 'ETH', 'SOL']).join(', ');

        // Signaux
        const signals = config.enabledSignals || {};
        const tkCrossEl = document.getElementById('signalTkCross');
        if (tkCrossEl) tkCrossEl.checked = signals.tkCross !== false;
        
        const kumoBreakoutEl = document.getElementById('signalKumoBreakout');
        if (kumoBreakoutEl) kumoBreakoutEl.checked = signals.kumoBreakout !== false;
        
        const kumoTwistEl = document.getElementById('signalKumoTwist');
        if (kumoTwistEl) kumoTwistEl.checked = signals.kumoTwist !== false;
        
        const kijunBounceEl = document.getElementById('signalKijunBounce');
        if (kijunBounceEl) kijunBounceEl.checked = signals.kijunBounce !== false;
        
        // TP/SL personnalisés
        if (config.defaultTP && config.defaultSL) {
            const customTPEl = document.getElementById('customTP');
            const customSLEl = document.getElementById('customSL');
            if (customTPEl) customTPEl.value = config.defaultTP;
            if (customSLEl) customSLEl.value = config.defaultSL;
        }
        
        // Filtres avancés
        const useRSIEl = document.getElementById('useRSIFilter');
        if (useRSIEl) useRSIEl.checked = config.useRSIFilter !== false;
        
        const rsiOverboughtEl = document.getElementById('rsiOverbought');
        if (rsiOverboughtEl) rsiOverboughtEl.value = config.rsiOverbought || 70;
        
        const rsiOversoldEl = document.getElementById('rsiOversold');
        if (rsiOversoldEl) rsiOversoldEl.value = config.rsiOversold || 30;
        
    } catch (error) {
        console.error('Erreur chargement config trading:', error);
    }
}

/**
 * Sauvegarde la configuration trading
 */
async function saveTradingConfig() {
    try {
        // Parse la liste des cryptos
        const cryptosText = document.getElementById('cryptosList').value;
        const symbols = cryptosText.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
        
        // Récupère le timeframe sélectionné (radio buttons)
        const selectedTF = document.querySelector('input[name="configTimeframe"]:checked')?.value || '15m';
        const tpslInfo = TIMEFRAME_TPSL[selectedTF] || { tp: 2, sl: 1 };
        
        // Mode TP/SL (3 modes: auto, atr, percent)
        const tpslMode = document.querySelector('input[name="tpslMode"]:checked')?.value || 'auto';
        
        // Détermine les TP/SL selon le mode
        let defaultTP, defaultSL, atrMultiplierSL, atrMultiplierTP;
        
        if (tpslMode === 'percent') {
            // Mode Pourcentage: utilise les valeurs des sliders
            defaultTP = parseFloat(document.getElementById('percentTP')?.value || 2);
            defaultSL = parseFloat(document.getElementById('percentSL')?.value || 1);
        } else if (tpslMode === 'atr') {
            // Mode ATR: utilise les multiplicateurs
            atrMultiplierSL = parseFloat(document.getElementById('atrMultiplierSL')?.value || 1.5);
            atrMultiplierTP = parseFloat(document.getElementById('atrMultiplierTP')?.value || 2.5);
            // Valeurs par défaut pour fallback
            defaultTP = tpslInfo.tp;
            defaultSL = tpslInfo.sl;
        } else {
            // Mode auto (Ichimoku): utilise les valeurs du timeframe
            defaultTP = tpslInfo.tp;
            defaultSL = tpslInfo.sl;
        }
        
        const config = {
            symbols: symbols,
            timeframes: [selectedTF],
            analysisInterval: parseInt(document.getElementById('configInterval').value) * 1000,
            leverage: parseInt(document.getElementById('configLeverage').value),
            mode: document.getElementById('configMode').value,
            // Multi-Crypto toujours activé
            multiCryptoMode: true,
            maxConcurrentTrades: parseInt(document.getElementById('maxConcurrentTrades').value),
            minWinProbability: parseInt(document.getElementById('minWinProbability').value) / 100,
            minScore: parseInt(document.getElementById('minScore').value),
            // Mode et valeurs TP/SL
            tpslMode: tpslMode,
            defaultTP: defaultTP,
            defaultSL: defaultSL,
            // Paramètres ATR (si mode ATR)
            atrMultiplierSL: atrMultiplierSL || 1.5,
            atrMultiplierTP: atrMultiplierTP || 2.5,
            // Signaux
            enabledSignals: {
                tkCross: document.getElementById('signalTkCross')?.checked ?? true,
                kumoBreakout: document.getElementById('signalKumoBreakout')?.checked ?? true,
                kumoTwist: document.getElementById('signalKumoTwist')?.checked ?? true,
                kijunBounce: document.getElementById('signalKijunBounce')?.checked ?? true
            },
            // Filtres avancés
            useRSIFilter: document.getElementById('useRSIFilter')?.checked ?? true,
            rsiOverbought: parseInt(document.getElementById('rsiOverbought')?.value || 70),
            rsiOversold: parseInt(document.getElementById('rsiOversold')?.value || 30)
        };

        await apiRequest('/config/trading', {
            method: 'POST',
            body: JSON.stringify(config)
        });

        showToast('Configuration trading sauvegardée', 'success');
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

// ==================== RISK CONFIG ====================

/**
 * Charge la configuration risk
 */
async function loadRiskConfig() {
    try {
        const data = await apiRequest('/config/risk');
        const config = data.config;

        // Risk per trade (slider)
        const riskEl = document.getElementById('riskPerTrade');
        const riskValueEl = document.getElementById('riskPerTradeValue');
        if (riskEl) {
            riskEl.value = config.riskPerTrade || 1;
            if (riskValueEl) riskValueEl.textContent = (config.riskPerTrade || 1) + '%';
        }
        
        // Max position size (select)
        const maxPosEl = document.getElementById('maxPositionSize');
        if (maxPosEl) maxPosEl.value = config.maxPositionSize || 10;
        
        // Daily loss limit (slider)
        const dailyLossEl = document.getElementById('dailyLossLimit');
        const dailyLossValueEl = document.getElementById('dailyLossLimitValue');
        if (dailyLossEl) {
            dailyLossEl.value = config.dailyLossLimit || 5;
            if (dailyLossValueEl) dailyLossValueEl.textContent = (config.dailyLossLimit || 5) + '%';
        }
        
        // Max drawdown (slider)
        const drawdownEl = document.getElementById('maxDrawdown');
        const drawdownValueEl = document.getElementById('maxDrawdownValue');
        if (drawdownEl) {
            drawdownEl.value = config.maxDrawdown || 20;
            if (drawdownValueEl) drawdownValueEl.textContent = (config.maxDrawdown || 20) + '%';
        }
        
        // Max trades per day (select)
        const maxTradesEl = document.getElementById('maxTradesPerDay');
        if (maxTradesEl) maxTradesEl.value = config.maxTradesPerDay || 10;
        
        // Max consecutive losses (select)
        const maxLossesEl = document.getElementById('maxConsecutiveLosses');
        if (maxLossesEl) maxLossesEl.value = config.maxConsecutiveLosses || 3;
        
        // RRR (slider)
        const rrrEl = document.getElementById('minRiskRewardRatio');
        const rrrValueEl = document.getElementById('rrrValue');
        if (rrrEl) {
            rrrEl.value = config.minRiskRewardRatio || 2;
            if (rrrValueEl) rrrValueEl.textContent = (config.minRiskRewardRatio || 2) + ':1';
        }
        
        // Max position size (slider)
        const maxPosSizeEl = document.getElementById('maxPositionSize');
        const maxPosSizeValueEl = document.getElementById('maxPositionSizeValue');
        if (maxPosSizeEl) {
            maxPosSizeEl.value = config.maxPositionSize || 10;
            if (maxPosSizeValueEl) maxPosSizeValueEl.textContent = (config.maxPositionSize || 10) + '%';
        }
        
        // Update risk example
        updateRiskExample();
    } catch (error) {
        console.error('Erreur chargement config risk:', error);
    }
}

/**
 * Sauvegarde la configuration risk
 */
async function saveRiskConfig() {
    try {
        const config = {
            riskPerTrade: parseFloat(document.getElementById('riskPerTrade').value),
            maxPositionSize: parseFloat(document.getElementById('maxPositionSize').value),
            dailyLossLimit: parseFloat(document.getElementById('dailyLossLimit').value),
            maxDrawdown: parseFloat(document.getElementById('maxDrawdown').value),
            maxTradesPerDay: parseInt(document.getElementById('maxTradesPerDay').value),
            maxConsecutiveLosses: parseInt(document.getElementById('maxConsecutiveLosses').value),
            minRiskRewardRatio: parseFloat(document.getElementById('minRiskRewardRatio').value)
        };

        await apiRequest('/config/risk', {
            method: 'POST',
            body: JSON.stringify(config)
        });

        showToast('Configuration risk sauvegardée', 'success');
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

// ==================== API KEYS ====================

/**
 * Vérifie le statut de l'API
 */
async function checkApiStatus() {
    try {
        const data = await apiRequest('/keys/status');
        const tradingData = await apiRequest('/keys/trading-address');
        
        document.getElementById('apiAuthStatus').textContent = data.authenticated ? '✅ Connecté' : '❌ Non connecté';
        document.getElementById('walletAddress').textContent = data.address || '-';
        document.getElementById('tradingAddress').textContent = tradingData.tradingAddress || data.address || '-';
        
        // Récupère le solde si connecté
        if (data.authenticated || tradingData.tradingAddress) {
            try {
                const balance = await apiRequest('/account/balance');
                document.getElementById('perpsBalance').textContent = `$${formatNumber(balance.totalEquity)}`;
            } catch (e) {
                document.getElementById('perpsBalance').textContent = 'Erreur';
            }
        }
    } catch (error) {
        document.getElementById('apiAuthStatus').textContent = '❌ Erreur';
    }
}

// ==================== MULTI-WALLET MANAGEMENT ====================

/**
 * Charge et affiche tous les wallets
 */
async function loadWallets() {
    try {
        const data = await apiRequest('/wallets');
        renderWalletsList(data.wallets || []);
        updateActiveWalletInfo(data.activeWallet);
        document.getElementById('walletCount').textContent = data.count || 0;
    } catch (error) {
        console.error('Erreur chargement wallets:', error);
    }
}

/**
 * Charge les wallets sauvegardés depuis le fichier
 */
async function loadAllWallets() {
    try {
        const data = await apiRequest('/wallets/load', { method: 'POST' });
        
        if (data.success) {
            showToast(`${data.count} wallet(s) chargé(s)`, 'success');
            renderWalletsList(data.wallets || []);
            updateActiveWalletInfo(data.activeWallet);
            document.getElementById('walletCount').textContent = data.count || 0;
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Affiche la liste des wallets
 */
function renderWalletsList(wallets) {
    const container = document.getElementById('walletsList');
    
    if (!wallets || wallets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="wallet"></i>
                <p>Aucun wallet enregistré</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    container.innerHTML = wallets.map(wallet => `
        <div class="wallet-item ${wallet.isActive ? 'active' : ''}" data-wallet-id="${wallet.id}">
            <div class="wallet-info">
                <div class="wallet-name">
                    ${wallet.name}
                    ${wallet.isActive ? '<span class="active-badge">ACTIF</span>' : ''}
                </div>
                <div class="wallet-address">${wallet.address.slice(0, 10)}...${wallet.address.slice(-8)}</div>
            </div>
            <div class="wallet-actions">
                ${!wallet.isActive ? `
                    <button class="btn-activate" onclick="activateWallet('${wallet.id}')" title="Activer">
                        <i data-lucide="power"></i>
                    </button>
                ` : ''}
                <button onclick="renameWallet('${wallet.id}', '${wallet.name}')" title="Renommer">
                    <i data-lucide="edit-2"></i>
                </button>
                <button class="btn-delete" onclick="deleteWallet('${wallet.id}', '${wallet.name}')" title="Supprimer">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

/**
 * Met à jour les infos du wallet actif
 */
function updateActiveWalletInfo(activeWallet) {
    const nameEl = document.getElementById('activeWalletName');
    const statusEl = document.getElementById('apiAuthStatus');
    const addressEl = document.getElementById('walletAddress');
    const tradingEl = document.getElementById('tradingAddress');
    
    if (activeWallet) {
        nameEl.textContent = activeWallet.name;
        statusEl.textContent = '✅ Connecté';
        statusEl.className = 'value success';
        addressEl.textContent = `${activeWallet.address.slice(0, 10)}...${activeWallet.address.slice(-6)}`;
        tradingEl.textContent = activeWallet.tradingAddress 
            ? `${activeWallet.tradingAddress.slice(0, 10)}...${activeWallet.tradingAddress.slice(-6)}`
            : '-';
    } else {
        nameEl.textContent = '-';
        statusEl.textContent = 'Non connecté';
        statusEl.className = 'value';
        addressEl.textContent = '-';
        tradingEl.textContent = '-';
    }
}

/**
 * Ajoute un nouveau wallet
 */
async function addWallet(event) {
    event.preventDefault();
    
    const name = document.getElementById('walletName').value.trim();
    const secretPhrase = document.getElementById('secretPhrase').value.trim();
    const tradingAddress = document.getElementById('tradingWalletAddress').value.trim();

    if (!secretPhrase) {
        showToast('Secret phrase requis', 'error');
        return;
    }

    try {
        const data = await apiRequest('/wallets', {
            method: 'POST',
            body: JSON.stringify({ 
                name: name || 'Nouveau Wallet',
                secretPhrase, 
                tradingAddress 
            })
        });

        if (data.success) {
            showToast(`Wallet "${data.name}" ajouté!`, 'success');
            
            // Reset form
            document.getElementById('walletName').value = '';
            document.getElementById('secretPhrase').value = '';
            document.getElementById('tradingWalletAddress').value = '';
            
            // Reload wallets
            loadWallets();
            
            // Active automatiquement si c'est le premier
            const walletsData = await apiRequest('/wallets');
            if (walletsData.count === 1) {
                activateWallet(data.walletId);
            }
        } else {
            showToast('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Active un wallet
 */
async function activateWallet(walletId) {
    try {
        const data = await apiRequest(`/wallets/${walletId}/activate`, { method: 'POST' });
        
        if (data.success) {
            showToast(`Wallet "${data.name}" activé!`, 'success');
            loadWallets();
            checkApiStatus();
        } else {
            showToast('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Renomme un wallet
 */
async function renameWallet(walletId, currentName) {
    const newName = prompt('Nouveau nom pour le wallet:', currentName);
    
    if (!newName || newName === currentName) return;
    
    try {
        const data = await apiRequest(`/wallets/${walletId}/rename`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName })
        });
        
        if (data.success) {
            showToast(`Wallet renommé: ${data.newName}`, 'success');
            loadWallets();
        } else {
            showToast('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Supprime un wallet
 */
async function deleteWallet(walletId, walletName) {
    if (!confirm(`Supprimer le wallet "${walletName}" ?\n\nCette action est irréversible.`)) {
        return;
    }
    
    try {
        const data = await apiRequest(`/wallets/${walletId}`, { method: 'DELETE' });
        
        if (data.success) {
            showToast(`Wallet "${data.name}" supprimé`, 'success');
            loadWallets();
        } else {
            showToast('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Teste la connexion API
 */
async function testApiConnection() {
    try {
        const data = await apiRequest('/keys/test', { method: 'POST' });
        
        if (data.success) {
            showToast('Connexion réussie!', 'success');
        } else {
            showToast('Échec: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

// ==================== BOT CONTROLS ====================

/**
 * Démarre le bot
 */
async function startBot() {
    try {
        const data = await apiRequest('/bot/start', { method: 'POST' });
        
        if (data.success) {
            showToast('Bot démarré!', 'success');
            refreshStatus();
        } else {
            showToast('Échec du démarrage', 'error');
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Arrête le bot
 */
async function stopBot() {
    try {
        const data = await apiRequest('/bot/stop', { method: 'POST' });
        
        if (data.success) {
            showToast('Bot arrêté', 'info');
            refreshStatus();
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Ferme la position actuelle
 */
async function closePosition() {
    if (!confirm('Voulez-vous vraiment fermer la position?')) return;

    try {
        await apiRequest('/close-position', { method: 'POST' });
        showToast('Position fermée', 'success');
        refreshStatus();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Rafraîchit l'analyse manuellement
 */
async function refreshAnalysis() {
    try {
        const data = await apiRequest('/analysis');
        updateAnalysisDisplay(data);
        showToast('Analyse mise à jour', 'info');
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Réinitialise les stats journalières
 */
async function resetDailyStats() {
    if (!confirm('Réinitialiser les statistiques journalières?')) return;

    try {
        await apiRequest('/risk/reset', { method: 'POST' });
        showToast('Stats réinitialisées', 'success');
        refreshStatus();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Redémarre le bot après arrêt risk
 */
async function restartRiskBot() {
    try {
        await apiRequest('/risk/restart-bot', { method: 'POST' });
        showToast('Bot redémarré', 'success');
        refreshStatus();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

// ==================== SCANNER ====================

let autoScanInterval = null;
let isAutoScanning = false;

/**
 * Lance un scan de toutes les cryptos
 */
async function startScan() {
    const btn = document.getElementById('startScanBtn');
    const timeframe = document.getElementById('scanTimeframe').value;
    
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader"></i> Scan en cours...';
    lucide.createIcons();

    try {
        const data = await apiRequest(`/scanner/scan?timeframe=${timeframe}`);
        
        if (data.success) {
            updateScannerSummary(data.summary);
            renderScannerTable(data.results);
            await loadOpportunities();
            showToast(`Scan terminé: ${data.summary.total} cryptos analysées`, 'success');
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="scan"></i> Lancer le Scan';
        lucide.createIcons();
    }
}

/**
 * Active/désactive le scan automatique
 */
async function toggleAutoScan() {
    const btn = document.getElementById('autoScanBtn');
    
    if (isAutoScanning) {
        // Arrête le scan auto
        await apiRequest('/scanner/stop', { method: 'POST' });
        clearInterval(autoScanInterval);
        autoScanInterval = null;
        isAutoScanning = false;
        btn.innerHTML = '<i data-lucide="refresh-cw"></i> Auto-Scan';
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-outline');
        showToast('Scan automatique arrêté', 'info');
    } else {
        // Démarre le scan auto
        const timeframe = document.getElementById('scanTimeframe').value;
        await apiRequest('/scanner/start', {
            method: 'POST',
            body: JSON.stringify({ timeframe, interval: 300000 })
        });
        
        isAutoScanning = true;
        btn.innerHTML = '<i data-lucide="pause"></i> Arrêter Auto-Scan';
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-warning');
        
        // Lance un scan immédiat
        await startScan();
        
        // Puis toutes les 5 minutes
        autoScanInterval = setInterval(() => {
            loadScannerResults();
        }, 60000);
        
        showToast('Scan automatique activé (toutes les 5 min)', 'success');
    }
    lucide.createIcons();
}

/**
 * Charge les résultats du scanner
 */
async function loadScannerResults() {
    try {
        const sortBy = document.getElementById('sortBy').value;
        const data = await apiRequest(`/scanner/results?sortBy=${sortBy}&order=desc`);
        
        updateScannerSummary(data.summary);
        renderScannerTable(data.results);
    } catch (error) {
        console.error('Erreur chargement résultats scanner:', error);
    }
}

/**
 * Met à jour le résumé du scanner
 */
function updateScannerSummary(summary) {
    document.getElementById('totalScanned').textContent = summary.total || 0;
    document.getElementById('bullishCount').textContent = summary.bullish || 0;
    document.getElementById('bearishCount').textContent = summary.bearish || 0;
    document.getElementById('tradeableCount').textContent = summary.tradeable || 0;
}

/**
 * Affiche les résultats dans le tableau
 */
function renderScannerTable(results) {
    const tbody = document.getElementById('scannerTableBody');
    
    if (!results || results.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="loading-cell">
                    <p>Aucun résultat. Lancez un scan.</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = results.map(r => {
        const changeClass = parseFloat(r.change24h) >= 0 ? 'positive' : 'negative';
        const scoreClass = r.score >= 3 ? 'bullish' : r.score <= -3 ? 'bearish' : 'neutral';
        const signal = r.signal?.action || '-';
        const signalClass = signal === 'BUY' ? 'buy' : signal === 'SELL' ? 'sell' : '';
        const winProb = r.winProbabilityPercent || '-';
        const winProbClass = parseFloat(r.winProbability) >= 0.65 ? 'positive' : parseFloat(r.winProbability) >= 0.55 ? 'neutral' : 'negative';
        
        return `
            <tr onclick="showTradeDetails('${r.symbol}')">
                <td class="symbol-cell">${r.symbol}</td>
                <td class="price-cell">$${formatNumber(r.price)}</td>
                <td class="change-cell ${changeClass}">${r.change24h}%</td>
                <td class="score-cell ${scoreClass}">${r.score}/${r.maxScore}</td>
                <td><span class="direction-badge ${r.direction}">${r.direction}</span></td>
                <td class="signal-cell ${signalClass}">${signal}</td>
                <td class="${winProbClass}">${winProb}</td>
                <td>
                    ${r.tradeable ? `<button class="btn btn-small btn-success" onclick="event.stopPropagation(); quickTrade('${r.symbol}', '${signal}')">Trade</button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Charge les opportunités
 */
async function loadOpportunities() {
    try {
        const data = await apiRequest('/scanner/opportunities?limit=5');
        
        renderOpportunities('bullishOpportunities', data.bullish, 'bullish');
        renderOpportunities('bearishOpportunities', data.bearish, 'bearish');
    } catch (error) {
        console.error('Erreur chargement opportunités:', error);
    }
}

/**
 * Affiche les opportunités
 */
function renderOpportunities(containerId, opportunities, type) {
    const container = document.getElementById(containerId);
    
    if (!opportunities || opportunities.length === 0) {
        container.innerHTML = '<p class="no-opportunities">Aucune opportunité détectée</p>';
        return;
    }

    container.innerHTML = opportunities.slice(0, 5).map(o => `
        <div class="opportunity-item ${type}" onclick="showTradeDetails('${o.symbol}')">
            <div>
                <span class="symbol">${o.symbol}</span>
                <span class="price">$${formatNumber(o.price)}</span>
            </div>
            <span class="score">${o.score}/${o.maxScore}</span>
        </div>
    `).join('');
}

/**
 * Affiche les détails d'un trade potentiel
 */
async function showTradeDetails(symbol) {
    try {
        showToast(`Chargement des détails pour ${symbol}...`, 'info');
        
        const details = await apiRequest(`/trade-details/${symbol}`);
        
        if (!details.success) {
            showToast(`Erreur: ${details.error || details.reason}`, 'error');
            return;
        }
        
        // Crée la modal
        const modal = document.createElement('div');
        modal.className = 'trade-modal-overlay';
        modal.innerHTML = `
            <div class="trade-modal">
                <div class="trade-modal-header">
                    <h2>${symbol} - Détails du Trade</h2>
                    <button class="close-modal" onclick="this.closest('.trade-modal-overlay').remove()">×</button>
                </div>
                <div class="trade-modal-body">
                    <!-- Recommandation -->
                    <div class="recommendation-box ${details.recommendation?.color || 'gray'}">
                        <span class="grade">${details.recommendation?.grade || '-'}</span>
                        <span class="message">${details.recommendation?.message || 'Analyse en cours...'}</span>
                    </div>
                    
                    <!-- Signal -->
                    <div class="trade-section">
                        <h3>📊 Signal</h3>
                        <div class="trade-grid">
                            <div class="trade-item">
                                <span class="label">Direction</span>
                                <span class="value ${details.direction}">${details.signal || '-'}</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Score Ichimoku</span>
                                <span class="value">${details.score}/${details.maxScore}</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Confiance</span>
                                <span class="value">${details.confidence || '-'}</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Prix actuel</span>
                                <span class="value">$${formatNumber(details.price)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Niveaux SL/TP -->
                    <div class="trade-section">
                        <h3>🎯 Niveaux</h3>
                        <div class="trade-grid">
                            <div class="trade-item sl">
                                <span class="label">Stop Loss</span>
                                <span class="value">$${formatNumber(details.stopLoss)} (${details.slPercent}%)</span>
                            </div>
                            <div class="trade-item tp">
                                <span class="label">Take Profit</span>
                                <span class="value">$${formatNumber(details.takeProfit)} (${details.tpPercent}%)</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Risk/Reward</span>
                                <span class="value ${details.meetsMinRRR ? 'positive' : 'negative'}">${details.riskRewardRatio?.toFixed(2) || '-'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Probabilités -->
                    <div class="trade-section">
                        <h3>📈 Probabilités</h3>
                        <div class="trade-grid">
                            <div class="trade-item">
                                <span class="label">Chance de gain</span>
                                <span class="value highlight">${details.winProbabilityPercent}</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Gain potentiel</span>
                                <span class="value positive">+$${details.potentialProfit}</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Perte potentielle</span>
                                <span class="value negative">-$${details.potentialLoss}</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Expected Value</span>
                                <span class="value ${parseFloat(details.expectedValue) >= 0 ? 'positive' : 'negative'}">$${details.expectedValue} (${details.expectedValuePercent})</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Niveaux Ichimoku -->
                    <div class="trade-section">
                        <h3>☁️ Niveaux Ichimoku</h3>
                        <div class="trade-grid small">
                            <div class="trade-item">
                                <span class="label">Tenkan</span>
                                <span class="value">$${formatNumber(details.ichimokuLevels?.tenkan)}</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Kijun</span>
                                <span class="value">$${formatNumber(details.ichimokuLevels?.kijun)}</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Kumo Top</span>
                                <span class="value">$${formatNumber(details.ichimokuLevels?.kumoTop)}</span>
                            </div>
                            <div class="trade-item">
                                <span class="label">Kumo Bottom</span>
                                <span class="value">$${formatNumber(details.ichimokuLevels?.kumoBottom)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Signaux détectés -->
                    ${details.detectedSignals?.length > 0 ? `
                    <div class="trade-section">
                        <h3>⚡ Signaux Détectés</h3>
                        <ul class="signals-list">
                            ${details.detectedSignals.map(s => `
                                <li class="${s.signal?.toLowerCase() || ''}">
                                    <strong>${s.name}</strong>: ${s.description || s.signal}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                    ` : ''}
                </div>
                <div class="trade-modal-footer">
                    ${details.recommendation?.shouldTrade ? `
                        <button class="btn btn-success" onclick="executeTrade('${symbol}', '${details.signal}', ${details.stopLoss}, ${details.takeProfit})">
                            <i data-lucide="check"></i> Exécuter le Trade
                        </button>
                    ` : ''}
                    <button class="btn btn-outline" onclick="this.closest('.trade-modal-overlay').remove()">Fermer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        lucide.createIcons();
        
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Exécute un trade
 */
async function executeTrade(symbol, signal, stopLoss, takeProfit) {
    if (!confirm(`Confirmer le trade ${signal} sur ${symbol}?`)) return;
    
    try {
        const result = await apiRequest('/trade', {
            method: 'POST',
            body: JSON.stringify({
                symbol,
                direction: signal === 'BUY' ? 'long' : 'short',
                size: 0.001, // Taille minimale pour test
                stopLoss,
                takeProfit
            })
        });
        
        if (result.success) {
            showToast(`Trade ${signal} ${symbol} exécuté!`, 'success');
            document.querySelector('.trade-modal-overlay')?.remove();
        } else {
            showToast('Erreur: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

/**
 * Trade rapide depuis le scanner (ouvre les détails)
 */
function quickTrade(symbol, signal) {
    showTradeDetails(symbol);
}

// ==================== NAVIGATION ====================

/**
 * Change de page
 */
function navigateTo(page) {
    // Met à jour la navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Affiche la bonne page
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `${page}Page`);
    });

    // Met à jour le titre
    const titles = {
        dashboard: 'Tableau de bord',
        trading: 'Configuration Trading',
        scanner: 'Scanner Multi-Crypto',
        risk: 'Risk Management',
        history: 'Historique des Trades',
        chart: 'Graphique',
        api: 'Configuration API'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;
    
    // Charge les données spécifiques à la page
    if (page === 'history') {
        loadTradeHistory();
    } else if (page === 'chart') {
        setTimeout(() => initTradingViewWidget(), 100);
    } else if (page === 'scanner') {
        loadScannerResults();
    } else if (page === 'risk') {
        loadRiskConfig();
    }
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
    // Initialise les icônes Lucide
    lucide.createIcons();
    
    // Charge les infos utilisateur
    loadUserInfo();

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.page));
    });

    // Bot controls
    document.getElementById('startBotBtn')?.addEventListener('click', startBot);
    document.getElementById('stopBotBtn')?.addEventListener('click', stopBot);
    
    // Logs controls améliorés
    initLogsControls();

    // Config Trading
    document.getElementById('saveTradingConfig')?.addEventListener('click', saveTradingConfig);
    
    // Initialise les contrôles de configuration
    initConfigControls();

    // Config Risk
    document.getElementById('saveRiskConfig')?.addEventListener('click', saveRiskConfig);
    document.getElementById('resetDailyStats')?.addEventListener('click', resetDailyStats);
    document.getElementById('restartRiskBot')?.addEventListener('click', restartRiskBot);
    
    // Initialise les contrôles de risk
    initRiskControls();

    // Multi-Wallet Management
    document.getElementById('addWalletForm')?.addEventListener('submit', addWallet);
    document.getElementById('loadAllWallets')?.addEventListener('click', loadAllWallets);
    document.getElementById('testConnection')?.addEventListener('click', testApiConnection);
    
    // Charge les wallets au démarrage
    loadWallets();

    // Scanner
    document.getElementById('startScanBtn')?.addEventListener('click', startScan);
    document.getElementById('autoScanBtn')?.addEventListener('click', toggleAutoScan);
    document.getElementById('sortBy')?.addEventListener('change', () => loadScannerResults());

    // Démarre directement sans authentification
    connectWebSocket();
    loadInitialData();

    // Rafraîchissement périodique (toutes les 30 secondes)
    setInterval(() => {
        refreshStatus();
    }, 30000);
});

// ==================== CONFIG CONTROLS ====================

/**
 * TP/SL par timeframe
 */
const TIMEFRAME_TPSL = {
    '1m': { tp: 0.5, sl: 0.25, desc: '1 minute - Scalping ultra-rapide', duration: '1-5 min' },
    '5m': { tp: 1.0, sl: 0.5, desc: '5 minutes - Scalping', duration: '5-30 min' },
    '15m': { tp: 2.0, sl: 1.0, desc: '15 minutes - Intraday recommandé', duration: '1-4h' },
    '30m': { tp: 3.0, sl: 1.5, desc: '30 minutes - Intraday', duration: '2-8h' },
    '1h': { tp: 4.0, sl: 2.0, desc: '1 heure - Swing trading', duration: '4-24h' }
};

/**
 * Presets de cryptos
 */
const CRYPTO_PRESETS = {
    top10: 'BTC, ETH, SOL, XRP, DOGE, ADA, AVAX, LINK, DOT, MATIC',
    top20: 'BTC, ETH, SOL, DOGE, XRP, ADA, AVAX, LINK, DOT, MATIC, UNI, ATOM, LTC, BCH, APT, ARB, OP, INJ, SUI, SEI',
    altcoins: 'SOL, AVAX, LINK, DOT, MATIC, UNI, ATOM, APT, ARB, OP, INJ, SUI, SEI, NEAR, FTM, AAVE',
    defi: 'UNI, AAVE, LINK, MKR, SNX, CRV, COMP, SUSHI, YFI, LDO'
};

/**
 * Initialise les contrôles de configuration trading
 */
function initConfigControls() {
    // Timeframe selector
    document.querySelectorAll('input[name="configTimeframe"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            updateTimeframeInfo(e.target.value);
            updateTPSLPreview(e.target.value);
        });
    });
    
    // Initial update
    const selectedTF = document.querySelector('input[name="configTimeframe"]:checked');
    if (selectedTF) {
        updateTimeframeInfo(selectedTF.value);
        updateTPSLPreview(selectedTF.value);
    }
    
    // Sliders avec valeurs
    setupSlider('minScore', 'minScoreValue', '');
    setupSlider('minWinProbability', 'minWinProbabilityValue', '%');
    
    // TP/SL Mode selector (4 modes: auto, ichimoku_pure, atr, percent)
    document.querySelectorAll('input[name="tpslMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            // Cache toutes les sections
            document.querySelectorAll('.tpsl-section').forEach(section => {
                section.classList.add('hidden');
            });
            
            // Affiche la section correspondante
            const mode = e.target.value;
            if (mode === 'auto') {
                document.getElementById('tpslAutoSection')?.classList.remove('hidden');
            } else if (mode === 'ichimoku_pure') {
                document.getElementById('tpslIchimokuPureSection')?.classList.remove('hidden');
            } else if (mode === 'atr') {
                document.getElementById('tpslATRSection')?.classList.remove('hidden');
            } else if (mode === 'percent') {
                document.getElementById('tpslPercentSection')?.classList.remove('hidden');
            }
        });
    });
    
    // ATR sliders
    setupSliderWithSuffix('atrMultiplierSL', 'atrMultiplierSLValue', 'x ATR');
    setupSliderWithSuffix('atrMultiplierTP', 'atrMultiplierTPValue', 'x ATR');
    
    // Pourcentage sliders
    setupSliderWithPrefix('percentSL', 'percentSLValue', '-', '%');
    setupSliderWithPrefix('percentTP', 'percentTPValue', '+', '%');
    
    // Calcul RRR dynamique pour ATR
    const atrSLSlider = document.getElementById('atrMultiplierSL');
    const atrTPSlider = document.getElementById('atrMultiplierTP');
    if (atrSLSlider && atrTPSlider) {
        const updateATRRRR = () => {
            const sl = parseFloat(atrSLSlider.value);
            const tp = parseFloat(atrTPSlider.value);
            const rrr = (tp / sl).toFixed(2);
            document.getElementById('atrRRR').textContent = `1:${rrr}`;
        };
        atrSLSlider.addEventListener('input', updateATRRRR);
        atrTPSlider.addEventListener('input', updateATRRRR);
    }
    
    // Calcul RRR dynamique pour Pourcentage
    const percentSLSlider = document.getElementById('percentSL');
    const percentTPSlider = document.getElementById('percentTP');
    if (percentSLSlider && percentTPSlider) {
        const updatePercentRRR = () => {
            const sl = parseFloat(percentSLSlider.value);
            const tp = parseFloat(percentTPSlider.value);
            const rrr = (tp / sl).toFixed(2);
            document.getElementById('percentRRR').textContent = `1:${rrr}`;
        };
        percentSLSlider.addEventListener('input', updatePercentRRR);
        percentTPSlider.addEventListener('input', updatePercentRRR);
    }
    
    setupSlider('trailingDistance', 'trailingDistanceValue', '%');
    setupSlider('breakevenTrigger', 'breakevenTriggerValue', '%');
    setupSlider('partialTPPercent', 'partialTPPercentValue', '%');
    
    // Crypto presets
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const preset = e.target.dataset.preset;
            if (CRYPTO_PRESETS[preset]) {
                document.getElementById('cryptosList').value = CRYPTO_PRESETS[preset];
                showToast(`Preset "${preset}" chargé`, 'success');
            }
        });
    });
}

/**
 * Configure un slider avec préfixe
 */
function setupSliderWithPrefix(sliderId, valueId, prefix = '', suffix = '') {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueId);
    if (slider && valueDisplay) {
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = prefix + e.target.value + suffix;
        });
    }
}

/**
 * Configure un slider avec suffixe uniquement
 */
function setupSliderWithSuffix(sliderId, valueId, suffix = '') {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueId);
    if (slider && valueDisplay) {
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value + suffix;
        });
    }
}

/**
 * Configure un slider avec affichage de valeur
 */
function setupSlider(sliderId, valueId, suffix = '') {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueId);
    if (slider && valueDisplay) {
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value + suffix;
        });
    }
}

/**
 * Met à jour l'info du timeframe sélectionné
 */
function updateTimeframeInfo(tf) {
    const info = TIMEFRAME_TPSL[tf];
    if (!info) return;
    
    const infoBox = document.getElementById('timeframeInfo');
    if (infoBox) {
        infoBox.innerHTML = `
            <div class="info-box">
                <i data-lucide="info"></i>
                <div>
                    <strong>${info.desc}</strong><br>
                    <span class="text-muted">TP/SL adaptés: ~${info.sl}-${info.tp}% | Durée moyenne: ${info.duration}</span>
                </div>
            </div>
        `;
        lucide.createIcons();
    }
}

/**
 * Met à jour la preview TP/SL (obsolète - TP/SL gérés par Ichimoku)
 */
function updateTPSLPreview(tf) {
    // Fonction conservée pour compatibilité mais ne fait plus rien
    // Les TP/SL sont maintenant calculés automatiquement par l'analyse Ichimoku
}

// ==================== RISK CONTROLS ====================

/**
 * Initialise les contrôles de risk management
 */
function initRiskControls() {
    // Sliders avec valeurs
    setupSlider('riskPerTrade', 'riskPerTradeValue', '%');
    setupSlider('maxPositionSize', 'maxPositionSizeValue', '%');
    setupSlider('maxDrawdown', 'maxDrawdownValue', '%');
    
    // Slider perte journalière avec gestion du OFF
    const dailyLossSlider = document.getElementById('dailyLossLimit');
    const dailyLossValue = document.getElementById('dailyLossLimitValue');
    const dailyLossHint = document.getElementById('dailyLossHint');
    
    if (dailyLossSlider) {
        dailyLossSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (val === 0) {
                dailyLossValue.textContent = 'OFF';
                dailyLossValue.classList.remove('danger');
                dailyLossValue.classList.add('success');
                if (dailyLossHint) dailyLossHint.textContent = 'Limite désactivée - Pas de protection automatique';
            } else {
                dailyLossValue.textContent = val + '%';
                dailyLossValue.classList.remove('success');
                dailyLossValue.classList.add('danger');
                if (dailyLossHint) dailyLossHint.textContent = `Le bot s'arrête après ${val}% de perte du capital`;
            }
        });
    }
    
    // RRR input et presets
    const rrrInput = document.getElementById('minRiskRewardRatio');
    const rrrExplanation = document.getElementById('rrrExplanation');
    const rrrPresets = document.querySelectorAll('.rrr-preset');
    
    function updateRRRExplanation(val) {
        const rrrExample = document.getElementById('rrrExample');
        const rrrWinrate = document.getElementById('rrrWinrate');
        
        // Calcul du winrate minimum requis
        const winrateMin = val > 0 ? (100 / (1 + val)).toFixed(0) : 0;
        const gain = (10 * val).toFixed(0);
        
        // Met à jour l'exemple concret
        if (rrrExample) {
            if (val == 0) {
                rrrExample.innerHTML = `
                    <p><strong>RRR désactivé</strong></p>
                    <p>Tous les signaux seront acceptés, peu importe le ratio risque/rendement.</p>
                `;
            } else {
                rrrExample.innerHTML = `
                    <p>Avec un RRR de <strong>${val}:1</strong> :</p>
                    <ul>
                        <li>Stop Loss : -10$ (risque)</li>
                        <li>Take Profit : +${gain}$ minimum (gain)</li>
                    </ul>
                `;
            }
        }
        
        // Met à jour le winrate requis
        if (rrrWinrate) {
            if (val == 0) {
                rrrWinrate.innerHTML = `
                    <p><strong>Aucun winrate minimum</strong></p>
                    <p>Sans filtre RRR, votre winrate doit être élevé pour être profitable.</p>
                `;
            } else {
                rrrWinrate.innerHTML = `
                    <p>Avec un RRR de <strong>${val}:1</strong> :</p>
                    <p class="rrr-winrate-value">Winrate minimum : <strong>${winrateMin}%</strong></p>
                    <small>Formule : 1 / (1 + ${val}) = ${winrateMin}%</small>
                `;
            }
        }
    }
    
    if (rrrInput) {
        rrrInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            updateRRRExplanation(val);
            // Met à jour les presets actifs
            rrrPresets.forEach(btn => {
                btn.classList.toggle('active', parseFloat(btn.dataset.value) === val);
            });
        });
    }
    
    // Presets RRR
    rrrPresets.forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseFloat(btn.dataset.value);
            if (rrrInput) rrrInput.value = val;
            updateRRRExplanation(val);
            rrrPresets.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Risk example update
    const riskSlider = document.getElementById('riskPerTrade');
    if (riskSlider) {
        riskSlider.addEventListener('input', updateRiskExample);
        updateRiskExample();
    }
}

/**
 * Met à jour l'exemple de risque
 */
function updateRiskExample() {
    const riskPercent = parseFloat(document.getElementById('riskPerTrade')?.value || 1);
    const exampleEl = document.getElementById('riskExample');
    if (exampleEl) {
        const riskAmount = (100 * riskPercent / 100).toFixed(2);
        exampleEl.innerHTML = `
            <i data-lucide="calculator"></i>
            <span>Avec 100$ de capital, vous risquez <strong>${riskAmount}$</strong> par trade</span>
        `;
        lucide.createIcons();
    }
}

/**
 * Initialise les contrôles du graphique P&L
 */
function initPnLChartControls() {
    const periodButtons = document.querySelectorAll('.chart-controls .btn');
    periodButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            // Met à jour le bouton actif
            periodButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Récupère la période sélectionnée
            const period = btn.dataset.period;
            
            // Recharge les stats avec la période
            await loadAccountStats(period);
        });
    });
}

/**
 * Filtre l'historique P&L selon la période
 */
function filterPnLByPeriod(pnlHistory, period) {
    if (!pnlHistory || pnlHistory.length === 0) return [];
    
    const now = new Date();
    let cutoffDate;
    
    switch (period) {
        case 'day':
            // Dernières 24 heures
            cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case 'week':
            // Derniers 7 jours
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            // Derniers 30 jours
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            return pnlHistory;
    }
    
    // Filtre les données
    const filtered = pnlHistory.filter(p => new Date(p.time) >= cutoffDate);
    
    // Recalcule le cumul pour la période filtrée
    let cumulative = 0;
    return filtered.map(p => {
        cumulative += p.pnl;
        return { ...p, cumulative };
    });
}

// Rafraîchit les stats toutes les 30 secondes
setInterval(() => {
    loadAccountStats();
}, 30000);

// Initialise les contrôles au chargement
document.addEventListener('DOMContentLoaded', () => {
    initPnLChartControls();
});

// ==================== HISTORY PAGE ====================

/**
 * Charge l'historique des trades
 */
async function loadTradeHistory() {
    try {
        const period = document.getElementById('historyPeriod')?.value || 'week';
        const symbol = document.getElementById('historySymbol')?.value || 'all';
        const result = document.getElementById('historyResult')?.value || 'all';
        const direction = document.getElementById('historyDirection')?.value || 'all';
        
        const params = new URLSearchParams({ period, symbol, result, direction });
        const data = await apiRequest(`/account/history?${params}`);
        
        // Met à jour les stats
        document.getElementById('historyTotalTrades').textContent = data.stats.total;
        document.getElementById('historyWins').textContent = data.stats.wins;
        document.getElementById('historyLosses').textContent = data.stats.losses;
        document.getElementById('historyWinRate').textContent = data.stats.winRate + '%';
        
        const pnlEl = document.getElementById('historyTotalPnL');
        const pnlCard = document.getElementById('historyPnLCard');
        pnlEl.textContent = (data.stats.totalPnL >= 0 ? '+' : '') + '$' + formatNumber(data.stats.totalPnL);
        pnlCard.classList.remove('win', 'loss');
        pnlCard.classList.add(data.stats.totalPnL >= 0 ? 'win' : 'loss');
        
        document.getElementById('historyCount').textContent = data.trades.length + ' trades';
        
        // Met à jour le filtre de symboles
        const symbolSelect = document.getElementById('historySymbol');
        const currentValue = symbolSelect.value;
        symbolSelect.innerHTML = '<option value="all">Tous</option>';
        data.symbols.forEach(s => {
            symbolSelect.innerHTML += `<option value="${s}" ${s === currentValue ? 'selected' : ''}>${s}</option>`;
        });
        
        // Met à jour le tableau
        const tbody = document.getElementById('historyTableBody');
        
        if (data.trades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">Aucun trade trouvé</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.trades.map(trade => {
            const date = new Date(trade.exitTime).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            const dirClass = trade.direction === 'long' ? 'direction-long' : 'direction-short';
            const pnlClass = trade.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
            const duration = formatDuration(trade.duration);
            
            return `
                <tr>
                    <td>${date}</td>
                    <td><strong>${trade.coin}</strong></td>
                    <td class="${dirClass}">${trade.direction.toUpperCase()}</td>
                    <td>$${formatNumber(trade.entryPrice)}</td>
                    <td>$${formatNumber(trade.exitPrice)}</td>
                    <td>${formatNumber(trade.size, 4)}</td>
                    <td class="${pnlClass}">${trade.pnl >= 0 ? '+' : ''}$${formatNumber(trade.pnl)}</td>
                    <td>${duration}</td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erreur chargement historique:', error);
        document.getElementById('historyTableBody').innerHTML = 
            '<tr><td colspan="8" class="no-data">Erreur de chargement</td></tr>';
    }
}

/**
 * Formate une durée en ms en texte lisible
 */
function formatDuration(ms) {
    if (!ms || ms < 0) return '-';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}j ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

/**
 * Exporte l'historique en CSV
 */
async function exportHistoryCSV() {
    try {
        const data = await apiRequest('/account/history?period=all');
        
        if (!data.trades || data.trades.length === 0) {
            showToast('Aucun trade à exporter', 'warn');
            return;
        }
        
        // Crée le CSV
        const headers = ['Date', 'Symbole', 'Direction', 'Prix Entrée', 'Prix Sortie', 'Taille', 'P&L', 'Durée (ms)'];
        const rows = data.trades.map(t => [
            new Date(t.exitTime).toISOString(),
            t.coin,
            t.direction,
            t.entryPrice,
            t.exitPrice,
            t.size,
            t.pnl,
            t.duration
        ]);
        
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        
        // Télécharge le fichier
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Export CSV téléchargé', 'success');
    } catch (error) {
        showToast('Erreur export: ' + error.message, 'error');
    }
}

// Event listeners pour la page History
document.getElementById('applyHistoryFilters')?.addEventListener('click', loadTradeHistory);
document.getElementById('exportHistory')?.addEventListener('click', exportHistoryCSV);

// ==================== CHART PAGE (TradingView) ====================

let tvWidget = null;

/**
 * Initialise le widget TradingView
 */
function initTradingViewWidget() {
    const container = document.getElementById('tradingview_widget');
    if (!container) return;
    
    const symbol = document.getElementById('chartSymbol')?.value || 'BTC';
    const showIchimoku = document.getElementById('showIchimoku')?.checked ?? true;
    const showVolume = document.getElementById('showVolume')?.checked ?? true;
    
    // Récupère le timeframe actif
    const activeBtn = document.querySelector('.tf-btn.active');
    const interval = activeBtn?.dataset.tf || '15';
    
    // Construit les études (indicateurs)
    const studies = [];
    if (showIchimoku) {
        studies.push('IchimokuCloud@tv-basicstudies');
    }
    if (showVolume) {
        studies.push('Volume@tv-basicstudies');
    }
    
    // Supprime l'ancien widget
    container.innerHTML = '';
    
    // Crée le nouveau widget (utilise Binance car Hyperliquid n'est pas sur TradingView)
    tvWidget = new TradingView.widget({
        autosize: true,
        symbol: `BINANCE:${symbol}USDT.P`,
        interval: interval,
        timezone: 'Europe/Paris',
        theme: 'dark',
        style: '1',
        locale: 'fr',
        toolbar_bg: '#1a1a2e',
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: true,
        container_id: 'tradingview_widget',
        studies: studies,
        disabled_features: [
            'use_localstorage_for_settings',
            'header_symbol_search',
            'header_compare'
        ],
        enabled_features: [
            'hide_left_toolbar_by_default'
        ],
        overrides: {
            'mainSeriesProperties.candleStyle.upColor': '#22c55e',
            'mainSeriesProperties.candleStyle.downColor': '#ef4444',
            'mainSeriesProperties.candleStyle.wickUpColor': '#22c55e',
            'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
            'paneProperties.background': '#1a1a2e',
            'paneProperties.vertGridProperties.color': '#2a2a4a',
            'paneProperties.horzGridProperties.color': '#2a2a4a'
        }
    });
}

/**
 * Met à jour le graphique TradingView
 */
function updateTradingViewChart() {
    initTradingViewWidget();
}

// Event listeners pour la page Chart
document.getElementById('chartSymbol')?.addEventListener('change', updateTradingViewChart);
document.getElementById('showIchimoku')?.addEventListener('change', updateTradingViewChart);
document.getElementById('showVolume')?.addEventListener('change', updateTradingViewChart);

document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateTradingViewChart();
    });
});

