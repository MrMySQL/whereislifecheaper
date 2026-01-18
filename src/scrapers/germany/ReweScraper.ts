import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
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
 * Scraper for REWE Germany (www.rewe.de/shop/)
 *
 * This scraper uses playwright-extra with stealth plugin to bypass Cloudflare:
 * 1. Launches browser with stealth mode and persistent session
 * 2. Navigates to www.rewe.de/shop/
 * 3. Selects "Lieferservice" (delivery service) option
 * 4. Enters postal code 10115 (Berlin) to set delivery zone
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
  private browserContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with stealth browser and select delivery market
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing REWE scraper with stealth mode...`);
    this.startTime = Date.now();

    // Launch browser with stealth mode
    await this.launchStealthBrowser();

    // Navigate to shop page and select delivery market
    await this.selectDeliveryMarket();

    scraperLogger.info(`REWE scraper initialized with delivery zone ${this.POSTAL_CODE}`);
  }

  /**
   * Launch browser with stealth plugin and persistent context
   */
  private async launchStealthBrowser(): Promise<void> {
    scraperLogger.info('Launching stealth browser for REWE...');

    // Create persistent session directory
    const sessionDir = path.join(os.tmpdir(), 'rewe-scraper-session');

    // Randomize viewport slightly for fingerprint variation
    const viewportWidth = 1920 + Math.floor(Math.random() * 100);
    const viewportHeight = 1080 + Math.floor(Math.random() * 50);

    // Launch with persistent context for session management
    this.browserContext = await chromium.launchPersistentContext(sessionDir, {
      // headless: false, // Headed mode is more reliable for Cloudflare bypass
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
      viewport: { width: viewportWidth, height: viewportHeight },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
      { name: 'userCountry', value: 'DE', domain: '.rewe.de', path: '/' },
    ]);

    scraperLogger.info('Stealth browser launched successfully');
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
          // No iframe found - maybe it's a different type of challenge or auto-solving
          scraperLogger.debug('No Turnstile iframe found, challenge may auto-solve');
        }

        // Wait for challenge to complete
        await this.page.waitForTimeout(waitBetweenAttempts);

        // Check if we're past the challenge
        const newTitle = await this.page.title();
        if (!newTitle.toLowerCase().includes('moment')) {
          scraperLogger.info('Cloudflare challenge solved successfully!');
          return true;
        }

        // Also check if the page URL changed (redirect after solving)
        const currentUrl = this.page.url();
        if (currentUrl.includes('/shop/') && !currentUrl.includes('challenge')) {
          scraperLogger.info('Cloudflare challenge solved (URL redirect detected)!');
          return true;
        }

      } catch (error) {
        scraperLogger.debug(`Cloudflare solve attempt ${attempt} failed:`, error);
      }

      // Wait before next attempt
      if (attempt < maxAttempts) {
        scraperLogger.info(`Waiting before next attempt...`);
        await this.page.waitForTimeout(waitBetweenAttempts);
      }
    }

    scraperLogger.warn('Could not solve Cloudflare challenge after all attempts');
    return false;
  }

  /**
   * Select a delivery market by entering postal code
   * This enables actual prices to be displayed
   */
  private async selectDeliveryMarket(): Promise<void> {
    if (!this.page) return;

    try {
      scraperLogger.info('Navigating to REWE shop to select delivery market...');

      // Navigate to the shop page
      await this.page.goto(`${this.BASE_URL}/shop/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await this.page.waitForTimeout(2000);

      // Handle cookie consent first
      await this.handleCookieConsent();

      // Check for Cloudflare challenge and try to solve it
      const title = await this.page.title();
      if (title.toLowerCase().includes('moment')) {
        scraperLogger.warn('Cloudflare challenge detected on shop page. Attempting to solve...');
        const solved = await this.solveCloudflareChallenge();
        if (!solved) {
          scraperLogger.error('Could not bypass Cloudflare challenge');
          return;
        }
      }

      // Click on "Lieferservice" option
      scraperLogger.info('Looking for Lieferservice option...');

      // Try different selectors for the Lieferservice button
      const lieferserviceSelectors = [
        'text=Lieferservice',
        'button:has-text("Lieferservice")',
        '[data-testid*="delivery"]',
        'a:has-text("Lieferservice")',
      ];

      let clicked = false;
      for (const selector of lieferserviceSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await element.click();
            clicked = true;
            scraperLogger.info('Clicked Lieferservice option');
            break;
          }
        } catch {
          // Continue trying other selectors
        }
      }

      if (!clicked) {
        scraperLogger.warn('Could not find Lieferservice button, trying postal code input directly');
      }

      await this.page.waitForTimeout(1500);

      // Enter postal code
      scraperLogger.info(`Entering postal code ${this.POSTAL_CODE}...`);

      // Look for postal code input field
      const postalInputSelectors = [
        'input[placeholder*="Postleitzahl"]',
        'input[placeholder*="PLZ"]',
        'input[type="text"][name*="zip"]',
        'input[type="text"][name*="postal"]',
        'input[type="number"]',
        'input[inputmode="numeric"]',
      ];

      let inputFound = false;
      for (const selector of postalInputSelectors) {
        try {
          const input = await this.page.$(selector);
          if (input) {
            await input.click();
            await input.fill(this.POSTAL_CODE);
            inputFound = true;
            scraperLogger.info('Entered postal code');
            break;
          }
        } catch {
          // Continue trying other selectors
        }
      }

      if (!inputFound) {
        // Try typing in the focused element or any visible input
        try {
          await this.page.keyboard.type(this.POSTAL_CODE);
          inputFound = true;
          scraperLogger.info('Typed postal code into focused element');
        } catch {
          scraperLogger.warn('Could not find postal code input');
        }
      }

      await this.page.waitForTimeout(1000);

      // Click "Lieferservice finden" button
      scraperLogger.info('Looking for Lieferservice finden button...');

      const findButtonSelectors = [
        'text=Lieferservice finden',
        'button:has-text("Lieferservice finden")',
        'button:has-text("finden")',
        'button[type="submit"]',
      ];

      for (const selector of findButtonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            scraperLogger.info('Clicked Lieferservice finden button');
            break;
          }
        } catch {
          // Continue trying other selectors
        }
      }

      // Wait for market selection to complete
      await this.page.waitForTimeout(3000);

      // Verify market was selected by checking for delivery info or prices
      const pageContent = await this.page.content();
      if (pageContent.includes('Lieferung') || pageContent.includes('€')) {
        this.marketSelected = true;
        scraperLogger.info('Delivery market selected successfully');
      } else {
        scraperLogger.warn('Market selection may not have completed successfully');
      }

    } catch (error) {
      scraperLogger.error('Failed to select delivery market:', error);
    }
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
   * Scrape a single category with pagination support
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];

    try {
      const baseCategoryUrl = `${this.BASE_URL}${category.url}`;
      scraperLogger.info(`Scraping category: ${category.name} from ${baseCategoryUrl}`);

      if (!this.page) return products;

      // Warn if market wasn't selected
      if (!this.marketSelected) {
        scraperLogger.warn('Market not selected - products may not have prices');
      }

      // Navigate to first page
      scraperLogger.debug(`Navigating to ${baseCategoryUrl}`);
      await this.page.goto(baseCategoryUrl, { waitUntil: 'domcontentloaded' });
      await this.waitForDynamicContent();

      // Handle cookie consent if it appears again
      await this.handleCookieConsent();

      // Check page title
      const title = await this.page.title();
      scraperLogger.info(`Page title: ${title}`);

      // If Cloudflare challenge is present, skip this category
      if (title.includes('moment') || title.includes('Moment')) {
        scraperLogger.warn(`Cloudflare challenge detected for ${category.name}, skipping`);
        return products;
      }

      // Get total pages from pagination
      const totalPages = await this.getTotalPages();
      scraperLogger.info(`Category ${category.name}: Found ${totalPages} pages`);

      // Scrape each page
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          // Navigate to page (skip for first page as we're already there)
          if (pageNum > 1) {
            const pageUrl = `${baseCategoryUrl}?page=${pageNum}`;
            scraperLogger.debug(`Navigating to page ${pageNum}: ${pageUrl}`);
            await this.page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
            await this.waitForDynamicContent();

            // Check for Cloudflare on subsequent pages
            const pageTitle = await this.page.title();
            if (pageTitle.includes('moment') || pageTitle.includes('Moment')) {
              scraperLogger.warn(`Cloudflare challenge on page ${pageNum}, stopping pagination`);
              break;
            }
          }

          // Scroll to load lazy-loaded images
          await this.loadAllProducts();

          // Extract products from the page
          const pageProducts = await this.extractProductsFromPage();

          // Count products with and without prices
          const productsWithPrice = pageProducts.filter(p => p.price > 0).length;
          const productsWithoutPrice = pageProducts.length - productsWithPrice;

          scraperLogger.info(`${category.name} page ${pageNum}/${totalPages}: Found ${pageProducts.length} products (${productsWithPrice} with price)`);

          if (productsWithoutPrice > 0 && productsWithPrice === 0 && pageNum === 1) {
            scraperLogger.warn(`All products show location-dependent pricing. No market/delivery zone selected.`);
          }

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
            scraperLogger.info(`${category.name} page ${pageNum}: Saved ${savedCount}/${parsedProducts.length} products`);
          }

          products.push(...parsedProducts);

          // Small delay between pages to avoid rate limiting
          if (pageNum < totalPages) {
            await this.page.waitForTimeout(1000);
          }
        } catch (pageError) {
          scraperLogger.error(`Failed to scrape page ${pageNum} of ${category.name}:`, pageError);
          // Continue to next page on error
        }
      }

      scraperLogger.info(`Category ${category.name}: Total ${products.length} products scraped from ${totalPages} pages`);
    } catch (error) {
      this.logError(
        `Failed to scrape category ${category.name}`,
        `${this.BASE_URL}${category.url}`,
        error as Error
      );
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
      scraperLogger.debug('Could not determine total pages, defaulting to 1');
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

      scraperLogger.debug(`Scroll ${scrollCount}: ${currentProductCount} products loaded`);
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
      scraperLogger.error('Failed to extract products from page:', error);
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
          scraperLogger.debug(`Skipping product without price: ${item.name}`);
          continue;
        }

        const { unit, unitQuantity } = this.parseUnit(item.grammage);

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
        scraperLogger.debug(`Failed to parse product: ${item.name}`, error);
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
   * Scrape detailed product information
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    throw new Error(`scrapeProductDetails not implemented for page-based scraper. URL: ${url}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up REWE scraper...`);

    // Close persistent browser context
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
      scraperLogger.info('Stealth browser closed');
    }

    const stats = this.getStats();
    scraperLogger.info('REWE scraping completed:', stats);
  }
}
