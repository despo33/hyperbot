/**
 * Service API pour communiquer avec le backend
 */

const API_BASE = '/api';

// Récupère le token JWT depuis le localStorage
function getToken() {
  return localStorage.getItem('authToken');
}

// Headers avec authentification
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Fonction fetch avec gestion d'erreurs
async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    
    if (response.status === 401) {
      // Token expiré ou invalide
      localStorage.removeItem('authToken');
      window.location.href = '/login';
      throw new Error('Session expirée');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Erreur serveur');
    }
    
    return data;
  } catch (error) {
    console.error(`[API] Erreur ${endpoint}:`, error.message);
    throw error;
  }
}

// ==================== AUTH ====================

export const authAPI = {
  login: (username, password) => 
    fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
    
  register: (username, email, password) =>
    fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),
    
  logout: () => {
    localStorage.removeItem('authToken');
    return Promise.resolve();
  },
  
  getProfile: () => fetchAPI('/auth/profile'),
};

// ==================== BOT ====================

export const botAPI = {
  getStatus: () => fetchAPI('/status'),
  
  start: () => fetchAPI('/bot/start', { method: 'POST' }),
  
  stop: () => fetchAPI('/bot/stop', { method: 'POST' }),
  
  getLogs: (limit = 100) => fetchAPI(`/logs?limit=${limit}`),
};

// ==================== TRADING ====================

export const tradingAPI = {
  getConfig: () => fetchAPI('/config/trading'),
  
  saveConfig: (config) => 
    fetchAPI('/config/trading', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
    
  getPositions: () => fetchAPI('/positions'),
  
  getOrders: () => fetchAPI('/orders'),
  
  closePosition: (symbol, size) =>
    fetchAPI('/position/close', {
      method: 'POST',
      body: JSON.stringify({ symbol, size }),
    }),
    
  placeTrade: (trade) =>
    fetchAPI('/trade', {
      method: 'POST',
      body: JSON.stringify(trade),
    }),
    
  getAnalysis: () => fetchAPI('/analysis'),
  
  getPrice: (symbol) => fetchAPI(`/price/${symbol}`),
  
  getCandles: (symbol, timeframe = '1h', limit = 100) =>
    fetchAPI(`/candles/${symbol}?timeframe=${timeframe}&limit=${limit}`),
};

// ==================== ACCOUNT ====================

export const accountAPI = {
  getBalance: () => fetchAPI('/account/balance'),
  
  getFills: () => fetchAPI('/account/fills'),
  
  getStats: () => fetchAPI('/account/stats'),
};

// ==================== SCANNER ====================

export const scannerAPI = {
  scan: (timeframe = '1h', strategy = 'ichimoku', symbols = null) => {
    let url = `/scanner/scan?timeframe=${timeframe}&strategy=${strategy}`;
    if (symbols) {
      url += `&symbols=${symbols.join(',')}`;
    }
    return fetchAPI(url);
  },
  
  getResults: (sortBy = 'score', order = 'desc') =>
    fetchAPI(`/scanner/results?sortBy=${sortBy}&order=${order}`),
    
  getOpportunities: (limit = 5) =>
    fetchAPI(`/scanner/opportunities?limit=${limit}`),
    
  analyzeSymbol: (symbol, timeframe = '1h') =>
    fetchAPI(`/scanner/symbol/${symbol}?timeframe=${timeframe}`),
    
  startAutoScan: (interval = 300000, timeframe = '1h') =>
    fetchAPI('/scanner/start', {
      method: 'POST',
      body: JSON.stringify({ interval, timeframe }),
    }),
    
  stopAutoScan: () =>
    fetchAPI('/scanner/stop', { method: 'POST' }),
    
  getCryptos: () => fetchAPI('/scanner/cryptos'),
};

// ==================== BACKTEST ====================

export const backtestAPI = {
  run: (config) =>
    fetchAPI('/backtest/run', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
    
  getResults: () => fetchAPI('/backtest/results'),
  
  getHistory: () => fetchAPI('/backtest/history'),
};

// ==================== WALLETS ====================

export const walletAPI = {
  getAll: () => fetchAPI('/wallets'),
  
  add: (wallet) =>
    fetchAPI('/wallets', {
      method: 'POST',
      body: JSON.stringify(wallet),
    }),
    
  setActive: (walletId) =>
    fetchAPI(`/wallets/${walletId}/activate`, { method: 'POST' }),
    
  delete: (walletId) =>
    fetchAPI(`/wallets/${walletId}`, { method: 'DELETE' }),
    
  testConnection: () =>
    fetchAPI('/keys/test', { method: 'POST' }),
};

// ==================== PROFILES ====================

export const profileAPI = {
  getAll: () => fetchAPI('/profiles'),
  
  create: (profile) =>
    fetchAPI('/profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    }),
    
  update: (index, profile) =>
    fetchAPI(`/profiles/${index}`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    }),
    
  activate: (index) =>
    fetchAPI(`/profiles/${index}/activate`, { method: 'POST' }),
    
  delete: (index) =>
    fetchAPI(`/profiles/${index}`, { method: 'DELETE' }),
    
  duplicate: (index) =>
    fetchAPI(`/profiles/${index}/duplicate`, { method: 'POST' }),
};

// ==================== WEBSOCKET ====================

export function createWebSocket(onMessage, onOpen, onClose) {
  const token = getToken();
  const wsUrl = `ws://${window.location.host}${token ? `?token=${token}` : ''}`;
  
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('[WS] Connecté');
    // S'abonne aux channels
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'logs' }));
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'status' }));
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'trades' }));
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'signals' }));
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'analysis' }));
    if (onOpen) onOpen();
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (onMessage) onMessage(data);
    } catch (e) {
      console.error('[WS] Erreur parsing:', e);
    }
  };
  
  ws.onclose = () => {
    console.log('[WS] Déconnecté');
    if (onClose) onClose();
  };
  
  ws.onerror = (error) => {
    console.error('[WS] Erreur:', error);
  };
  
  return ws;
}

export default {
  auth: authAPI,
  bot: botAPI,
  trading: tradingAPI,
  account: accountAPI,
  scanner: scannerAPI,
  backtest: backtestAPI,
  wallet: walletAPI,
  profile: profileAPI,
  createWebSocket,
};
