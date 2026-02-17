import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

// Environment variable validation schema
const envSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  API_PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PLAYWRIGHT_HEADLESS: Joi.boolean().default(true),
  SCRAPER_MAX_RETRIES: Joi.number().default(3),
  SCRAPER_TIMEOUT: Joi.number().default(30000),
  SCRAPER_CONCURRENT_BROWSERS: Joi.number().default(3),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_DIR: Joi.string().default('./logs'),
  // Google OAuth
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_CALLBACK_URL: Joi.string().default('http://localhost:5173/api/auth/google/callback'),
  // Session
  SESSION_SECRET: Joi.string().default('development-secret-change-in-production'),
  // Admin emails (comma-separated)
  ADMIN_EMAILS: Joi.string().default(''),
  // Proxy configuration - JSON mapping supermarket names to proxy URLs
  // Format: {"migros":"http://proxy1:8080","rewe":"http://proxy2:8080"}
  SCRAPER_PROXY_CONFIG: Joi.string().optional(),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

/**
 * Parse proxy config JSON into a Map for quick lookup
 * Format: {"migros":"http://proxy1:8080","rewe":"http://proxy2:8080"}
 */
function parseProxyConfig(configJson: string | undefined): Map<string, string> {
  const proxyMap = new Map<string, string>();
  if (!configJson) return proxyMap;

  try {
    const config = JSON.parse(configJson);
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        proxyMap.set(key.toLowerCase(), value);
      }
    }
  } catch (e) {
    console.error('Failed to parse SCRAPER_PROXY_CONFIG:', e);
  }
  return proxyMap;
}

export const config = {
  database: {
    url: envVars.DATABASE_URL as string,
  },
  api: {
    port: envVars.API_PORT as number,
    env: envVars.NODE_ENV as string,
  },
  scraper: {
    headless: envVars.PLAYWRIGHT_HEADLESS as boolean,
    maxRetries: envVars.SCRAPER_MAX_RETRIES as number,
    timeout: envVars.SCRAPER_TIMEOUT as number,
    concurrentBrowsers: envVars.SCRAPER_CONCURRENT_BROWSERS as number,
    proxyConfig: parseProxyConfig(envVars.SCRAPER_PROXY_CONFIG as string | undefined),
  },
  logging: {
    level: envVars.LOG_LEVEL as string,
    dir: envVars.LOG_DIR as string,
  },
  google: {
    clientId: envVars.GOOGLE_CLIENT_ID as string | undefined,
    clientSecret: envVars.GOOGLE_CLIENT_SECRET as string | undefined,
    callbackUrl: envVars.GOOGLE_CALLBACK_URL as string,
  },
  session: {
    secret: envVars.SESSION_SECRET as string,
  },
  auth: {
    adminEmails: (envVars.ADMIN_EMAILS as string).split(',').map(e => e.trim()).filter(Boolean),
  },
};
