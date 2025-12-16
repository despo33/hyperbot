/**
 * Service de logging structuré avec Winston
 * Fournit des logs formatés pour la production
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Format personnalisé pour les logs
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    })
);

// Format pour la console (avec couleurs)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} ${level} ${message}`;
    })
);

// Création du logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    defaultMeta: { service: 'trading-bot' },
    transports: [
        // Console - toujours actif
        new winston.transports.Console({
            format: consoleFormat
        })
    ]
});

// En production, ajoute un fichier de logs
if (process.env.NODE_ENV === 'production') {
    const logsDir = path.join(__dirname, '..', 'logs');
    
    // Fichier pour tous les logs
    logger.add(new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }));
    
    // Fichier séparé pour les erreurs
    logger.add(new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5
    }));
}

// Méthodes utilitaires
export const logTrade = (action, data) => {
    logger.info(`[TRADE] ${action}`, { trade: data });
};

export const logSignal = (symbol, signal, score) => {
    logger.info(`[SIGNAL] ${symbol}: ${signal} (score: ${score})`);
};

export const logApi = (endpoint, status, duration) => {
    logger.debug(`[API] ${endpoint} - ${status} (${duration}ms)`);
};

export const logSecurity = (event, details) => {
    logger.warn(`[SECURITY] ${event}`, { details });
};

export const logError = (context, error) => {
    logger.error(`[${context}] ${error.message}`, { stack: error.stack });
};

export default logger;
