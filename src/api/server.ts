import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from '../config/env';
import { scraperLogger } from '../utils/logger';
import { checkConnection, closePool } from '../config/database';
import pool from '../config/database';

// Auth imports
import { initializePassport, passport, authRouter } from '../auth';

// Import routes
import countriesRouter from './routes/countries';
import supermarketsRouter from './routes/supermarkets';
import productsRouter from './routes/products';
import pricesRouter from './routes/prices';
import scraperRouter from './routes/scraper';
import canonicalRouter from './routes/canonical';
import ratesRouter from './routes/rates';
import sitemapRouter from './routes/sitemap';

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
}));
app.use(cors({
  origin: config.api.env === 'development' ? ['http://localhost:5173', 'http://localhost:3000'] : true,
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
    sameSite: config.api.env === 'production' ? 'strict' : 'lax',
  },
}));

// Passport initialization
initializePassport();
app.use(passport.initialize());
app.use(passport.session());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    scraperLogger.debug(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const dbHealthy = await checkConnection();
    res.json({
      status: dbHealthy ? 'healthy' : 'degraded',
      database: dbHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/countries', countriesRouter);
app.use('/api/supermarkets', supermarketsRouter);
app.use('/api/products', productsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/scraper', scraperRouter);
app.use('/api/canonical', canonicalRouter);
app.use('/api/rates', ratesRouter);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `API route ${req.method} ${req.path} not found`,
  });
});

// SEO routes (sitemap.xml, robots.txt) - must be before static file serving
app.use('/', sitemapRouter);

// Serve React frontend in production, or fallback to old public directory
const frontendPath = config.api.env === 'production'
  ? path.join(__dirname, '../../dist/frontend')
  : path.join(__dirname, '../../public');

// Serve static files
app.use(express.static(frontendPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  scraperLogger.error('API Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
  });
});

// Start server
const PORT = config.api.port;

async function startServer() {
  try {
    // Check database connection
    const dbHealthy = await checkConnection();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }

    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`\n📊 Dashboard: http://localhost:${PORT}/`);
      console.log(`\n🔌 API Endpoints:`);
      console.log(`   - GET  /api/auth/google (Login with Google)`);
      console.log(`   - GET  /api/auth/me (Current user)`);
      console.log(`   - GET  /api/countries`);
      console.log(`   - GET  /api/supermarkets`);
      console.log(`   - GET  /api/products`);
      console.log(`   - GET  /api/prices/latest`);
      console.log(`   - GET  /api/prices/stats`);
      console.log(`   - GET  /api/canonical/comparison`);
      console.log(`   - POST /api/scraper/trigger (Admin only)`);
      console.log(`   - GET  /api/rates`);
      console.log(`\n❤️  Health check: http://localhost:${PORT}/health`);
      scraperLogger.info(`Server started on port ${PORT}`);
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await closePool();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down...');
      await closePool();
      process.exit(0);
    });
  } catch (error) {
    scraperLogger.error('Failed to start server:', error);
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
