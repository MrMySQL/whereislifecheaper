import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';

/**
 * Knuspr categories configuration
 * Category IDs extracted from URLs like /en-DE/c{id}-{slug}
 */
export const knusprCategories: CategoryConfig[] = [
  // Main categories (from actual website navigation)
  { id: '1', name: 'Obst & Gemüse', url: '/en-DE/c1-obst-gemuese' },
  { id: '652', name: 'Fleisch & Fisch', url: '/en-DE/c652-fleisch-fisch' },
  { id: '480', name: 'Brot & Gebäck', url: '/en-DE/c480-brot-gebaeck' },
  { id: '663', name: 'Wurst & Schinken', url: '/en-DE/c663-wurst-schinken' },
  { id: '532', name: 'Kühlregal', url: '/en-DE/c532-kuehlregal' },
  { id: '4668', name: 'Süßes & Salziges', url: '/en-DE/c4668-suesses-salziges' },
  { id: '510', name: 'Tiefkühlprodukte', url: '/en-DE/c510-tiefkuehlprodukte' },
  { id: '2416', name: 'Plant Based', url: '/en-DE/c2416-plant-based' },
  { id: '29', name: 'Kochen & Backen', url: '/en-DE/c29-kochen-backen' },
  { id: '115', name: 'Getränke', url: '/en-DE/c115-getraenke' },
  { id: '3212', name: 'Alternative Ernährung', url: '/en-DE/c3212-alternative-ernaehrung' },
  { id: '833', name: 'Baby & Kinder', url: '/en-DE/c833-baby-kinder' },
  { id: '712', name: 'Drogerie', url: '/en-DE/c712-drogerie' },
  { id: '773', name: 'Haushalt & Büro', url: '/en-DE/c773-haushalt-buero' },
  { id: '700', name: 'Tierbedarf', url: '/en-DE/c700-tierbedarf' },
  { id: '4915', name: 'Bistro', url: '/en-DE/c4915-bistro' },
];

/**
 * Knuspr scraper configuration
 */
export const knusprConfig: Partial<ScraperConfig> = {
  name: 'Knuspr',
  baseUrl: 'https://www.knuspr.de',
  categories: knusprCategories,
  selectors: {
    // Not used for API-based scraping, kept for compatibility
    productCard: '',
    productName: '',
    productPrice: '',
  },
  waitTimes: {
    pageLoad: 3000,
    dynamicContent: 2000,
    betweenRequests: 500,
    betweenPages: 300,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/**
 * Knuspr API response types
 */
interface KnusprCategoryResponse {
  categoryId: number;
  categoryType: string;
  productIds: number[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    offset: number;
    paged: boolean;
  };
}

interface KnusprProductData {
  id: number;
  name: string;
  slug: string;
  mainCategoryId: number;
  unit: string;
  textualAmount: string;
  badges: Array<{ type: string; title: string }>;
  archived: boolean;
  premiumOnly: boolean;
  brand: string | null;
  images: string[];
  weightedItem: boolean;
}

interface KnusprPriceData {
  productId: number;
  price: { amount: number; currency: string };
  pricePerUnit: { amount: number; currency: string };
  sales: Array<{
    id: number;
    type: string;
    price: { amount: number; currency: string };
    originalPrice: { amount: number; currency: string };
  }>;
}

/**
 * Combined product with price info
 */
interface KnusprProductWithPrice {
  product: KnusprProductData;
  priceInfo: KnusprPriceData;
}

/**
 * Scraper for Knuspr Germany (knuspr.de)
 * Uses the REST API for efficient data extraction
 * Requires browser context to establish session cookies
 *
 * API Flow:
 * 1. GET /categories/normal/{id}/products → productIds array (0-indexed pagination)
 * 2. GET /products?products=ID1&products=ID2... → product details array
 * 3. GET /products/prices?products=ID1&products=ID2... → price details array
 */
export class KnusprScraper extends BaseScraper {
  private readonly API_BASE = 'https://www.knuspr.de/api/v1';
  private readonly PAGE_SIZE = 50;
  private readonly BATCH_SIZE = 50; // How many products to fetch details at once

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with browser (needed for cookies/session)
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Knuspr API scraper...`);
    this.startTime = Date.now();

    // Launch browser to handle cookie consent and session
    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to main page
    scraperLogger.info('Navigating to Knuspr to establish session...');
    await this.page.goto('https://www.knuspr.de/en-DE/', { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();

    // Handle cookie consent if present
    await this.handleCookieConsent();

    scraperLogger.info(`Knuspr API scraper initialized`);
  }

  /**
   * Handle cookie consent dialog if present
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    try {
      // Wait a bit for cookie banner to appear
      await this.page.waitForTimeout(2000);

      // Common cookie consent button selectors
      const cookieButtonSelectors = [
        'button[data-testid="cookie-consent-accept"]',
        'button:has-text("Accept all")',
        'button:has-text("Alle akzeptieren")',
        'button:has-text("Accept")',
        '#onetrust-accept-btn-handler',
        '.cookie-consent-accept',
        '[class*="cookie"] button[class*="accept"]',
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
   * Scrape a single category using REST API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];
    const categoryId = category.id;

    try {
      scraperLogger.info(`Scraping category: ${category.name} (ID: ${categoryId})`);

      let page = 0; // Knuspr API uses 0-indexed pagination
      let hasMorePages = true;

      while (hasMorePages) {
        // Step 1: Get product IDs for this page
        const categoryResponse = await this.fetchCategoryProductIds(categoryId, page);

        if (!categoryResponse || categoryResponse.productIds.length === 0) {
          scraperLogger.debug(`No more products in category ${category.name} at page ${page}`);
          break;
        }

        const productIds = categoryResponse.productIds;
        scraperLogger.info(
          `${category.name}: Page ${page + 1}, found ${productIds.length} product IDs`
        );

        // Step 2: Fetch product details and prices in batches
        const productsWithPrices = await this.fetchProductsWithPrices(productIds);

        // Step 3: Convert to ProductData format
        const pageProducts = productsWithPrices.map((pwp) =>
          this.convertApiProduct(pwp, category.name)
        );

        // Save products via callback
        if (this.onPageScraped && pageProducts.length > 0) {
          const savedCount = await this.onPageScraped(pageProducts, {
            categoryId,
            categoryName: category.name,
            pageNumber: page + 1,
            totalProductsOnPage: pageProducts.length,
          });
          scraperLogger.info(
            `${category.name} page ${page + 1}: Saved ${savedCount}/${pageProducts.length} products`
          );
        }

        products.push(...pageProducts);
        this.productsScraped += pageProducts.length;

        // Check if there are more pages
        // If we got less than PAGE_SIZE products, we've reached the end
        if (productIds.length < this.PAGE_SIZE) {
          hasMorePages = false;
        } else {
          page++;
          // Small delay between pages
          await this.page?.waitForTimeout(this.config.waitTimes.betweenPages || 300);
        }
      }

      scraperLogger.info(`Category ${category.name}: Total ${products.length} products scraped`);
    } catch (error) {
      this.logError(
        `Failed to scrape category ${category.name}`,
        `${this.API_BASE}/categories/normal/${categoryId}/products`,
        error as Error
      );
    }

    return products;
  }

  /**
   * Fetch product IDs for a category page from the API
   */
  private async fetchCategoryProductIds(
    categoryId: string,
    page: number
  ): Promise<KnusprCategoryResponse | null> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = `${this.API_BASE}/categories/normal/${categoryId}/products?page=${page}&size=${this.PAGE_SIZE}&sort=recommended&filter=`;

    try {
      const response = await this.page.request.get(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en-DE,en;q=0.9,de;q=0.8',
        },
      });

      if (!response.ok()) {
        scraperLogger.warn(`API request failed: ${response.status()} ${response.statusText()}`);
        return null;
      }

      const data: KnusprCategoryResponse = await response.json();
      return data;
    } catch (error) {
      scraperLogger.error(`Failed to fetch ${url}:`, error);
      return null;
    }
  }

  /**
   * Fetch product details and prices for given product IDs
   */
  private async fetchProductsWithPrices(productIds: number[]): Promise<KnusprProductWithPrice[]> {
    if (!this.page || productIds.length === 0) {
      return [];
    }

    const results: KnusprProductWithPrice[] = [];

    // Process in batches to avoid too-long URLs
    for (let i = 0; i < productIds.length; i += this.BATCH_SIZE) {
      const batch = productIds.slice(i, i + this.BATCH_SIZE);
      const productsParam = batch.map((id) => `products=${id}`).join('&');

      try {
        // Fetch product details and prices in parallel
        const [productsResponse, pricesResponse] = await Promise.all([
          this.page.request.get(`${this.API_BASE}/products?${productsParam}`, {
            headers: { Accept: 'application/json' },
          }),
          this.page.request.get(`${this.API_BASE}/products/prices?${productsParam}`, {
            headers: { Accept: 'application/json' },
          }),
        ]);

        if (!productsResponse.ok() || !pricesResponse.ok()) {
          scraperLogger.warn(`Failed to fetch batch: products=${productsResponse.status()}, prices=${pricesResponse.status()}`);
          continue;
        }

        const productsData: KnusprProductData[] = await productsResponse.json();
        const pricesData: KnusprPriceData[] = await pricesResponse.json();

        // Create a map of prices by productId
        const priceMap = new Map<number, KnusprPriceData>();
        for (const price of pricesData) {
          priceMap.set(price.productId, price);
        }

        // Combine products with their prices
        for (const product of productsData) {
          const priceInfo = priceMap.get(product.id);
          if (priceInfo) {
            results.push({ product, priceInfo });
          } else {
            scraperLogger.debug(`No price found for product ${product.id}: ${product.name}`);
          }
        }
      } catch (error) {
        scraperLogger.error(`Failed to fetch product batch:`, error);
      }

      // Small delay between batches
      if (i + this.BATCH_SIZE < productIds.length) {
        await this.page.waitForTimeout(100);
      }
    }

    return results;
  }

  /**
   * Convert Knuspr API product to ProductData format
   */
  private convertApiProduct(
    productWithPrice: KnusprProductWithPrice,
    categoryName: string
  ): ProductData {
    const { product, priceInfo } = productWithPrice;
    const { unit, unitQuantity } = this.parseGermanUnit(product.textualAmount);

    // Check for active sale
    const activeSale = priceInfo.sales.find(
      (s) => s.originalPrice && s.originalPrice.amount > priceInfo.price.amount
    );
    const isOnSale = !!activeSale;
    const originalPrice = activeSale?.originalPrice?.amount;

    // Build product URL
    const productUrl = `https://www.knuspr.de/en-DE/p${product.id}-${product.slug}`;

    // Get first image URL
    const imageUrl = product.images.length > 0 ? product.images[0] : undefined;

    return {
      name: product.name,
      price: priceInfo.price.amount,
      currency: priceInfo.price.currency,
      originalPrice: isOnSale ? originalPrice : undefined,
      isOnSale,
      imageUrl,
      productUrl,
      brand: product.brand || undefined,
      unit,
      unitQuantity,
      isAvailable: !product.archived,
      externalId: product.id.toString(),
      categoryName,
    };
  }

  /**
   * Parse German unit format to standard format
   * Examples: "ca. 270 g", "1 kg", "500 ml", "6 Stück", "1 l", "250g", "1 pc"
   */
  private parseGermanUnit(textualAmount: string): { unit?: string; unitQuantity?: number } {
    if (!textualAmount) {
      return { unit: undefined, unitQuantity: undefined };
    }

    const text = textualAmount.toLowerCase().trim();

    // Remove "ca. " prefix (approximately)
    const cleanedText = text.replace(/^ca\.\s*/i, '');

    // Handle multi-pack format (e.g., "6 x 1,5 l", "4 x 250 ml")
    const multiPackMatch = cleanedText.match(
      /(\d+)\s*x\s*(\d+[,.]?\d*)\s*(kg|g|l|liter|ml|stück|st\.?|stk\.?|pc)/i
    );
    if (multiPackMatch) {
      const count = parseInt(multiPackMatch[1], 10);
      const unitSize = parseFloat(multiPackMatch[2].replace(',', '.'));
      const unitType = multiPackMatch[3].toLowerCase();
      const totalQuantity = count * unitSize;

      return this.normalizeUnit(unitType, totalQuantity);
    }

    // Standard format (e.g., "500 g", "1,5 l", "270g", "1 pc")
    const standardMatch = cleanedText.match(
      /(\d+[,.]?\d*)\s*(kg|g|l|liter|ml|stück|st\.?|stk\.?|stueck|pc)/i
    );
    if (standardMatch) {
      const quantity = parseFloat(standardMatch[1].replace(',', '.'));
      const unitType = standardMatch[2].toLowerCase();

      return this.normalizeUnit(unitType, quantity);
    }

    // Just a number with "Stück" or "pc" (pieces)
    const piecesMatch = cleanedText.match(/(\d+)\s*(stück|st\.?|stk\.?|stueck|pc)/i);
    if (piecesMatch) {
      const quantity = parseInt(piecesMatch[1], 10);
      return { unit: 'pieces', unitQuantity: quantity };
    }

    // Just "Stück" or "pc" without number
    if (
      cleanedText.includes('stück') ||
      cleanedText.includes('st.') ||
      cleanedText.includes('stk') ||
      cleanedText === 'pc'
    ) {
      return { unit: 'pieces', unitQuantity: 1 };
    }

    return { unit: undefined, unitQuantity: undefined };
  }

  /**
   * Normalize unit type and quantity to standard format
   */
  private normalizeUnit(
    unitType: string,
    quantity: number
  ): { unit?: string; unitQuantity?: number } {
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
      case 'stueck':
      case 'st.':
      case 'st':
      case 'stk.':
      case 'stk':
      case 'pc':
        return { unit: 'pieces', unitQuantity: quantity };
      default:
        return { unit: unitType, unitQuantity: quantity };
    }
  }

  /**
   * Scrape detailed product information (not needed for API-based scraping)
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    // For API-based scraping, we get all details from the products endpoints
    throw new Error(`scrapeProductDetails not implemented for API-based scraper. URL: ${url}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up Knuspr API scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Knuspr scraping completed:', stats);
  }
}
