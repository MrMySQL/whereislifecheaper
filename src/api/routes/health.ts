import { Router } from 'express';
import { checkConnection } from '../../config/database';

/**
 * Health check, shared by both entry points.
 *
 * Mounted at `/health` and `/api/health` in each entry: in production only the
 * `/api/*` paths reach the function (everything else is rewritten to the SPA),
 * while local tooling has long used `/health`. Keeping one router mounted at
 * both paths in both entries is also what lets the parity test compare the two
 * route tables as whole sets.
 */
const router = Router();

router.get('/', async (_req, res) => {
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

export default router;
