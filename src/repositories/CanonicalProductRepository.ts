import { query, getClient } from '../config/database';
import { CanonicalProductRow } from '../types/db.types';

export class CanonicalProductRepository {
  async findAll(search?: string): Promise<Record<string, unknown>[]> {
    let sql = `
      SELECT
        cp.id, cp.name, cp.description, cp.category_id,
        c.name as category_name,
        cp.show_per_unit_price, cp.disabled, cp.created_at,
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
    const params: unknown[] = [];

    if (search) {
      sql += ` WHERE cp.name ILIKE $1`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY cp.name`;
    const result = await query(sql, params as any[]);
    return result.rows;
  }

  async getMappedProducts(
    filters: { search?: string; staleOnly?: boolean; staleDays?: number },
    pagination: { limit: number; offset: number }
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
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
      query(dataSql, [...params as any[], pagination.limit, pagination.offset]),
      query(countSql, params as any[]),
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
      params as any[]
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

  async getLinkedProducts(canonicalId: string): Promise<Record<string, unknown>[]> {
    const result = await query(
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
       ORDER BY c.name, p.name`,
      [canonicalId]
    );
    return result.rows;
  }

  async getComparison(
    filters: { search?: string },
    pagination: { limit: number; offset: number }
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
    const whereClauses = ['cp.disabled IS NOT TRUE'];
    const baseParams: unknown[] = [];

    if (filters.search) {
      baseParams.push(`%${filters.search}%`);
      whereClauses.push(`cp.name ILIKE $${baseParams.length}`);
    }

    const baseWhereSql = whereClauses.join(' AND ');
    const eligibleCanonicalCte = `
      WITH eligible_canonical AS (
        SELECT cp.id, cp.name
        FROM canonical_products cp
        INNER JOIN products p ON p.canonical_product_id = cp.id
        INNER JOIN product_mappings pm ON pm.product_id = p.id
        INNER JOIN supermarkets s ON pm.supermarket_id = s.id
        WHERE ${baseWhereSql}
          AND EXISTS (
            SELECT 1 FROM prices pr_exists WHERE pr_exists.product_mapping_id = pm.id
          )
        GROUP BY cp.id, cp.name
        HAVING COUNT(DISTINCT s.country_id) >= 2
      )
    `;

    const dataSql = `
      ${eligibleCanonicalCte},
      paged_canonical AS (
        SELECT id FROM eligible_canonical
        ORDER BY name, id
        LIMIT $${baseParams.length + 1}
        OFFSET $${baseParams.length + 2}
      )
      SELECT
        cp.id as canonical_id, cp.name as canonical_name, cp.description as canonical_description,
        cp.show_per_unit_price,
        cat.name as category_name,
        p.id as product_id, p.name as product_name, p.brand, p.unit, p.unit_quantity, p.image_url,
        pm.url as product_url,
        s.name as supermarket_name,
        c.id as country_id, c.name as country_name, c.code as country_code, c.currency_code,
        pr.price, pr.currency, pr.original_price, pr.is_on_sale, pr.scraped_at, pr.price_per_unit
      FROM paged_canonical pc
      INNER JOIN canonical_products cp ON cp.id = pc.id
      LEFT JOIN categories cat ON cp.category_id = cat.id
      INNER JOIN products p ON p.canonical_product_id = cp.id
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      INNER JOIN LATERAL (
        SELECT price, currency, original_price, is_on_sale, scraped_at, price_per_unit
        FROM prices
        WHERE product_mapping_id = pm.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      ORDER BY cp.name, c.name, p.id
    `;

    const countSql = `
      ${eligibleCanonicalCte}
      SELECT COUNT(*)::int as total FROM eligible_canonical
    `;

    const [dataResult, countResult] = await Promise.all([
      query(dataSql, [...baseParams as any[], pagination.limit, pagination.offset]),
      query(countSql, baseParams as any[]),
    ]);

    return {
      data: dataResult.rows,
      total: countResult.rows[0]?.total || 0,
    };
  }

  async getProductsByCountry(
    countryId: string,
    filters: { search?: string; supermarketId?: string; mappedOnly?: boolean },
    pagination: { limit: number; offset: number }
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
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
      sql += ` AND (p.name ILIKE $${i} OR p.brand ILIKE $${i})`;
      params.push(`%${filters.search}%`);
      i++;
    }
    if (filters.mappedOnly) {
      sql += ` AND p.canonical_product_id IS NOT NULL`;
    }

    sql += ` ORDER BY p.id, p.name`;
    sql = `SELECT * FROM (${sql}) sub ORDER BY name LIMIT $${i++} OFFSET $${i++}`;
    params.push(pagination.limit, pagination.offset);

    const dataResult = await query(sql, params as any[]);

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
      countSql += ` AND (p.name ILIKE $${ci} OR p.brand ILIKE $${ci})`;
      countParams.push(`%${filters.search}%`);
      ci++;
    }
    if (filters.mappedOnly) {
      countSql += ` AND p.canonical_product_id IS NOT NULL`;
    }

    const countResult = await query(countSql, countParams as any[]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0]?.total || '0'),
    };
  }
}
