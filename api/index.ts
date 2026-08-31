import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from '../src/config/env';
import { apiLogger } from '../src/utils/logger';
import pool from '../src/config/database';

// Auth imports
import { initializePassport, passport, authRouter } from '../src/auth';

// Import routes
import countriesRouter from '../src/api/routes/countries';
import supermarketsRouter from '../src/api/routes/supermarkets';
import productsRouter from '../src/api/routes/products';
import pricesRouter from '../src/api/routes/prices';
import canonicalRouter from '../src/api/routes/canonical';
import scraperRouter from '../src/api/routes/scraper';
import ratesRouter from '../src/api/routes/rates';
import translateRouter from '../src/api/routes/translate';
import rentRouter from '../src/api/routes/rent';
import healthRouter from '../src/api/routes/health';
import sitemapRouter from '../src/api/routes/sitemap';

const app = express();

// Trust proxy - required for secure cookies behind Vercel/proxies
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Session middleware
const PgSession = connectPgSimple(session);
app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: 'sessions',
    createTableIfMissing: false,
  }),
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.api.env === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax', // 'lax' works for same-origin and OAuth redirects
  },
}));

// Passport initialization
initializePassport();
app.use(passport.initialize());
app.use(passport.session());

// Health check - mounted at both paths in both entries; see routes/health.ts.
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/countries', countriesRouter);
app.use('/api/supermarkets', supermarketsRouter);
app.use('/api/products', productsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/scraper', scraperRouter);
app.use('/api/canonical', canonicalRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/translate', translateRouter);
app.use('/api/rent', rentRouter);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `API route ${req.method} ${req.path} not found`,
  });
});

// SEO routes (sitemap.xml, robots.txt) - root paths, so they must be
// registered after the /api/* 404 handler above.
app.use('/', sitemapRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  apiLogger.error('API Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.api.env === 'development' ? err.message : 'An error occurred',
  });
});

export default app;
