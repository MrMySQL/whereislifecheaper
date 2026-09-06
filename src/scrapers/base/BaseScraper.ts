import { interpretProductQuantity } from '../../utils/productQuantity';
import { Browser, Page, chromium } from 'playwright';
import { createPrefixedLogger } from '../../utils/logger';
import { retry, sleep } from '../../utils/retry';
import { config } from '../../config/env';
import {
  ScraperConfig,
  ProductData,
  ScrapeResult,
  ScrapeError,
  OnPageScrapedCallback,
  CategoryConfig,
} from '../../types/scraper.types';
import path from 'path';
import fs from 'fs';

/**
 * An error that makes the rest of the run pointless.
 *
 * scrapeProductList catches whatever scrapeCategory throws and moves on to
 * the next category; that is right for a blocked page and wrong for a lost
 * session, where every later category fails the same way and only burns the
 * deadline. Throw (a subclass of) this to stop the run instead.
 */
export class FatalScrapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalScrapeError';
  }
}

/**
 * A failed HTTP request that knows which URL it was for, so a catch that
 * covers several parallel requests can still report the one that failed.
 */
export class RequestFailure extends Error {
  constructor(public readonly url: string, message: string) {
    super(message);
    this.name = 'RequestFailure';
  }
}

/**
 * Abstract base class for all scrapers
 * Provides common functionality for browser management, error handling, and logging
 */
export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected config: ScraperConfig;
  protected startTime: number = 0;
  protected productsScraped: number = 0;
  protected productsFailed: number = 0;
  /** Page and product errors: logError(). A lost page is not a lost category. */
  protected errors: ScrapeError[] = [];
  /**
   * Category outcomes for this run. A scraper that loses most of its
   * categories but still stores something from the rest used to be
   * indistinguishable from a healthy run — see getCategoryStats().
   *
   * Kept in their own buffer, not mixed into `errors`: ScraperService reports
   * this list as "categories failed", and a page error in there would name a
   * category that actually came through.
   */
  protected categoryErrors: ScrapeError[] = [];
  protected categoriesAttempted: number = 0;
  protected categoriesFailed: number = 0;
  private failedCategoryIds = new Set<string>();
  /** The category scrapeProductList is inside, so failCategory() can defer to it. */
  private currentCategoryId: string | null = null;
  private pendingCategoryFailure: ScrapeError | null = null;
  protected onPageScraped?: OnPageScrapedCallback;
  protected logger: ReturnType<typeof createPrefixedLogger>;

  protected runId?: string;

  constructor(config: ScraperConfig) {
    this.config = config;
    this.logger = createPrefixedLogger(config.name);
  }

  /**
   * Set a unique run ID for this scraping session.
   * Updates the logger prefix to include the run ID for log filtering.
   */
  setRunId(runId: string): void {
    this.runId = runId;
    this.logger = createPrefixedLogger(`${this.config.name}|${runId}`);
  }

  /**
   * Set callback to be called after each page is scraped
   * This allows incremental saving of products
   */
  setOnPageScrapedCallback(callback: OnPageScrapedCallback): void {
    this.onPageScraped = callback;
  }

  /**
   * Initialize the scraper - must be called before scraping
   */
  abstract initialize(): Promise<void>;

  /**
   * Scrape a single category and return its products.
   * This is the main method that subclasses must implement.
   *
   * Contract for failures: throw, or call failCategory() (the category is
   * being given up) or logError() (a page or product was lost) before
   * returning what was collected. A category that returns nothing with
   * nothing reported is taken as empty, not as lost — the base class can
   * only count what it is told about, so a failure logged through the plain
   * logger vanishes from the run's health.
   */
  protected abstract scrapeCategory(category: CategoryConfig): Promise<ProductData[]>;

  /**
   * Scrape detailed information for a single product
   */
  abstract scrapeProductDetails(url: string): Promise<ProductData>;

  /**
   * Cleanup resources - must be called after scraping
   */
  abstract cleanup(): Promise<void>;

  /**
   * Scrape the product list from all category pages.
   * Default implementation using template method pattern.
   * Iterates over all categories and calls scrapeCategory for each.
   * Can be overridden if special handling is needed.
   */
  async scrapeProductList(): Promise<ProductData[]> {
    const allProducts: ProductData[] = [];

    this.logger.info(
      `Starting to scrape ${this.config.name} (${this.config.categories.length} categories)...`
    );

    for (const category of this.config.categories) {
      this.categoriesAttempted++;
      this.currentCategoryId = category.id;
      this.pendingCategoryFailure = null;
      const errorsBefore = this.errors.length;
      let categoryProducts: ProductData[] = [];
      try {
        this.logger.info(`Scraping category: ${category.name} (${category.id})`);

        categoryProducts = await this.scrapeCategory(category);
        allProducts.push(...categoryProducts);

        this.logger.info(
          `Scraped ${categoryProducts.length} products from ${category.name}`
        );
      } catch (error) {
        if (error instanceof FatalScrapeError) {
          this.currentCategoryId = null;
          throw error;
        }
        this.failCategory(category, error);
      }

      // Whether the category is lost is decided here, on what it returned,
      // not inside scrapeCategory: most scrapers catch their own failure and
      // return what they have, and a category that saved 44 pages before the
      // 45th died came through. One that returned nothing after an error did
      // not — a category with no products has no successful request behind
      // it, so any error logged during it is the request that would have
      // produced them. (A category that is empty and logged nothing is just
      // empty.)
      const reported = this.takePendingCategoryFailure();
      this.currentCategoryId = null;
      const errorsDuring = this.errors.length - errorsBefore;
      const produced = categoryProducts.length;
      const lost = produced === 0 && (reported !== null || errorsDuring > 0);
      if (lost) {
        const last = this.errors[this.errors.length - 1];
        this.recordCategoryFailure(category, reported ?? {
          productUrl: last.productUrl,
          message:
            `Failed to scrape category: ${category.name} ` +
            `(${errorsDuring} error${errorsDuring === 1 ? '' : 's'}, last: ${last.message})`,
          timestamp: new Date(),
        });
      } else if (reported !== null) {
        const message = `${reported.message} — after ${produced} product${produced === 1 ? '' : 's'}`;
        this.logger.warn(`Category came through partially: ${message}`);
        this.errors.push({ ...reported, message });
      }

      if (!lost) {
        // Wait between categories
        await this.waitBetweenRequests();
      }
    }

    if (this.categoriesFailed > 0) {
      this.logger.warn(
        `${this.categoriesFailed} of ${this.categoriesAttempted} categories failed`
      );
    }
    this.logger.info(`Total products scraped: ${allProducts.length}`);
    return allProducts;
  }

  /**
   * Parse proxy URL into Playwright proxy config
   */
  private parseProxyUrl(proxyUrl: string): { server: string; username?: string; password?: string } {
    const url = new URL(proxyUrl);
    return {
      server: `${url.protocol}//${url.host}`,
      username: url.username || undefined,
      password: url.password || undefined,
    };
  }

  /**
   * Get the proxy URL for this supermarket (if configured)
   * Matches supermarket name against proxy config keys (partial, case-insensitive)
   */
  private getProxyUrl(): string | undefined {
    const proxyConfig = config.scraper.proxyConfig;
    if (proxyConfig.size === 0) return undefined;

    const supermarketName = this.config.name.toLowerCase();

    // Find matching proxy config entry
    for (const [key, url] of proxyConfig.entries()) {
      if (supermarketName.includes(key)) {
        return url;
      }
    }
    return undefined;
  }

  /**
   * Launch browser with configured options
   */
  protected async launchBrowser(): Promise<void> {
    this.logger.info(`Launching browser for ${this.config.name}`);

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: config.scraper.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    };

    // Add proxy if configured for this supermarket
    const proxyUrl = this.getProxyUrl();
    if (proxyUrl) {
      launchOptions.proxy = this.parseProxyUrl(proxyUrl);
      this.logger.info(`Using proxy: ${launchOptions.proxy.server}`);
    }

    this.browser = await chromium.launch(launchOptions);

    this.logger.info(`Browser launched for ${this.config.name}`);
  }

  /**
   * Create a new page with configured settings
   */
  protected async createPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call launchBrowser() first.');
    }

    const page = await this.browser.newPage({
      userAgent: this.getUserAgent(),
      viewport: { width: 1920, height: 1080 },
    });

    // Set extra headers if configured
    if (this.config.headers) {
      await page.setExtraHTTPHeaders(this.config.headers);
    }

    // Set cookies if configured
    if (this.config.cookies) {
      const context = page.context();
      await context.addCookies(this.config.cookies);
    }

    // Handle console messages
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.logger.debug(`Browser console error: ${msg.text()}`);
      }
    });

    return page;
  }

  /**
   * Get a random user agent or the configured one
   */
  protected getUserAgent(): string {
    if (this.config.userAgents && this.config.userAgents.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.config.userAgents.length);
      return this.config.userAgents[randomIndex];
    }

    // Default user agent
    return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  /**
   * Navigate to a URL with retry logic
   */
  protected async navigateToUrl(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    await retry(
      async () => {
        this.logger.debug(`Navigating to: ${url}`);
        await this.page!.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: config.scraper.timeout,
        });
        await sleep(this.config.waitTimes.pageLoad);
      },
      {
        maxRetries: this.config.maxRetries,
        initialDelay: 2000,
        onRetry: (attempt, error) => {
          this.logger.warn(`Navigation retry ${attempt} for ${url}:`, error.message);
        },
      }
    );
  }

  /**
   * Wait for dynamic content to load
   */
  protected async waitForDynamicContent(): Promise<void> {
    await sleep(this.config.waitTimes.dynamicContent);
  }

  /**
   * Wait between requests to avoid rate limiting
   */
  protected async waitBetweenRequests(): Promise<void> {
    const delay = this.config.waitTimes.betweenRequests;
    // Add random jitter to avoid pattern detection
    const jitter = Math.random() * 500;
    await sleep(delay + jitter);
  }

  /**
   * Handle anti-bot detection
   * Override this in specific scrapers if needed
   */
  protected async handleAntiBot(): Promise<void> {
    if (!this.page) return;

    // Random mouse movements
    await this.page.mouse.move(
      Math.random() * 100,
      Math.random() * 100
    );

    // Random scrolling
    await this.page.evaluate(() => {
      window.scrollBy(0, Math.random() * 300);
    });

    await sleep(500 + Math.random() * 1000);
  }

  /**
   * Take a screenshot for debugging
   */
  protected async takeScreenshot(name: string): Promise<void> {
    if (!this.page) return;

    try {
      const screenshotsDir = path.join(process.cwd(), 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}_${timestamp}.png`;
      const filepath = path.join(screenshotsDir, filename);

      await this.page.screenshot({ path: filepath, fullPage: true });
      this.logger.info(`Screenshot saved: ${filepath}`);
    } catch (error) {
      this.logger.error('Failed to take screenshot:', error);
    }
  }

  /**
   * Extract text from element safely
   */
  protected async extractText(
    selector: string,
    defaultValue: string = ''
  ): Promise<string> {
    if (!this.page) return defaultValue;

    try {
      const element = await this.page.$(selector);
      if (!element) return defaultValue;

      const text = await element.textContent();
      return text?.trim() || defaultValue;
    } catch (error) {
      this.logger.debug(`Failed to extract text from ${selector}:`, error);
      return defaultValue;
    }
  }

  /**
   * Extract attribute from element safely
   */
  protected async extractAttribute(
    selector: string,
    attribute: string,
    defaultValue: string = ''
  ): Promise<string> {
    if (!this.page) return defaultValue;

    try {
      const element = await this.page.$(selector);
      if (!element) return defaultValue;

      const value = await element.getAttribute(attribute);
      return value || defaultValue;
    } catch (error) {
      this.logger.debug(`Failed to extract ${attribute} from ${selector}:`, error);
      return defaultValue;
    }
  }

  /**
   * Check if element exists
   */
  protected async elementExists(selector: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      const element = await this.page.$(selector);
      return element !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Retry a function with error handling
   */
  protected async retryOnFailure<T>(
    fn: () => Promise<T>,
    context: string
  ): Promise<T> {
    return retry(fn, {
      maxRetries: this.config.maxRetries,
      initialDelay: 1000,
      onRetry: (attempt, error) => {
        this.logger.warn(`${context} - Retry ${attempt}:`, error.message);
      },
    });
  }

  /**
   * Log an error for later reporting
   */
  protected logError(message: string, productUrl?: string, error?: Error): void {
    const scrapeError: ScrapeError = {
      productUrl,
      message,
      stack: error?.stack,
      timestamp: new Date(),
    };

    this.errors.push(scrapeError);
    this.productsFailed++;

    this.logger.error(message, {
      productUrl,
      error: error?.message,
      supermarket: this.config.name,
    });
  }

  /**
   * Report that scraping a category failed.
   *
   * Call this from a scrapeCategory that catches its own failure and returns
   * what it has (the common shape) instead of logError(): logError() records
   * a page or product error, and nothing downstream reads those as "the
   * category failed". Whether the category counts as lost is settled by
   * scrapeProductList once scrapeCategory returns — lost if it returned no
   * products, a page-level error otherwise. Reporting a category more than
   * once, say marking it and then rethrowing, keeps the first report.
   *
   * Outside scrapeProductList (a scraper that overrides it) there is nothing
   * to defer to, and the report counts as a lost category immediately.
   */
  protected failCategory(category: CategoryConfig, error?: unknown, productUrl?: string): void {
    const cause = error instanceof Error ? error : undefined;
    const detail = cause ? cause.message : typeof error === 'string' ? error : undefined;
    const message = `Failed to scrape category: ${category.name}${detail ? ` (${detail})` : ''}`;

    this.logger.error(message, {
      productUrl,
      error: cause?.message,
      supermarket: this.config.name,
    });

    const entry: ScrapeError = { productUrl, message, stack: cause?.stack, timestamp: new Date() };
    if (this.currentCategoryId === category.id) {
      this.pendingCategoryFailure ??= entry;
      return;
    }
    this.recordCategoryFailure(category, entry);
  }

  /** In a method so the compiler does not narrow the field across the awaited scrape. */
  private takePendingCategoryFailure(): ScrapeError | null {
    const reported = this.pendingCategoryFailure;
    this.pendingCategoryFailure = null;
    return reported;
  }

  private recordCategoryFailure(category: CategoryConfig, entry: ScrapeError): void {
    if (this.failedCategoryIds.has(category.id)) return;
    this.failedCategoryIds.add(category.id);
    this.categoriesFailed++;
    this.categoryErrors.push(entry);
  }

  /**
   * Build scrape result
   */
  protected buildScrapeResult(products: ProductData[]): ScrapeResult {
    const duration = Date.now() - this.startTime;

    return {
      supermarketId: this.config.supermarketId,
      products: products.map((p) => ({
        ...p,
        normalizedName: p.name, // Will be normalized by the service
        pricePerUnit: interpretProductQuantity(p).comparablePrice ?? undefined,
      })),
      scrapedAt: new Date(),
      duration,
      productsScraped: this.productsScraped,
      productsFailed: this.productsFailed,
      errors: this.errors,
      categoryErrors: this.categoryErrors,
      categoriesAttempted: this.categoriesAttempted,
      categoriesFailed: this.categoriesFailed,
    };
  }

  /**
   * Close browser and cleanup
   */
  protected async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.logger.info(`Browser closed for ${this.config.name}`);
  }

  /**
   * Page and product errors collected during this run. Category failures are
   * not in here — see getCategoryErrors().
   */
  public getErrors(): ScrapeError[] {
    return [...this.errors];
  }

  /**
   * One entry per category this run lost, whether it threw, marked itself
   * failed via failCategory(), or came back empty after logging errors.
   */
  public getCategoryErrors(): ScrapeError[] {
    return [...this.categoryErrors];
  }

  /**
   * How many categories this run attempted, and how many of them failed.
   *
   * A scraper that overrides scrapeProductList without keeping the counters
   * reports 0 attempted, which callers read as "no category signal" rather
   * than as a clean run.
   */
  public getCategoryStats(): { attempted: number; failed: number } {
    return { attempted: this.categoriesAttempted, failed: this.categoriesFailed };
  }

  /**
   * Get scraping statistics
   */
  public getStats() {
    return {
      supermarket: this.config.name,
      productsScraped: this.productsScraped,
      productsFailed: this.productsFailed,
      errorCount: this.errors.length,
      duration: Date.now() - this.startTime,
    };
  }
}
