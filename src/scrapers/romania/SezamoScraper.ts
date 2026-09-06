import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';

/**
 * Sezamo categories configuration
 * Category IDs extracted from URLs like /en-RO/c{id}-{slug}
 */
export const sezamoCategories: CategoryConfig[] = [
  { id: '627', name: 'Fruit & Vegetables', url: '/en-RO/c627-fructe-si-legume' },
  { id: '626', name: 'Bakery', url: '/en-RO/c626-brutarie-si-patiserie' },
  { id: '631', name: 'Chilled Food', url: '/en-RO/c631-lactate-si-oua' },
  { id: '628', name: 'Meat & Fish', url: '/en-RO/c628-carne-si-peste' },
  { id: '630', name: 'Ready to Eat & Cook', url: '/en-RO/c630-ready-to-eat-cook' },
  { id: '629', name: 'Cooked Meats & Deli', url: '/en-RO/c629-mezeluri' },
  { id: '2621', name: 'Plant Based', url: '/en-RO/c2621-plant-based' },
  { id: '632', name: 'Food Cupboard', url: '/en-RO/c632-bacanie' },
  { id: '633', name: 'Frozen Food', url: '/en-RO/c633-produse-congelate' },
  { id: '634', name: 'Drinks', url: '/en-RO/c634-bauturi' },
  { id: '635', name: 'Cleaning & Home Care', url: '/en-RO/c635-curatenie-si-detergenti' },
  { id: '636', name: 'Health, Beauty & Personal Care', url: '/en-RO/c636-cosmetice' },
  { id: '637', name: 'Baby, Kids & Parents', url: '/en-RO/c637-mama-si-copilul' },
  { id: '638', name: 'Household & Office', url: '/en-RO/c638-menaj-si-birou' },
  { id: '639', name: 'Pets', url: '/en-RO/c639-pet-shop' },
  { id: '2364', name: 'Dietary Foods', url: '/en-RO/c2364-nutritie-speciala' },
];

/**
 * Sezamo scraper configuration
 */
export const sezamoConfig: Partial<ScraperConfig> = {
  name: 'Sezamo',
  baseUrl: 'https://www.sezamo.ro',
  categories: sezamoCategories,
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
 * Sezamo API response types (same Rohlik engine as Gurkerl/Knuspr)
 */
interface SezamoCategoryResponse {
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

interface SezamoProductData {
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

interface SezamoPriceData {
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

interface SezamoProductWithPrice {
  product: SezamoProductData;
  priceInfo: SezamoPriceData;
}

/**
 * Scraper for Sezamo Romania (sezamo.ro)
 * Uses the REST API for efficient data extraction (same Rohlik engine as Gurkerl/Knuspr)
 * Requires browser context to establish session cookies
 *
 * API Flow:
 * 1. GET /categories/normal/{id}/products → productIds array (0-indexed pagination)
 * 2. GET /products?products=ID1&products=ID2... → product details array
 * 3. GET /products/prices?products=ID1&products=ID2... → price details array
 */
export class SezamoScraper extends BaseScraper {
  private readonly API_BASE = 'https://www.sezamo.ro/api/v1';
  private readonly PAGE_SIZE = 50;
  private readonly BATCH_SIZE = 50;

  constructor(config: ScraperConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing Sezamo API scraper...`);
    this.startTime = Date.now();

    await this.launchBrowser();
    this.page = await this.createPage();

    this.logger.info('Navigating to Sezamo to establish session...');
    await this.page.goto('https://www.sezamo.ro/en-RO/', { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();

    await this.handleCookieConsent();

    this.logger.info(`Sezamo API scraper initialized`);
  }

  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    try {
      await this.page.waitForTimeout(2000);

      const cookieButtonSelectors = [
        'button[data-testid="cookie-consent-accept"]',
        'button:has-text("Accept all")',
        'button:has-text("Acceptă toate")',
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

  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];
    const categoryId = category.id;

    try {
      this.logger.info(`Scraping category: ${category.name} (ID: ${categoryId})`);

      let page = 0;
      let hasMorePages = true;

      while (hasMorePages) {
        const categoryResponse = await this.fetchCategoryProductIds(categoryId, page);

        if (!categoryResponse) {
          // fetchCategoryProductIds logged the cause and returned null: a
          // failed request, not the end of the category. We give the category
          // up here; BaseScraper decides whether that lost it or truncated it.
          this.failCategory(
            category,
            `page ${page + 1} could not be fetched`,
            `${this.API_BASE}/categories/normal/${categoryId}/products`
          );
          break;
        }
        if (categoryResponse.productIds.length === 0) {
          this.logger.debug(`No more products in category ${category.name} at page ${page}`);
          break;
        }

        const productIds = categoryResponse.productIds;
        this.logger.info(
          `${category.name}: Page ${page + 1}, found ${productIds.length} product IDs`
        );

        const productsWithPrices = await this.fetchProductsWithPrices(productIds);

        const pageProducts = productsWithPrices.map((pwp) =>
          this.convertApiProduct(pwp, category.name)
        );

        if (this.onPageScraped && pageProducts.length > 0) {
          const savedCount = await this.onPageScraped(pageProducts, {
            categoryId,
            categoryName: category.name,
            pageNumber: page + 1,
            totalProductsOnPage: pageProducts.length,
          });
          this.logger.info(
            `${category.name} page ${page + 1}: Saved ${savedCount}/${pageProducts.length} products`
          );
        }

        products.push(...pageProducts);
        this.productsScraped += pageProducts.length;

        if (productIds.length < this.PAGE_SIZE) {
          hasMorePages = false;
        } else {
          page++;
          await this.page?.waitForTimeout(this.config.waitTimes.betweenPages || 300);
        }
      }

      this.logger.info(`Category ${category.name}: Total ${products.length} products scraped`);
    } catch (error) {
      this.failCategory(category, error, `${this.API_BASE}/categories/normal/${categoryId}/products`);
    }

    return products;
  }

  private async fetchCategoryProductIds(
    categoryId: string,
    page: number
  ): Promise<SezamoCategoryResponse | null> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = `${this.API_BASE}/categories/normal/${categoryId}/products?page=${page}&size=${this.PAGE_SIZE}&sort=recommended&filter=`;

    try {
      const response = await this.page.request.get(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en-RO,en;q=0.9,ro;q=0.8',
        },
      });

      if (!response.ok()) {
        this.logger.warn(`API request failed: ${response.status()} ${response.statusText()}`);
        return null;
      }

      const data: SezamoCategoryResponse = await response.json();
      return data;
    } catch (error) {
      this.logger.error(`Failed to fetch ${url}:`, error);
      return null;
    }
  }

  private async fetchProductsWithPrices(productIds: number[]): Promise<SezamoProductWithPrice[]> {
    if (!this.page || productIds.length === 0) {
      return [];
    }

    const results: SezamoProductWithPrice[] = [];

    for (let i = 0; i < productIds.length; i += this.BATCH_SIZE) {
      const batch = productIds.slice(i, i + this.BATCH_SIZE);
      const productsParam = batch.map((id) => `products=${id}`).join('&');

      try {
        const [productsResponse, pricesResponse] = await Promise.all([
          this.page.request.get(`${this.API_BASE}/products?${productsParam}`, {
            headers: { Accept: 'application/json' },
          }),
          this.page.request.get(`${this.API_BASE}/products/prices?${productsParam}`, {
            headers: { Accept: 'application/json' },
          }),
        ]);

        if (!productsResponse.ok() || !pricesResponse.ok()) {
          this.logger.warn(`Failed to fetch batch: products=${productsResponse.status()}, prices=${pricesResponse.status()}`);
          continue;
        }

        const productsData: SezamoProductData[] = await productsResponse.json();
        const pricesData: SezamoPriceData[] = await pricesResponse.json();

        const priceMap = new Map<number, SezamoPriceData>();
        for (const price of pricesData) {
          priceMap.set(price.productId, price);
        }

        for (const product of productsData) {
          const priceInfo = priceMap.get(product.id);
          if (priceInfo) {
            results.push({ product, priceInfo });
          } else {
            this.logger.debug(`No price found for product ${product.id}: ${product.name}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to fetch product batch:`, error);
      }

      if (i + this.BATCH_SIZE < productIds.length) {
        await this.page.waitForTimeout(100);
      }
    }

    return results;
  }

  private convertApiProduct(
    productWithPrice: SezamoProductWithPrice,
    categoryName: string
  ): ProductData {
    const { product, priceInfo } = productWithPrice;
    const { unit, unitQuantity } = this.parseUnit(product.textualAmount);

    const activeSale = priceInfo.sales.find(
      (s) => s.originalPrice && s.originalPrice.amount > priceInfo.price.amount
    );
    const isOnSale = !!activeSale;
    const originalPrice = activeSale?.originalPrice?.amount;

    const productUrl = `https://www.sezamo.ro/en-RO/p${product.id}-${product.slug}`;

    const imageUrl = product.images.length > 0 ? product.images[0] : undefined;

    return {
      name: product.name,
      price: isOnSale && activeSale ? activeSale.price.amount : priceInfo.price.amount,
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
   * Parse unit format to standard format
   * Sezamo uses English units: "1 pc", "500 g", "1 kg", "1.5 l", "6 x 250 ml"
   */
  private parseUnit(textualAmount: string): { unit?: string; unitQuantity?: number } {
    if (!textualAmount) {
      return { unit: undefined, unitQuantity: undefined };
    }

    const text = textualAmount.toLowerCase().trim();

    // Remove "ca. " or "approx. " prefix
    const cleanedText = text.replace(/^(ca\.|approx\.?)\s*/i, '');

    // Handle multi-pack format (e.g., "6 x 1.5 l", "4 x 250 ml")
    const multiPackMatch = cleanedText.match(
      /(\d+)\s*x\s*(\d+[,.]?\d*)\s*(kg|g|l|liter|ml|pc|pcs|buc|stk)/i
    );
    if (multiPackMatch) {
      const count = parseInt(multiPackMatch[1], 10);
      const unitSize = parseFloat(multiPackMatch[2].replace(',', '.'));
      const unitType = multiPackMatch[3].toLowerCase();
      const totalQuantity = count * unitSize;

      return this.normalizeUnit(unitType, totalQuantity);
    }

    // Standard format (e.g., "500 g", "1.5 l", "270g", "1 pc")
    const standardMatch = cleanedText.match(
      /(\d+[,.]?\d*)\s*(kg|g|l|liter|ml|pc|pcs|buc|stk)/i
    );
    if (standardMatch) {
      const quantity = parseFloat(standardMatch[1].replace(',', '.'));
      const unitType = standardMatch[2].toLowerCase();

      return this.normalizeUnit(unitType, quantity);
    }

    // Just pieces keywords without number
    if (cleanedText === 'pc' || cleanedText === 'pcs' || cleanedText === 'buc') {
      return { unit: 'pieces', unitQuantity: 1 };
    }

    return { unit: undefined, unitQuantity: undefined };
  }

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
      case 'pc':
      case 'pcs':
      case 'buc':
      case 'stk':
        return { unit: 'pieces', unitQuantity: quantity };
      default:
        return { unit: unitType, unitQuantity: quantity };
    }
  }

  async scrapeProductDetails(url: string): Promise<ProductData> {
    throw new Error(`scrapeProductDetails not implemented for API-based scraper. URL: ${url}`);
  }

  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up Sezamo API scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    this.logger.info('Sezamo scraping completed:', stats);
  }
}
