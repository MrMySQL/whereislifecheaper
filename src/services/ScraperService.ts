import { BaseScraper } from '../scrapers/base/BaseScraper';
import { ScraperFactory, CreateScraperOptions } from '../scrapers/base/ScraperFactory';
import { ProductService } from './ProductService';
import { query } from '../config/database';
import { scraperLogger } from '../utils/logger';
import { ProductData, ScrapeResult, CategoryConfig, PageInfo } from '../types/scraper.types';
import { calculatePricePerUnit } from '../utils/normalizer';
import { getScraperCategories } from '../config/scrapers';

export interface RunScraperOptions {
  categoryIds?: string[];  // Filter to specific category IDs
}

/**
 * Service for orchestrating scraping operations
 * Coordinates scraper execution, data storage, and logging
 */
export class ScraperService {
  private productService: ProductService;

  constructor() {
    this.productService = new ProductService();
  }

  /**
   * Run scraper for a specific supermarket
   */
  async runScraper(supermarketId: string, options?: RunScraperOptions): Promise<ScrapeResult> {
    const categoryInfo = options?.categoryIds?.length
      ? ` (categories: ${options.categoryIds.join(', ')})`
      : '';
    scraperLogger.info(`Starting scraper for supermarket: ${supermarketId}${categoryInfo}`);

    let scraper: BaseScraper | null = null;
    let scrapeLogId: string | null = null;
    const startTime = Date.now();
    let totalStoredCount = 0;

    try {
      // Get supermarket configuration from database
      const supermarket = await this.getSupermarketConfig(supermarketId);

      if (!supermarket) {
        throw new Error(`Supermarket not found: ${supermarketId}`);
      }

      if (!supermarket.is_active) {
        scraperLogger.warn(`Supermarket is not active: ${supermarket.name}`);
        return this.buildEmptyResult(supermarketId, 'Supermarket not active');
      }

      // Create scrape log entry
      scrapeLogId = await this.createScrapeLog(supermarketId, 'running');

      // Create scraper instance with optional category filter
      const scraperOptions: CreateScraperOptions = {
        categoryIds: options?.categoryIds,
      };
      scraper = ScraperFactory.createFromSupermarket(supermarket, scraperOptions);

      // Set up callback to save products after each page
      scraper.setOnPageScrapedCallback(async (products: ProductData[], pageInfo: PageInfo): Promise<number> => {
        const savedCount = await this.storeProducts(products, supermarketId);
        totalStoredCount += savedCount;
        scraperLogger.debug(
          `Page callback: saved ${savedCount}/${products.length} products from ${pageInfo.categoryName} page ${pageInfo.pageNumber}`
        );
        return savedCount;
      });

      // Initialize scraper
      await scraper.initialize();

      // Scrape products (products are saved incrementally via callback)
      const products = await scraper.scrapeProductList();

      scraperLogger.info(
        `Scraped ${products.length} products from ${supermarket.name}, stored ${totalStoredCount}`
      );

      // Update scrape log with success
      if (scrapeLogId) {
        await this.updateScrapeLog(scrapeLogId, 'success', {
          productsScraped: totalStoredCount,
          duration: Date.now() - startTime,
        });
      }

      // Build result
      const result: ScrapeResult = {
        supermarketId,
        products: products.map((p) => ({
          ...p,
          normalizedName: p.name,
          pricePerUnit: calculatePricePerUnit(
            p.price,
            p.unitQuantity,
            p.unit
          ),
        })),
        scrapedAt: new Date(),
        duration: Date.now() - startTime,
        productsScraped: totalStoredCount,
        productsFailed: products.length - totalStoredCount,
        errors: [],
      };

      scraperLogger.info(
        `Scraping completed for ${supermarket.name}: ${totalStoredCount} products stored`
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      scraperLogger.error(
        `Scraping failed for supermarket ${supermarketId}:`,
        error
      );

      // Update scrape log with failure
      if (scrapeLogId) {
        await this.updateScrapeLog(scrapeLogId, 'failed', {
          error: errorMessage,
          duration: Date.now() - startTime,
        });
      }

      return this.buildEmptyResult(supermarketId, errorMessage);
    } finally {
      // Cleanup scraper resources
      if (scraper) {
        await scraper.cleanup();
      }
    }
  }

  /**
   * Run scrapers for all active supermarkets
   */
  async runAllScrapers(): Promise<ScrapeResult[]> {
    scraperLogger.info('Starting scrape for all active supermarkets');

    const supermarkets = await this.getActiveSupermarkets();

    scraperLogger.info(
      `Found ${supermarkets.length} active supermarkets to scrape`
    );

    const results: ScrapeResult[] = [];

    // Run scrapers sequentially to avoid overwhelming servers
    for (const supermarket of supermarkets) {
      try {
        const result = await this.runScraper(supermarket.id);
        results.push(result);

        // Wait between supermarkets to be respectful
        await this.sleep(60000); // 1 minute between supermarkets
      } catch (error) {
        scraperLogger.error(
          `Failed to run scraper for ${supermarket.name}:`,
          error
        );
      }
    }

    scraperLogger.info(
      `Completed scraping all supermarkets. Total results: ${results.length}`
    );

    return results;
  }

  /**
   * Store scraped products and prices in database
   */
  private async storeProducts(
    products: ProductData[],
    supermarketId: string
  ): Promise<number> {
    let storedCount = 0;

    for (const product of products) {
      try {
        // Find or create product, returns mapping ID
        const mappingId = await this.productService.findOrCreateProduct(
          product,
          supermarketId
        );

        // Record price using the mapping ID
        await this.productService.recordPrice(mappingId, {
          price: product.price,
          currency: product.currency,
          originalPrice: product.originalPrice,
          isOnSale: product.isOnSale,
          pricePerUnit: calculatePricePerUnit(
            product.price,
            product.unitQuantity,
            product.unit
          ),
        });

        storedCount++;
      } catch (error) {
        scraperLogger.error(
          `Failed to store product: ${product.name}`,
          error
        );
      }
    }

    return storedCount;
  }

  /**
   * Get supermarket configuration from database
   */
  private async getSupermarketConfig(supermarketId: string): Promise<any> {
    const result = await query(
      `SELECT
        s.*,
        c.code as country_code,
        c.currency_code
      FROM supermarkets s
      INNER JOIN countries c ON s.country_id = c.id
      WHERE s.id = $1`,
      [supermarketId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all active supermarkets
   */
  private async getActiveSupermarkets(): Promise<any[]> {
    const result = await query(
      `SELECT * FROM supermarkets WHERE is_active = true ORDER BY name`
    );

    return result.rows;
  }

  /**
   * Create scrape log entry
   */
  private async createScrapeLog(
    supermarketId: string,
    status: string
  ): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO scrape_logs (
        supermarket_id,
        status,
        started_at
      ) VALUES ($1, $2, CURRENT_TIMESTAMP)
      RETURNING id`,
      [supermarketId, status]
    );

    return result.rows[0].id;
  }

  /**
   * Update scrape log with results
   */
  private async updateScrapeLog(
    logId: string,
    status: string,
    data: {
      productsScraped?: number;
      productsFailed?: number;
      error?: string;
      duration?: number;
    }
  ): Promise<void> {
    // Convert milliseconds to seconds for database
    const durationSeconds = data.duration ? Math.round(data.duration / 1000) : null;

    await query(
      `UPDATE scrape_logs
       SET
         status = $2,
         products_scraped = $3,
         products_failed = $4,
         error_message = $5,
         duration_seconds = $6,
         completed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        logId,
        status,
        data.productsScraped || null,
        data.productsFailed || null,
        data.error || null,
        durationSeconds,
      ]
    );
  }

  /**
   * Get scrape history for a supermarket
   */
  async getScrapeHistory(
    supermarketId: string,
    limit: number = 10
  ): Promise<any[]> {
    const result = await query(
      `SELECT
        sl.*,
        s.name as supermarket_name
      FROM scrape_logs sl
      INNER JOIN supermarkets s ON sl.supermarket_id = s.id
      WHERE sl.supermarket_id = $1
      ORDER BY sl.started_at DESC
      LIMIT $2`,
      [supermarketId, limit]
    );

    return result.rows;
  }

  /**
   * Get latest scrape statistics
   */
  async getLatestStats(): Promise<any> {
    const result = await query(`
      SELECT
        s.name as supermarket_name,
        c.name as country_name,
        sl.status,
        sl.products_scraped,
        sl.duration_seconds,
        sl.completed_at
      FROM scrape_logs sl
      INNER JOIN supermarkets s ON sl.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE sl.id IN (
        SELECT MAX(id)
        FROM scrape_logs
        GROUP BY supermarket_id
      )
      ORDER BY sl.completed_at DESC
    `);

    return result.rows;
  }

  /**
   * Build empty result for failed scrapes
   */
  private buildEmptyResult(
    supermarketId: string,
    errorMessage: string
  ): ScrapeResult {
    return {
      supermarketId,
      products: [],
      scrapedAt: new Date(),
      duration: 0,
      productsScraped: 0,
      productsFailed: 0,
      errors: [
        {
          message: errorMessage,
          timestamp: new Date(),
        },
      ],
    };
  }

  /**
   * Helper to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get available categories for a supermarket
   */
  async getAvailableCategories(supermarketId: string): Promise<CategoryConfig[]> {
    const supermarket = await this.getSupermarketConfig(supermarketId);

    if (!supermarket) {
      return [];
    }

    // Get categories from the scraper configuration
    return getScraperCategories(supermarket.scraper_class);
  }
}
