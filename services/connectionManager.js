/**
 * Connection Manager
 * Gère la reconnexion automatique WebSocket/API
 */

import EventEmitter from 'events';

class ConnectionManager extends EventEmitter {
    constructor() {
        super();
        
        this.config = {
            // Reconnexion automatique
            reconnect: {
                enabled: true,
                maxAttempts: 10,
                initialDelayMs: 1000,
                maxDelayMs: 30000,
                multiplier: 2
            },
            // Health check
            healthCheck: {
                enabled: true,
                intervalMs: 30000,  // Vérifie toutes les 30 secondes
                timeoutMs: 10000    // Timeout de 10 secondes
            },
            // Heartbeat WebSocket
            heartbeat: {
                intervalMs: 15000,  // Ping toutes les 15 secondes
                timeoutMs: 5000     // Timeout pong de 5 secondes
            }
        };

        this.state = {
            api: {
                connected: false,
                lastCheck: null,
                lastSuccess: null,
                consecutiveFailures: 0,
                reconnectAttempts: 0
            },
            websocket: {
                connected: false,
                lastPing: null,
                lastPong: null,
                reconnectAttempts: 0
            }
        };

        this.healthCheckInterval = null;
        this.heartbeatInterval = null;
        this.reconnectTimeout = null;

        // Callbacks
        this.apiHealthCheckFn = null;
        this.wsReconnectFn = null;
    }

    /**
     * Configure les fonctions de callback
     * @param {Object} callbacks 
     */
    setCallbacks({ apiHealthCheck, wsReconnect }) {
        this.apiHealthCheckFn = apiHealthCheck;
        this.wsReconnectFn = wsReconnect;
    }

    /**
     * Démarre le monitoring des connexions
     */
    start() {
        console.log('[CONNECTION] 🔌 Connection Manager démarré');
        
        // Démarre le health check API
        if (this.config.healthCheck.enabled) {
            this.startHealthCheck();
        }

        // Démarre le heartbeat WebSocket
        if (this.config.heartbeat.intervalMs > 0) {
            this.startHeartbeat();
        }
    }

    /**
     * Arrête le monitoring
     */
    stop() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        console.log('[CONNECTION] ⏹️ Connection Manager arrêté');
    }

    /**
     * Démarre le health check API
     */
    startHealthCheck() {
        this.healthCheckInterval = setInterval(async () => {
            await this.checkApiHealth();
        }, this.config.healthCheck.intervalMs);

        // Check immédiat
        this.checkApiHealth();
    }

    /**
     * Vérifie la santé de l'API
     */
    async checkApiHealth() {
        if (!this.apiHealthCheckFn) return;

        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Health check timeout')), 
                    this.config.healthCheck.timeoutMs);
            });

            const checkPromise = this.apiHealthCheckFn();
            await Promise.race([checkPromise, timeoutPromise]);

            // Succès
            this.state.api.connected = true;
            this.state.api.lastSuccess = Date.now();
            this.state.api.consecutiveFailures = 0;
            this.state.api.reconnectAttempts = 0;

            if (!this.state.api.connected) {
                console.log('[CONNECTION] ✅ API reconnectée');
                this.emit('api:connected');
            }
        } catch (error) {
            this.state.api.consecutiveFailures++;
            this.state.api.lastCheck = Date.now();

            console.warn(`[CONNECTION] ⚠️ API health check failed (${this.state.api.consecutiveFailures}x): ${error.message}`);

            if (this.state.api.consecutiveFailures >= 3) {
                this.state.api.connected = false;
                this.emit('api:disconnected', error);
                
                if (this.config.reconnect.enabled) {
                    this.scheduleApiReconnect();
                }
            }
        }

        this.state.api.lastCheck = Date.now();
    }

    /**
     * Planifie une tentative de reconnexion API
     */
    scheduleApiReconnect() {
        if (this.state.api.reconnectAttempts >= this.config.reconnect.maxAttempts) {
            console.error('[CONNECTION] ❌ Max reconnect attempts reached for API');
            this.emit('api:maxReconnectReached');
            return;
        }

        const delay = Math.min(
            this.config.reconnect.initialDelayMs * 
                Math.pow(this.config.reconnect.multiplier, this.state.api.reconnectAttempts),
            this.config.reconnect.maxDelayMs
        );

        this.state.api.reconnectAttempts++;

        console.log(`[CONNECTION] 🔄 API reconnect attempt ${this.state.api.reconnectAttempts} in ${delay}ms`);

        this.reconnectTimeout = setTimeout(async () => {
            await this.checkApiHealth();
        }, delay);
    }

    /**
     * Démarre le heartbeat WebSocket
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.config.heartbeat.intervalMs);
    }

    /**
     * Envoie un heartbeat WebSocket
     */
    sendHeartbeat() {
        this.state.websocket.lastPing = Date.now();
        this.emit('ws:ping');

        // Vérifie le timeout du pong
        setTimeout(() => {
            if (this.state.websocket.lastPong < this.state.websocket.lastPing) {
                console.warn('[CONNECTION] ⚠️ WebSocket heartbeat timeout');
                this.handleWsDisconnect();
            }
        }, this.config.heartbeat.timeoutMs);
    }

    /**
     * Reçoit un pong WebSocket
     */
    receivePong() {
        this.state.websocket.lastPong = Date.now();
        this.state.websocket.connected = true;
    }

    /**
     * Gère une déconnexion WebSocket
     */
    handleWsDisconnect() {
        this.state.websocket.connected = false;
        this.emit('ws:disconnected');

        if (this.config.reconnect.enabled && this.wsReconnectFn) {
            this.scheduleWsReconnect();
        }
    }

    /**
     * Planifie une reconnexion WebSocket
     */
    scheduleWsReconnect() {
        if (this.state.websocket.reconnectAttempts >= this.config.reconnect.maxAttempts) {
            console.error('[CONNECTION] ❌ Max reconnect attempts reached for WebSocket');
            this.emit('ws:maxReconnectReached');
            return;
        }

        const delay = Math.min(
            this.config.reconnect.initialDelayMs * 
                Math.pow(this.config.reconnect.multiplier, this.state.websocket.reconnectAttempts),
            this.config.reconnect.maxDelayMs
        );

        this.state.websocket.reconnectAttempts++;

        console.log(`[CONNECTION] 🔄 WebSocket reconnect attempt ${this.state.websocket.reconnectAttempts} in ${delay}ms`);

        setTimeout(async () => {
            try {
                await this.wsReconnectFn();
                this.state.websocket.connected = true;
                this.state.websocket.reconnectAttempts = 0;
                console.log('[CONNECTION] ✅ WebSocket reconnectée');
                this.emit('ws:connected');
            } catch (error) {
                console.error('[CONNECTION] ❌ WebSocket reconnect failed:', error.message);
                this.scheduleWsReconnect();
            }
        }, delay);
    }

    /**
     * Signale une connexion WebSocket établie
     */
    wsConnected() {
        this.state.websocket.connected = true;
        this.state.websocket.reconnectAttempts = 0;
        this.state.websocket.lastPong = Date.now();
        this.emit('ws:connected');
    }

    /**
     * Signale une déconnexion WebSocket
     */
    wsDisconnected() {
        this.handleWsDisconnect();
    }

    /**
     * Retourne le statut des connexions
     */
    getStatus() {
        return {
            api: {
                connected: this.state.api.connected,
                lastCheck: this.state.api.lastCheck,
                lastSuccess: this.state.api.lastSuccess,
                consecutiveFailures: this.state.api.consecutiveFailures,
                reconnectAttempts: this.state.api.reconnectAttempts
            },
            websocket: {
                connected: this.state.websocket.connected,
                lastPing: this.state.websocket.lastPing,
                lastPong: this.state.websocket.lastPong,
                reconnectAttempts: this.state.websocket.reconnectAttempts
            },
            config: this.config
        };
    }

    /**
     * Vérifie si tout est connecté
     */
    isFullyConnected() {
        return this.state.api.connected && this.state.websocket.connected;
    }

    /**
     * Reset les compteurs de reconnexion
     */
    resetReconnectCounters() {
        this.state.api.reconnectAttempts = 0;
        this.state.api.consecutiveFailures = 0;
        this.state.websocket.reconnectAttempts = 0;
    }
}

export default new ConnectionManager();
