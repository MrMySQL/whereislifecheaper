import { BaseScraper, FatalScrapeError } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { config } from '../../config/env';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import topUserAgents from 'top-user-agents';
import * as path from 'path';
import * as os from 'os';

// Apply stealth plugin to avoid bot detection
chromium.use(stealth());

/**
 * REWE categories configuration
 * Uses www.rewe.de/shop/ URLs (not shop.rewe.de which has Cloudflare protection)
 */
export const reweCategories: CategoryConfig[] = [
  { id: 'obst-gemuese', name: 'Obst & Gemüse', url: '/shop/c/obst-gemuese/' },
  { id: 'fleisch-fisch', name: 'Fleisch & Fisch', url: '/shop/c/fleisch-fisch/' },
  { id: 'kaese-eier-molkerei', name: 'Käse, Eier & Molkerei', url: '/shop/c/kaese-eier-molkerei/' },
  { id: 'brot-cerealien-aufstriche', name: 'Brot, Cerealien & Aufstriche', url: '/shop/c/brot-cerealien-aufstriche/' },
  { id: 'getraenke-genussmittel', name: 'Getränke & Genussmittel', url: '/shop/c/getraenke-genussmittel/' },
  { id: 'suesses-salziges', name: 'Süßes & Salziges', url: '/shop/c/suesses-salziges/' },
  { id: 'tiefkuehlkost', name: 'Tiefkühlkost', url: '/shop/c/tiefkuehlkost/' },
  { id: 'kochen-backen', name: 'Kochen & Backen', url: '/shop/c/kochen-backen/' },
  { id: 'oele-sossen-gewuerze', name: 'Öle, Soßen & Gewürze', url: '/shop/c/oele-sossen-gewuerze/' },
  { id: 'fertiggerichte-konserven', name: 'Fertiggerichte & Konserven', url: '/shop/c/fertiggerichte-konserven/' },
  { id: 'kaffee-tee-kakao', name: 'Kaffee, Tee & Kakao', url: '/shop/c/kaffee-tee-kakao/' },
  { id: 'drogerie-gesundheit', name: 'Drogerie & Gesundheit', url: '/shop/c/drogerie-gesundheit/' },
  { id: 'babybedarf', name: 'Babybedarf', url: '/shop/c/babybedarf/' },
  { id: 'tierbedarf', name: 'Tierbedarf', url: '/shop/c/tierbedarf/' },
  { id: 'kueche-haushalt', name: 'Küche & Haushalt', url: '/shop/c/kueche-haushalt/' },
];

/**
 * REWE scraper configuration
 */
export const reweConfig: Partial<ScraperConfig> = {
  name: 'REWE',
  baseUrl: 'https://www.rewe.de',
  categories: reweCategories,
  selectors: {
    productCard: '[class*="product-tile"]',
    productName: '[class*="title"]',
    productPrice: '[class*="price"]',
    productImage: 'img',
    productUrl: 'a',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 3000,
    betweenRequests: 2000,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/**
 * REWE product from page
 */
interface ReweProduct {
  id: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  productUrl: string;
  price: number;
  originalPrice?: number;
  grammage?: string;
  isAvailable: boolean;
}

/**
 * Body of GET /api/marketselection/configuration — the shop's own record of
 * which market this session shops in. All three are null until a market is
 * chosen.
 */
export interface MarketConfiguration {
  selectedService: string | null;
  selectedMarket: string | null;
  customerZipCode: string | null;
}

/**
 * The delivery market (wwIdent) the session is set to for `zip`, or null when
 * there is none. Pickup is not good enough: its prices are another market's.
 */
export function deliveryMarketFor(configuration: MarketConfiguration, zip: string): string | null {
  if (configuration.selectedService !== 'DELIVERY') return null;
  if (configuration.customerZipCode !== zip) return null;
  return configuration.selectedMarket || null;
}

/** How long to keep asking for the market after the service was chosen. */
const MARKET_POLL_ATTEMPTS = 30;
const MARKET_POLL_INTERVAL_MS = 500;

/**
 * Raised when REWE has no delivery market for the session. Without one every
 * tile reads "Preis abhängig vom Standort", so this is fatal for the run, not
 * a per-page glitch to log and skip: BaseScraper stops at the first one
 * instead of paginating every remaining category to the same result.
 */
export class ReweMarketError extends FatalScrapeError {
  constructor(message: string) {
    super(message);
    this.name = 'ReweMarketError';
  }
}

/**
 * A page full of products with no price on any of them means the market is
 * gone, not that the shelf is empty. Runs from May to August 2026 paginated
 * 1,919 such pages and reported success.
 */
export function assertPricedPage(
  products: { price: number }[],
  categoryName: string,
  pageNumber: number
): void {
  if (products.length === 0) return;
  if (products.some(p => p.price > 0)) return;
  throw new ReweMarketError(
    `${categoryName} page ${pageNumber}: ${products.length} products and none with a price — ` +
      'the delivery market is not set'
  );
}

/**
 * Scraper for REWE Germany (www.rewe.de/shop/)
 *
 * This scraper uses playwright-extra with stealth plugin to bypass Cloudflare:
 * 1. Launches browser with stealth mode and persistent session
 * 2. Navigates to www.rewe.de/shop/
 * 3. Enters postal code 10115 (Berlin) into the market chooser
 * 4. Picks "Lieferservice" in the service overlay the chooser then opens
 * 5. Once market is selected, navigates to category pages to scrape products with actual prices
 *
 * STEALTH MODE FEATURES:
 * - Uses playwright-extra with puppeteer-extra-plugin-stealth
 * - Persistent browser context to maintain cookies/session
 * - Randomized viewport and realistic fingerprinting
 * - German locale and timezone settings
 *
 * The scraper uses Berlin (10115) as the default delivery zone.
 */
export class ReweScraper extends BaseScraper {
  private readonly BASE_URL = 'https://www.rewe.de';
  private readonly POSTAL_CODE = '10115'; // Berlin
  private marketSelected = false;
  private marketWwIdent: string | null = null;
  private browserContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with stealth browser and select delivery market
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing REWE scraper with stealth mode...`);
    this.startTime = Date.now();

    // Launch browser with stealth mode
    await this.launchStealthBrowser();

    // Navigate to shop page and select delivery market
    await this.selectDeliveryMarket();

    this.logger.info(
      `REWE scraper initialized with delivery market ${this.marketWwIdent} for zone ${this.POSTAL_CODE}`
    );
  }

  /**
   * Launch browser with stealth plugin and persistent context
   */
  private async launchStealthBrowser(): Promise<void> {
    this.logger.info('Launching stealth browser for REWE...');

    // Create persistent session directory
    const sessionDir = path.join(os.tmpdir(), 'rewe-scraper-session');

    // Randomize viewport slightly for fingerprint variation
    const viewportWidth = 1920 + Math.floor(Math.random() * 100);
    const viewportHeight = 1080 + Math.floor(Math.random() * 50);

    // Get a random user agent from the top user agents list
    const userAgent = topUserAgents[Math.floor(Math.random() * Math.min(10, topUserAgents.length))];
    this.logger.debug(`Using user agent: ${userAgent}`);

    // Launch with persistent context for session management
    // Use PLAYWRIGHT_HEADLESS env var to control headless mode
    // For Cloudflare bypass, headed mode with xvfb works best in CI
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS === 'true';
    this.logger.info(`Browser mode: ${isHeadless ? 'headless' : 'headed'}`);

    // Parse proxy URL if configured for this supermarket
    let proxyConfig: { server: string; username?: string; password?: string } | undefined;
    const proxyUrl = this.getProxyUrlForSupermarket();
    if (proxyUrl) {
      const url = new URL(proxyUrl);
      proxyConfig = {
        server: `${url.protocol}//${url.host}`,
        username: url.username || undefined,
        password: url.password || undefined,
      };
      this.logger.info(`Using proxy: ${proxyConfig.server}`);
    }

    this.browserContext = await chromium.launchPersistentContext(sessionDir, {
      headless: isHeadless,
      args: [
        ...(isHeadless ? ['--headless=new'] : []), // New headless mode if headless
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
      viewport: { width: viewportWidth, height: viewportHeight },
      userAgent,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      permissions: ['geolocation'],
      geolocation: { latitude: 52.52, longitude: 13.405 }, // Berlin coordinates
      proxy: proxyConfig,
    });

    // Get the default page from persistent context
    const pages = this.browserContext.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browserContext.newPage();

    // Set German locale cookie
    await this.browserContext.addCookies([
      { name: 'userCountry', value: 'DE', domain: '.rewe.de', path: '/' },
    ]);

    this.logger.info('Stealth browser launched successfully');
  }

  /**
   * Get proxy URL for this supermarket from config
   */
  private getProxyUrlForSupermarket(): string | undefined {
    const proxyConfigMap = config.scraper.proxyConfig;
    if (proxyConfigMap.size === 0) return undefined;

    const supermarketName = this.config.name.toLowerCase();
    for (const [key, url] of proxyConfigMap.entries()) {
      if (supermarketName.includes(key)) {
        return url;
      }
    }
    return undefined;
  }

  /**
   * Attempt to solve Cloudflare Turnstile challenge by clicking the checkbox
   * Returns true if challenge was solved, false otherwise
   */
  private async solveCloudflareChallenge(): Promise<boolean> {
    if (!this.page) return false;

    const maxAttempts = 3;
    const waitBetweenAttempts = 5000;
    const timestamp = Date.now();

    // Take screenshot of the Cloudflare challenge page
    try {
      const screenshotPath = path.join('logs', `cloudflare-challenge-${timestamp}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      this.logger.info(`Cloudflare challenge screenshot saved: ${screenshotPath}`);
    } catch (e) {
      this.logger.debug('Could not save challenge screenshot:', e);
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.info(`Cloudflare solve attempt ${attempt}/${maxAttempts}...`);

      try {
        // Wait for the page to stabilize
        await this.page.waitForTimeout(2000);

        // Look for Turnstile iframe
        const turnstileSelectors = [
          'iframe[src*="challenges.cloudflare.com"]',
          'iframe[src*="turnstile"]',
          'iframe[title*="challenge"]',
          '#turnstile-wrapper iframe',
          '.cf-turnstile iframe',
        ];

        let iframe = null;
        for (const selector of turnstileSelectors) {
          iframe = await this.page.$(selector);
          if (iframe) {
            this.logger.debug(`Found Turnstile iframe with selector: ${selector}`);
            break;
          }
        }

        if (iframe) {
          // Get the iframe's content frame
          const frame = await iframe.contentFrame();
          if (frame) {
            this.logger.info('Found Cloudflare Turnstile iframe, attempting to click checkbox...');

            // Look for the checkbox inside the iframe
            const checkboxSelectors = [
              'input[type="checkbox"]',
              '.ctp-checkbox-label',
              '#challenge-stage input',
              'label',
            ];

            for (const selector of checkboxSelectors) {
              try {
                const checkbox = await frame.$(selector);
                if (checkbox) {
                  // Move mouse naturally before clicking
                  const box = await checkbox.boundingBox();
                  if (box) {
                    // Random offset within the element for more human-like click
                    const x = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
                    const y = box.y + box.height / 2 + (Math.random() - 0.5) * 10;
                    await this.page.mouse.move(x, y, { steps: 10 });
                    await this.page.waitForTimeout(100 + Math.random() * 200);
                  }
                  await checkbox.click();
                  this.logger.info('Clicked Turnstile checkbox');
                  break;
                }
              } catch {
                // Continue trying other selectors
              }
            }
          }
        } else {
          // No iframe found - maybe it's a different type of challenge or auto-solving
          this.logger.debug('No Turnstile iframe found, challenge may auto-solve');
        }

        // Wait for challenge to complete
        await this.page.waitForTimeout(waitBetweenAttempts);

        // Take screenshot after attempt
        try {
          const afterScreenshotPath = path.join('logs', `cloudflare-after-attempt-${timestamp}-${attempt}.png`);
          await this.page.screenshot({ path: afterScreenshotPath, fullPage: true });
          this.logger.info(`Post-attempt screenshot saved: ${afterScreenshotPath}`);
        } catch (e) {
          this.logger.debug('Could not save post-attempt screenshot:', e);
        }

        // Check if we're past the challenge
        const newTitle = await this.page.title();
        if (!newTitle.toLowerCase().includes('moment')) {
          this.logger.info('Cloudflare challenge solved successfully!');
          return true;
        }

        // Also check if the page URL changed (redirect after solving)
        const currentUrl = this.page.url();
        if (currentUrl.includes('/shop/') && !currentUrl.includes('challenge')) {
          this.logger.info('Cloudflare challenge solved (URL redirect detected)!');
          return true;
        }

      } catch (error) {
        this.logger.debug(`Cloudflare solve attempt ${attempt} failed:`, error);
      }

      // Wait before next attempt
      if (attempt < maxAttempts) {
        this.logger.info(`Waiting before next attempt...`);
        await this.page.waitForTimeout(waitBetweenAttempts);
      }
    }

    this.logger.warn('Could not solve Cloudflare challenge after all attempts');
    return false;
  }

  /**
   * Select the Berlin delivery market so category pages carry real prices.
   *
   * The shop's chooser is postcode-first: submitting the zip opens a
   * "Service wählen" overlay, and its Lieferservice button POSTs
   * /shop/api/marketselection/userselections, which stores the choice in the
   * server-side session. Nothing on the page proves that worked — a page
   * with no market still contains '€' — so the only trustworthy check is the
   * configuration endpoint, read before (a persistent session may already
   * carry the market) and after.
   *
   * Throws when no delivery market is set afterwards. The previous version
   * logged and carried on, which is how a broken chooser produced 0-product
   * runs recorded as success from May to August 2026.
   */
  private async selectDeliveryMarket(): Promise<void> {
    if (!this.page) throw new ReweMarketError('Browser page is not initialized');

    this.logger.info('Navigating to REWE shop to select delivery market...');
    await this.page.goto(`${this.BASE_URL}/shop/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await this.handleCookieConsent();

    const title = await this.page.title();
    if (title.toLowerCase().includes('moment')) {
      this.logger.warn('Cloudflare challenge detected on shop page. Attempting to solve...');
      if (!(await this.solveCloudflareChallenge())) {
        throw new ReweMarketError('Could not bypass Cloudflare challenge on the shop page');
      }
    }

    const existing = deliveryMarketFor(await this.readMarketConfiguration(), this.POSTAL_CODE);
    if (existing) {
      this.marketWwIdent = existing;
      this.marketSelected = true;
      this.logger.info(`Session already has delivery market ${existing} for ${this.POSTAL_CODE}`);
      return;
    }

    this.logger.info(`Entering postal code ${this.POSTAL_CODE}...`);
    const zipInput = this.page.locator('[data-testid="zip-code-input"]');
    await zipInput.waitFor({ state: 'visible', timeout: 15000 });
    await zipInput.fill(this.POSTAL_CODE);
    await this.page.locator('[data-testid="gbmc_zipCodeSubmit"]').click();

    // The zip lookup answers with the services offered there, and the overlay
    // renders one service-btn per service: Abholservice and Lieferservice.
    const delivery = this.page.locator('button[data-testid="service-btn"]', { hasText: 'Lieferservice' });
    await delivery.waitFor({ state: 'visible', timeout: 15000 });
    const [response] = await Promise.all([
      this.page.waitForResponse(
        r => r.url().includes('/api/marketselection/userselections'),
        { timeout: 15000 }
      ),
      delivery.click(),
    ]);
    if (!response.ok()) {
      throw new ReweMarketError(`REWE rejected the market selection: HTTP ${response.status()}`);
    }

    const wwIdent = await this.awaitDeliveryMarket();
    this.marketWwIdent = wwIdent;
    this.marketSelected = true;
    this.logger.info(`Delivery market ${wwIdent} selected for ${this.POSTAL_CODE}`);
  }

  /**
   * Wait for the session to report the delivery market.
   *
   * The 201 from userselections does not carry it: the app then reloads the
   * shop, and only that navigation leaves the session with the market. Read
   * once right after the response and it still says null. So poll — a read
   * that lands mid-navigation throws, which just means "not yet".
   */
  private async awaitDeliveryMarket(): Promise<string> {
    if (!this.page) throw new ReweMarketError('Browser page is not initialized');

    let configuration: MarketConfiguration | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MARKET_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) await this.page.waitForTimeout(MARKET_POLL_INTERVAL_MS);
      try {
        configuration = await this.readMarketConfiguration();
        lastError = null;
      } catch (error) {
        // Every read error keeps the poll going: the reload that follows the
        // 201 rejects a read in flight as a destroyed context or a failed
        // fetch, and the next read works. A persistent cause (a 403 from the
        // endpoint, say) still ends here after the poll budget, so it is
        // kept and reported instead of dying as "configuration: null".
        configuration = null;
        lastError = error;
      }
      const wwIdent = configuration && deliveryMarketFor(configuration, this.POSTAL_CODE);
      if (wwIdent) return wwIdent;
    }
    const seen = lastError instanceof Error
      ? `last read failed: ${lastError.message}`
      : `last read: ${JSON.stringify(configuration)}`;
    throw new ReweMarketError(
      `No delivery market set for ${this.POSTAL_CODE} after the zip flow (${seen})`
    );
  }

  /**
   * What the shop currently believes about this session's market. Fetched
   * from page context so the request carries the session cookies.
   */
  private async readMarketConfiguration(): Promise<MarketConfiguration> {
    if (!this.page) throw new ReweMarketError('Browser page is not initialized');
    return this.page.evaluate(async () => {
      const response = await fetch('/api/marketselection/configuration?checkMarketSelection=false', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`marketselection/configuration answered HTTP ${response.status}`);
      }
      return (await response.json()) as MarketConfiguration;
    });
  }

  /**
   * Handle cookie consent dialog if present
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    try {
      // Wait a bit for cookie banner to appear
      await this.page.waitForTimeout(1000);

      const cookieButtonSelectors = [
        '#uc-btn-accept-banner',
        'button[data-testid="uc-accept-all-button"]',
        'button:has-text("Alle akzeptieren")',
        'button:has-text("Alle annehmen")',
      ];

      for (const selector of cookieButtonSelectors) {
        try {
          const cookieButton = await this.page.$(selector);
          if (cookieButton) {
            await cookieButton.click();
            this.logger.debug('Cookie consent accepted');
            await this.page.waitForTimeout(500);
            break;
          }
        } catch {
          // Continue trying other selectors
        }
      }
    } catch (error) {
      this.logger.debug('No cookie consent dialog found or already dismissed');
    }
  }


  /**
   * Scrape a single category with pagination support
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];

    try {
      const baseCategoryUrl = `${this.BASE_URL}${category.url}`;
      this.logger.info(`Scraping category: ${category.name} from ${baseCategoryUrl}`);

      if (!this.page) return products;

      // Warn if market wasn't selected
      if (!this.marketSelected) {
        this.logger.warn('Market not selected - products may not have prices');
      }

      // Navigate to first page
      this.logger.debug(`Navigating to ${baseCategoryUrl}`);
      await this.page.goto(baseCategoryUrl, { waitUntil: 'domcontentloaded' });
      await this.waitForDynamicContent();

      // Handle cookie consent if it appears again
      await this.handleCookieConsent();

      // Check page title
      let title = await this.page.title();
      this.logger.info(`Page title: ${title}`);

      // If Cloudflare challenge is present, try to solve it
      if (title.includes('moment') || title.includes('Moment')) {
        this.logger.warn(`Cloudflare challenge detected for ${category.name}, attempting to solve...`);
        const solved = await this.solveCloudflareChallenge();
        if (!solved) {
          this.failCategory(category, 'Could not solve Cloudflare challenge', baseCategoryUrl);
          return products;
        }
        // Update title after solving
        title = await this.page.title();
        this.logger.info(`Page title after solving: ${title}`);
      }

      // Get total pages from pagination
      const totalPages = await this.getTotalPages();
      this.logger.info(`Category ${category.name}: Found ${totalPages} pages`);

      // Scrape each page
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          // Navigate to page (skip for first page as we're already there)
          if (pageNum > 1) {
            const pageUrl = `${baseCategoryUrl}?page=${pageNum}`;
            this.logger.debug(`Navigating to page ${pageNum}: ${pageUrl}`);
            await this.page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
            await this.waitForDynamicContent();

            // Check for Cloudflare on subsequent pages
            let pageTitle = await this.page.title();
            if (pageTitle.includes('moment') || pageTitle.includes('Moment')) {
              this.logger.warn(`Cloudflare challenge on page ${pageNum}, attempting to solve...`);
              const solved = await this.solveCloudflareChallenge();
              if (!solved) {
                this.logError(`Could not solve Cloudflare on page ${pageNum} of ${category.name}, stopping pagination`, pageUrl);
                break;
              }
              pageTitle = await this.page.title();
              this.logger.info(`Page ${pageNum} title after solving: ${pageTitle}`);
            }
          }

          // Scroll to load lazy-loaded images
          await this.loadAllProducts();

          // Extract products from the page
          const pageProducts = await this.extractProductsFromPage();

          const productsWithPrice = pageProducts.filter(p => p.price > 0).length;

          this.logger.info(`${category.name} page ${pageNum}/${totalPages}: Found ${pageProducts.length} products (${productsWithPrice} with price)`);

          // Every page, not just the first: a market that drops mid-category
          // leaves later pages full of unpriced tiles that parseProducts
          // would otherwise discard without a word.
          assertPricedPage(pageProducts, category.name, pageNum);

          // Parse products
          const parsedProducts = this.parseProducts(pageProducts, category.name);

          // Save products via callback
          if (this.onPageScraped && parsedProducts.length > 0) {
            const savedCount = await this.onPageScraped(parsedProducts, {
              categoryId: category.id,
              categoryName: category.name,
              pageNumber: pageNum,
              totalProductsOnPage: parsedProducts.length,
            });
            this.logger.info(`${category.name} page ${pageNum}: Saved ${savedCount}/${parsedProducts.length} products`);
          }

          products.push(...parsedProducts);

          // Small delay between pages to avoid rate limiting
          if (pageNum < totalPages) {
            await this.page.waitForTimeout(1000);
          }
        } catch (pageError) {
          // A lost market is not a page glitch: every page after it is empty too.
          if (pageError instanceof ReweMarketError) throw pageError;
          // logError, not logger.error: a category whose every page failed
          // this way must come back as lost, and the base class only sees
          // errors that went through the buffer.
          this.logError(
            `Failed to scrape page ${pageNum} of ${category.name}`,
            pageNum === 1 ? baseCategoryUrl : `${baseCategoryUrl}?page=${pageNum}`,
            pageError as Error
          );
          // Continue to next page on error
        }
      }

      this.logger.info(`Category ${category.name}: Total ${products.length} products scraped from ${totalPages} pages`);
    } catch (error) {
      // Fatal: BaseScraper rethrows it out of scrapeProductList, so the run
      // ends here rather than crawling every remaining category unpriced.
      if (error instanceof ReweMarketError) throw error;
      this.failCategory(category, error, `${this.BASE_URL}${category.url}`);
    }

    return products;
  }

  /**
   * Get total number of pages from pagination
   */
  private async getTotalPages(): Promise<number> {
    if (!this.page) return 1;

    try {
      const totalPages = await this.page.evaluate(() => {
        // Look for pagination navigation
        const paginationNav = document.querySelector('nav[aria-label*="Suchergebnisse"], nav ul[aria-label*="Suchergebnisse"]');
        if (!paginationNav) {
          // Try alternative: look for page number buttons/links
          const pageLinks = document.querySelectorAll('a[href*="?page="]');
          if (pageLinks.length === 0) return 1;

          let maxPage = 1;
          pageLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            const match = href.match(/[?&]page=(\d+)/);
            if (match) {
              const pageNum = parseInt(match[1], 10);
              if (pageNum > maxPage) maxPage = pageNum;
            }
          });
          return maxPage;
        }

        // Find all page number elements in pagination
        const pageItems = paginationNav.querySelectorAll('li');
        let maxPage = 1;

        pageItems.forEach(item => {
          // Check for page number in link or button
          const link = item.querySelector('a[href*="?page="]');
          if (link) {
            const href = link.getAttribute('href') || '';
            const match = href.match(/[?&]page=(\d+)/);
            if (match) {
              const pageNum = parseInt(match[1], 10);
              if (pageNum > maxPage) maxPage = pageNum;
            }
          }

          // Check for page number in button text
          const button = item.querySelector('button');
          if (button) {
            const text = button.textContent?.trim() || '';
            const pageNum = parseInt(text, 10);
            if (!isNaN(pageNum) && pageNum > maxPage) maxPage = pageNum;
          }

          // Check for plain text page number
          const text = item.textContent?.trim() || '';
          if (/^\d+$/.test(text)) {
            const pageNum = parseInt(text, 10);
            if (pageNum > maxPage) maxPage = pageNum;
          }
        });

        return maxPage;
      });

      return totalPages;
    } catch (error) {
      this.logger.debug('Could not determine total pages, defaulting to 1');
      return 1;
    }
  }

  /**
   * Load all products by scrolling (handle infinite scroll/lazy loading)
   */
  private async loadAllProducts(): Promise<void> {
    if (!this.page) return;

    const maxScrolls = 15; // Limit scrolls
    let lastProductCount = 0;
    let scrollCount = 0;
    let noChangeCount = 0;

    while (scrollCount < maxScrolls && noChangeCount < 3) {
      // Get current product count
      const currentProductCount = await this.page.$$eval(
        '[class*="product-tile"]',
        (elements) => elements.length
      ).catch(() => 0);

      // If no new products loaded, increment no-change counter
      if (currentProductCount === lastProductCount) {
        noChangeCount++;
      } else {
        noChangeCount = 0;
      }

      lastProductCount = currentProductCount;
      scrollCount++;

      // Scroll down
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      // Wait for content to load
      await this.page.waitForTimeout(1000);

      this.logger.debug(`Scroll ${scrollCount}: ${currentProductCount} products loaded`);
    }
  }

  /**
   * Extract products from the current page
   */
  private async extractProductsFromPage(): Promise<ReweProduct[]> {
    if (!this.page) return [];

    try {
      const products = await this.page.evaluate(() => {
        // Select product tiles using the class pattern found in REWE's page
        const productTiles = document.querySelectorAll('[class*="product-tile"]');
        const results: ReweProduct[] = [];
        const seenUrls = new Set<string>();

        productTiles.forEach((tile) => {
          try {
            // Find the product link
            const linkEl = tile.querySelector('a[href*="/shop/p/"]');
            if (!linkEl) return;

            const productUrl = (linkEl as HTMLAnchorElement).href;
            if (!productUrl || seenUrls.has(productUrl)) return;
            seenUrls.add(productUrl);

            // Extract product name from title element
            const titleEl = tile.querySelector('[class*="title"], h3, h4');
            const name = titleEl?.textContent?.trim() || '';
            if (!name) return;

            // Extract price - look for price elements
            const priceAreaEl = tile.querySelector('[class*="price-area"], [class*="price"]');
            let price = 0;
            let originalPrice: number | undefined;

            if (priceAreaEl) {
              const priceText = priceAreaEl.textContent || '';

              // Check if it's showing "Preis abhängig vom Standort" (price depends on location)
              if (!priceText.includes('abhängig') && !priceText.includes('Standort')) {
                // Parse German price format (e.g., "1,99 €" or "1,99€")
                const priceMatches = priceText.match(/(\d+)[,.](\d{2})\s*€?/g);
                if (priceMatches && priceMatches.length > 0) {
                  // First price is usually the current price
                  const currentPriceMatch = priceMatches[0].match(/(\d+)[,.](\d{2})/);
                  if (currentPriceMatch) {
                    price = parseFloat(`${currentPriceMatch[1]}.${currentPriceMatch[2]}`);
                  }

                  // If there are multiple prices, second might be original (strikethrough)
                  if (priceMatches.length > 1) {
                    const originalPriceMatch = priceMatches[1].match(/(\d+)[,.](\d{2})/);
                    if (originalPriceMatch) {
                      originalPrice = parseFloat(`${originalPriceMatch[1]}.${originalPriceMatch[2]}`);
                      // Swap if original is less than current (current should be lower for sales)
                      if (originalPrice < price) {
                        [price, originalPrice] = [originalPrice, price];
                      }
                    }
                  }
                }
              }
            }

            // Extract image URL
            const imgEl = tile.querySelector('img');
            const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';

            // Extract grammage/unit info
            const grammageEl = tile.querySelector('[class*="grammage"]');
            const grammage = grammageEl?.textContent?.trim() || '';

            // Extract product ID from URL
            const urlParts = productUrl.split('/');
            const id = urlParts[urlParts.length - 1] || `rewe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            results.push({
              id,
              name,
              imageUrl: imageUrl || undefined,
              productUrl,
              price,
              originalPrice,
              grammage: grammage || undefined,
              isAvailable: true,
            });
          } catch {
            // Skip this product if parsing fails
          }
        });

        return results;
      });

      return products;
    } catch (error) {
      this.logger.error('Failed to extract products from page:', error);
      return [];
    }
  }

  /**
   * Parse extracted products into ProductData format
   */
  private parseProducts(rawProducts: ReweProduct[], categoryName: string): ProductData[] {
    const products: ProductData[] = [];

    for (const item of rawProducts) {
      try {
        // Skip products without price (location-dependent pricing not resolved)
        if (item.price === 0) {
          this.logger.debug(`Skipping product without price: ${item.name}`);
          continue;
        }

        let { unit, unitQuantity } = this.parseUnit(item.grammage);

        // Fallback: If unit is "pieces", try to extract weight from product name
        if (unit === 'pieces') {
          const weightFromName = this.parseWeightFromName(item.name);
          if (weightFromName && weightFromName.unit && weightFromName.unitQuantity) {
            unit = weightFromName.unit;
            unitQuantity = weightFromName.unitQuantity;
            this.logger.debug(`Extracted weight from name for "${item.name}": ${unitQuantity} ${unit}`);
          }
        }

        const product: ProductData = {
          name: item.name,
          price: item.price,
          currency: 'EUR',
          originalPrice: item.originalPrice,
          isOnSale: item.originalPrice !== undefined && item.originalPrice > item.price,
          imageUrl: item.imageUrl,
          productUrl: item.productUrl,
          unit,
          unitQuantity,
          isAvailable: item.isAvailable,
          externalId: item.id,
          categoryName,
        };

        products.push(product);
        this.productsScraped++;
      } catch (error) {
        this.productsFailed++;
        this.logger.debug(`Failed to parse product: ${item.name}`, error);
      }
    }

    return products;
  }

  /**
   * Parse German unit format to standard format
   */
  private parseUnit(grammage?: string): { unit?: string; unitQuantity?: number } {
    if (!grammage) {
      return { unit: undefined, unitQuantity: undefined };
    }

    const text = grammage.toLowerCase().trim();

    // Handle multi-pack format first (e.g., "6 x 1,5 l")
    const multiPackMatch = text.match(/(\d+)\s*x\s*(\d+[,.]?\d*)\s*(kg|g|l|ml|stück|st\.?|stk\.?)/i);
    if (multiPackMatch) {
      const count = parseInt(multiPackMatch[1], 10);
      const unitSize = parseFloat(multiPackMatch[2].replace(',', '.'));
      const unitType = multiPackMatch[3].toLowerCase();
      const totalQuantity = count * unitSize;

      return this.normalizeUnit(unitType, totalQuantity);
    }

    // Standard format (e.g., "500 g", "1,5 l")
    const standardMatch = text.match(/(\d+[,.]?\d*)\s*(kg|g|l|liter|ml|stück|st\.?|stk\.?)/i);
    if (standardMatch) {
      const quantity = parseFloat(standardMatch[1].replace(',', '.'));
      const unitType = standardMatch[2].toLowerCase();

      return this.normalizeUnit(unitType, quantity);
    }

    // Just unit without quantity
    if (text.includes('stück') || text.includes('st.') || text.includes('stk')) {
      return { unit: 'pieces', unitQuantity: 1 };
    }

    return { unit: undefined, unitQuantity: undefined };
  }

  /**
   * Normalize unit type and quantity
   */
  private normalizeUnit(unitType: string, quantity: number): { unit?: string; unitQuantity?: number } {
    switch (unitType) {
      case 'kg':
        return { unit: 'kg', unitQuantity: quantity };
      case 'g':
        if (quantity >= 1000) {
          return { unit: 'kg', unitQuantity: quantity / 1000 };
        }
        return { unit: 'g', unitQuantity: quantity };
      case 'l':
      case 'liter':
        return { unit: 'l', unitQuantity: quantity };
      case 'ml':
        if (quantity >= 1000) {
          return { unit: 'l', unitQuantity: quantity / 1000 };
        }
        return { unit: 'ml', unitQuantity: quantity };
      case 'stück':
      case 'st.':
      case 'st':
      case 'stk.':
      case 'stk':
        return { unit: 'pieces', unitQuantity: quantity };
      default:
        return { unit: unitType, unitQuantity: quantity };
    }
  }

  /**
   * Parse weight from product name as fallback when unit is "pieces"
   * German weight patterns: "500g", "1kg", "1,5kg", "250ml", "1l"
   */
  private parseWeightFromName(name: string): { unit?: string; unitQuantity?: number } | null {
    if (!name) return null;

    const normalized = name.toLowerCase();

    // Pattern: number with optional decimal (comma or dot) + unit
    // Word boundary to avoid matching partial strings
    const weightPattern = /\b(\d+[,.]?\d*)\s*(kg|g|ml|l)\b/i;
    const match = normalized.match(weightPattern);

    if (match) {
      const quantity = parseFloat(match[1].replace(',', '.'));
      const unitType = match[2].toLowerCase();

      if (isNaN(quantity) || quantity <= 0) return null;

      return this.normalizeUnit(unitType, quantity);
    }

    return null;
  }

  /**
   * Scrape detailed product information
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    throw new Error(`scrapeProductDetails not implemented for page-based scraper. URL: ${url}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up REWE scraper...`);

    // Close persistent browser context
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
      this.logger.info('Stealth browser closed');
    }

    const stats = this.getStats();
    this.logger.info('REWE scraping completed:', stats);
  }
}
