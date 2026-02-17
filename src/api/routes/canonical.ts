import { Router } from 'express';
import { query } from '../../config/database';
import { isAdmin } from '../../auth';

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
        cp.show_per_unit_price,
        cp.disabled,
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
 * GET /api/canonical/mapped-products
 * Get mapped products with canonical assignment and last price update metadata
 * @requires Admin
 */
router.get('/mapped-products', isAdmin, async (req, res, next) => {
  try {
    const { search, stale_only = 'false', stale_days = '7', limit = '50', offset = '0' } = req.query;

    const searchTerm = typeof search === 'string' ? search.trim() : '';
    const staleOnly = stale_only === 'true';

    const staleDaysRaw = parseInt(stale_days as string, 10);
    const staleDaysThreshold = Number.isFinite(staleDaysRaw) && staleDaysRaw > 0 ? staleDaysRaw : 7;

    const limitRaw = parseInt(limit as string, 10);
    const offsetRaw = parseInt(offset as string, 10);
    const limitNum = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
    const offsetNum = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const whereClauses = ['p.canonical_product_id IS NOT NULL'];
    const params: any[] = [];

    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      const searchParam = params.length;
      whereClauses.push(
        `(p.name ILIKE $${searchParam} OR p.brand ILIKE $${searchParam} OR cp.name ILIKE $${searchParam})`
      );
    }

    const staleFilterSql = staleOnly
      ? `WHERE last_price_updated_at IS NULL OR last_price_updated_at < NOW() - ($${params.length + 1} * INTERVAL '1 day')`
      : '';

    if (staleOnly) {
      params.push(staleDaysThreshold);
    }

    const baseCteSql = `
      WITH canonical_mapped_products AS (
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.brand,
          p.unit,
          p.unit_quantity,
          cp.id as canonical_product_id,
          cp.name as canonical_product_name,
          cp.disabled as canonical_disabled,
          MAX(pr.scraped_at) as last_price_updated_at,
          COUNT(DISTINCT pm.id) as mappings_count,
          COUNT(DISTINCT s.country_id) as countries_count,
          COALESCE(
            JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT(
              'supermarket_id', s.id,
              'supermarket_name', s.name,
              'country_id', c.id,
              'country_name', c.name,
              'country_code', c.code,
              'country_flag', c.flag_emoji
            )) FILTER (WHERE s.id IS NOT NULL),
            '[]'::jsonb
          ) as markets
        FROM products p
        INNER JOIN canonical_products cp ON cp.id = p.canonical_product_id
        LEFT JOIN product_mappings pm ON pm.product_id = p.id
        LEFT JOIN supermarkets s ON s.id = pm.supermarket_id
        LEFT JOIN countries c ON c.id = s.country_id
        LEFT JOIN prices pr ON pr.product_mapping_id = pm.id
        WHERE ${whereClauses.join(' AND ')}
        GROUP BY
          p.id,
          p.name,
          p.brand,
          p.unit,
          p.unit_quantity,
          cp.id,
          cp.name,
          cp.disabled
      ),
      filtered_products AS (
        SELECT
          *,
          CASE
            WHEN last_price_updated_at IS NULL THEN NULL
            ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - last_price_updated_at)) / 86400)::int
          END as stale_days
        FROM canonical_mapped_products
        ${staleFilterSql}
      )
    `;

    const dataSql = `
      ${baseCteSql}
      SELECT * FROM filtered_products
      ORDER BY last_price_updated_at ASC NULLS FIRST, product_name ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const dataParams = [...params, limitNum, offsetNum];

    const countSql = `
      ${baseCteSql}
      SELECT COUNT(*)::int as total FROM filtered_products
    `;
    const countParams = [...params];

    const [result, countResult] = await Promise.all([
      query(dataSql, dataParams),
      query(countSql, countParams),
    ]);

    res.json({
      data: result.rows,
      count: countResult.rows[0]?.total || 0,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
      },
      meta: {
        stale_days_threshold: staleDaysThreshold,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/canonical
 * Create a new canonical product
 * @requires Admin
 */
router.post('/', isAdmin, async (req, res, next) => {
  try {
    const { name, description, category_id, show_per_unit_price } = req.body;

    if (!name) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'name is required',
      });
      return;
    }

    const result = await query(
      `INSERT INTO canonical_products (name, description, category_id, show_per_unit_price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         description = COALESCE(EXCLUDED.description, canonical_products.description),
         category_id = COALESCE(EXCLUDED.category_id, canonical_products.category_id),
         show_per_unit_price = COALESCE(EXCLUDED.show_per_unit_price, canonical_products.show_per_unit_price)
       RETURNING *`,
      [name, description || null, category_id || null, show_per_unit_price ?? false]
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
 * @requires Admin
 */
router.put('/link', isAdmin, async (req, res, next) => {
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
 * PATCH /api/canonical/:id
 * Update a canonical product (e.g., toggle show_per_unit_price or disabled)
 * @requires Admin
 */
router.patch('/:id', isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { show_per_unit_price, disabled } = req.body;

    if (show_per_unit_price === undefined && disabled === undefined) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'No fields to update',
      });
      return;
    }

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (show_per_unit_price !== undefined) {
      updates.push(`show_per_unit_price = $${paramIndex++}`);
      params.push(show_per_unit_price);
    }

    if (disabled !== undefined) {
      updates.push(`disabled = $${paramIndex++}`);
      params.push(disabled);
    }

    params.push(id);

    const result = await query(
      `UPDATE canonical_products
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Canonical product not found',
      });
      return;
    }

    res.json({
      message: 'Updated successfully',
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
        cp.show_per_unit_price,
        cat.name as category_name,
        p.id as product_id,
        p.name as product_name,
        p.brand,
        p.unit,
        p.unit_quantity,
        p.image_url,
        pm.url as product_url,
        s.name as supermarket_name,
        c.id as country_id,
        c.name as country_name,
        c.code as country_code,
        c.currency_code,
        pr.price,
        pr.currency,
        pr.original_price,
        pr.is_on_sale,
        pr.scraped_at,
        pr.price_per_unit
      FROM canonical_products cp
      LEFT JOIN categories cat ON cp.category_id = cat.id
      INNER JOIN products p ON p.canonical_product_id = cp.id
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      LEFT JOIN LATERAL (
        SELECT price, currency, original_price, is_on_sale, scraped_at, price_per_unit FROM prices
        WHERE product_mapping_id = pm.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      WHERE (cp.disabled IS NOT TRUE)
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND cp.name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY cp.name, c.name`;

    const result = await query(sql, params);

    // Group by canonical product and organize by country
    // First pass: collect all products per canonical product + country
    const canonicalMap = new Map<number, any>();

    result.rows.forEach((row: any) => {
      if (!canonicalMap.has(row.canonical_id)) {
        canonicalMap.set(row.canonical_id, {
          canonical_id: row.canonical_id,
          canonical_name: row.canonical_name,
          canonical_description: row.canonical_description,
          show_per_unit_price: row.show_per_unit_price ?? false,
          category: row.category_name,
          products_by_country: {}, // Temporary: collect all products
        });
      }

      const canonical = canonicalMap.get(row.canonical_id);
      const countryCode = row.country_code;

      // Initialize array for this country if not exists
      if (!canonical.products_by_country[countryCode]) {
        canonical.products_by_country[countryCode] = [];
      }

      // Skip products without prices (e.g., products whose prices were deleted during cleanup)
      if (row.price == null) {
        return;
      }

      // Add product to the list
      canonical.products_by_country[countryCode].push({
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand,
        unit: row.unit,
        unit_quantity: row.unit_quantity,
        image_url: row.image_url,
        product_url: row.product_url,
        price: parseFloat(row.price),
        price_per_unit: row.price_per_unit ? parseFloat(row.price_per_unit) : null,
        currency: row.currency || row.currency_code,
        original_price: row.original_price ? parseFloat(row.original_price) : null,
        is_on_sale: row.is_on_sale,
        supermarket: row.supermarket_name,
        country_name: row.country_name,
        scraped_at: row.scraped_at,
      });
    });

    // Second pass: calculate averages and build final prices_by_country
    canonicalMap.forEach((canonical) => {
      const pricesByCountry: Record<string, any> = {};
      const usePerUnitPrice = canonical.show_per_unit_price;

      (Object.entries(canonical.products_by_country) as [string, any[]][]).forEach(([countryCode, products]) => {
        // Skip countries with no products (all products may have been filtered due to missing prices)
        if (products.length === 0) {
          return;
        }

        const productCount = products.length;

        // Calculate average price
        const totalPrice = products.reduce((sum, p) => sum + p.price, 0);
        const avgPrice = totalPrice / productCount;

        // Calculate average price_per_unit (only for products that have it)
        const productsWithPricePerUnit = products.filter(p => p.price_per_unit != null);
        const avgPricePerUnit = productsWithPricePerUnit.length > 0
          ? productsWithPricePerUnit.reduce((sum, p) => sum + p.price_per_unit, 0) / productsWithPricePerUnit.length
          : null;

        // Use first product for metadata (unit, currency, country_name, etc.)
        const firstProduct = products[0];

        pricesByCountry[countryCode] = {
          product_id: firstProduct.product_id,
          product_name: firstProduct.product_name,
          brand: firstProduct.brand,
          unit: firstProduct.unit,
          unit_quantity: firstProduct.unit_quantity,
          image_url: firstProduct.image_url,
          product_url: firstProduct.product_url,
          // Use price_per_unit average when show_per_unit_price is enabled
          price: (usePerUnitPrice && avgPricePerUnit != null) ? avgPricePerUnit : avgPrice,
          price_per_unit: avgPricePerUnit,
          currency: firstProduct.currency,
          original_price: firstProduct.original_price,
          is_on_sale: products.some(p => p.is_on_sale),
          supermarket: firstProduct.supermarket,
          country_name: firstProduct.country_name,
          scraped_at: firstProduct.scraped_at,
          // New fields for multiple products
          product_count: productCount,
          products: products.map(p => ({
            product_id: p.product_id,
            product_name: p.product_name,
            brand: p.brand,
            unit: p.unit,
            unit_quantity: p.unit_quantity,
            price: p.price,
            price_per_unit: p.price_per_unit,
            supermarket: p.supermarket,
            image_url: p.image_url,
            product_url: p.product_url,
          })),
        };
      });

      // Replace temporary products_by_country with final prices_by_country
      canonical.prices_by_country = pricesByCountry;
      delete canonical.products_by_country;
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
    const { search, supermarket_id, mapped_only, limit = '100', offset = '0' } = req.query;

    let sql = `
      SELECT DISTINCT ON (p.id)
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
        pr.currency,
        pr.scraped_at as price_updated_at,
        pm.url as product_url
      FROM products p
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      LEFT JOIN canonical_products cp ON p.canonical_product_id = cp.id
      LEFT JOIN LATERAL (
        SELECT price, currency, scraped_at FROM prices
        WHERE product_mapping_id = pm.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      WHERE c.id = $1
    `;

    const params: any[] = [countryId];
    let paramIndex = 2;

    if (supermarket_id) {
      sql += ` AND s.id = $${paramIndex}`;
      params.push(parseInt(supermarket_id as string));
      paramIndex++;
    }

    if (search) {
      sql += ` AND (p.name ILIKE $${paramIndex} OR p.brand ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (mapped_only === 'true') {
      sql += ` AND p.canonical_product_id IS NOT NULL`;
    }

    // DISTINCT ON requires ORDER BY to start with the same expression
    sql += ` ORDER BY p.id, p.name`;

    // Wrap in subquery to apply final ordering and pagination
    sql = `SELECT * FROM (${sql}) sub ORDER BY name LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(sql, params);

    // Get total count for pagination (count distinct products)
    let countSql = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE c.id = $1
    `;
    const countParams: (string | number)[] = [countryId];
    let countParamIndex = 2;

    if (supermarket_id) {
      countSql += ` AND s.id = $${countParamIndex}`;
      countParams.push(parseInt(supermarket_id as string));
      countParamIndex++;
    }

    if (search) {
      countSql += ` AND (p.name ILIKE $${countParamIndex} OR p.brand ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (mapped_only === 'true') {
      countSql += ` AND p.canonical_product_id IS NOT NULL`;
    }

    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0]?.total || '0');

    res.json({
      data: result.rows,
      count: total,
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
 * @requires Admin
 */
router.delete('/:id', isAdmin, async (req, res, next) => {
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
