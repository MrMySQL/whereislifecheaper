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
  GOOGLE_CALLBACK_URL: Joi.string().default('http://localhost:3000/api/auth/google/callback'),
  // Session
  SESSION_SECRET: Joi.string().default('development-secret-change-in-production'),
  // Admin emails (comma-separated)
  ADMIN_EMAILS: Joi.string().default(''),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
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
