import { Router } from 'express';
import { query } from '../../config/database';

const router = Router();

/**
 * GET /api/canonical
 * Get all canonical products
 */
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;

    let sql = `
      SELECT
        cp.id,
        cp.name,
        cp.description,
        cp.category_id,
        c.name as category_name,
        cp.created_at,
        (
          SELECT COUNT(DISTINCT p.id)
          FROM products p
          WHERE p.canonical_product_id = cp.id
        ) as linked_products_count,
        (
          SELECT COUNT(DISTINCT s.country_id)
          FROM products p
          JOIN product_mappings pm ON p.id = pm.product_id
          JOIN supermarkets s ON pm.supermarket_id = s.id
          WHERE p.canonical_product_id = cp.id
        ) as countries_count
      FROM canonical_products cp
      LEFT JOIN categories c ON cp.category_id = c.id
    `;

    const params: any[] = [];

    if (search) {
      sql += ` WHERE cp.name ILIKE $1`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY cp.name`;

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
 * POST /api/canonical
 * Create a new canonical product
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, description, category_id } = req.body;

    if (!name) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'name is required',
      });
      return;
    }

    const result = await query(
      `INSERT INTO canonical_products (name, description, category_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET
         description = COALESCE(EXCLUDED.description, canonical_products.description),
         category_id = COALESCE(EXCLUDED.category_id, canonical_products.category_id)
       RETURNING *`,
      [name, description || null, category_id || null]
    );

    res.status(201).json({
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/canonical/link
 * Link a product to a canonical product
 */
router.put('/link', async (req, res, next) => {
  try {
    const { product_id, canonical_product_id } = req.body;

    if (!product_id) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'product_id is required',
      });
      return;
    }

    const result = await query(
      `UPDATE products
       SET canonical_product_id = $1
       WHERE id = $2
       RETURNING id, name, canonical_product_id`,
      [canonical_product_id || null, product_id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Product not found',
      });
      return;
    }

    res.json({
      message: canonical_product_id ? 'Product linked' : 'Product unlinked',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/canonical/comparison
 * Get products comparison using canonical products
 * Only shows products that have been linked to canonical products
 */
router.get('/comparison', async (req, res, next) => {
  try {
    const { search, limit = '100', offset = '0' } = req.query;

    let sql = `
      SELECT
        cp.id as canonical_id,
        cp.name as canonical_name,
        cp.description as canonical_description,
        cat.name as category_name,
        p.id as product_id,
        p.name as product_name,
        p.brand,
        p.unit,
        p.unit_quantity,
        s.name as supermarket_name,
        c.id as country_id,
        c.name as country_name,
        c.code as country_code,
        c.currency_code,
        pr.price,
        pr.currency,
        pr.original_price,
        pr.is_on_sale,
        pr.scraped_at
      FROM canonical_products cp
      LEFT JOIN categories cat ON cp.category_id = cat.id
      INNER JOIN products p ON p.canonical_product_id = cp.id
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      LEFT JOIN LATERAL (
        SELECT price, currency, original_price, is_on_sale, scraped_at FROM prices
        WHERE product_mapping_id = pm.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      sql += ` WHERE cp.name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY cp.name, c.name`;

    const result = await query(sql, params);

    // Group by canonical product and organize by country
    const canonicalMap = new Map<number, any>();

    result.rows.forEach((row: any) => {
      if (!canonicalMap.has(row.canonical_id)) {
        canonicalMap.set(row.canonical_id, {
          canonical_id: row.canonical_id,
          canonical_name: row.canonical_name,
          canonical_description: row.canonical_description,
          category: row.category_name,
          prices_by_country: {},
        });
      }

      const canonical = canonicalMap.get(row.canonical_id);
      const countryCode = row.country_code;

      // Keep the cheapest price per country
      if (!canonical.prices_by_country[countryCode] ||
          row.price < canonical.prices_by_country[countryCode].price) {
        canonical.prices_by_country[countryCode] = {
          product_id: row.product_id,
          product_name: row.product_name,
          brand: row.brand,
          unit: row.unit,
          unit_quantity: row.unit_quantity,
          price: parseFloat(row.price),
          currency: row.currency || row.currency_code,
          original_price: row.original_price ? parseFloat(row.original_price) : null,
          is_on_sale: row.is_on_sale,
          supermarket: row.supermarket_name,
          country_name: row.country_name,
          scraped_at: row.scraped_at,
        };
      }
    });

    // Convert to array and filter products available in multiple countries
    let comparison = Array.from(canonicalMap.values())
      .filter(p => Object.keys(p.prices_by_country).length >= 2)
      .map(p => ({
        ...p,
        country_count: Object.keys(p.prices_by_country).length,
      }));

    // Apply pagination
    const total = comparison.length;
    const offsetNum = parseInt(offset as string);
    const limitNum = parseInt(limit as string);
    comparison = comparison.slice(offsetNum, offsetNum + limitNum);

    res.json({
      data: comparison,
      total,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/canonical/products-by-country/:countryId
 * Get all products for a specific country with their canonical product assignments
 */
router.get('/products-by-country/:countryId', async (req, res, next) => {
  try {
    const { countryId } = req.params;
    const { search, limit = '100', offset = '0' } = req.query;

    let sql = `
      SELECT
        p.id,
        p.name,
        p.brand,
        p.unit,
        p.unit_quantity,
        p.image_url,
        p.canonical_product_id,
        cp.name as canonical_product_name,
        s.id as supermarket_id,
        s.name as supermarket_name,
        c.id as country_id,
        c.name as country_name,
        c.code as country_code,
        pr.price,
        pr.currency
      FROM products p
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
      LEFT JOIN LATERAL (
        SELECT price, currency FROM prices
        WHERE product_mapping_id = pm.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      WHERE c.id = $1
    `;

    const params: any[] = [countryId];
    let paramIndex = 2;

    if (search) {
      sql += ` AND (p.name ILIKE $${paramIndex} OR p.brand ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY p.name`;
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
 * DELETE /api/canonical/:id
 * Delete a canonical product
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // First unlink all products
    await query(
      `UPDATE products SET canonical_product_id = NULL WHERE canonical_product_id = $1`,
      [id]
    );

    // Then delete the canonical product
    const result = await query(
      `DELETE FROM canonical_products WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Canonical product not found',
      });
      return;
    }

    res.json({
      message: 'Deleted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/canonical/:id/products
 * Get all products linked to a canonical product
 */
router.get('/:id/products', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
        p.id,
        p.name,
        p.brand,
        p.unit,
        p.unit_quantity,
        s.id as supermarket_id,
        s.name as supermarket_name,
        c.id as country_id,
        c.name as country_name,
        c.code as country_code,
        c.currency_code,
        pr.price,
        pr.currency,
        pr.scraped_at
      FROM products p
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      LEFT JOIN LATERAL (
        SELECT price, currency, scraped_at FROM prices
        WHERE product_mapping_id = pm.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      WHERE p.canonical_product_id = $1
      ORDER BY c.name, p.name`,
      [id]
    );

    res.json({
      data: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
