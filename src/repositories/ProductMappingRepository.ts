import { query, getClient } from '../config/database';
import { MappingLookupResult, NameBrandMappingResult } from '../types/db.types';
import { ProductData } from '../types/scraper.types';

/**
 * Handles all DB access for the scraper domain:
 * mapping lookups, product creates/updates, and batch operations.
 * Used exclusively by ProductService during scraping.
 */
export class ProductMappingRepository {
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
    const mappingIds = products.map(p => parseInt(p.mapping.id, 10));
    const urls = products.map(p => p.product.productUrl);
    const externalIds = products.map(p => p.product.externalId || null);

    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query(
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

      await client.query(
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

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
}
