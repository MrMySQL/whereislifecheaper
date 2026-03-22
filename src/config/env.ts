import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Environment variable validation schema
const envSchema = z.object({
  DATABASE_URL: z.string(),
  API_PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PLAYWRIGHT_HEADLESS: z.preprocess(
    (val) => val === 'true' || val === '1' || val === true,
    z.boolean().default(true)
  ),
  SCRAPER_MAX_RETRIES: z.coerce.number().default(3),
  SCRAPER_TIMEOUT: z.coerce.number().default(30000),
  SCRAPER_CONCURRENT_BROWSERS: z.coerce.number().default(3),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('./logs'),
  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:5173/api/auth/google/callback'),
  // Session
  SESSION_SECRET: z.string().default('development-secret-change-in-production'),
  // Admin emails (comma-separated)
  ADMIN_EMAILS: z.string().default(''),
  // Proxy configuration - JSON mapping supermarket names to proxy URLs
  // Format: {"migros":"http://proxy1:8080","rewe":"http://proxy2:8080"}
  SCRAPER_PROXY_CONFIG: z.string().optional(),
  // Google Translate API
  GOOGLE_TRANSLATE_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Environment validation error: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
}

const envVars = parsed.data;

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
    url: envVars.DATABASE_URL,
  },
  api: {
    port: envVars.API_PORT,
    env: envVars.NODE_ENV,
  },
  scraper: {
    headless: envVars.PLAYWRIGHT_HEADLESS,
    maxRetries: envVars.SCRAPER_MAX_RETRIES,
    timeout: envVars.SCRAPER_TIMEOUT,
    concurrentBrowsers: envVars.SCRAPER_CONCURRENT_BROWSERS,
    proxyConfig: parseProxyConfig(envVars.SCRAPER_PROXY_CONFIG),
  },
  logging: {
    level: envVars.LOG_LEVEL,
    dir: envVars.LOG_DIR,
  },
  google: {
    clientId: envVars.GOOGLE_CLIENT_ID,
    clientSecret: envVars.GOOGLE_CLIENT_SECRET,
    callbackUrl: envVars.GOOGLE_CALLBACK_URL,
  },
  session: {
    secret: envVars.SESSION_SECRET,
  },
  auth: {
    adminEmails: envVars.ADMIN_EMAILS.split(',').map(e => e.trim()).filter(Boolean),
  },
  translate: {
    apiKey: envVars.GOOGLE_TRANSLATE_API_KEY,
  },
};
