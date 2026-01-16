import { Router } from 'express';
import { query } from '../../config/database';

const router = Router();

/**
 * GET /api/products
 * Get products with optional filters
 */
router.get('/', async (req, res, next) => {
  try {
    const { search, category_id, brand, limit = '50', offset = '0' } = req.query;

    let sql = `
      SELECT
        p.*,
        cat.name as category_name
      FROM products p
      LEFT JOIN categories cat ON p.category_id = cat.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND p.normalized_name ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }

    if (category_id) {
      sql += ` AND p.category_id = $${paramIndex++}`;
      params.push(category_id);
    }

    if (brand) {
      sql += ` AND LOWER(p.brand) = LOWER($${paramIndex++})`;
      params.push(brand);
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

/**
 * GET /api/products/:id
 * Get product by ID with prices from all supermarkets
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const productResult = await query(
      `SELECT
        p.*,
        cat.name as category_name
      FROM products p
      LEFT JOIN categories cat ON p.category_id = cat.id
      WHERE p.id = $1`,
      [id]
    );

    if (productResult.rows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Product not found',
      });
      return;
    }

    // Get latest prices from all supermarkets
    const pricesResult = await query(
      `SELECT DISTINCT ON (s.id)
        s.id as supermarket_id,
        s.name as supermarket_name,
        c.name as country_name,
        c.code as country_code,
        c.currency_code,
        pr.price,
        pr.original_price,
        pr.is_on_sale,
        pr.is_available,
        pr.price_per_unit,
        pr.scraped_at,
        pm.product_url
      FROM supermarkets s
      INNER JOIN countries c ON s.country_id = c.id
      INNER JOIN product_mappings pm ON s.id = pm.supermarket_id AND pm.product_id = $1
      LEFT JOIN LATERAL (
        SELECT * FROM prices
        WHERE product_id = $1 AND supermarket_id = s.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      WHERE s.is_active = true
      ORDER BY s.id, pr.scraped_at DESC`,
      [id]
    );

    res.json({
      data: {
        ...productResult.rows[0],
        prices: pricesResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/:id/price-history
 * Get price history for a product at a specific supermarket
 */
router.get('/:id/price-history', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { supermarket_id, days = '30' } = req.query;

    let sql = `
      SELECT
        pr.id,
        pr.product_mapping_id,
        pr.price,
        pr.currency,
        pr.original_price,
        pr.is_on_sale,
        pr.price_per_unit,
        pr.scraped_at,
        pm.product_id,
        pm.supermarket_id,
        s.name as supermarket_name,
        c.name as country_name,
        c.code as country_code
      FROM prices pr
      INNER JOIN product_mappings pm ON pr.product_mapping_id = pm.id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE pm.product_id = $1
      AND pr.scraped_at >= CURRENT_TIMESTAMP - INTERVAL '${parseInt(days as string)} days'
    `;

    const params: any[] = [id];
    let paramIndex = 2;

    if (supermarket_id) {
      sql += ` AND pm.supermarket_id = $${paramIndex++}`;
      params.push(supermarket_id);
    }

    sql += ` ORDER BY pr.scraped_at DESC`;

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
 * GET /api/products/compare
 * Compare product prices across countries
 */
router.get('/compare/countries', async (req, res, next) => {
  try {
    const { product_name } = req.query;

    if (!product_name) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'product_name query parameter is required',
      });
      return;
    }

    const result = await query(
      `SELECT
        c.id as country_id,
        c.name as country_name,
        c.code as country_code,
        c.currency_code,
        s.id as supermarket_id,
        s.name as supermarket_name,
        p.id as product_id,
        p.name as product_name,
        p.brand,
        p.unit,
        p.unit_quantity,
        pr.price,
        pr.price_per_unit,
        pr.is_on_sale,
        pr.scraped_at
      FROM products p
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      INNER JOIN LATERAL (
        SELECT * FROM prices
        WHERE product_id = p.id AND supermarket_id = s.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      WHERE p.normalized_name ILIKE $1
      AND s.is_active = true
      ORDER BY c.name, pr.price_per_unit`,
      [`%${product_name}%`]
    );

    // Group by country
    const byCountry = result.rows.reduce((acc: any, row: any) => {
      const countryKey = row.country_code;
      if (!acc[countryKey]) {
        acc[countryKey] = {
          country_id: row.country_id,
          country_name: row.country_name,
          country_code: row.country_code,
          currency: row.currency_code,
          products: [],
        };
      }
      acc[countryKey].products.push({
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand,
        supermarket_name: row.supermarket_name,
        price: row.price,
        price_per_unit: row.price_per_unit,
        unit: row.unit,
        unit_quantity: row.unit_quantity,
        is_on_sale: row.is_on_sale,
        scraped_at: row.scraped_at,
      });
      return acc;
    }, {});

    res.json({
      data: Object.values(byCountry),
      search_term: product_name,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
