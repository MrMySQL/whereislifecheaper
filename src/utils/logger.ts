import winston from 'winston';
import path from 'path';
import { config } from '../config/env';
import fs from 'fs';
import { LoggingWinston } from '@google-cloud/logging-winston';

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

// Google Cloud Logging transport (enabled when GOOGLE_CLOUD_PROJECT is set)
const gcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
const useGoogleCloud = !!gcpProjectId && config.api.env === 'production';

// Parse credentials from JSON env var (for serverless platforms like Vercel)
const getGoogleCredentials = () => {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (credentialsJson) {
    try {
      return JSON.parse(credentialsJson);
    } catch (e) {
      console.error('Failed to parse GOOGLE_CREDENTIALS_JSON:', e);
      return undefined;
    }
  }
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS file path
  return undefined;
};

const createGoogleCloudTransport = (logName: string) => {
  if (!useGoogleCloud) return null;

  const credentials = getGoogleCredentials();

  return new LoggingWinston({
    projectId: gcpProjectId,
    logName: `whereislifecheaper-${logName}`,
    labels: {
      app: 'whereislifecheaper',
      component: logName,
    },
    ...(credentials && { credentials }),
  });
};

// Create base logger
const baseTransports: winston.transport[] = [
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
];

const gcpMainTransport = createGoogleCloudTransport('main');
if (gcpMainTransport) baseTransports.push(gcpMainTransport);

export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: baseTransports,
});

// Helper to create logger with optional GCP transport
const createLogger = (component: string, logSubDir: string) => {
  const transports: winston.transport[] = [
    new winston.transports.File({
      filename: path.join(logDir, logSubDir, 'combined.log'),
    }),
    new winston.transports.File({
      filename: path.join(logDir, logSubDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ];

  const gcpTransport = createGoogleCloudTransport(component);
  if (gcpTransport) transports.push(gcpTransport);

  return winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    transports,
  });
};

// Create specialized loggers for different components
export const scraperLogger = createLogger('scraper', 'scrapers');
export const apiLogger = createLogger('api', 'api');
export const cronLogger = createLogger('cron', 'cron');

// If in development, also log to console with colors
if (config.api.env === 'development') {
  logger.info('Logger initialized in development mode');
}

export default logger;
