import winston from 'winston';
import path from 'path';
import { config } from '../config/env';
import fs from 'fs';

// Ensure log directories exist
const logDir = config.logging.dir;
const dirs = [
  logDir,
  path.join(logDir, 'scrapers'),
  path.join(logDir, 'api'),
  path.join(logDir, 'cron'),
];

dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for better readability
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create base logger
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      level: 'info',
    }),
    // Write error logs to error.log
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    // Console output
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

// Create specialized loggers for different components
export const scraperLogger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'scrapers', 'combined.log'),
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'scrapers', 'error.log'),
      level: 'error',
    }),
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

export const apiLogger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'api', 'combined.log'),
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'api', 'error.log'),
      level: 'error',
    }),
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

export const cronLogger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'cron', 'combined.log'),
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'cron', 'error.log'),
      level: 'error',
    }),
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

// If in development, also log to console with colors
if (config.api.env === 'development') {
  logger.info('Logger initialized in development mode');
}

export default logger;
