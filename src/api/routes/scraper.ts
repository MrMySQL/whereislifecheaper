import { Router } from 'express';
import { ScraperService } from '../../services/ScraperService';
import { query } from '../../config/database';
import { scraperLogger } from '../../utils/logger';

const router = Router();
const scraperService = new ScraperService();

/**
 * POST /api/scraper/trigger
 * Trigger a manual scrape
 */
router.post('/trigger', async (req, res, next) => {
  try {
    const { supermarket_id } = req.body;

    scraperLogger.info('Manual scrape triggered via API', { supermarket_id });

    // Run scraper asynchronously
    if (supermarket_id) {
      // Validate supermarket exists
      const supermarket = await query(
        'SELECT id, name FROM supermarkets WHERE id = $1 AND is_active = true',
        [supermarket_id]
      );

      if (supermarket.rows.length === 0) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Supermarket not found or inactive',
        });
        return;
      }

      // Start scraper in background
      scraperService.runScraper(supermarket_id).catch((err) => {
        scraperLogger.error('Background scraper failed:', err);
      });

      res.json({
        message: 'Scraper triggered',
        supermarket_id,
        supermarket_name: supermarket.rows[0].name,
        status: 'running',
      });
    } else {
      // Trigger all scrapers
      scraperService.runAllScrapers().catch((err) => {
        scraperLogger.error('Background scraper failed:', err);
      });

      res.json({
        message: 'All scrapers triggered',
        status: 'running',
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scraper/status
 * Get scraper status and recent logs
 */
router.get('/status', async (_req, res, next) => {
  try {
    // Get recent scrape logs
    const recentLogs = await query(`
      SELECT
        sl.*,
        s.name as supermarket_name,
        c.name as country_name
      FROM scrape_logs sl
      INNER JOIN supermarkets s ON sl.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      ORDER BY sl.started_at DESC
      LIMIT 20
    `);

    // Get currently running scrapers
    const runningScrapers = await query(`
      SELECT
        sl.*,
        s.name as supermarket_name
      FROM scrape_logs sl
      INNER JOIN supermarkets s ON sl.supermarket_id = s.id
      WHERE sl.status = 'running'
    `);

    // Get summary stats
    const stats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'success' AND started_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as success_24h,
        COUNT(*) FILTER (WHERE status = 'failed' AND started_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as failed_24h,
        SUM(products_scraped) FILTER (WHERE started_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as products_24h,
        COUNT(*) FILTER (WHERE status = 'running') as currently_running
      FROM scrape_logs
    `);

    res.json({
      status: runningScrapers.rows.length > 0 ? 'running' : 'idle',
      running_scrapers: runningScrapers.rows,
      recent_logs: recentLogs.rows,
      stats_24h: stats.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scraper/logs
 * Get scrape logs with optional filters
 */
router.get('/logs', async (req, res, next) => {
  try {
    const { supermarket_id, status, limit = '50', offset = '0' } = req.query;

    let sql = `
      SELECT
        sl.*,
        s.name as supermarket_name,
        c.name as country_name,
        c.code as country_code
      FROM scrape_logs sl
      INNER JOIN supermarkets s ON sl.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (supermarket_id) {
      sql += ` AND sl.supermarket_id = $${paramIndex++}`;
      params.push(supermarket_id);
    }

    if (status) {
      sql += ` AND sl.status = $${paramIndex++}`;
      params.push(status);
    }

    sql += ` ORDER BY sl.started_at DESC`;
    sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(sql, params);

    res.json({
      data: result.rows,
      count: result.rowCount,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
