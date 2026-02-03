import { query } from '../config/database';
import { ProductData } from '../types/scraper.types';
import { normalizeProductName, calculatePricePerUnit } from '../utils/normalizer';
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
    const externalId = productData.externalId || this.extractExternalId(productData.productUrl);

    try {
      let productId: string | null = null;
      let existingMappingId: string | null = null;

      // If we have an external_id, first check if a mapping already exists
      // This ensures product variants with different external_ids stay separate
      if (externalId) {
        const existingMapping = await this.findMappingByExternalId(supermarketId, externalId);
        if (existingMapping) {
          productId = existingMapping.productId;
          existingMappingId = existingMapping.mappingId;
          // Update the product name if it changed (e.g., packaging was added)
          await this.updateProductIfChanged(productId, {
            name: productData.name,
            normalizedName,
            imageUrl: productData.imageUrl,
            unit: productData.unit,
            unitQuantity: productData.unitQuantity,
          });
        }
      }

      // If no existing mapping found by external_id, try to find by normalized name + brand
      // BUT only if we don't have an external_id - products with external_ids from the same
      // supermarket should NOT be merged by name, as they represent different variants
      if (!productId && !externalId) {
        productId = await this.findProductByNameAndBrand(normalizedName, productData.brand);
      }

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

      // If we already found an existing mapping by external_id, just return it
      if (existingMappingId) {
        return existingMappingId;
      }

      // Create or update product mapping for this supermarket
      // Returns the mapping ID for recording prices
      const mappingId = await this.createOrUpdateMapping(productId, supermarketId, {
        externalId,
        productUrl: productData.productUrl,
      });

      return mappingId;
    } catch (error) {
      scraperLogger.error('Error in findOrCreateProduct:', error);
      throw error;
    }
  }

  /**
   * Find existing mapping by supermarket and external_id
   */
  private async findMappingByExternalId(
    supermarketId: string,
    externalId: string
  ): Promise<{ productId: string; mappingId: string } | null> {
    const result = await query<{ product_id: string; id: string }>(
      `SELECT product_id, id FROM product_mappings
       WHERE supermarket_id = $1 AND external_id = $2
       LIMIT 1`,
      [supermarketId, externalId]
    );

    if (result.rows.length > 0) {
      return {
        productId: result.rows[0].product_id,
        mappingId: result.rows[0].id,
      };
    }
    return null;
  }

  /**
   * Update product fields if they changed
   */
  private async updateProductIfChanged(
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
   *
   * Handles duplicate products that may appear in multiple categories
   * by checking for existing mappings first.
   */
  private async createOrUpdateMapping(
    productId: string,
    supermarketId: string,
    data: {
      externalId?: string;
      productUrl: string;
    }
  ): Promise<string> {
    // First check if a mapping already exists for this (product_id, supermarket_id)
    // This handles the case where the same product appears in multiple categories
    const existingMapping = await query<{ id: string }>(
      `SELECT id FROM product_mappings
       WHERE product_id = $1 AND supermarket_id = $2
       LIMIT 1`,
      [productId, supermarketId]
    );

    if (existingMapping.rows.length > 0) {
      // Update existing mapping
      await query(
        `UPDATE product_mappings SET
          url = $2,
          last_scraped_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [existingMapping.rows[0].id, data.productUrl]
      );
      return existingMapping.rows[0].id;
    }

    // No existing mapping - insert new one
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

    // No external_id - use ON CONFLICT on (product_id, supermarket_id) constraint
    const result = await query<{ id: string }>(
      `INSERT INTO product_mappings (
        product_id,
        supermarket_id,
        url,
        last_scraped_at
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id, supermarket_id)
      DO UPDATE SET
        url = EXCLUDED.url,
        last_scraped_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id`,
      [productId, supermarketId, data.productUrl]
    );

    return result.rows[0].id;
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
   * Bulk process products and record prices in batched operations
   * Significantly faster than individual operations for large datasets
   *
   * @param products Array of products to process
   * @param supermarketId Supermarket ID
   * @param currency Currency code for prices
   * @returns Number of successfully processed products
   */
  async bulkSaveProducts(
    products: ProductData[],
    supermarketId: string,
    currency: string
  ): Promise<number> {
    if (products.length === 0) return 0;

    const startTime = Date.now();
    scraperLogger.debug(`Bulk saving ${products.length} products...`);

    try {
      // Step 1: Prepare product data with external IDs and normalized names
      const preparedProducts = products.map(p => ({
        ...p,
        externalId: p.externalId || this.extractExternalId(p.productUrl),
        normalizedName: normalizeProductName(p.name),
      }));

      // Step 2: Batch fetch existing mappings by external_id
      const externalIds = preparedProducts
        .map(p => p.externalId)
        .filter((id): id is string => !!id);

      const existingMappings = await this.batchFindMappingsByExternalIds(
        supermarketId,
        externalIds
      );

      // Create lookup map for quick access
      const mappingsByExternalId = new Map(
        existingMappings.map(m => [m.external_id, m])
      );

      // Step 3: Separate products into existing vs new
      const existingProducts: Array<{ product: typeof preparedProducts[0]; mapping: typeof existingMappings[0] }> = [];
      const newProducts: typeof preparedProducts = [];

      for (const product of preparedProducts) {
        if (product.externalId && mappingsByExternalId.has(product.externalId)) {
          existingProducts.push({
            product,
            mapping: mappingsByExternalId.get(product.externalId)!,
          });
        } else {
          newProducts.push(product);
        }
      }

      scraperLogger.debug(
        `Found ${existingProducts.length} existing, ${newProducts.length} new products`
      );

      // Step 4: Batch update existing products
      const existingMappingIds: string[] = [];
      if (existingProducts.length > 0) {
        await this.batchUpdateProducts(existingProducts);
        existingMappingIds.push(...existingProducts.map(ep => ep.mapping.id));
      }

      // Step 5: Batch create new products and mappings
      const newMappingIds: string[] = [];
      if (newProducts.length > 0) {
        const createdMappingIds = await this.batchCreateProductsAndMappings(
          newProducts,
          supermarketId
        );
        newMappingIds.push(...createdMappingIds);
      }

      // Step 6: Batch insert prices for all products
      const allMappingIds = [...existingMappingIds, ...newMappingIds];
      const allProducts = [...existingProducts.map(ep => ep.product), ...newProducts];

      if (allMappingIds.length > 0) {
        await this.batchInsertPrices(allMappingIds, allProducts, currency);
      }

      const duration = Date.now() - startTime;
      scraperLogger.debug(
        `Bulk saved ${allMappingIds.length} products in ${duration}ms ` +
        `(${existingMappingIds.length} updated, ${newMappingIds.length} created)`
      );

      return allMappingIds.length;
    } catch (error) {
      scraperLogger.error('Error in bulkSaveProducts:', error);
      throw error;
    }
  }

  /**
   * Batch find mappings by external IDs
   */
  private async batchFindMappingsByExternalIds(
    supermarketId: string,
    externalIds: string[]
  ): Promise<Array<{ id: string; product_id: string; external_id: string }>> {
    if (externalIds.length === 0) return [];

    const result = await query<{ id: string; product_id: string; external_id: string }>(
      `SELECT id, product_id, external_id FROM product_mappings
       WHERE supermarket_id = $1 AND external_id = ANY($2)`,
      [supermarketId, externalIds]
    );

    return result.rows;
  }

  /**
   * Batch update existing products
   */
  private async batchUpdateProducts(
    products: Array<{
      product: ProductData & { normalizedName: string };
      mapping: { id: string; product_id: string }
    }>
  ): Promise<void> {
    if (products.length === 0) return;

    // Build batch update query using UNNEST
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

    // Update mapping last_scraped_at
    const mappingIds = products.map(p => parseInt(p.mapping.id, 10));
    await query(
      `UPDATE product_mappings SET
        last_scraped_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::int[])`,
      [mappingIds]
    );
  }

  /**
   * Batch create new products and mappings
   * Returns array of mapping IDs
   */
  private async batchCreateProductsAndMappings(
    products: Array<ProductData & { externalId?: string; normalizedName: string }>,
    supermarketId: string
  ): Promise<string[]> {
    if (products.length === 0) return [];

    // Insert products in batch
    const names = products.map(p => p.name);
    const normalizedNames = products.map(p => p.normalizedName);
    const brands = products.map(p => p.brand || null);
    const units = products.map(p => p.unit || null);
    const unitQuantities = products.map(p => p.unitQuantity || null);
    const imageUrls = products.map(p => p.imageUrl || null);

    const productResult = await query<{ id: string }>(
      `INSERT INTO products (name, normalized_name, brand, unit, unit_quantity, image_url)
       SELECT * FROM UNNEST(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[], $6::text[]
       )
       RETURNING id`,
      [names, normalizedNames, brands, units, unitQuantities, imageUrls]
    );

    const productIds = productResult.rows.map(r => parseInt(r.id, 10));

    // Create mappings for new products
    const externalIds = products.map(p => p.externalId || null);
    const urls = products.map(p => p.productUrl);
    const supermarketIdInt = parseInt(supermarketId, 10);
    const supermarketIds = products.map(() => supermarketIdInt);

    const mappingResult = await query<{ id: string }>(
      `INSERT INTO product_mappings (product_id, supermarket_id, external_id, url, last_scraped_at)
       SELECT unnest($1::int[]), unnest($2::int[]), unnest($3::text[]), unnest($4::text[]), CURRENT_TIMESTAMP
       ON CONFLICT (supermarket_id, external_id)
       DO UPDATE SET
         url = EXCLUDED.url,
         last_scraped_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [productIds, supermarketIds, externalIds, urls]
    );

    return mappingResult.rows.map(r => r.id);
  }

  /**
   * Batch insert prices
   */
  private async batchInsertPrices(
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
    const pricePerUnits = products.map(p =>
      calculatePricePerUnit(p.price, p.unitQuantity, p.unit) || null
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
