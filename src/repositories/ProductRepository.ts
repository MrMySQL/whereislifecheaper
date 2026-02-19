import { query } from '../config/database';
import { ProductWithCategory } from '../types/db.types';

/**
 * Handles all DB read queries for the products API.
 * Used exclusively by API routes and ProductService read methods.
 */
export class ProductRepository {
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
        pm.url as product_url
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
      AND pr.scraped_at >= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day')
    `;
    const params: unknown[] = [productId, options.days];
    let i = 3;

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
        pm.url as product_url,
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
