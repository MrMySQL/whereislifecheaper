import { BaseScraper } from '../scrapers/base/BaseScraper';
import { ScraperFactory, CreateScraperOptions } from '../scrapers/base/ScraperFactory';
import { ProductService } from './ProductService';
import { SupermarketRepository, ScrapeLogRepository } from '../repositories';
import { supermarketRepository as defaultSupermarketRepo, scrapeLogRepository as defaultScrapeLogRepo } from '../repositories';
import { scraperLogger } from '../utils/logger';
import { ProductData, ScrapeResult, CategoryConfig, PageInfo } from '../types/scraper.types';
import { ScrapeLogWithSupermarket, ScrapeLogLatestStats } from '../types/db.types';
import { calculatePricePerUnit } from '../utils/normalizer';
import { getScraperCategories } from '../scrapers/scraperRegistry';
import { generateRunId } from '../utils/runId';

export interface RunScraperOptions {
  categoryIds?: string[];
  /** Wall-clock budget for this scraper, in ms. Defaults to SCRAPER_DEADLINE_MS. */
  deadlineMs?: number;
}

/**
 * Wall-clock budget for a single scraper.
 *
 * Without this, one scraper that never returns holds the whole run open until
 * the CI job is killed — which is exactly what Woolworths did from 2026-04-28
 * to 2026-08-01, costing 33 consecutive runs. The default leaves room for the
 * slowest healthy scraper (Voli, ~28 min on the 2026-08-01 run) with margin.
 */
export const FALLBACK_SCRAPER_DEADLINE_MS = 45 * 60 * 1000;

/**
 * Resolve SCRAPER_DEADLINE_MS, falling back to the default rather than
 * disabling the safeguard. `SCRAPER_DEADLINE_MS=0` or a typo'd value used to
 * parse to 0/NaN, which `withDeadline` reads as "no deadline" — silently
 * restoring the exact failure mode this whole change exists to prevent.
 */
export function resolveDeadlineMs(raw = process.env.SCRAPER_DEADLINE_MS): number {
  if (raw === undefined || raw.trim() === '') return FALLBACK_SCRAPER_DEADLINE_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    scraperLogger.warn(
      `Ignoring invalid SCRAPER_DEADLINE_MS="${raw}" — using the ${FALLBACK_SCRAPER_DEADLINE_MS}ms default. ` +
      `A deadline can only be disabled per call, never by configuration.`
    );
    return FALLBACK_SCRAPER_DEADLINE_MS;
  }
  return parsed;
}

export const DEFAULT_SCRAPER_DEADLINE_MS = resolveDeadlineMs();

/** Thrown when a scraper exceeds its wall-clock budget. */
export class ScraperDeadlineError extends Error {
  constructor(public readonly deadlineMs: number) {
    super(`Scraper exceeded its ${Math.round(deadlineMs / 60000)} minute deadline`);
    this.name = 'ScraperDeadlineError';
  }
}

export class ScraperService {
  private productService: ProductService;
  private supermarketRepository: SupermarketRepository;
  private scrapeLogRepository: ScrapeLogRepository;
  /** scrape_logs rows this process opened and has not closed yet, id -> supermarket. */
  private readonly inFlightLogs = new Map<string, string>();
  /** Set once a signal handler has closed the in-flight rows; see markInFlightFailed. */
  private shuttingDown = false;

  constructor(
    productService?: ProductService,
    supermarketRepo?: SupermarketRepository,
    scrapeLogRepo?: ScrapeLogRepository,
  ) {
    this.productService = productService ?? new ProductService();
    this.supermarketRepository = supermarketRepo ?? defaultSupermarketRepo;
    this.scrapeLogRepository = scrapeLogRepo ?? defaultScrapeLogRepo;
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

    // Clock starts here so lookup, browser launch and scrape all draw on one
    // budget. `remaining()` never returns 0 while a budget is in force, since
    // withDeadline reads 0 as "unbounded".
    const budgetMs = options?.deadlineMs ?? DEFAULT_SCRAPER_DEADLINE_MS;
    const bounded = Number.isFinite(budgetMs) && budgetMs > 0;
    const deadlineAt = startTime + budgetMs;
    const remaining = () => (bounded ? Math.max(1, deadlineAt - Date.now()) : 0);

    try {
      // Setup is inside the budget as well: a wedged connection pool or a
      // lock on scrape_logs would otherwise hang the run before the first
      // timed call is ever reached.
      const supermarket = await this.withDeadline(
        this.supermarketRepository.findById(supermarketId), remaining(), budgetMs
      );

      if (!supermarket) {
        throw new Error(`Supermarket not found: ${supermarketId}`);
      }
      if (!supermarket.is_active) {
        scraperLogger.warn(`Supermarket is not active: ${supermarket.name}`);
        return this.buildEmptyResult(supermarketId, 'Supermarket not active');
      }

      // Nothing to gain from opening a row this process has already committed
      // to abandoning.
      if (this.shuttingDown) {
        return this.buildEmptyResult(supermarketId, 'Shutting down');
      }

      // The insert can outlive the deadline that is racing it. Either way the
      // row it creates has to be accounted for: this run owns it, or it is
      // closed straight away. A row nobody owns sits on 'running' until
      // reapStaleRuns finds it eight hours later.
      const creating = this.scrapeLogRepository.create(supermarketId, 'running');
      let owned = true;
      void creating.then(
        id => {
          this.inFlightLogs.set(id, supermarket.name);
          // Abandoned by the deadline, or by a signal that arrived while the
          // insert was still in flight.
          if (!owned || this.shuttingDown) {
            void this.closeInFlight(id, 'scrape_logs row created after its run was abandoned');
          }
        },
        () => undefined,
      );

      try {
        scrapeLogId = await this.withDeadline(creating, remaining(), budgetMs);
      } catch (error) {
        owned = false;
        throw error;
      }

      const scraperOptions: CreateScraperOptions = { categoryIds: options?.categoryIds };
      scraper = ScraperFactory.createFromSupermarket(supermarket, scraperOptions);
      scraper.setRunId(runId);

      scraper.setOnPageScrapedCallback(async (products: ProductData[], pageInfo: PageInfo): Promise<number> => {
        const savedCount = await this.storeProducts(products, supermarketId);
        totalStoredCount += savedCount;
        scraperLogger.debug(
          `Page callback: saved ${savedCount}/${products.length} products from ${pageInfo.categoryName} page ${pageInfo.pageNumber}`
        );
        return savedCount;
      });

      // The budget covers the whole lifecycle, not just the scrape: a browser
      // that never launches holds the run open just as effectively as a
      // scrape that never returns, and initialize() is a network call too.
      await this.withDeadline(scraper.initialize(), remaining(), budgetMs);
      const products = await this.withDeadline(scraper.scrapeProductList(), remaining(), budgetMs);

      scraperLogger.info(
        `Scraped ${products.length} products from ${supermarket.name}, stored ${totalStoredCount}`
      );

      // A scraper that returns cleanly but stores nothing is not a success —
      // a swallowed API error, a captcha, or a dead category all look like
      // this, and recording them as 'success' is what hid REWE's 0-product
      // runs for three months.
      const status = totalStoredCount === 0 ? 'partial' : 'success';
      if (status === 'partial') {
        scraperLogger.warn(
          `${supermarket.name} completed without storing any products — recording as 'partial'`
        );
      }

      if (scrapeLogId && !this.shuttingDown) {
        // onlyIfRunning: the flag above is read one await before this write
        // lands, so shutdown can still slip in between. The database is the
        // only place the two writers can actually be ordered.
        await this.scrapeLogRepository.update(scrapeLogId, status, {
          productsScraped: totalStoredCount,
          error: status === 'partial' ? 'Completed but stored 0 products' : undefined,
          duration: Date.now() - startTime,
          onlyIfRunning: true,
        });
        this.inFlightLogs.delete(scrapeLogId);
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
      const timedOut = error instanceof ScraperDeadlineError;

      if (timedOut) {
        scraperLogger.error(
          `Scraper for supermarket ${supermarketId} hit its deadline after ` +
          `${Math.round((Date.now() - startTime) / 1000)}s; ${totalStoredCount} products were stored before the cut`
        );
      } else {
        scraperLogger.error(`Scraping failed for supermarket ${supermarketId}:`, error);
      }

      // Products are persisted incrementally by the page callback, so a
      // deadline that lands mid-run still leaves real data behind.
      if (scrapeLogId && !this.shuttingDown) {
        await this.scrapeLogRepository.update(scrapeLogId, timedOut && totalStoredCount > 0 ? 'partial' : 'failed', {
          productsScraped: totalStoredCount,
          error: errorMessage,
          duration: Date.now() - startTime,
          onlyIfRunning: true,
        });
        this.inFlightLogs.delete(scrapeLogId);
      }

      const result = this.buildEmptyResult(supermarketId, errorMessage);
      result.productsScraped = totalStoredCount;
      result.duration = Date.now() - startTime;
      return result;
    } finally {
      // cleanup() closes the browser, which is what actually stops a scraper
      // that blew its deadline — Promise.race alone leaves it running.
      if (scraper) await scraper.cleanup();
    }
  }

  /**
   * Reject with ScraperDeadlineError if `promise` has not settled in time.
   *
   * The underlying work is not cancellable, so it keeps going until the caller
   * closes the browser in its finally block; its eventual settlement is
   * swallowed here so it cannot surface as an unhandled rejection.
   */
  private withDeadline<T>(promise: Promise<T>, timeoutMs: number, budgetMs = timeoutMs): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

    promise.catch(() => undefined);

    let timer: NodeJS.Timeout | undefined;
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        // Reports the full budget, not the slice left for this step.
        timer = setTimeout(() => reject(new ScraperDeadlineError(budgetMs)), timeoutMs);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    }) as Promise<T>;
  }

  async runAllScrapers(concurrency: number = 3): Promise<ScrapeResult[]> {
    // Math.min(0 | NaN, n) leaves the worker pool empty, so the run would
    // finish instantly with zero results and report success.
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error(`Invalid concurrency: ${concurrency}. Expected a positive integer.`);
    }
    scraperLogger.info(`Starting scrape for all active supermarkets (concurrency: ${concurrency})`);

    // A run killed mid-scraper (CI timeout, SIGKILL) leaves its 'running' row
    // behind forever, which permanently inflates the admin status endpoint.
    const reaped = await this.scrapeLogRepository.reapStaleRuns();
    if (reaped > 0) {
      scraperLogger.warn(`Reaped ${reaped} stale 'running' scrape_logs row(s) from previous runs`);
    }

    const supermarkets = await this.supermarketRepository.getActive();
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
        // runScraper handles its own failures, so reaching here means
        // something outside it threw (cleanup, a repository write). Dropping
        // the result entirely is what let the caller exit 0 on a run where a
        // scraper never produced one.
        scraperLogger.error(`Failed to run scraper for ${supermarket.name}:`, error);
        results.push(
          this.buildEmptyResult(
            supermarket.id,
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
      }

      await runNext();
    };

    for (let i = 0; i < Math.min(concurrency, supermarkets.length); i++) {
      running.push(runNext());
    }

    await Promise.all(running);

    const empty = results.filter(r => r.productsScraped === 0);
    const errored = results.filter(r => r.errors.length > 0);
    scraperLogger.info(
      `Completed scraping all supermarkets. ${results.length}/${supermarkets.length} ran, ` +
      `${empty.length} stored nothing, ${errored.length} reported errors`
    );

    // Every active supermarket must be accounted for; a caller deciding the
    // run's exit code can only see what is in this array.
    const accountedFor = new Set(results.map(r => r.supermarketId));
    for (const supermarket of supermarkets) {
      if (accountedFor.has(supermarket.id)) continue;
      scraperLogger.error(`No result recorded for ${supermarket.name} — reporting it as failed`);
      results.push(this.buildEmptyResult(supermarket.id, 'Scraper produced no result'));
    }

    return results;
  }

  /**
   * Close out any scrape_logs row this process left on 'running'.
   *
   * reapStaleRuns only fires at the start of the next full run and only after
   * 8 hours, so without this a Ctrl-C or a cancelled CI job leaves the admin
   * status endpoint claiming a scrape is still in progress.
   */
  async markInFlightFailed(reason: string): Promise<number> {
    // Stops runScraper opening or reopening rows once shutdown has begun.
    this.shuttingDown = true;

    let closed = 0;
    for (const logId of [...this.inFlightLogs.keys()]) {
      closed += await this.closeInFlight(logId, reason);
    }
    return closed;
  }

  /**
   * Close one tracked row, keeping it tracked if the write fails.
   *
   * Guarded in SQL, so a scraper that finished between the caller deciding to
   * close the row and this write landing keeps the status it earned. A
   * dropped id is a row stranded on 'running', so the entry survives a throw
   * and a later call can retry it.
   */
  private async closeInFlight(logId: string, reason: string): Promise<number> {
    try {
      const closed = await this.scrapeLogRepository.failIfRunning(logId, reason);
      this.inFlightLogs.delete(logId);
      return closed;
    } catch (error) {
      scraperLogger.error(`Could not close scrape log ${logId}:`, error);
      return 0;
    }
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

  async getScrapeHistory(supermarketId: string, limit: number = 10): Promise<ScrapeLogWithSupermarket[]> {
    return this.scrapeLogRepository.getHistoryForSupermarket(supermarketId, limit);
  }

  async getLatestStats(): Promise<ScrapeLogLatestStats[]> {
    return this.scrapeLogRepository.getLatestStats();
  }

  async getAvailableCategories(supermarketId: string): Promise<CategoryConfig[]> {
    const supermarket = await this.supermarketRepository.findById(supermarketId);
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
