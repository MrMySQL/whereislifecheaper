import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { sleep } from '../../utils/retry';
import { chromium } from 'playwright';
import { config } from '../../config/env';

/**
 * Kaufland categories configuration
 * URL pattern: /c/{category-name}/~{category-id}/
 */
export const kauflandCategories: CategoryConfig[] = [
  { id: 'dairy-milk', name: 'Milk & Dairy', url: '/c/milch/~1951/' },
  { id: 'cheese', name: 'Cheese', url: '/c/kaese/~1952/' },
  { id: 'meat', name: 'Meat & Sausage', url: '/c/fleisch-wurst/~1318/' },
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', url: '/c/obst-gemuese/~1315/' },
  { id: 'frozen', name: 'Frozen Foods', url: '/c/tiefkuehlprodukte/~1401/' },
  { id: 'beverages', name: 'Beverages', url: '/c/getraenke/~1312/' },
  { id: 'sweets', name: 'Sweets & Snacks', url: '/c/suessigkeiten-snacks/~1319/' },
];

/**
 * Kaufland scraper configuration
 */
export const kauflandConfig: Partial<ScraperConfig> = {
  name: 'Kaufland',
  baseUrl: 'https://www.kaufland.de',
  categories: kauflandCategories,
  selectors: {
    productCard: '[data-testid="product-card"], .product-card, article[class*="product"]',
    productName: '[data-testid="product-title"], .product-title, h3, h2',
    productPrice: '[data-testid="product-price"], .product-price, [class*="price"]',
    productImage: 'img[data-testid="product-image"], img.product-image, img[src*="product"]',
    productUrl: 'a[href*="/product/"]',
    pagination: '[data-testid="pagination"], .pagination, nav[aria-label*="page"]',
    nextPage: '[data-testid="pagination-next"], [aria-label*="next"], [aria-label*="weiter"]',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 4000,
    betweenRequests: 2000,
    betweenPages: 3000,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  ],
};

/**
 * Product data extracted from Kaufland page
 */
interface KauflandProductData {
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  productUrl: string;
  brand?: string;
  unit?: string;
  unitQuantity?: number;
}

/**
 * Scraper for Kaufland Germany (kaufland.de)
 * Uses Playwright browser automation to bypass Cloudflare protection
 * Extracts products from DOM/embedded data on category pages
 *
 * NOTE: Kaufland.de uses Cloudflare Turnstile protection which is difficult
 * to bypass in headless mode. For best results:
 * 1. Run with PLAYWRIGHT_HEADLESS=false to allow manual Turnstile solving
 * 2. Or use a residential proxy service
 * 3. Or wait for the Turnstile to auto-solve (may work on some IPs)
 */
export class KauflandScraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with browser using enhanced stealth settings
   * Navigate to main page to establish session and pass Cloudflare
   */
  async initialize(): Promise<void> {
    scraperLogger.info('Initializing Kaufland scraper...');
    this.startTime = Date.now();

    await this.launchStealthBrowser();

    // Navigate to main page to establish session
    scraperLogger.info('Navigating to Kaufland homepage to establish session...');
    await this.page!.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();

    // Handle Cloudflare challenge and cookie consent
    await this.handleAntiBot();
    await this.handleCookieConsent();

    scraperLogger.info('Kaufland scraper initialized');
  }

  /**
   * Launch browser with enhanced stealth settings to avoid Cloudflare detection
   */
  private async launchStealthBrowser(): Promise<void> {
    scraperLogger.info('Launching browser with stealth settings for Kaufland');

    // Enhanced stealth args to avoid detection
    const stealthArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      '--window-size=1920,1080',
      '--start-maximized',
      // Additional stealth args
      '--disable-infobars',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-keychain',
    ];

    this.browser = await chromium.launch({
      headless: config.scraper.headless,
      args: stealthArgs,
    });

    // Create context with specific settings to appear more human
    const context = await this.browser.newContext({
      userAgent: this.config.userAgents?.[0] || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      geolocation: { latitude: 52.52, longitude: 13.405 }, // Berlin
      permissions: ['geolocation'],
      // Mimic real browser behavior
      javaScriptEnabled: true,
      hasTouch: false,
      isMobile: false,
      deviceScaleFactor: 1,
    });

    // Add init script to mask automation
    await context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override navigator.plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override navigator.languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['de-DE', 'de', 'en-US', 'en'],
      });

      // Override chrome
      (window as any).chrome = {
        runtime: {},
      };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters);
    });

    this.page = await context.newPage();

    scraperLogger.info('Browser launched with stealth settings for Kaufland');
  }

  /**
   * Check if the page is showing a Cloudflare challenge
   */
  private isCloudflareChallenge(title: string): boolean {
    const challengeIndicators = [
      'Just a moment',
      'Nur einen Moment',
      'Cloudflare',
      'Verifizierung',
      'Checking your browser',
      'Bitte warten',
    ];
    return challengeIndicators.some(indicator => title.toLowerCase().includes(indicator.toLowerCase()));
  }

  /**
   * Override handleAntiBot to wait for Cloudflare challenge to complete
   */
  protected async handleAntiBot(): Promise<void> {
    if (!this.page) return;

    // Check if we're on a Cloudflare challenge page
    const title = await this.page.title();
    if (this.isCloudflareChallenge(title)) {
      scraperLogger.info(`Cloudflare challenge detected (title: "${title}"), attempting to solve...`);

      // Try to click the Turnstile checkbox
      await this.handleCloudflareTurnstile();

      // Wait for the title to change (max 30 seconds)
      const maxWaitTime = 30000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await sleep(2000);

        const currentTitle = await this.page.title();
        if (!this.isCloudflareChallenge(currentTitle)) {
          scraperLogger.info(`Cloudflare challenge passed. New title: "${currentTitle}"`);
          // Wait a bit more for page to fully load
          await sleep(3000);
          return;
        }

        // Try clicking the checkbox again
        await this.handleCloudflareTurnstile();

        scraperLogger.debug(`Still waiting for Cloudflare... (${Math.round((Date.now() - startTime) / 1000)}s)`);
      }

      scraperLogger.warn('Cloudflare challenge did not complete in time');
      await this.takeScreenshot('cloudflare-timeout');
    }

    // Call parent's anti-bot handling for mouse movements etc.
    await super.handleAntiBot();
  }

  /**
   * Attempt to solve Cloudflare Turnstile challenge by clicking the checkbox
   */
  private async handleCloudflareTurnstile(): Promise<void> {
    if (!this.page) return;

    try {
      // Try to find any checkbox element directly on the page
      const checkboxSelectors = [
        'input[type="checkbox"]',
        '[role="checkbox"]',
        '[class*="checkbox"]',
        '[id*="checkbox"]',
      ];

      for (const selector of checkboxSelectors) {
        const checkbox = await this.page.$(selector);
        if (checkbox) {
          const isVisible = await checkbox.isVisible();
          if (isVisible) {
            scraperLogger.info(`Found visible checkbox with selector: ${selector}`);
            await checkbox.click();
            await sleep(3000);
            return;
          }
        }
      }

      // Try to find the Turnstile iframe
      const iframeSelectors = [
        'iframe[src*="challenges.cloudflare.com"]',
        'iframe[src*="turnstile"]',
        'iframe[src*="cf-chl"]',
        'iframe[title*="challenge"]',
        'iframe[title*="Widget"]',
        'iframe', // Any iframe
      ];

      for (const selector of iframeSelectors) {
        const turnstileIframe = await this.page.$(selector);
        if (turnstileIframe) {
          const box = await turnstileIframe.boundingBox();
          if (box && box.width > 50 && box.height > 20) {
            scraperLogger.info(`Found iframe matching ${selector}, clicking inside...`);

            // Click near the left side where checkbox would be
            const clickX = box.x + 30;
            const clickY = box.y + box.height / 2;

            // Human-like movement
            await this.page.mouse.move(clickX - 30, clickY - 20);
            await sleep(100);
            await this.page.mouse.move(clickX, clickY);
            await sleep(100);
            await this.page.mouse.click(clickX, clickY);
            await sleep(3000);
            return;
          }
        }
      }

      // Look for Turnstile container elements (including Kaufland-specific classes)
      const containerSelectors = [
        '.captcha-box',     // Found in Kaufland's Cloudflare page
        '[class*="captcha"]',
        '[class*="cf-turnstile"]',
        '[id*="turnstile"]',
        '[class*="challenge-container"]',
        // Specific to Kaufland's Cloudflare page
        'div[style*="border-radius"][style*="box-shadow"]',
      ];

      for (const selector of containerSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const box = await element.boundingBox();
          if (box && box.width > 100 && box.height > 30) {
            scraperLogger.info(`Found Turnstile container: ${selector}`);
            const clickX = box.x + 30;
            const clickY = box.y + box.height / 2;
            await this.page.mouse.click(clickX, clickY);
            await sleep(3000);
            return;
          }
        }
      }

      // Last resort: try clicking at the approximate location of the checkbox
      // Based on the Kaufland Cloudflare screenshot, the checkbox is in the upper portion
      // of the page, centered horizontally in a verification widget
      const viewport = this.page.viewportSize();
      if (viewport) {
        // The checkbox appears to be:
        // - Horizontally: left edge of the centered verification widget (around 1/3 from left)
        // - Vertically: in the upper quarter of the page
        const checkboxX = 635;  // Left portion of the centered widget
        const checkboxY = 267;  // Upper portion where checkbox appears

        scraperLogger.debug(`Attempting blind click at Turnstile checkbox (${checkboxX}, ${checkboxY})`);

        // Human-like mouse movement to the checkbox
        await this.page.mouse.move(checkboxX - 50, checkboxY - 30);
        await sleep(80 + Math.random() * 100);
        await this.page.mouse.move(checkboxX - 20, checkboxY - 10);
        await sleep(50 + Math.random() * 80);
        await this.page.mouse.move(checkboxX, checkboxY);
        await sleep(100 + Math.random() * 150);

        // Click with slight randomization
        await this.page.mouse.click(checkboxX + Math.random() * 10, checkboxY + Math.random() * 5);
        await sleep(3000);
      }

    } catch (error) {
      scraperLogger.debug('Failed to interact with Turnstile:', error);
    }
  }

  /**
   * Handle cookie consent dialog if present
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    try {
      // Common cookie consent button selectors
      const consentSelectors = [
        '[data-testid="cookie-consent-accept"]',
        '#onetrust-accept-btn-handler',
        '[id*="accept"][id*="cookie"]',
        'button[class*="cookie"][class*="accept"]',
        '[aria-label*="accept"][aria-label*="cookie"]',
        'button:has-text("Alle akzeptieren")',
        'button:has-text("Akzeptieren")',
      ];

      for (const selector of consentSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            scraperLogger.info('Cookie consent accepted');
            await sleep(1000);
            break;
          }
        } catch {
          // Continue to next selector
        }
      }
    } catch (error) {
      scraperLogger.debug('No cookie consent dialog found or already accepted');
    }
  }

  /**
   * Scrape a single category
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];
    const categoryUrl = `${this.config.baseUrl}${category.url}`;

    scraperLogger.info(`Scraping category: ${category.name} at ${categoryUrl}`);

    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      try {
        const pageUrl = currentPage === 1
          ? categoryUrl
          : `${categoryUrl}?page=${currentPage}`;

        await this.navigateToUrl(pageUrl);
        await this.waitForDynamicContent();
        await this.handleAntiBot();

        // Extract products from the page
        const pageProducts = await this.extractProductsFromPage(category);

        if (pageProducts.length === 0) {
          scraperLogger.info(`No products found on page ${currentPage}, stopping pagination`);
          hasMorePages = false;
          continue;
        }

        // Save products incrementally via callback
        if (this.onPageScraped && pageProducts.length > 0) {
          const savedCount = await this.onPageScraped(pageProducts, {
            categoryId: category.id,
            categoryName: category.name,
            pageNumber: currentPage,
            totalProductsOnPage: pageProducts.length,
          });
          scraperLogger.info(
            `Page ${currentPage} of ${category.name}: Saved ${savedCount}/${pageProducts.length} products`
          );
        }

        products.push(...pageProducts);

        // Check for next page
        hasMorePages = await this.hasNextPage();

        if (hasMorePages) {
          currentPage++;
          await sleep(this.config.waitTimes.betweenPages || 3000);
        }
      } catch (error) {
        this.logError(
          `Failed to scrape page ${currentPage} of ${category.name}`,
          categoryUrl,
          error as Error
        );
        hasMorePages = false;
      }
    }

    return products;
  }

  /**
   * Extract products from the current page
   */
  private async extractProductsFromPage(category: CategoryConfig): Promise<ProductData[]> {
    if (!this.page) return [];

    const products: ProductData[] = [];

    try {
      // Log page title for debugging Cloudflare issues
      const title = await this.page.title();
      if (this.isCloudflareChallenge(title)) {
        scraperLogger.warn(`Still on Cloudflare challenge page: "${title}"`);
        await this.takeScreenshot('kaufland-cloudflare-blocked');
        return products;
      }

      scraperLogger.info(`Page loaded successfully - Title: "${title}"`);

      // Try to find products via embedded JSON data first (more reliable)
      const jsonProducts = await this.extractFromEmbeddedJson();
      if (jsonProducts.length > 0) {
        scraperLogger.info(`Extracted ${jsonProducts.length} products from embedded JSON`);
        return jsonProducts.map(p => this.convertToProductData(p, category));
      }

      // Fall back to DOM extraction
      scraperLogger.debug('No JSON products found, trying DOM extraction');
      const domProducts = await this.extractFromDom();
      if (domProducts.length > 0) {
        scraperLogger.info(`DOM extraction found ${domProducts.length} products`);
      }
      return domProducts.map(p => this.convertToProductData(p, category));

    } catch (error) {
      scraperLogger.error('Failed to extract products from page:', error);
      await this.takeScreenshot('kaufland-extraction-error');
      return products;
    }
  }

  /**
   * Try to extract products from embedded JSON data
   */
  private async extractFromEmbeddedJson(): Promise<KauflandProductData[]> {
    if (!this.page) return [];

    try {
      const products = await this.page.evaluate(() => {
        const results: KauflandProductData[] = [];

        // Look for JSON-LD schema data
        const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const script of jsonLdScripts) {
          try {
            const data = JSON.parse(script.textContent || '');
            if (data['@type'] === 'ItemList' && data.itemListElement) {
              for (const item of data.itemListElement) {
                if (item.item && item.item['@type'] === 'Product') {
                  const product = item.item;
                  results.push({
                    name: product.name,
                    price: parseFloat(product.offers?.price) || 0,
                    imageUrl: product.image,
                    productUrl: product.url || '',
                    brand: product.brand?.name,
                  });
                }
              }
            } else if (data['@type'] === 'Product') {
              results.push({
                name: data.name,
                price: parseFloat(data.offers?.price) || 0,
                imageUrl: data.image,
                productUrl: data.url || '',
                brand: data.brand?.name,
              });
            }
          } catch {
            // Invalid JSON, continue
          }
        }

        // Look for __NEXT_DATA__ or similar SSR data
        const nextDataScript = document.querySelector('script#__NEXT_DATA__');
        if (nextDataScript) {
          try {
            const data = JSON.parse(nextDataScript.textContent || '');
            // Navigate to products in the data structure (varies by site)
            const pageProps = data?.props?.pageProps;
            if (pageProps?.products) {
              for (const product of pageProps.products) {
                results.push({
                  name: product.name || product.title,
                  price: product.price || product.currentPrice,
                  originalPrice: product.originalPrice || product.oldPrice,
                  imageUrl: product.imageUrl || product.image,
                  productUrl: product.url || product.link,
                  brand: product.brand,
                });
              }
            }
          } catch {
            // Invalid JSON, continue
          }
        }

        return results;
      });

      return products;
    } catch {
      return [];
    }
  }

  /**
   * Extract products from DOM elements
   */
  private async extractFromDom(): Promise<KauflandProductData[]> {
    if (!this.page) return [];

    try {
      const products = await this.page.evaluate((selectors) => {
        const results: KauflandProductData[] = [];

        // Find all product cards
        const productCards = Array.from(document.querySelectorAll(selectors.productCard));

        for (const card of productCards) {
          try {
            // Extract name
            const nameEl = card.querySelector(selectors.productName);
            const name = nameEl?.textContent?.trim() || '';
            if (!name) continue;

            // Extract price - look for price element and parse German format
            const priceEl = card.querySelector(selectors.productPrice);
            let priceText = priceEl?.textContent?.trim() || '';
            // Remove currency symbol and whitespace, replace comma with dot
            priceText = priceText.replace(/[€\s]/g, '').replace(',', '.');
            const price = parseFloat(priceText) || 0;
            if (price === 0) continue;

            // Extract image URL
            const imgEl = card.querySelector('img') as HTMLImageElement;
            const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';

            // Extract product URL
            const linkEl = card.querySelector('a[href]') as HTMLAnchorElement;
            const productUrl = linkEl?.href || '';

            results.push({
              name,
              price,
              imageUrl,
              productUrl,
            });
          } catch {
            // Skip invalid product
          }
        }

        return results;
      }, this.config.selectors);

      return products;
    } catch (error) {
      scraperLogger.error('DOM extraction failed:', error);
      return [];
    }
  }

  /**
   * Convert extracted data to ProductData format
   */
  private convertToProductData(
    extracted: KauflandProductData,
    category: CategoryConfig
  ): ProductData {
    const isOnSale = !!(extracted.originalPrice && extracted.originalPrice > extracted.price);

    // Try to extract unit info from name
    const { unit, unitQuantity } = this.parseUnitFromName(extracted.name);

    const product: ProductData = {
      name: extracted.name,
      price: extracted.price,
      currency: 'EUR',
      originalPrice: isOnSale ? extracted.originalPrice : undefined,
      isOnSale,
      imageUrl: extracted.imageUrl,
      productUrl: extracted.productUrl,
      brand: extracted.brand,
      unit,
      unitQuantity,
      categoryName: category.name,
      isAvailable: true,
    };

    this.productsScraped++;
    return product;
  }

  /**
   * Parse unit information from product name
   * E.g., "Milch 1L" -> { unit: 'l', unitQuantity: 1 }
   */
  private parseUnitFromName(name: string): { unit?: string; unitQuantity?: number } {
    // Common German unit patterns
    const patterns = [
      // Volume: 1L, 1,5l, 500ml
      { regex: /(\d+(?:[,.]\d+)?)\s*(?:l|liter|lt)(?:\s|$)/i, unit: 'l', multiplier: 1 },
      { regex: /(\d+(?:[,.]\d+)?)\s*ml(?:\s|$)/i, unit: 'ml', multiplier: 1 },
      // Weight: 500g, 1kg, 1,5kg
      { regex: /(\d+(?:[,.]\d+)?)\s*kg(?:\s|$)/i, unit: 'kg', multiplier: 1 },
      { regex: /(\d+(?:[,.]\d+)?)\s*g(?:\s|$)/i, unit: 'g', multiplier: 1 },
      // Pieces: 6er, 10 Stück, x6
      { regex: /(\d+)\s*(?:er|stück|stk|st)(?:\s|$)/i, unit: 'pieces', multiplier: 1 },
      { regex: /x\s*(\d+)(?:\s|$)/i, unit: 'pieces', multiplier: 1 },
    ];

    for (const pattern of patterns) {
      const match = name.match(pattern.regex);
      if (match) {
        const quantity = parseFloat(match[1].replace(',', '.')) * pattern.multiplier;
        return { unit: pattern.unit, unitQuantity: quantity };
      }
    }

    return {};
  }

  /**
   * Check if there's a next page
   */
  private async hasNextPage(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const nextPageSelectors = [
        '[data-testid="pagination-next"]:not([disabled])',
        '[aria-label*="next"]:not([disabled])',
        '[aria-label*="weiter"]:not([disabled])',
        'a[rel="next"]',
        '.pagination-next:not(.disabled)',
      ];

      for (const selector of nextPageSelectors) {
        const nextButton = await this.page.$(selector);
        if (nextButton) {
          const isDisabled = await nextButton.getAttribute('disabled');
          const ariaDisabled = await nextButton.getAttribute('aria-disabled');
          if (!isDisabled && ariaDisabled !== 'true') {
            return true;
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Scrape detailed product information
   * For DOM-based scraping, most details come from the list page
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    // For this implementation, product details are extracted from list pages
    // This method could be expanded for individual product pages if needed
    throw new Error(`scrapeProductDetails not implemented. URL: ${url}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info('Cleaning up Kaufland scraper...');
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Kaufland scraping completed:', stats);
  }
}
