import { BaseScraper } from '../scrapers/base/BaseScraper';
import { ScraperFactory, CreateScraperOptions } from '../scrapers/base/ScraperFactory';
import { ProductService } from './ProductService';
import { supermarketRepository, scrapeLogRepository } from '../repositories';
import { scraperLogger } from '../utils/logger';
import { ProductData, ScrapeResult, CategoryConfig, PageInfo } from '../types/scraper.types';
import { calculatePricePerUnit } from '../utils/normalizer';
import { getScraperCategories } from '../scrapers/scraperRegistry';
import { generateRunId } from '../utils/runId';

export interface RunScraperOptions {
  categoryIds?: string[];
}

export class ScraperService {
  private productService: ProductService;

  constructor() {
    this.productService = new ProductService();
  }

  async runScraper(supermarketId: string, options?: RunScraperOptions): Promise<ScrapeResult> {
    const runId = generateRunId();
    const categoryInfo = options?.categoryIds?.length
      ? ` (categories: ${options.categoryIds.join(', ')})`
      : '';
    scraperLogger.info(`Starting scraper for supermarket: ${supermarketId}${categoryInfo} [${runId}]`);

    let scraper: BaseScraper | null = null;
    let scrapeLogId: string | null = null;
    const startTime = Date.now();
    let totalStoredCount = 0;

    try {
      const supermarket = await supermarketRepository.findById(supermarketId);

      if (!supermarket) {
        throw new Error(`Supermarket not found: ${supermarketId}`);
      }
      if (!supermarket.is_active) {
        scraperLogger.warn(`Supermarket is not active: ${supermarket.name}`);
        return this.buildEmptyResult(supermarketId, 'Supermarket not active');
      }

      scrapeLogId = await scrapeLogRepository.create(supermarketId, 'running');

      const scraperOptions: CreateScraperOptions = { categoryIds: options?.categoryIds };
      scraper = ScraperFactory.createFromSupermarket(supermarket as any, scraperOptions);
      scraper.setRunId(runId);

      scraper.setOnPageScrapedCallback(async (products: ProductData[], pageInfo: PageInfo): Promise<number> => {
        const savedCount = await this.storeProducts(products, supermarketId);
        totalStoredCount += savedCount;
        scraperLogger.debug(
          `Page callback: saved ${savedCount}/${products.length} products from ${pageInfo.categoryName} page ${pageInfo.pageNumber}`
        );
        return savedCount;
      });

      await scraper.initialize();
      const products = await scraper.scrapeProductList();

      scraperLogger.info(
        `Scraped ${products.length} products from ${supermarket.name}, stored ${totalStoredCount}`
      );

      if (scrapeLogId) {
        await scrapeLogRepository.update(scrapeLogId, 'success', {
          productsScraped: totalStoredCount,
          duration: Date.now() - startTime,
        });
      }

      const result: ScrapeResult = {
        supermarketId,
        products: products.map(p => ({
          ...p,
          normalizedName: p.name,
          pricePerUnit: calculatePricePerUnit(p.price, p.unitQuantity, p.unit),
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      scraperLogger.error(`Scraping failed for supermarket ${supermarketId}:`, error);

      if (scrapeLogId) {
        await scrapeLogRepository.update(scrapeLogId, 'failed', {
          error: errorMessage,
          duration: Date.now() - startTime,
        });
      }

      return this.buildEmptyResult(supermarketId, errorMessage);
    } finally {
      if (scraper) await scraper.cleanup();
    }
  }

  async runAllScrapers(concurrency: number = 3): Promise<ScrapeResult[]> {
    scraperLogger.info(`Starting scrape for all active supermarkets (concurrency: ${concurrency})`);

    const supermarkets = await supermarketRepository.getActive();
    scraperLogger.info(`Found ${supermarkets.length} active supermarkets to scrape`);

    const results: ScrapeResult[] = [];
    const queue = [...supermarkets];
    const running: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      const supermarket = queue.shift();
      if (!supermarket) return;

      try {
        scraperLogger.info(`[Pool] Starting: ${supermarket.name}`);
        const result = await this.runScraper(supermarket.id);
        results.push(result);
        scraperLogger.info(`[Pool] Completed: ${supermarket.name} (${result.productsScraped} products)`);
      } catch (error) {
        scraperLogger.error(`Failed to run scraper for ${supermarket.name}:`, error);
      }

      await runNext();
    };

    for (let i = 0; i < Math.min(concurrency, supermarkets.length); i++) {
      running.push(runNext());
    }

    await Promise.all(running);

    scraperLogger.info(`Completed scraping all supermarkets. Total results: ${results.length}`);
    return results;
  }

  private async storeProducts(products: ProductData[], supermarketId: string): Promise<number> {
    if (products.length === 0) return 0;

    const currency = products[0].currency;
    try {
      return await this.productService.bulkSaveProducts(products, supermarketId, currency);
    } catch (error) {
      scraperLogger.error('Bulk save failed, falling back to individual saves', error);

      let storedCount = 0;
      for (const product of products) {
        try {
          const mappingId = await this.productService.findOrCreateProduct(product, supermarketId);
          await this.productService.recordPrice(mappingId, {
            price: product.price,
            currency: product.currency,
            originalPrice: product.originalPrice,
            isOnSale: product.isOnSale,
            pricePerUnit: calculatePricePerUnit(product.price, product.unitQuantity, product.unit),
          });
          storedCount++;
        } catch (err) {
          scraperLogger.error(`Failed to store product: ${product.name}`, err);
        }
      }
      return storedCount;
    }
  }

  async getScrapeHistory(supermarketId: string, limit: number = 10): Promise<Record<string, unknown>[]> {
    return scrapeLogRepository.getHistoryForSupermarket(supermarketId, limit);
  }

  async getLatestStats(): Promise<Record<string, unknown>[]> {
    return scrapeLogRepository.getLatestStats();
  }

  async getAvailableCategories(supermarketId: string): Promise<CategoryConfig[]> {
    const supermarket = await supermarketRepository.findById(supermarketId);
    if (!supermarket) return [];
    return getScraperCategories(supermarket.scraper_class ?? '');
  }

  private buildEmptyResult(supermarketId: string, errorMessage: string): ScrapeResult {
    return {
      supermarketId,
      products: [],
      scrapedAt: new Date(),
      duration: 0,
      productsScraped: 0,
      productsFailed: 0,
      errors: [{ message: errorMessage, timestamp: new Date() }],
    };
  }
}
