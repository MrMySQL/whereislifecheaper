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
  // Main categories
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

  // Grocery subcategories
  { id: '2733', name: 'Baking Ingredients', url: 'baking-ingredients' },
  { id: '2751', name: 'Biscuits & Cakes', url: 'biscuits-cakes' },
  { id: '2766', name: 'Canned Food', url: 'canned-food' },
  { id: '2784', name: 'Cereals', url: 'cereals' },
  { id: '2793', name: 'Chocolates, Sweets & Jelly', url: 'chocolates-sweets-jelly' },
  { id: '2808', name: 'Commodities', url: 'commodities' },
  { id: '14538', name: 'Coffee & Tea', url: 'coffee-tea' },
  { id: '3777', name: 'Desserts', url: 'desserts' },
  { id: '2823', name: 'Jams, Spreads & Honey', url: 'jams-spreads-honey' },
  { id: '3771', name: 'Noodles, Tofu & Condiments', url: 'noodles-tofu-condiments' },
  { id: '49056', name: 'Organic Food', url: 'organic-food' },
  { id: '49080', name: 'Pasta & Instant Food', url: 'pasta-instant-food' },
  { id: '49095', name: 'Sauce, Spice & Seasoning', url: 'sauce-spice-seasoning' },
  { id: '49107', name: 'Snacks', url: 'snacks' },

  // Fresh produce subcategories
  { id: '3783', name: 'Fruits', url: 'fruits' },
  { id: '3858', name: 'Vegetables', url: 'vegetables' },
  { id: '3798', name: 'Eggs', url: 'eggs' },
  { id: '3792', name: 'Organic', url: 'organic' },

  // Meat & Poultry subcategories
  { id: '5307', name: 'Meat', url: 'meat' },
  { id: '5328', name: 'Poultry', url: 'poultry' },
  { id: '3402', name: 'Fish & Seafood', url: 'fish-seafood' },

  // Chilled & Frozen subcategories
  { id: '24105', name: 'Dairy', url: 'dairy' },
  { id: '25857', name: 'Frozen Food', url: 'frozen-food' },
  { id: '29481', name: 'Ice Cream', url: 'ice-cream' },
  { id: '3840', name: 'Ready To Cook', url: 'ready-to-cook' },

  // Bakery subcategories
  { id: '6591', name: 'Bread', url: 'bread' },
  { id: '7401', name: 'Bun', url: 'bun' },
  { id: '7707', name: 'Cakes & Donuts', url: 'cakes-donuts' },

  // Beverages subcategories
  { id: '9576', name: 'Asian Drinks', url: 'asian-drinks' },
  { id: '13881', name: 'Carbonated Drinks', url: 'carbonated-drinks' },
  { id: '15561', name: 'Cordials & Concentrates', url: 'cordials-concentrates' },
  { id: '17190', name: 'Energy & Sports Drinks', url: 'energy-sports-drinks' },
  { id: '18948', name: 'Fruit & Vegetable Juice', url: 'fruit-vegetable-juice' },
  { id: '19608', name: 'Milk Powder', url: 'milk-powder' },
  { id: '19965', name: 'Ready to Drink Milk', url: 'ready-to-drink-milk' },
  { id: '20586', name: 'Water', url: 'water' },

  // Baby subcategories
  { id: '6006', name: 'Baby Feeding', url: 'baby-feeding' },
  { id: '6018', name: 'Baby Food', url: 'baby-food' },
  { id: '6048', name: 'Diapers', url: 'diapers' },
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

  /** The API caps a response at 100 products however large a `size` we ask for. */
  private readonly PAGE_SIZE = 100;

  /**
   * Safety net for the pagination loop. The largest category seen is Grocery at
   * ~4,050 products (41 requests), so 200 pages is far above any real catalogue
   * while still bounding a category that never terminates.
   */
  private readonly MAX_PAGES_PER_CATEGORY = 200;

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

    // Visit homepage first to establish session
    await this.page.goto('https://www.lotuss.com.my/en', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await this.page.waitForTimeout(3000);

    this.logger.info(`Lotus's API scraper initialized`);
  }

  /**
   * Scrape a single category straight from the product API.
   *
   * This used to drive the category page in the browser and passively capture
   * whatever API responses the site happened to fire, gated behind
   * `waitForSelector('[class*="product"]')`. The site stopped rendering any
   * element with "product" in a class, so that gate threw for all 54 categories
   * and the catch discarded each one — 0 products for 64 days while the API
   * underneath was answering normally. Nothing about the data needed a DOM, so
   * the request is now explicit and the DOM is out of the path entirely.
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const products: ProductData[] = [];
    const seenSkus = new Set<string>();
    let offset = 0;
    let pages = 0;

    while (pages < this.MAX_PAGES_PER_CATEGORY) {
      const batch = await this.fetchProductPage(category, offset);
      pages++;

      // A failed request is not an empty category: keep what we have and stop,
      // leaving the error recorded so the run cannot report clean.
      if (batch === null) break;
      if (batch.length === 0) break;

      const fresh = batch.filter((p) => p.sku && !seenSkus.has(p.sku));
      for (const p of batch) {
        if (p.sku) seenSkus.add(p.sku);
      }

      // Past the end of a category the API replays its last page rather than
      // returning an empty list, so a page of nothing new means we are done.
      if (fresh.length === 0) break;

      const pageProducts: ProductData[] = [];
      for (const apiProduct of fresh) {
        const converted = this.convertApiProduct(apiProduct, category.name);
        if (converted) pageProducts.push(converted);
      }

      if (this.onPageScraped && pageProducts.length > 0) {
        const savedCount = await this.onPageScraped(pageProducts, {
          categoryId: category.id,
          categoryName: category.name,
          pageNumber: pages,
          totalProductsOnPage: pageProducts.length,
        });
        this.logger.info(
          `${category.name} (offset ${offset}): Saved ${savedCount}/${pageProducts.length} products`
        );
      }

      products.push(...pageProducts);
      this.productsScraped += pageProducts.length;

      if (batch.length < this.PAGE_SIZE) break;

      offset += this.PAGE_SIZE;
      await this.waitBetweenRequests();
    }

    this.logger.info(
      `${category.name}: Total ${products.length} products scraped across ${pages} request(s)`
    );
    return products;
  }

  /**
   * Build the products URL for one page of a category.
   *
   * Pagination is by `offset`, not `page` — the API silently ignores a `page`
   * parameter and returns the first page every time, which is what a naive
   * rewrite would have capped every category at 100 products.
   */
  private buildProductsUrl(category: CategoryConfig, offset: number): string {
    const filter = /^\d+$/.test(category.id)
      ? { categoryId: [Number(category.id)] }
      : { categoryUrlKey: category.url };

    const q = {
      websiteCode: this.WEBSITE_CODE,
      filter,
      offset,
      size: this.PAGE_SIZE,
    };

    return `${this.config.baseUrl}/product/v2/products?q=${encodeURIComponent(JSON.stringify(q))}`;
  }

  /**
   * Fetch one page of a category. Returns null when the request itself failed,
   * so the caller can tell a broken request from a genuinely empty category.
   */
  private async fetchProductPage(
    category: CategoryConfig,
    offset: number
  ): Promise<LotussApiProduct[] | null> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = this.buildProductsUrl(category, offset);

    try {
      // Playwright's request context: carries the browser session and a real
      // browser fingerprint. The API 403s clients it does not recognise.
      const response = await this.page.request.get(url, { headers: this.apiHeaders });

      if (!response.ok()) {
        this.logError(
          `Failed to fetch ${category.name} at offset ${offset}: ${response.status()} ${response.statusText()}`,
          url
        );
        return null;
      }

      const body = await response.json();
      const products = body?.data?.products;

      if (!Array.isArray(products)) {
        this.logError(
          `Unexpected response shape for ${category.name} at offset ${offset}`,
          url
        );
        return null;
      }

      return products as LotussApiProduct[];
    } catch (error) {
      this.logError(
        `Failed to fetch ${category.name} at offset ${offset}`,
        url,
        error as Error
      );
      return null;
    }
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
