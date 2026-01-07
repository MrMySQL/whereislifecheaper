import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from '../config/env';
import { scraperLogger } from '../utils/logger';
import { checkConnection, closePool } from '../config/database';

// Import routes
import countriesRouter from './routes/countries';
import supermarketsRouter from './routes/supermarkets';
import productsRouter from './routes/products';
import pricesRouter from './routes/prices';
import scraperRouter from './routes/scraper';

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
}));
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

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
app.use('/api/countries', countriesRouter);
app.use('/api/supermarkets', supermarketsRouter);
app.use('/api/products', productsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/scraper', scraperRouter);

// Serve frontend for non-API routes
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `API route ${req.method} ${req.path} not found`,
  });
});

// Fallback to frontend for other routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
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
      console.log(`   - GET  /api/countries`);
      console.log(`   - GET  /api/supermarkets`);
      console.log(`   - GET  /api/products`);
      console.log(`   - GET  /api/prices/latest`);
      console.log(`   - GET  /api/prices/stats`);
      console.log(`   - GET  /api/prices/basket?products=...`);
      console.log(`   - POST /api/scraper/trigger`);
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
