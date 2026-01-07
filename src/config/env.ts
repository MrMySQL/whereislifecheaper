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
    headless: envVars.PLAYWRIGHT_HEADLESS === 'true',
    maxRetries: envVars.SCRAPER_MAX_RETRIES as number,
    timeout: envVars.SCRAPER_TIMEOUT as number,
    concurrentBrowsers: envVars.SCRAPER_CONCURRENT_BROWSERS as number,
  },
  logging: {
    level: envVars.LOG_LEVEL as string,
    dir: envVars.LOG_DIR as string,
  },
};
