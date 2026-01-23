import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { extractQuantity } from '../../utils/normalizer';
import { BrowserContext } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

/**
 * Lotus's API product type
 */
interface LotussApiProduct {
  id: number;
  sku: string;
  urlKey: string;
  name: string;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
  sellingType: string;
  weightPerPiece: number;
  unitOfWeight: string;
  unitOfQuantity: string;
  priceRange: {
    minimumPrice: {
      regularPrice: { value: number; currency: string };
      finalPrice: { value: number; currency: string };
      discount: { amountOff: number; percentOff: number };
    };
  };
  breadcrumb: Array<{ id: number; name: string; urlKey: string }>;
  links?: {
    brand?: { id: string; name: string; urlKey: string };
    category?: { id: number; name: string; urlKey: string };
  };
  thumbnail?: { url: string };
  image?: { url: string };
}

interface LotussCategoryResponse {
  status: { code: number; message: string };
  data: {
    id: number;
    name: string;
    urlKey: string;
    children: LotussCategory[];
  };
}

interface LotussCategory {
  id: number;
  level: number;
  name: string;
  urlKey: string;
  children?: LotussCategory[];
}

/**
 * Lotus's API categories - using urlKey for API calls
 * IDs fetched from: https://api-o2o.lotuss.com.my/lotuss-mobile-bff/product/v1/categories/4?websiteCode=malaysia_hy
 */
export const lotussApiCategories: CategoryConfig[] = [
  { id: '3189', name: 'Fresh Produce', url: 'fresh-produce' },
  { id: '5304', name: 'Meat & Poultry', url: 'meat-poultry' },
  { id: '23946', name: 'Chilled & Frozen', url: 'chilled-frozen' },
  { id: '6504', name: 'Bakery', url: 'bakery' },
  { id: '9405', name: 'Beverages', url: 'beverages' },
  { id: '2730', name: 'Grocery', url: 'grocery' },
  { id: '6003', name: 'Baby', url: 'baby' },
  { id: '49146', name: 'Household', url: 'household' },
  { id: '5763', name: 'Health & Beauty', url: 'health-beauty' },
  { id: '5475', name: 'Pets', url: 'pets' },
  { id: '5349', name: 'Home & Gardening', url: 'home-gardening' },
  { id: '5868', name: 'Appliances', url: 'appliances' },
  { id: '5976', name: 'AV & Tech', url: 'av-tech' },
  { id: '5499', name: 'Sports & Leisure', url: 'sports-leisure' },
  { id: '5370', name: 'Office, Bags & Stationery', url: 'office-bags-stationery' },
  { id: '49080', name: 'Pasta & Instant Food', url: 'pasta-instant-food' },
  { id: '2808', name: 'Commodities', url: 'commodities' }
];

/**
 * Lotus's API scraper configuration
 */
export const lotussApiConfig: Partial<ScraperConfig> = {
  name: "Lotus's (API)",
  baseUrl: 'https://api-o2o.lotuss.com.my/lotuss-mobile-bff',
  categories: lotussApiCategories,
  selectors: {
    productCard: '',
    productName: '',
    productPrice: '',
  },
  waitTimes: {
    pageLoad: 1000,
    dynamicContent: 500,
    betweenRequests: 500,  // Faster since we're using API
  },
  maxRetries: 3,
  concurrentPages: 1,
  headers: {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en',
    'channel': 'web',
    'version': '2.3.8',
    'key': 'SeiRQmEDnaZXOlpfKhCjV4Bo2y6vAcW99QKmzifsgP2uCMN7wF3ahRXex84kH6qUVIWoY5Dp0GEljdAvS1JytOZcLbnBTr',
  },
};

/**
 * API-based scraper for Lotus's Malaysia (lotuss.com.my)
 * Uses Playwright to establish session, then makes direct API calls
 */
export class LotussApiScraper extends BaseScraper {
  private context: BrowserContext | null = null;
  private readonly WEBSITE_CODE = 'malaysia_hy';
  private apiHeaders: Record<string, string> = {};
  private capturedProducts: Map<string, LotussApiProduct[]> = new Map();

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper - establish browser session for API calls
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing Lotus's API scraper...`);
    this.startTime = Date.now();

    // Set up API headers
    this.apiHeaders = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en',
      'channel': 'web',
      'version': '2.3.8',
      'key': 'SeiRQmEDnaZXOlpfKhCjV4Bo2y6vAcW99QKmzifsgP2uCMN7wF3ahRXex84kH6qUVIWoY5Dp0GEljdAvS1JytOZcLbnBTr',
    };

    // Launch browser with stealth plugin to bypass bot detection
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
    this.logger.info(`Launching browser in ${isHeadless ? 'headless' : 'headed'} mode with stealth plugin`);

    // Add stealth plugin to avoid bot detection
    chromium.use(StealthPlugin());

    this.browser = await chromium.launch({
      headless: isHeadless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: this.getUserAgent(),
      viewport: { width: 1920, height: 1080 },
    });

    this.page = await this.context.newPage();

    // Set up route interception to capture API responses
    await this.page.route('**/lotuss-mobile-bff/product/v2/products**', async (route) => {
      const response = await route.fetch();
      const body = await response.json();

      if (body?.data?.products) {
        // Extract category from the request URL
        const url = route.request().url();
        const queryMatch = url.match(/q=([^&]+)/);
        if (queryMatch) {
          const query = JSON.parse(decodeURIComponent(queryMatch[1]));
          // API uses either categoryId or categoryUrlKey depending on category
          const categoryId = query?.filter?.categoryId?.[0];
          const categoryUrlKey = query?.filter?.categoryUrlKey;

          // Store under both keys if available (for lookup flexibility)
          const keys: string[] = [];
          if (categoryId) keys.push(String(categoryId));
          if (categoryUrlKey) keys.push(categoryUrlKey);
          if (keys.length === 0) keys.push('unknown');

          for (const key of keys) {
            const existing = this.capturedProducts.get(key) || [];
            this.capturedProducts.set(key, [...existing, ...body.data.products]);
          }
          this.logger.debug(`Captured ${body.data.products.length} products for category keys: ${keys.join(', ')}`);
        }
      }

      await route.fulfill({ response });
    });

    // Visit homepage first to establish session
    await this.page.goto('https://www.lotuss.com.my/en', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await this.page.waitForTimeout(3000);

    this.logger.info(`Lotus's API scraper initialized`);
  }

  /**
   * Scrape a single category by navigating to category pages and capturing API responses
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const products: ProductData[] = [];

    this.logger.info(`Scraping category: ${category.name} (ID: ${category.id})`);

    // Clear any previously captured products for this category (both id and url keys)
    this.capturedProducts.delete(category.id);
    this.capturedProducts.delete(category.url);

    // Navigate to the category page - this will trigger API calls that we intercept
    const categoryUrl = `https://www.lotuss.com.my/en/category/${category.url}`;
    this.logger.info(`Navigating to ${categoryUrl}`);

    try {
      await this.page.goto(categoryUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Wait for products to load
      await this.page.waitForSelector('[class*="product"]', { timeout: 30000 });
      await this.page.waitForTimeout(2000);

      // Scroll to load more products (trigger lazy loading)
      let previousHeight = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 20;

      while (scrollAttempts < maxScrollAttempts) {
        const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);

        if (currentHeight === previousHeight) {
          // No more content to load
          break;
        }

        previousHeight = currentHeight;
        await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await this.page.waitForTimeout(1500);
        scrollAttempts++;

        const capturedById = this.capturedProducts.get(category.id)?.length || 0;
        const capturedByUrl = this.capturedProducts.get(category.url)?.length || 0;
        this.logger.debug(`${category.name}: Scroll attempt ${scrollAttempts}, captured ${capturedById || capturedByUrl} products`);
      }

      // Get captured products (try both category.id and category.url as keys)
      const apiProducts = this.capturedProducts.get(category.id) || this.capturedProducts.get(category.url) || [];
      this.logger.info(`${category.name}: Captured ${apiProducts.length} products from API intercepts`);

      // Convert and deduplicate products
      const seenSkus = new Set<string>();
      for (const p of apiProducts) {
        if (seenSkus.has(p.sku)) continue;
        seenSkus.add(p.sku);

        const converted = this.convertApiProduct(p, category.name);
        if (converted) {
          products.push(converted);
        }
      }

      // Save products via callback
      if (this.onPageScraped && products.length > 0) {
        const savedCount = await this.onPageScraped(products, {
          categoryId: category.id,
          categoryName: category.name,
          pageNumber: 1,
          totalProductsOnPage: products.length,
        });
        this.logger.info(`${category.name}: Saved ${savedCount}/${products.length} products`);
      }

      this.productsScraped += products.length;

    } catch (error) {
      this.logError(
        `Failed to scrape category ${category.name}`,
        categoryUrl,
        error as Error
      );
    }

    this.logger.info(`${category.name}: Total ${products.length} products scraped`);
    return products;
  }

  /**
   * Convert API product to ProductData format
   */
  private convertApiProduct(
    apiProduct: LotussApiProduct,
    categoryName: string
  ): ProductData | null {
    try {
      const regularPrice = apiProduct.priceRange?.minimumPrice?.regularPrice?.value;
      const finalPrice = apiProduct.priceRange?.minimumPrice?.finalPrice?.value;
      const discount = apiProduct.priceRange?.minimumPrice?.discount;

      if (!finalPrice || finalPrice <= 0) {
        return null;
      }

      // Determine if on sale
      const isOnSale = discount?.percentOff > 0 || (regularPrice > finalPrice);
      const originalPrice = isOnSale && regularPrice > finalPrice ? regularPrice : undefined;

      // Extract quantity from name
      const quantityInfo = extractQuantity(apiProduct.name);

      // Get image URL
      const imageUrl = apiProduct.thumbnail?.url || apiProduct.image?.url;

      // Build product URL
      const productUrl = `https://www.lotuss.com.my/en/product/${apiProduct.urlKey}`;

      return {
        name: apiProduct.name,
        price: finalPrice,
        currency: 'MYR',
        originalPrice,
        isOnSale,
        imageUrl,
        productUrl,
        externalId: apiProduct.sku,
        brand: apiProduct.links?.brand?.name,
        unit: quantityInfo?.unit || (apiProduct.unitOfWeight !== 'Each' ? apiProduct.unitOfWeight?.toLowerCase() : undefined),
        unitQuantity: quantityInfo?.value || (apiProduct.weightPerPiece > 0 ? apiProduct.weightPerPiece : undefined),
        categoryName: apiProduct.breadcrumb?.[0]?.name || categoryName,
        isAvailable: apiProduct.stockStatus === 'IN_STOCK',
      };
    } catch (error) {
      this.logger.debug(`Failed to convert product: ${apiProduct.name}`, error);
      return null;
    }
  }

  /**
   * Scrape detailed product information (API version)
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    // Extract product SKU from URL
    const urlMatch = url.match(/\/product\/(?:.*-)?(\d+)$/) || url.match(/\/product\/(\d+)$/);
    const productId = urlMatch ? urlMatch[1] : url.split('/').pop();

    if (!productId) {
      throw new Error(`Could not extract product ID from ${url}`);
    }

    // For detailed product info, we'd need a different API endpoint
    // For now, fall back to DOM scraping for individual product pages
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await this.page.waitForTimeout(2000);

    const name = await this.extractText('h1') || await this.extractText('[data-testid="product-title"]');
    if (!name) {
      throw new Error(`Could not extract product name from ${url}`);
    }

    const pageContent = await this.page.content();
    const priceMatch = pageContent.match(/RM\s*(\d+\.?\d*)/);
    if (!priceMatch) {
      throw new Error(`Could not extract price from ${url}`);
    }

    const price = parseFloat(priceMatch[1]);
    const quantityInfo = extractQuantity(name);

    return {
      name,
      price,
      currency: 'MYR',
      isOnSale: false,
      productUrl: url,
      externalId: productId,
      unit: quantityInfo?.unit,
      unitQuantity: quantityInfo?.value,
      isAvailable: true,
    };
  }

  /**
   * Fetch all categories from API (can be used for dynamic category discovery)
   */
  async fetchCategories(): Promise<LotussCategory[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    try {
      const apiUrl = `${this.config.baseUrl}/product/v1/categories/4?websiteCode=${this.WEBSITE_CODE}`;

      const response = await this.page.evaluate(
        async ({ url, headers }) => {
          const res = await fetch(url, {
            method: 'GET',
            headers: headers as HeadersInit,
          });
          return res.json();
        },
        { url: apiUrl, headers: this.apiHeaders }
      );

      const apiResponse = response as LotussCategoryResponse;

      if (apiResponse.status?.code !== 200) {
        this.logger.error(`Categories API error: ${apiResponse.status?.message}`);
        return [];
      }

      return apiResponse.data?.children || [];
    } catch (error) {
      this.logger.error(`Failed to fetch categories: ${error}`);
      return [];
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up Lotus's API scraper...`);

    // Clear captured products
    this.capturedProducts.clear();

    if (this.page) {
      // Unroute all to avoid errors from pending routes
      try {
        await this.page.unrouteAll({ behavior: 'ignoreErrors' });
      } catch {
        // Ignore errors during unroute
      }
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    const stats = this.getStats();
    this.logger.info("Lotus's API scraping completed:", stats);
  }
}
