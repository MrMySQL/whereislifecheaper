import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { sleep } from '../../utils/retry';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import topUserAgents from 'top-user-agents';
import * as path from 'path';
import * as os from 'os';

// Apply stealth plugin to avoid bot detection
chromium.use(stealth());

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
 *
 * This scraper uses playwright-extra with stealth plugin to bypass Cloudflare:
 * 1. Launches browser with stealth mode and persistent session
 * 2. Uses top-user-agents for realistic user agent rotation
 * 3. Uses headed mode (headless: false) for better Cloudflare bypass
 * 4. Handles Cloudflare Turnstile challenge automatically
 *
 * STEALTH MODE FEATURES:
 * - Uses playwright-extra with puppeteer-extra-plugin-stealth
 * - Persistent browser context to maintain cookies/session
 * - Randomized viewport and realistic fingerprinting
 * - German locale and timezone settings
 */
export class KauflandScraper extends BaseScraper {
  private browserContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with stealth browser
   * Navigate to main page to establish session and pass Cloudflare
   */
  async initialize(): Promise<void> {
    scraperLogger.info('Initializing Kaufland scraper with stealth mode...');
    this.startTime = Date.now();

    await this.launchStealthBrowser();

    // Navigate to main page to establish session
    scraperLogger.info('Navigating to Kaufland homepage to establish session...');
    await this.page!.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.page!.waitForTimeout(2000);

    // Handle cookie consent first
    await this.handleCookieConsent();

    // Check for Cloudflare challenge and try to solve it
    const title = await this.page!.title();
    if (this.isCloudflareChallenge(title)) {
      scraperLogger.warn('Cloudflare challenge detected on homepage. Attempting to solve...');
      const solved = await this.solveCloudflareChallenge();
      if (!solved) {
        scraperLogger.error('Could not bypass Cloudflare challenge on homepage');
      }
    }

    scraperLogger.info('Kaufland scraper initialized');
  }

  /**
   * Launch browser with playwright-extra stealth plugin and persistent context
   */
  private async launchStealthBrowser(): Promise<void> {
    scraperLogger.info('Launching stealth browser for Kaufland...');

    // Create persistent session directory
    const sessionDir = path.join(os.tmpdir(), 'kaufland-scraper-session');

    // Randomize viewport slightly for fingerprint variation
    const viewportWidth = 1920 + Math.floor(Math.random() * 100);
    const viewportHeight = 1080 + Math.floor(Math.random() * 50);

    // Get a random user agent from the top user agents list
    const userAgent = topUserAgents[Math.floor(Math.random() * Math.min(10, topUserAgents.length))];
    scraperLogger.debug(`Using user agent: ${userAgent}`);

    // Launch with persistent context for session management
    this.browserContext = await chromium.launchPersistentContext(sessionDir, {
      headless: false, // Headed mode is more reliable for Cloudflare bypass
      args: [
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
    });

    // Get the default page from persistent context
    const pages = this.browserContext.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browserContext.newPage();

    // Set German locale cookie
    await this.browserContext.addCookies([
      { name: 'userCountry', value: 'DE', domain: '.kaufland.de', path: '/' },
    ]);

    scraperLogger.info('Stealth browser launched successfully for Kaufland');
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
   * Attempt to solve Cloudflare Turnstile challenge by clicking the checkbox
   * Returns true if challenge was solved, false otherwise
   */
  private async solveCloudflareChallenge(): Promise<boolean> {
    if (!this.page) return false;

    const maxAttempts = 3;
    const waitBetweenAttempts = 5000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      scraperLogger.info(`Cloudflare solve attempt ${attempt}/${maxAttempts}...`);

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
            scraperLogger.debug(`Found Turnstile iframe with selector: ${selector}`);
            break;
          }
        }

        if (iframe) {
          // Get the iframe's content frame
          const frame = await iframe.contentFrame();
          if (frame) {
            scraperLogger.info('Found Cloudflare Turnstile iframe, attempting to click checkbox...');

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
                  scraperLogger.info('Clicked Turnstile checkbox');
                  break;
                }
              } catch {
                // Continue trying other selectors
              }
            }
          }
        } else {
          // No iframe found - try clicking the captcha-box directly (Kaufland specific)
          const captchaBox = await this.page.$('.captcha-box');
          if (captchaBox) {
            scraperLogger.info('Found captcha-box, attempting to click...');
            const box = await captchaBox.boundingBox();
            if (box) {
              const x = box.x + 30; // Click near the left where checkbox is
              const y = box.y + box.height / 2;
              await this.page.mouse.move(x, y, { steps: 10 });
              await this.page.waitForTimeout(100 + Math.random() * 200);
              await this.page.mouse.click(x, y);
              scraperLogger.info('Clicked captcha-box');
            }
          } else {
            scraperLogger.debug('No Turnstile iframe or captcha-box found, challenge may auto-solve');
          }
        }

        // Wait for challenge to complete
        await this.page.waitForTimeout(waitBetweenAttempts);

        // Check if we're past the challenge
        const newTitle = await this.page.title();
        if (!this.isCloudflareChallenge(newTitle)) {
          scraperLogger.info('Cloudflare challenge solved successfully!');
          return true;
        }

        // Also check if the page URL changed (redirect after solving)
        const currentUrl = this.page.url();
        if (!currentUrl.includes('challenge')) {
          const pageContent = await this.page.content();
          if (pageContent.includes('product') || pageContent.includes('Produkt')) {
            scraperLogger.info('Cloudflare challenge solved (content detected)!');
            return true;
          }
        }

      } catch (error) {
        scraperLogger.debug(`Cloudflare solve attempt ${attempt} failed:`, error);
      }

      // Wait before next attempt
      if (attempt < maxAttempts) {
        scraperLogger.info('Waiting before next attempt...');
        await this.page.waitForTimeout(waitBetweenAttempts);
      }
    }

    scraperLogger.warn('Could not solve Cloudflare challenge after all attempts');
    return false;
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
        '#onetrust-accept-btn-handler',
        '[data-testid="cookie-consent-accept"]',
        'button:has-text("Alle akzeptieren")',
        'button:has-text("Akzeptieren")',
        'button:has-text("Alle annehmen")',
        '[id*="accept"][id*="cookie"]',
        'button[class*="cookie"][class*="accept"]',
      ];

      for (const selector of cookieButtonSelectors) {
        try {
          const cookieButton = await this.page.$(selector);
          if (cookieButton) {
            await cookieButton.click();
            scraperLogger.debug('Cookie consent accepted');
            await this.page.waitForTimeout(500);
            break;
          }
        } catch {
          // Continue trying other selectors
        }
      }
    } catch (error) {
      scraperLogger.debug('No cookie consent dialog found or already dismissed');
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

        // Handle cookie consent if it appears again
        await this.handleCookieConsent();

        // Check for Cloudflare challenge
        let title = await this.page!.title();
        if (this.isCloudflareChallenge(title)) {
          scraperLogger.warn(`Cloudflare challenge detected on ${category.name} page ${currentPage}, attempting to solve...`);
          const solved = await this.solveCloudflareChallenge();
          if (!solved) {
            scraperLogger.error(`Could not solve Cloudflare challenge for ${category.name}, skipping`);
            hasMorePages = false;
            continue;
          }
          title = await this.page!.title();
        }

        scraperLogger.info(`Page ${currentPage} loaded - Title: "${title}"`);

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
    throw new Error(`scrapeProductDetails not implemented. URL: ${url}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info('Cleaning up Kaufland scraper...');

    // Close persistent browser context
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
      scraperLogger.info('Stealth browser closed for Kaufland');
    }

    const stats = this.getStats();
    scraperLogger.info('Kaufland scraping completed:', stats);
  }
}
