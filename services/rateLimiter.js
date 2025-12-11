/**
 * Rate Limiter Intelligent
 * Évite les bans API en gérant le débit des requêtes
 */

class RateLimiter {
    constructor() {
        this.config = {
            // Limites par défaut (Hyperliquid)
            limits: {
                orders: { max: 10, windowMs: 1000 },      // 10 ordres/seconde
                info: { max: 20, windowMs: 1000 },        // 20 requêtes info/seconde
                cancel: { max: 10, windowMs: 1000 },      // 10 annulations/seconde
                global: { max: 100, windowMs: 60000 }     // 100 requêtes/minute global
            },
            // Backoff exponentiel en cas d'erreur 429
            backoff: {
                initialDelayMs: 1000,
                maxDelayMs: 60000,
                multiplier: 2
            },
            // Queue settings
            queue: {
                maxSize: 100,
                timeout: 30000 // 30 secondes max d'attente
            }
        };

        // Compteurs de requêtes
        this.counters = {
            orders: [],
            info: [],
            cancel: [],
            global: []
        };

        // Queue de requêtes en attente
        this.queue = [];
        this.isProcessing = false;

        // État du backoff
        this.backoffState = {
            currentDelay: 0,
            lastError: null,
            consecutiveErrors: 0
        };

        // Statistiques
        this.stats = {
            totalRequests: 0,
            throttledRequests: 0,
            errors429: 0,
            averageWaitTime: 0
        };
    }

    /**
     * Nettoie les compteurs expirés
     * @param {string} type - Type de requête
     */
    cleanupCounters(type) {
        const now = Date.now();
        const windowMs = this.config.limits[type]?.windowMs || 1000;
        
        this.counters[type] = this.counters[type].filter(
            timestamp => now - timestamp < windowMs
        );
    }

    /**
     * Vérifie si une requête peut être envoyée
     * @param {string} type - Type de requête
     * @returns {Object} { allowed, waitTime }
     */
    canMakeRequest(type) {
        this.cleanupCounters(type);
        this.cleanupCounters('global');

        const typeLimit = this.config.limits[type];
        const globalLimit = this.config.limits.global;

        // Vérifie la limite par type
        if (typeLimit && this.counters[type].length >= typeLimit.max) {
            const oldestRequest = this.counters[type][0];
            const waitTime = typeLimit.windowMs - (Date.now() - oldestRequest);
            return { allowed: false, waitTime: Math.max(0, waitTime), reason: `${type} limit` };
        }

        // Vérifie la limite globale
        if (this.counters.global.length >= globalLimit.max) {
            const oldestRequest = this.counters.global[0];
            const waitTime = globalLimit.windowMs - (Date.now() - oldestRequest);
            return { allowed: false, waitTime: Math.max(0, waitTime), reason: 'global limit' };
        }

        // Vérifie le backoff
        if (this.backoffState.currentDelay > 0) {
            const timeSinceError = Date.now() - this.backoffState.lastError;
            if (timeSinceError < this.backoffState.currentDelay) {
                return { 
                    allowed: false, 
                    waitTime: this.backoffState.currentDelay - timeSinceError,
                    reason: 'backoff'
                };
            } else {
                // Reset le backoff
                this.backoffState.currentDelay = 0;
            }
        }

        return { allowed: true, waitTime: 0 };
    }

    /**
     * Enregistre une requête
     * @param {string} type - Type de requête
     */
    recordRequest(type) {
        const now = Date.now();
        this.counters[type].push(now);
        this.counters.global.push(now);
        this.stats.totalRequests++;
    }

    /**
     * Gère une erreur 429 (rate limit)
     */
    handleRateLimitError() {
        this.stats.errors429++;
        this.backoffState.consecutiveErrors++;
        this.backoffState.lastError = Date.now();

        // Calcule le nouveau délai avec backoff exponentiel
        if (this.backoffState.currentDelay === 0) {
            this.backoffState.currentDelay = this.config.backoff.initialDelayMs;
        } else {
            this.backoffState.currentDelay = Math.min(
                this.backoffState.currentDelay * this.config.backoff.multiplier,
                this.config.backoff.maxDelayMs
            );
        }

        console.warn(`[RATE] ⚠️ Rate limit hit! Backoff: ${this.backoffState.currentDelay}ms`);
    }

    /**
     * Signale une requête réussie (reset le backoff)
     */
    handleSuccess() {
        if (this.backoffState.consecutiveErrors > 0) {
            this.backoffState.consecutiveErrors = 0;
            this.backoffState.currentDelay = 0;
        }
    }

    /**
     * Attend si nécessaire avant d'envoyer une requête
     * @param {string} type - Type de requête
     * @returns {Promise<void>}
     */
    async waitIfNeeded(type) {
        const check = this.canMakeRequest(type);
        
        if (!check.allowed) {
            this.stats.throttledRequests++;
            console.log(`[RATE] Throttling ${type}: wait ${check.waitTime}ms (${check.reason})`);
            await this.sleep(check.waitTime);
        }

        this.recordRequest(type);
    }

    /**
     * Wrapper pour les requêtes avec rate limiting
     * @param {string} type - Type de requête
     * @param {Function} requestFn - Fonction de requête
     * @returns {Promise<any>}
     */
    async executeWithLimit(type, requestFn) {
        await this.waitIfNeeded(type);

        try {
            const result = await requestFn();
            this.handleSuccess();
            return result;
        } catch (error) {
            if (error.message?.includes('429') || error.message?.includes('rate limit')) {
                this.handleRateLimitError();
                // Retry après le backoff
                await this.sleep(this.backoffState.currentDelay);
                return this.executeWithLimit(type, requestFn);
            }
            throw error;
        }
    }

    /**
     * Ajoute une requête à la queue
     * @param {string} type - Type de requête
     * @param {Function} requestFn - Fonction de requête
     * @param {number} priority - Priorité (0 = haute, 10 = basse)
     * @returns {Promise<any>}
     */
    async enqueue(type, requestFn, priority = 5) {
        return new Promise((resolve, reject) => {
            if (this.queue.length >= this.config.queue.maxSize) {
                reject(new Error('Queue full'));
                return;
            }

            const item = {
                type,
                requestFn,
                priority,
                resolve,
                reject,
                addedAt: Date.now()
            };

            // Insère selon la priorité
            const insertIndex = this.queue.findIndex(q => q.priority > priority);
            if (insertIndex === -1) {
                this.queue.push(item);
            } else {
                this.queue.splice(insertIndex, 0, item);
            }

            this.processQueue();
        });
    }

    /**
     * Traite la queue de requêtes
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();

            // Vérifie le timeout
            if (Date.now() - item.addedAt > this.config.queue.timeout) {
                item.reject(new Error('Request timeout in queue'));
                continue;
            }

            try {
                const result = await this.executeWithLimit(item.type, item.requestFn);
                item.resolve(result);
            } catch (error) {
                item.reject(error);
            }
        }

        this.isProcessing = false;
    }

    /**
     * Utilitaire sleep
     * @param {number} ms 
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retourne les statistiques
     */
    getStats() {
        return {
            ...this.stats,
            queueSize: this.queue.length,
            currentBackoff: this.backoffState.currentDelay,
            counters: {
                orders: this.counters.orders.length,
                info: this.counters.info.length,
                cancel: this.counters.cancel.length,
                global: this.counters.global.length
            }
        };
    }

    /**
     * Reset les statistiques
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            throttledRequests: 0,
            errors429: 0,
            averageWaitTime: 0
        };
    }
}

export default new RateLimiter();
