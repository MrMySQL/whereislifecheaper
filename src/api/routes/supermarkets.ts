import { Router } from 'express';
import { query } from '../../config/database';

const router = Router();

/**
 * GET /api/supermarkets
 * Get all supermarkets with optional country filter
 */
router.get('/', async (req, res, next) => {
  try {
    const { country_id, active_only } = req.query;

    let sql = `
      SELECT
        s.*,
        c.name as country_name,
        c.code as country_code,
        c.currency_code,
        (
          SELECT COUNT(DISTINCT pm.product_id)
          FROM product_mappings pm
          WHERE pm.supermarket_id = s.id
        ) as product_count,
        (
          SELECT MAX(sl.completed_at)
          FROM scrape_logs sl
          WHERE sl.supermarket_id = s.id AND sl.status = 'success'
        ) as last_scrape
      FROM supermarkets s
      INNER JOIN countries c ON s.country_id = c.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (country_id) {
      sql += ` AND s.country_id = $${paramIndex++}`;
      params.push(country_id);
    }

    if (active_only === 'true') {
      sql += ` AND s.is_active = true`;
    }

    sql += ` ORDER BY c.name, s.name`;

    const result = await query(sql, params);

    res.json({
      data: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/supermarkets/:id
 * Get supermarket by ID with latest scrape info
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
        s.*,
        c.name as country_name,
        c.code as country_code,
        c.currency_code,
        (
          SELECT COUNT(DISTINCT pm.product_id)
          FROM product_mappings pm
          WHERE pm.supermarket_id = s.id
        ) as product_count
      FROM supermarkets s
      INNER JOIN countries c ON s.country_id = c.id
      WHERE s.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Supermarket not found',
      });
      return;
    }

    // Get recent scrape logs
    const logsResult = await query(
      `SELECT id, status, products_scraped, products_failed, duration_seconds, error_message, started_at, completed_at
       FROM scrape_logs
       WHERE supermarket_id = $1
       ORDER BY started_at DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      data: {
        ...result.rows[0],
        recent_scrapes: logsResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/supermarkets/:id/products
 * Get products from a specific supermarket
 */
router.get('/:id/products', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = '50', offset = '0', search } = req.query;

    let sql = `
      SELECT
        p.id,
        p.name,
        p.normalized_name,
        p.brand,
        p.unit,
        p.unit_quantity,
        p.image_url,
        cat.name as category_name,
        pm.product_url,
        pr.price,
        pr.currency,
        pr.original_price,
        pr.is_on_sale,
        pr.is_available,
        pr.price_per_unit,
        pr.scraped_at
      FROM products p
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN LATERAL (
        SELECT * FROM prices
        WHERE product_id = p.id AND supermarket_id = $1
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      WHERE pm.supermarket_id = $1
    `;

    const params: any[] = [id];
    let paramIndex = 2;

    if (search) {
      sql += ` AND p.normalized_name ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY p.name LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
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
