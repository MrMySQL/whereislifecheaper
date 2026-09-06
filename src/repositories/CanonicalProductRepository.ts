import { query, getClient } from '../config/database';
import {
  CanonicalProductRow,
  CanonicalProductWithCounts,
  MappedProductEntry,
  LinkedProductEntry,
  CanonicalComparisonRow,
  CountryProductEntry,
} from '../types/db.types';

export class CanonicalProductRepository {
  async findAll(search?: string): Promise<CanonicalProductWithCounts[]> {
    let sql = `
      SELECT
        cp.id, cp.name, cp.description, cp.category_id,
        c.name as category_name,
        cp.show_per_unit_price, cp.disabled, cp.created_at,
        COUNT(DISTINCT p.id) as linked_products_count,
        COUNT(DISTINCT s.country_id) as countries_count
      FROM canonical_products cp
      LEFT JOIN categories c ON cp.category_id = c.id
      LEFT JOIN products p ON p.canonical_product_id = cp.id
      LEFT JOIN product_mappings pm ON pm.product_id = p.id
      LEFT JOIN supermarkets s ON pm.supermarket_id = s.id
    `;
    const params: unknown[] = [];

    if (search) {
      sql += ` WHERE cp.name ILIKE $1`;
      params.push(`%${search}%`);
    }

    sql += ` GROUP BY cp.id, cp.name, cp.description, cp.category_id, c.name, cp.show_per_unit_price, cp.disabled, cp.created_at`;
    sql += ` ORDER BY cp.name`;
    const result = await query<CanonicalProductWithCounts>(sql, params);
    return result.rows;
  }

  async getMappedProducts(
    filters: { search?: string; staleOnly?: boolean; staleDays?: number },
    pagination: { limit: number; offset: number }
  ): Promise<{ data: MappedProductEntry[]; total: number }> {
    const staleDaysThreshold = filters.staleDays ?? 7;
    const whereClauses = ['p.canonical_product_id IS NOT NULL'];
    const params: unknown[] = [];

    if (filters.search) {
      params.push(`%${filters.search}%`);
      const searchParam = params.length;
      whereClauses.push(
        `(p.name ILIKE $${searchParam} OR p.brand ILIKE $${searchParam} OR cp.name ILIKE $${searchParam})`
      );
    }

    const staleFilterSql = filters.staleOnly
      ? `WHERE last_price_updated_at IS NULL OR last_price_updated_at < NOW() - ($${params.length + 1} * INTERVAL '1 day')`
      : '';

    if (filters.staleOnly) {
      params.push(staleDaysThreshold);
    }

    const baseCteSql = `
      WITH canonical_mapped_products AS (
        SELECT
          p.id as product_id, p.name as product_name, p.brand, p.unit, p.unit_quantity,
          cp.id as canonical_product_id, cp.name as canonical_product_name, cp.disabled as canonical_disabled,
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
        GROUP BY p.id, p.name, p.brand, p.unit, p.unit_quantity, cp.id, cp.name, cp.disabled
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
    const countSql = `
      ${baseCteSql}
      SELECT COUNT(*)::int as total FROM filtered_products
    `;

    const [dataResult, countResult] = await Promise.all([
      query<MappedProductEntry>(dataSql, [...params, pagination.limit, pagination.offset]),
      query<{ total: number }>(countSql, params),
    ]);

    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total || 0,
    };
  }

  async create(data: {
    name: string;
    description?: string;
    categoryId?: string;
    showPerUnitPrice?: boolean;
  }): Promise<CanonicalProductRow> {
    const result = await query<CanonicalProductRow>(
      `INSERT INTO canonical_products (name, description, category_id, show_per_unit_price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         description = COALESCE(EXCLUDED.description, canonical_products.description),
         category_id = COALESCE(EXCLUDED.category_id, canonical_products.category_id),
         show_per_unit_price = COALESCE(EXCLUDED.show_per_unit_price, canonical_products.show_per_unit_price)
       RETURNING *`,
      [data.name, data.description || null, data.categoryId || null, data.showPerUnitPrice ?? false]
    );
    return result.rows[0];
  }

  async update(
    id: string,
    data: { showPerUnitPrice?: boolean; disabled?: boolean }
  ): Promise<CanonicalProductRow | null> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (data.showPerUnitPrice !== undefined) {
      updates.push(`show_per_unit_price = $${i++}`);
      params.push(data.showPerUnitPrice);
    }
    if (data.disabled !== undefined) {
      updates.push(`disabled = $${i++}`);
      params.push(data.disabled);
    }

    params.push(id);
    const result = await query<CanonicalProductRow>(
      `UPDATE canonical_products SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    return result.rows[0] ?? null;
  }

  async deleteWithUnlink(id: string): Promise<CanonicalProductRow | null> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE products SET canonical_product_id = NULL WHERE canonical_product_id = $1`,
        [id]
      );
      const result = await client.query<CanonicalProductRow>(
        `DELETE FROM canonical_products WHERE id = $1 RETURNING *`,
        [id]
      );
      await client.query('COMMIT');
      return result.rows[0] ?? null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async linkProduct(
    productId: string,
    canonicalProductId: string | null
  ): Promise<{ id: string; name: string; canonical_product_id: string | null } | null> {
    const result = await query<{ id: string; name: string; canonical_product_id: string | null }>(
      `UPDATE products
       SET canonical_product_id = $1
       WHERE id = $2
       RETURNING id, name, canonical_product_id`,
      [canonicalProductId, productId]
    );
    return result.rows[0] ?? null;
  }

  async deleteProduct(id: string): Promise<{ id: string; name: string } | null> {
    const result = await query<{ id: string; name: string }>(
      `DELETE FROM products WHERE id = $1 RETURNING id, name`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async getLinkedProducts(
    canonicalId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<LinkedProductEntry[]> {
    const result = await query<LinkedProductEntry>(
      `SELECT
        p.id, p.name, p.brand, p.unit, p.unit_quantity,
        s.id as supermarket_id, s.name as supermarket_name,
        c.id as country_id, c.name as country_name, c.code as country_code, c.currency_code,
        pr.price, pr.currency, pr.scraped_at
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
       ORDER BY c.name, p.name
       LIMIT $2 OFFSET $3`,
      [canonicalId, limit, offset]
    );
    return result.rows;
  }

  /** Only current, available, non-duplicate offers can enter country averages. */
  async getComparison(
    filters: { search?: string; maxAgeDays?: number },
    pagination: { limit: number; offset: number }
  ): Promise<{
    data: CanonicalComparisonRow[];
    total: number;
    freshness: { newest: Date | null; oldest: Date | null };
  }> {
    const maxAgeDays = filters.maxAgeDays ?? 7;
    if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 365) {
      throw new Error('Price freshness must be between 1 and 365 days');
    }
    const params: unknown[] = [maxAgeDays];
    const searchSql = filters.search ? 'AND cp.name ILIKE $2' : '';
    if (filters.search) params.push(`%${filters.search}%`);
    // This CTE visits only canonical-linked offers, then uses the existing
    // (product_mapping_id, scraped_at DESC) index once per offer. Never scan
    // all historical prices, and never fall back from an unusable latest price
    // to an older interpretation of a different package.
    const cte = `WITH current_offers AS (
      SELECT cp.id AS canonical_id, cp.name AS canonical_name,
        cp.description AS canonical_description, cp.show_per_unit_price,
        cat.name AS category_name, p.id AS product_id, p.name AS product_name,
        p.brand, p.image_url, pm.url AS product_url, s.name AS supermarket_name,
        c.id AS country_id, c.name AS country_name, c.code AS country_code, c.currency_code,
        CASE WHEN cp.show_per_unit_price THEN pr.quantity_info->>'contentUnit' ELSE p.unit END AS unit,
        CASE WHEN cp.show_per_unit_price THEN (pr.quantity_info->>'contentQuantity')::numeric ELSE p.unit_quantity END AS unit_quantity,
        pr.price, pr.currency, pr.original_price, pr.is_on_sale, pr.scraped_at,
        CASE WHEN pr.quantity_info->>'status' = 'verified'
          THEN (pr.quantity_info->>'comparablePrice')::numeric ELSE NULL END AS price_per_unit
      FROM canonical_products cp
      LEFT JOIN product_maintenance_policies pol ON pol.canonical_product_id = cp.id
      JOIN products p ON p.canonical_product_id = cp.id
      JOIN product_mappings pm ON pm.product_id = p.id
      JOIN supermarkets s ON s.id = pm.supermarket_id
      JOIN countries c ON c.id = s.country_id
      LEFT JOIN categories cat ON cat.id = cp.category_id
      CROSS JOIN LATERAL (
        SELECT price, currency, original_price, is_on_sale, scraped_at, quantity_info
        FROM prices WHERE product_mapping_id = pm.id AND scraped_at IS NOT NULL
        ORDER BY scraped_at DESC, id DESC LIMIT 1
      ) pr
      WHERE cp.disabled IS NOT TRUE AND s.is_active
        AND pm.availability_status = 'available'
        AND pm.last_checked_at >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
        AND pm.duplicate_of_mapping_id IS NULL
        AND pm.quantity_info IS NOT DISTINCT FROM pr.quantity_info
        AND pr.price > 0
        AND pr.scraped_at >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
        AND (cp.show_per_unit_price IS NOT TRUE OR (
          pr.quantity_info->>'status' = 'verified'
          AND pr.quantity_info->>'contentUnit' IN ('kg', 'l')
          AND (pr.quantity_info->>'comparablePrice')::numeric > 0
        ))
        AND (pol.expected_unit IS NULL OR pr.quantity_info->>'contentUnit' = pol.expected_unit)
        AND (cp.show_per_unit_price OR pol.expected_quantity IS NULL
          OR (pr.quantity_info->>'contentQuantity')::numeric = pol.expected_quantity)
        ${searchSql}
    ), eligible_canonical AS (
      SELECT canonical_id, canonical_name FROM current_offers
      GROUP BY canonical_id, canonical_name HAVING COUNT(DISTINCT country_id) >= 2
    )`;
    const [data, count, dates] = await Promise.all([
      query<CanonicalComparisonRow>(`${cte}, paged AS (
        SELECT canonical_id FROM eligible_canonical ORDER BY canonical_name, canonical_id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      ) SELECT co.* FROM current_offers co JOIN paged USING (canonical_id)
        ORDER BY co.canonical_name, co.country_name, co.product_id`,
      [...params, pagination.limit, pagination.offset]),
      query<{ total: number }>(`${cte} SELECT COUNT(*)::int AS total FROM eligible_canonical`, params),
      query<{ newest: Date | null; oldest: Date | null }>(`${cte}
        SELECT MAX(co.scraped_at) AS newest, MIN(co.scraped_at) AS oldest
        FROM current_offers co JOIN eligible_canonical ec USING (canonical_id)`, params),
    ]);
    return {
      data: data.rows, total: count.rows[0]?.total ?? 0,
      freshness: dates.rows[0] ?? {newest: null, oldest: null},
    };
  }

  async getProductsByCountry(
    countryId: string,
    filters: { search?: string; supermarketId?: string; mappedOnly?: boolean; unit?: string; unitQuantity?: number },
    pagination: { limit: number; offset: number }
  ): Promise<{ data: CountryProductEntry[]; total: number }> {
    let sql = `
      SELECT DISTINCT ON (p.id)
        p.id, p.name, p.brand, p.unit, p.unit_quantity, p.image_url, p.created_at,
        p.canonical_product_id,
        cp.name as canonical_product_name,
        s.id as supermarket_id, s.name as supermarket_name,
        c.id as country_id, c.name as country_name, c.code as country_code,
        pr.price, pr.currency, pr.scraped_at as price_updated_at,
        pm.last_scraped_at as last_seen_at, pm.url as product_url
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
    const params: unknown[] = [countryId];
    let i = 2;

    if (filters.supermarketId) {
      sql += ` AND s.id = $${i++}`;
      params.push(parseInt(filters.supermarketId, 10));
    }
    if (filters.search) {
      const terms = filters.search.split(',').map(t => t.trim()).filter(Boolean);
      if (terms.length === 1) {
        sql += ` AND (p.name ILIKE $${i} OR p.brand ILIKE $${i})`;
        params.push(`%${terms[0]}%`);
        i++;
      } else {
        const orClauses = terms.map((term) => {
          const idx = i++;
          params.push(`%${term}%`);
          return `(p.name ILIKE $${idx} OR p.brand ILIKE $${idx})`;
        });
        sql += ` AND (${orClauses.join(' OR ')})`;
      }
    }
    if (filters.mappedOnly) {
      sql += ` AND p.canonical_product_id IS NOT NULL`;
    }
    if (filters.unit) {
      sql += ` AND p.unit = $${i++}`;
      params.push(filters.unit);
    }
    if (filters.unitQuantity !== undefined) {
      sql += ` AND p.unit_quantity = $${i++}`;
      params.push(filters.unitQuantity);
    }

    sql += ` ORDER BY p.id, p.name`;
    sql = `SELECT * FROM (${sql}) sub ORDER BY name LIMIT $${i++} OFFSET $${i++}`;
    params.push(pagination.limit, pagination.offset);

    const dataResult = await query<CountryProductEntry>(sql, params);

    let countSql = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE c.id = $1
    `;
    const countParams: unknown[] = [countryId];
    let ci = 2;

    if (filters.supermarketId) {
      countSql += ` AND s.id = $${ci++}`;
      countParams.push(parseInt(filters.supermarketId, 10));
    }
    if (filters.search) {
      const terms = filters.search.split(',').map(t => t.trim()).filter(Boolean);
      if (terms.length === 1) {
        countSql += ` AND (p.name ILIKE $${ci} OR p.brand ILIKE $${ci})`;
        countParams.push(`%${terms[0]}%`);
        ci++;
      } else {
        const orClauses = terms.map((term) => {
          const idx = ci++;
          countParams.push(`%${term}%`);
          return `(p.name ILIKE $${idx} OR p.brand ILIKE $${idx})`;
        });
        countSql += ` AND (${orClauses.join(' OR ')})`;
      }
    }
    if (filters.mappedOnly) {
      countSql += ` AND p.canonical_product_id IS NOT NULL`;
    }
    if (filters.unit) {
      countSql += ` AND p.unit = $${ci++}`;
      countParams.push(filters.unit);
    }
    if (filters.unitQuantity !== undefined) {
      countSql += ` AND p.unit_quantity = $${ci++}`;
      countParams.push(filters.unitQuantity);
    }

    const countResult = await query<{ total: string }>(countSql, countParams);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0]?.total || '0'),
    };
  }
}
