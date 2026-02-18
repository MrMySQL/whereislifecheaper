import { query, getClient } from '../config/database';
import { ProductWithCategory, MappingLookupResult, NameBrandMappingResult } from '../types/db.types';
import { ProductData } from '../types/scraper.types';

export class ProductRepository {
  // ── Mapping lookups ──────────────────────────────────────────────────────

  async findMappingByExternalId(
    supermarketId: string,
    externalId: string
  ): Promise<MappingLookupResult | null> {
    const result = await query<MappingLookupResult>(
      `SELECT product_id, id, external_id, url FROM product_mappings
       WHERE supermarket_id = $1 AND external_id = $2
       LIMIT 1`,
      [supermarketId, externalId]
    );
    return result.rows[0] ?? null;
  }

  async findMappingByUrl(
    supermarketId: string,
    url: string
  ): Promise<MappingLookupResult | null> {
    const result = await query<MappingLookupResult>(
      `SELECT product_id, id, external_id, url FROM product_mappings
       WHERE supermarket_id = $1
       AND (
         url = $2
         OR TRIM(TRAILING '/' FROM url) = TRIM(TRAILING '/' FROM $2)
       )
       ORDER BY id DESC
       LIMIT 1`,
      [supermarketId, url]
    );
    return result.rows[0] ?? null;
  }

  async findProductByNameAndBrand(
    normalizedName: string,
    brand?: string
  ): Promise<string | null> {
    const result = await query<{ id: string }>(
      `SELECT id FROM products
       WHERE normalized_name = $1
       AND ($2::text IS NULL OR brand = $2)
       LIMIT 1`,
      [normalizedName, brand || null]
    );
    return result.rows[0]?.id ?? null;
  }

  // ── Single-product writes ────────────────────────────────────────────────

  async createProduct(data: {
    name: string;
    normalizedName: string;
    brand?: string;
    categoryId?: string;
    unit?: string;
    unitQuantity?: number;
    imageUrl?: string;
  }): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO products (name, normalized_name, brand, category_id, unit, unit_quantity, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        data.name,
        data.normalizedName,
        data.brand || null,
        data.categoryId || null,
        data.unit || null,
        data.unitQuantity || null,
        data.imageUrl || null,
      ]
    );
    return result.rows[0].id;
  }

  async updateProduct(
    productId: string,
    data: {
      name: string;
      normalizedName: string;
      imageUrl?: string;
      unit?: string;
      unitQuantity?: number;
    }
  ): Promise<void> {
    await query(
      `UPDATE products SET
        name = $2,
        normalized_name = $3,
        image_url = COALESCE($4, image_url),
        unit = COALESCE($5, unit),
        unit_quantity = COALESCE($6, unit_quantity),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        productId,
        data.name,
        data.normalizedName,
        data.imageUrl || null,
        data.unit || null,
        data.unitQuantity || null,
      ]
    );
  }

  async createOrUpdateMapping(
    productId: string,
    supermarketId: string,
    data: { externalId?: string; productUrl: string }
  ): Promise<string> {
    const existing = await query<{ id: string }>(
      `SELECT id FROM product_mappings WHERE product_id = $1 AND supermarket_id = $2 LIMIT 1`,
      [productId, supermarketId]
    );

    if (existing.rows.length > 0) {
      await this.updateMappingById(existing.rows[0].id, data);
      return existing.rows[0].id;
    }

    if (data.externalId) {
      const result = await query<{ id: string }>(
        `INSERT INTO product_mappings (product_id, supermarket_id, external_id, url, last_scraped_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (supermarket_id, external_id) DO UPDATE SET
           url = EXCLUDED.url,
           last_scraped_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [productId, supermarketId, data.externalId, data.productUrl]
      );
      return result.rows[0].id;
    }

    const result = await query<{ id: string }>(
      `INSERT INTO product_mappings (product_id, supermarket_id, url, last_scraped_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (product_id, supermarket_id) DO UPDATE SET
         url = EXCLUDED.url,
         last_scraped_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [productId, supermarketId, data.productUrl]
    );
    return result.rows[0].id;
  }

  async updateMappingById(
    mappingId: string,
    data: { productUrl: string; externalId?: string }
  ): Promise<void> {
    await query(
      `UPDATE product_mappings SET
        url = $2,
        external_id = COALESCE(external_id, $3),
        last_scraped_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [mappingId, data.productUrl, data.externalId || null]
    );
  }

  // ── Batch lookups ────────────────────────────────────────────────────────

  async batchFindMappingsByExternalIds(
    supermarketId: string,
    externalIds: string[]
  ): Promise<MappingLookupResult[]> {
    if (externalIds.length === 0) return [];
    const result = await query<MappingLookupResult>(
      `SELECT id, product_id, external_id, url FROM product_mappings
       WHERE supermarket_id = $1 AND external_id = ANY($2)`,
      [supermarketId, externalIds]
    );
    return result.rows;
  }

  async batchFindMappingsByUrls(
    supermarketId: string,
    urls: string[]
  ): Promise<MappingLookupResult[]> {
    if (urls.length === 0) return [];
    const result = await query<MappingLookupResult>(
      `SELECT DISTINCT ON (TRIM(TRAILING '/' FROM pm.url))
        pm.id,
        pm.product_id,
        pm.external_id,
        TRIM(TRAILING '/' FROM pm.url) AS url
       FROM product_mappings pm
       WHERE pm.supermarket_id = $1
       AND TRIM(TRAILING '/' FROM pm.url) = ANY($2)
       ORDER BY TRIM(TRAILING '/' FROM pm.url), pm.id DESC`,
      [supermarketId, urls]
    );
    return result.rows;
  }

  async batchFindMappingsByNameAndBrand(
    supermarketId: string,
    products: Array<ProductData & { normalizedName: string }>
  ): Promise<NameBrandMappingResult[]> {
    if (products.length === 0) return [];
    const normalizedNames = products.map(p => p.normalizedName);
    const brands = products.map(p => p.brand || null);
    const result = await query<NameBrandMappingResult>(
      `WITH lookup AS (
        SELECT DISTINCT normalized_name, brand
        FROM unnest($2::text[], $3::text[]) AS l(normalized_name, brand)
      )
      SELECT DISTINCT ON (l.normalized_name, COALESCE(l.brand, ''))
        pm.id,
        pm.product_id,
        pm.external_id,
        pm.url,
        l.normalized_name AS lookup_normalized_name,
        l.brand AS lookup_brand
      FROM lookup l
      INNER JOIN products p
        ON p.normalized_name = l.normalized_name
       AND (l.brand IS NULL OR p.brand = l.brand)
      INNER JOIN product_mappings pm
        ON pm.product_id = p.id
       AND pm.supermarket_id = $1
      ORDER BY l.normalized_name, COALESCE(l.brand, ''), pm.id DESC`,
      [supermarketId, normalizedNames, brands]
    );
    return result.rows;
  }

  // ── Batch writes ─────────────────────────────────────────────────────────

  async batchUpdateExistingProducts(
    products: Array<{
      product: ProductData & { normalizedName: string; externalId?: string };
      mapping: MappingLookupResult;
    }>
  ): Promise<void> {
    if (products.length === 0) return;

    const productIds = products.map(p => parseInt(p.mapping.product_id, 10));
    const names = products.map(p => p.product.name);
    const normalizedNames = products.map(p => p.product.normalizedName);
    const imageUrls = products.map(p => p.product.imageUrl || null);
    const units = products.map(p => p.product.unit || null);
    const unitQuantities = products.map(p => p.product.unitQuantity || null);

    await query(
      `UPDATE products AS p SET
        name = u.name,
        normalized_name = u.normalized_name,
        image_url = COALESCE(u.image_url, p.image_url),
        unit = COALESCE(u.unit, p.unit),
        unit_quantity = COALESCE(u.unit_quantity, p.unit_quantity),
        updated_at = CURRENT_TIMESTAMP
      FROM (SELECT
        unnest($1::int[]) AS id,
        unnest($2::text[]) AS name,
        unnest($3::text[]) AS normalized_name,
        unnest($4::text[]) AS image_url,
        unnest($5::text[]) AS unit,
        unnest($6::numeric[]) AS unit_quantity
      ) AS u
      WHERE p.id = u.id`,
      [productIds, names, normalizedNames, imageUrls, units, unitQuantities]
    );

    const mappingIds = products.map(p => parseInt(p.mapping.id, 10));
    const urls = products.map(p => p.product.productUrl);
    const externalIds = products.map(p => p.product.externalId || null);

    await query(
      `UPDATE product_mappings AS pm SET
        url = u.url,
        external_id = COALESCE(pm.external_id, u.external_id),
        last_scraped_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      FROM (SELECT
        unnest($1::int[]) AS id,
        unnest($2::text[]) AS url,
        unnest($3::text[]) AS external_id
      ) AS u
      WHERE pm.id = u.id`,
      [mappingIds, urls, externalIds]
    );
  }

  async batchCreateProductsAndMappings(
    products: Array<ProductData & { externalId?: string; normalizedName: string }>,
    supermarketId: string
  ): Promise<string[]> {
    if (products.length === 0) return [];

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const names = products.map(p => p.name);
      const normalizedNames = products.map(p => p.normalizedName);
      const brands = products.map(p => p.brand || null);
      const units = products.map(p => p.unit || null);
      const unitQuantities = products.map(p => p.unitQuantity || null);
      const imageUrls = products.map(p => p.imageUrl || null);

      const productResult = await client.query<{ id: string }>(
        `INSERT INTO products (name, normalized_name, brand, unit, unit_quantity, image_url)
         SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[], $6::text[])
         RETURNING id`,
        [names, normalizedNames, brands, units, unitQuantities, imageUrls]
      );

      const productIds = productResult.rows.map(r => parseInt(r.id, 10));
      const externalIds = products.map(p => p.externalId || null);
      const urls = products.map(p => p.productUrl);
      const supermarketIdInt = parseInt(supermarketId, 10);
      const supermarketIds = products.map(() => supermarketIdInt);

      const mappingResult = await client.query<{ id: string }>(
        `INSERT INTO product_mappings (product_id, supermarket_id, external_id, url, last_scraped_at)
         SELECT unnest($1::int[]), unnest($2::int[]), unnest($3::text[]), unnest($4::text[]), CURRENT_TIMESTAMP
         ON CONFLICT (supermarket_id, external_id) DO UPDATE SET
           url = EXCLUDED.url,
           last_scraped_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [productIds, supermarketIds, externalIds, urls]
      );

      await client.query('COMMIT');
      return mappingResult.rows.map(r => r.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Query methods (used by API routes) ───────────────────────────────────

  async findAll(
    filters: { search?: string; categoryId?: string; brand?: string },
    pagination: { limit: number; offset: number }
  ): Promise<ProductWithCategory[]> {
    let sql = `
      SELECT p.*, cat.name as category_name
      FROM products p
      LEFT JOIN categories cat ON p.category_id = cat.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let i = 1;

    if (filters.search) {
      sql += ` AND p.normalized_name ILIKE $${i++}`;
      params.push(`%${filters.search}%`);
    }
    if (filters.categoryId) {
      sql += ` AND p.category_id = $${i++}`;
      params.push(filters.categoryId);
    }
    if (filters.brand) {
      sql += ` AND LOWER(p.brand) = LOWER($${i++})`;
      params.push(filters.brand);
    }

    sql += ` ORDER BY p.name LIMIT $${i++} OFFSET $${i++}`;
    params.push(pagination.limit, pagination.offset);

    const result = await query<ProductWithCategory>(sql, params as any[]);
    return result.rows;
  }

  async findByIdWithPrices(productId: string): Promise<Record<string, unknown> | null> {
    const productResult = await query<ProductWithCategory>(
      `SELECT p.*, cat.name as category_name
       FROM products p
       LEFT JOIN categories cat ON p.category_id = cat.id
       WHERE p.id = $1`,
      [productId]
    );
    if (productResult.rows.length === 0) return null;

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
         WHERE product_mapping_id = pm.id
         ORDER BY scraped_at DESC
         LIMIT 1
       ) pr ON true
       WHERE s.is_active = true
       ORDER BY s.id, pr.scraped_at DESC`,
      [productId]
    );

    return { ...productResult.rows[0], prices: pricesResult.rows };
  }

  async getPriceHistory(
    productId: string,
    options: { supermarketId?: string; days: number }
  ): Promise<Record<string, unknown>[]> {
    let sql = `
      SELECT
        pr.id, pr.product_mapping_id, pr.price, pr.currency, pr.original_price,
        pr.is_on_sale, pr.price_per_unit, pr.scraped_at,
        pm.product_id, pm.supermarket_id,
        s.name as supermarket_name,
        c.name as country_name, c.code as country_code
      FROM prices pr
      INNER JOIN product_mappings pm ON pr.product_mapping_id = pm.id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE pm.product_id = $1
      AND pr.scraped_at >= CURRENT_TIMESTAMP - INTERVAL '${options.days} days'
    `;
    const params: unknown[] = [productId];
    let i = 2;

    if (options.supermarketId) {
      sql += ` AND pm.supermarket_id = $${i++}`;
      params.push(options.supermarketId);
    }
    sql += ` ORDER BY pr.scraped_at DESC`;

    const result = await query(sql, params as any[]);
    return result.rows;
  }

  async compareByCountry(productName: string): Promise<Record<string, unknown>[]> {
    const result = await query(
      `SELECT
        c.id as country_id, c.name as country_name, c.code as country_code, c.currency_code,
        s.id as supermarket_id, s.name as supermarket_name,
        p.id as product_id, p.name as product_name, p.brand, p.unit, p.unit_quantity,
        pr.price, pr.price_per_unit, pr.is_on_sale, pr.scraped_at
       FROM products p
       INNER JOIN product_mappings pm ON p.id = pm.product_id
       INNER JOIN supermarkets s ON pm.supermarket_id = s.id
       INNER JOIN countries c ON s.country_id = c.id
       INNER JOIN LATERAL (
         SELECT * FROM prices WHERE product_mapping_id = pm.id ORDER BY scraped_at DESC LIMIT 1
       ) pr ON true
       WHERE p.normalized_name ILIKE $1 AND s.is_active = true
       ORDER BY c.name, pr.price_per_unit`,
      [`%${productName}%`]
    );
    return result.rows;
  }

  async search(searchTerm: string, limit: number): Promise<Record<string, unknown>[]> {
    const result = await query(
      `SELECT
        p.*,
        c.name as category_name,
        similarity(p.normalized_name, $1) as similarity_score
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.normalized_name % $1
       ORDER BY similarity_score DESC
       LIMIT $2`,
      [searchTerm, limit]
    );
    return result.rows;
  }

  async getProductsForSupermarket(
    supermarketId: string,
    filters: { search?: string },
    pagination: { limit: number; offset: number }
  ): Promise<Record<string, unknown>[]> {
    let sql = `
      SELECT
        p.id, p.name, p.normalized_name, p.brand, p.unit, p.unit_quantity, p.image_url,
        cat.name as category_name,
        pm.product_url,
        pr.price, pr.currency, pr.original_price, pr.is_on_sale, pr.is_available, pr.price_per_unit, pr.scraped_at
      FROM products p
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN LATERAL (
        SELECT * FROM prices
        WHERE product_mapping_id = pm.id
        ORDER BY scraped_at DESC
        LIMIT 1
      ) pr ON true
      WHERE pm.supermarket_id = $1
    `;
    const params: unknown[] = [supermarketId];
    let i = 2;

    if (filters.search) {
      sql += ` AND p.normalized_name ILIKE $${i++}`;
      params.push(`%${filters.search}%`);
    }
    sql += ` ORDER BY p.name LIMIT $${i++} OFFSET $${i++}`;
    params.push(pagination.limit, pagination.offset);

    const result = await query(sql, params as any[]);
    return result.rows;
  }

  async getLatestPricesBySupermarket(supermarketId: string): Promise<Record<string, unknown>[]> {
    const result = await query(
      `SELECT DISTINCT ON (p.id)
        p.id, p.name, p.brand, p.unit, p.unit_quantity,
        pr.price, pr.currency, pr.original_price, pr.is_on_sale, pr.is_available, pr.price_per_unit, pr.scraped_at
       FROM products p
       INNER JOIN product_mappings pm ON p.id = pm.product_id
       INNER JOIN prices pr ON pr.product_mapping_id = pm.id
       WHERE pm.supermarket_id = $1
       ORDER BY p.id, pr.scraped_at DESC`,
      [supermarketId]
    );
    return result.rows;
  }
}
