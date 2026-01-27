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
  protected errors: ScrapeError[] = [];
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
      try {
        this.logger.info(`Scraping category: ${category.name} (${category.id})`);

        const categoryProducts = await this.scrapeCategory(category);
        allProducts.push(...categoryProducts);

        this.logger.info(
          `Scraped ${categoryProducts.length} products from ${category.name}`
        );

        // Wait between categories
        await this.waitBetweenRequests();
      } catch (error) {
        this.logError(
          `Failed to scrape category: ${category.name}`,
          undefined,
          error as Error
        );
      }
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
   * Build scrape result
   */
  protected buildScrapeResult(products: ProductData[]): ScrapeResult {
    const duration = Date.now() - this.startTime;

    return {
      supermarketId: this.config.supermarketId,
      products: products.map((p) => ({
        ...p,
        normalizedName: p.name, // Will be normalized by the service
        pricePerUnit: p.unitQuantity
          ? p.price / p.unitQuantity
          : undefined,
      })),
      scrapedAt: new Date(),
      duration,
      productsScraped: this.productsScraped,
      productsFailed: this.productsFailed,
      errors: this.errors,
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
