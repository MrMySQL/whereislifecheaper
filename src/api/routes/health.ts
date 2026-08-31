import { Router } from 'express';
import { checkConnection } from '../../config/database';

/**
 * Health check, shared by both entry points.
 *
 * Mounted at `/api/health` in both entries, and additionally at `/health` in
 * the long-running server, which local tooling and the docs have long used. The
 * Vercel function mounts only `/api/health`: its `/((?!api/).*)` rewrite hands
 * every other path to the SPA shell, so a `/health` there would answer HTML, or
 * rather never be invoked at all.
 */
const router = Router();

router.get('/', async (_req, res) => {
  try {
    const dbHealthy = await checkConnection();
    // 503, not 200-with-a-'degraded'-body: uptime monitors read the status
    // code, and the API cannot answer a single query without the database, so
    // a 200 here reports a dead service as up. `checkConnection` swallows its
    // own errors and returns false, so this - not the catch below - is the
    // branch a real outage takes.
    res.status(dbHealthy ? 200 : 503).json({
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
