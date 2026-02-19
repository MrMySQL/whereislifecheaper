import { query } from '../config/database';
import { ProductData } from '../types/scraper.types';
import { calculatePricePerUnit } from '../utils/normalizer';

export class PriceRepository {
  async recordPrice(
    productMappingId: string,
    priceData: {
      price: number;
      currency: string;
      originalPrice?: number;
      isOnSale: boolean;
      pricePerUnit?: number;
    }
  ): Promise<void> {
    await query(
      `INSERT INTO prices (
        product_mapping_id, price, currency, original_price, is_on_sale, price_per_unit, scraped_at
       ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        productMappingId,
        priceData.price,
        priceData.currency,
        priceData.originalPrice || null,
        priceData.isOnSale,
        priceData.pricePerUnit || null,
      ]
    );
  }

  async batchInsertPrices(
    mappingIds: string[],
    products: ProductData[],
    currency: string
  ): Promise<void> {
    if (mappingIds.length === 0) return;

    const mappingIdsInt = mappingIds.map(id => parseInt(id, 10));
    const prices = products.map(p => p.price);
    const currencies = products.map(() => currency);
    const originalPrices = products.map(p => p.originalPrice || null);
    const isOnSales = products.map(p => p.isOnSale);
    const pricePerUnits = products.map(
      p => calculatePricePerUnit(p.price, p.unitQuantity, p.unit) || null
    );

    await query(
      `INSERT INTO prices (product_mapping_id, price, currency, original_price, is_on_sale, price_per_unit, scraped_at)
       SELECT
         unnest($1::int[]),
         unnest($2::numeric[]),
         unnest($3::text[]),
         unnest($4::numeric[]),
         unnest($5::boolean[]),
         unnest($6::numeric[]),
         CURRENT_TIMESTAMP`,
      [mappingIdsInt, prices, currencies, originalPrices, isOnSales, pricePerUnits]
    );
  }

  async cleanupOld(daysToKeep: number): Promise<number> {
    const result = await query(
      `DELETE FROM prices
       WHERE scraped_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`,
      [daysToKeep]
    );
    return result.rowCount || 0;
  }

  async getLatest(
    filters: { countryId?: string; supermarketId?: string },
    pagination: { limit: number; offset: number }
  ): Promise<Record<string, unknown>[]> {
    let sql = `
      SELECT DISTINCT ON (pm.product_id, s.id)
        p.id as product_id, p.name as product_name, p.brand, p.unit, p.unit_quantity,
        s.id as supermarket_id, s.name as supermarket_name,
        c.id as country_id, c.name as country_name, c.code as country_code,
        pr.price, pr.currency, pr.original_price, pr.is_on_sale,
        pm.is_available, pr.price_per_unit, pr.scraped_at
      FROM prices pr
      INNER JOIN product_mappings pm ON pr.product_mapping_id = pm.id
      INNER JOIN products p ON pm.product_id = p.id
      INNER JOIN supermarkets s ON pm.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE s.is_active = true
    `;
    const params: unknown[] = [];
    let i = 1;

    if (filters.countryId) {
      sql += ` AND c.id = $${i++}`;
      params.push(filters.countryId);
    }
    if (filters.supermarketId) {
      sql += ` AND s.id = $${i++}`;
      params.push(filters.supermarketId);
    }

    sql += ` ORDER BY pm.product_id, s.id, pr.scraped_at DESC`;
    sql += ` LIMIT $${i++} OFFSET $${i++}`;
    params.push(pagination.limit, pagination.offset);

    const result = await query(sql, params as any[]);
    return result.rows;
  }

  async getStats(): Promise<Record<string, unknown>[]> {
    const result = await query(`
      WITH active_mappings AS (
        SELECT
          c.id as country_id, c.name as country_name, c.code as country_code,
          c.currency_code, c.flag_emoji,
          s.id as supermarket_id,
          pm.id as product_mapping_id, pm.product_id, pm.last_scraped_at
        FROM countries c
        INNER JOIN supermarkets s ON c.id = s.country_id
        INNER JOIN product_mappings pm ON s.id = pm.supermarket_id
        WHERE s.is_active = true
      )
      SELECT
        am.country_id, am.country_name, am.country_code, am.currency_code, am.flag_emoji,
        COUNT(DISTINCT am.product_id) as product_count,
        COUNT(DISTINCT am.supermarket_id) as supermarket_count,
        MAX(am.last_scraped_at) as last_scrape
      FROM active_mappings am
      GROUP BY am.country_id, am.country_name, am.country_code, am.currency_code, am.flag_emoji
      ORDER BY am.country_name
    `);
    return result.rows;
  }

  async getBasket(productList: string[]): Promise<Record<string, unknown>[]> {
    const result = await query(
      `SELECT
        c.id as country_id, c.name as country_name, c.code as country_code, c.currency_code,
        p.name as product_name,
        MIN(pr.price)::numeric(10,2) as cheapest_price,
        s.name as cheapest_supermarket
       FROM countries c
       INNER JOIN supermarkets s ON c.id = s.country_id
       INNER JOIN product_mappings pm ON s.id = pm.supermarket_id
       INNER JOIN products p ON pm.product_id = p.id
       INNER JOIN LATERAL (
         SELECT price FROM prices
         WHERE product_mapping_id = pm.id
         ORDER BY scraped_at DESC
         LIMIT 1
       ) pr ON true
       WHERE s.is_active = true
       AND p.normalized_name = ANY($1)
       GROUP BY c.id, p.id, s.name
       ORDER BY c.name, p.name`,
      [productList.map(p => p.toLowerCase())]
    );
    return result.rows;
  }

  async compare(
    filters: { search?: string },
    pagination: { limit: number; offset: number }
  ): Promise<Record<string, unknown>[]> {
    let sql = `
      WITH latest_prices AS (
        SELECT DISTINCT ON (pm.product_id, s.id)
          p.id as product_id, p.name as product_name, p.normalized_name, p.brand, p.unit, p.unit_quantity,
          s.id as supermarket_id, s.name as supermarket_name,
          c.id as country_id, c.name as country_name, c.code as country_code, c.currency_code,
          pr.price, pr.currency, pr.original_price, pr.is_on_sale, pr.scraped_at
        FROM products p
        INNER JOIN product_mappings pm ON p.id = pm.product_id
        INNER JOIN supermarkets s ON pm.supermarket_id = s.id
        INNER JOIN countries c ON s.country_id = c.id
        LEFT JOIN prices pr ON pm.id = pr.product_mapping_id
        WHERE s.is_active = true
        AND pr.price IS NOT NULL
    `;
    const params: unknown[] = [];
    let i = 1;

    if (filters.search) {
      sql += ` AND (p.name ILIKE $${i} OR p.brand ILIKE $${i})`;
      params.push(`%${filters.search}%`);
      i++;
    }

    sql += `
        ORDER BY pm.product_id, s.id, pr.scraped_at DESC
      )
      SELECT * FROM latest_prices
      ORDER BY product_name
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(pagination.limit, pagination.offset);

    const result = await query(sql, params as any[]);
    return result.rows;
  }
}
