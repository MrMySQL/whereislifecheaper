import { Router } from 'express';
import { query } from '../../config/database';

const router = Router();

/**
 * GET /api/prices/latest
 * Get latest prices across all supermarkets
 */
router.get('/latest', async (req, res, next) => {
  try {
    const { country_id, supermarket_id, limit = '100', offset = '0' } = req.query;

    let sql = `
      SELECT DISTINCT ON (p.id, s.id)
        p.id as product_id,
        p.name as product_name,
        p.brand,
        p.unit,
        p.unit_quantity,
        s.id as supermarket_id,
        s.name as supermarket_name,
        c.id as country_id,
        c.name as country_name,
        c.code as country_code,
        pr.price,
        pr.currency,
        pr.original_price,
        pr.is_on_sale,
        pr.is_available,
        pr.price_per_unit,
        pr.scraped_at
      FROM prices pr
      INNER JOIN products p ON pr.product_id = p.id
      INNER JOIN supermarkets s ON pr.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE s.is_active = true
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (country_id) {
      sql += ` AND c.id = $${paramIndex++}`;
      params.push(country_id);
    }

    if (supermarket_id) {
      sql += ` AND s.id = $${paramIndex++}`;
      params.push(supermarket_id);
    }

    sql += ` ORDER BY p.id, s.id, pr.scraped_at DESC`;
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

/**
 * GET /api/prices/stats
 * Get price statistics by country
 */
router.get('/stats', async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT
        c.id as country_id,
        c.name as country_name,
        c.code as country_code,
        c.currency_code,
        COUNT(DISTINCT p.id) as product_count,
        COUNT(DISTINCT s.id) as supermarket_count,
        AVG(pr.price)::numeric(10,2) as avg_price,
        MIN(pr.price)::numeric(10,2) as min_price,
        MAX(pr.price)::numeric(10,2) as max_price,
        MAX(pr.scraped_at) as last_update
      FROM countries c
      INNER JOIN supermarkets s ON c.id = s.country_id
      INNER JOIN product_mappings pm ON s.id = pm.supermarket_id
      INNER JOIN products p ON pm.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT * FROM prices
        WHERE product_id = p.id AND supermarket_id = s.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      WHERE s.is_active = true
      GROUP BY c.id
      ORDER BY c.name
    `);

    res.json({
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/prices/basket
 * Calculate basket price for a list of products in each country
 */
router.get('/basket', async (req, res, next) => {
  try {
    const { products } = req.query;

    if (!products) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'products query parameter is required (comma-separated product names)',
      });
      return;
    }

    const productList = (products as string).split(',').map((p) => p.trim());

    const result = await query(
      `SELECT
        c.id as country_id,
        c.name as country_name,
        c.code as country_code,
        c.currency_code,
        p.name as product_name,
        MIN(pr.price)::numeric(10,2) as cheapest_price,
        s_cheapest.name as cheapest_supermarket
      FROM countries c
      INNER JOIN supermarkets s ON c.id = s.country_id
      INNER JOIN product_mappings pm ON s.id = pm.supermarket_id
      INNER JOIN products p ON pm.product_id = p.id
      INNER JOIN LATERAL (
        SELECT * FROM prices
        WHERE product_id = p.id AND supermarket_id = s.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      LEFT JOIN LATERAL (
        SELECT s2.name
        FROM supermarkets s2
        INNER JOIN prices pr2 ON s2.id = pr2.supermarket_id
        WHERE pr2.product_id = p.id
        AND s2.country_id = c.id
        AND s2.is_active = true
        ORDER BY pr2.price ASC, pr2.scraped_at DESC
        LIMIT 1
      ) s_cheapest ON true
      WHERE s.is_active = true
      AND p.normalized_name = ANY($1)
      GROUP BY c.id, p.id, s_cheapest.name
      ORDER BY c.name, p.name`,
      [productList.map((p) => p.toLowerCase())]
    );

    // Group by country and calculate totals
    const byCountry = result.rows.reduce((acc: any, row: any) => {
      const countryKey = row.country_code;
      if (!acc[countryKey]) {
        acc[countryKey] = {
          country_id: row.country_id,
          country_name: row.country_name,
          country_code: row.country_code,
          currency: row.currency_code,
          items: [],
          total: 0,
        };
      }
      acc[countryKey].items.push({
        product_name: row.product_name,
        price: parseFloat(row.cheapest_price),
        supermarket: row.cheapest_supermarket,
      });
      acc[countryKey].total += parseFloat(row.cheapest_price);
      return acc;
    }, {});

    // Round totals
    Object.values(byCountry).forEach((country: any) => {
      country.total = Math.round(country.total * 100) / 100;
    });

    res.json({
      data: Object.values(byCountry),
      requested_products: productList,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
