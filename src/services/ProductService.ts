import { query } from '../config/database';
import { ProductData } from '../types/scraper.types';
import { normalizeProductName } from '../utils/normalizer';
import { scraperLogger } from '../utils/logger';

/**
 * Service for managing products in the database
 */
export class ProductService {
  /**
   * Find or create a product in the database
   * Returns the product mapping ID (for recording prices)
   */
  async findOrCreateProduct(
    productData: ProductData,
    supermarketId: string,
    categoryId?: string
  ): Promise<string> {
    const normalizedName = normalizeProductName(productData.name);

    try {
      // First, try to find existing product by normalized name and brand
      let productId = await this.findProductByNameAndBrand(
        normalizedName,
        productData.brand
      );

      if (!productId) {
        // Create new product
        productId = await this.createProduct({
          name: productData.name,
          normalizedName,
          brand: productData.brand,
          categoryId,
          unit: productData.unit,
          unitQuantity: productData.unitQuantity,
          imageUrl: productData.imageUrl,
        });

        scraperLogger.debug(`Created new product: ${productData.name} (${productId})`);
      }

      // Create or update product mapping for this supermarket
      // Returns the mapping ID for recording prices
      // Use externalId from scraper if provided, otherwise try to extract from URL
      const mappingId = await this.createOrUpdateMapping(productId, supermarketId, {
        externalId: productData.externalId || this.extractExternalId(productData.productUrl),
        productUrl: productData.productUrl,
      });

      return mappingId;
    } catch (error) {
      scraperLogger.error('Error in findOrCreateProduct:', error);
      throw error;
    }
  }

  /**
   * Find product by normalized name and brand
   */
  private async findProductByNameAndBrand(
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

    return result.rows.length > 0 ? result.rows[0].id : null;
  }

  /**
   * Create a new product
   */
  private async createProduct(data: {
    name: string;
    normalizedName: string;
    brand?: string;
    categoryId?: string;
    unit?: string;
    unitQuantity?: number;
    imageUrl?: string;
  }): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO products (
        name,
        normalized_name,
        brand,
        category_id,
        unit,
        unit_quantity,
        image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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

  /**
   * Create or update product mapping for a supermarket
   * Returns the mapping ID
   */
  private async createOrUpdateMapping(
    productId: string,
    supermarketId: string,
    data: {
      externalId?: string;
      productUrl: string;
    }
  ): Promise<string> {
    // Use ON CONFLICT to handle the unique constraint on (supermarket_id, external_id)
    // If external_id exists, use upsert on that constraint
    if (data.externalId) {
      const result = await query<{ id: string }>(
        `INSERT INTO product_mappings (
          product_id,
          supermarket_id,
          external_id,
          url,
          last_scraped_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (supermarket_id, external_id)
        DO UPDATE SET
          url = EXCLUDED.url,
          last_scraped_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id`,
        [productId, supermarketId, data.externalId, data.productUrl]
      );
      return result.rows[0].id;
    }

    // No external_id - check if mapping exists by product_id + supermarket_id
    const existingResult = await query<{ id: string }>(
      `SELECT id FROM product_mappings
       WHERE product_id = $1 AND supermarket_id = $2
       LIMIT 1`,
      [productId, supermarketId]
    );

    if (existingResult.rows.length > 0) {
      await query(
        `UPDATE product_mappings
         SET url = $2, last_scraped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [existingResult.rows[0].id, data.productUrl]
      );
      return existingResult.rows[0].id;
    }

    // Insert new mapping without external_id
    const insertResult = await query<{ id: string }>(
      `INSERT INTO product_mappings (
        product_id,
        supermarket_id,
        url,
        last_scraped_at
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      RETURNING id`,
      [productId, supermarketId, data.productUrl]
    );

    return insertResult.rows[0].id;
  }

  /**
   * Extract external product ID from URL
   * Examples:
   *   https://www.migros.com.tr/sut-1l-p-12345 -> 12345
   *   https://www.migros.com.tr/sut-1l-p-f4725a -> f4725a
   */
  private extractExternalId(url: string): string | undefined {
    // Match both numeric and hex IDs after -p-
    const match = url.match(/-p-([a-zA-Z0-9]+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Record a price for a product mapping
   */
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
        product_mapping_id,
        price,
        currency,
        original_price,
        is_on_sale,
        price_per_unit,
        scraped_at
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

  /**
   * Get product by ID with latest prices
   */
  async getProductById(productId: string): Promise<any> {
    const result = await query(
      `SELECT
        p.*,
        c.name as category_name,
        json_agg(
          json_build_object(
            'supermarket_id', pr.supermarket_id,
            'price', pr.price,
            'currency', pr.currency,
            'is_on_sale', pr.is_on_sale,
            'scraped_at', pr.scraped_at
          ) ORDER BY pr.scraped_at DESC
        ) FILTER (WHERE pr.id IS NOT NULL) as prices
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN LATERAL (
        SELECT DISTINCT ON (supermarket_id) *
        FROM prices
        WHERE product_id = p.id
        ORDER BY supermarket_id, scraped_at DESC
      ) pr ON true
      WHERE p.id = $1
      GROUP BY p.id, c.name`,
      [productId]
    );

    return result.rows[0] || null;
  }

  /**
   * Search products by name
   */
  async searchProducts(
    searchTerm: string,
    limit: number = 50
  ): Promise<any[]> {
    const normalizedSearch = normalizeProductName(searchTerm);

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
      [normalizedSearch, limit]
    );

    return result.rows;
  }

  /**
   * Get latest prices for all products at a supermarket
   */
  async getLatestPricesBySupermarket(supermarketId: string): Promise<any[]> {
    const result = await query(
      `SELECT DISTINCT ON (p.id)
        p.id,
        p.name,
        p.brand,
        p.unit,
        p.unit_quantity,
        pr.price,
        pr.currency,
        pr.original_price,
        pr.is_on_sale,
        pr.is_available,
        pr.price_per_unit,
        pr.scraped_at
      FROM products p
      INNER JOIN product_mappings pm ON p.id = pm.product_id
      INNER JOIN prices pr ON p.id = pr.product_id AND pr.supermarket_id = pm.supermarket_id
      WHERE pm.supermarket_id = $1
      ORDER BY p.id, pr.scraped_at DESC`,
      [supermarketId]
    );

    return result.rows;
  }

  /**
   * Delete old prices (older than specified days)
   */
  async cleanupOldPrices(daysToKeep: number = 90): Promise<number> {
    const result = await query(
      `DELETE FROM prices
       WHERE scraped_at < CURRENT_TIMESTAMP - INTERVAL '${daysToKeep} days'`
    );

    const deletedCount = result.rowCount || 0;
    scraperLogger.info(`Cleaned up ${deletedCount} old price records`);
    return deletedCount;
  }
}
