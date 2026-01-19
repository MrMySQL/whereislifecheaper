import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { extractQuantity } from '../../utils/normalizer';
import { BrowserContext, chromium } from 'playwright';

/**
 * Lotus's API response types
 */
interface LotussApiResponse {
  status: { code: number; message: string };
  meta: { total: number; offset: number; limit: number };
  data: {
    sort: string;
    filters: any[];
    products: LotussApiProduct[];
  };
}

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
 * These match the actual category IDs from the Lotus's API
 */
export const lotussApiCategories: CategoryConfig[] = [
  { id: '3189', name: 'Fresh Produce', url: 'fresh-produce' },
  { id: '3399', name: 'Meat & Poultry', url: 'meat-poultry' },
  { id: '23946', name: 'Chilled & Frozen', url: 'chilled-frozen' },
  { id: '6504', name: 'Bakery', url: 'bakery' },
  { id: '9405', name: 'Beverages', url: 'beverages' },
  { id: '2730', name: 'Grocery', url: 'grocery' },
  { id: '6003', name: 'Baby', url: 'baby' },
  { id: '3300', name: 'Household', url: 'household' },
  { id: '5763', name: 'Health & Beauty', url: 'health-beauty' },
  { id: '6195', name: 'Pets', url: 'pets' },
  { id: '5820', name: 'Home & Gardening', url: 'home-gardening' },
  { id: '5922', name: 'Appliances', url: 'appliances' },
  { id: '5976', name: 'AV & Tech', url: 'av-tech' },
  { id: '6138', name: 'Sports & Leisure', url: 'sports-leisure' },
  { id: '6081', name: 'Office, Bags & Stationery', url: 'office-bags-stationery' },
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
  private readonly API_LIMIT = 50; // Products per API call
  private readonly WEBSITE_CODE = 'malaysia_hy';

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper - establish browser session for API calls
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Lotus's API scraper...`);
    this.startTime = Date.now();

    // Launch browser to establish session and get cookies
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.context = await this.browser.newContext({
      userAgent: this.getUserAgent(),
      viewport: { width: 1920, height: 1080 },
    });

    this.page = await this.context.newPage();

    // Visit homepage to establish session
    await this.page.goto('https://www.lotuss.com.my/en', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for page to be ready for API calls
    await this.page.waitForTimeout(5000);

    scraperLogger.info(`Lotus's API scraper initialized`);
  }

  /**
   * Scrape a single category using the API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];
    let offset = 0;
    let hasMore = true;

    scraperLogger.info(`Scraping category via API: ${category.name} (${category.url})`);

    while (hasMore) {
      try {
        const apiProducts = await this.fetchProducts(category.url, offset);

        if (!apiProducts || apiProducts.length === 0) {
          hasMore = false;
          continue;
        }

        // Convert API products to ProductData
        const convertedProducts = apiProducts
          .map(p => this.convertApiProduct(p, category.name))
          .filter((p): p is ProductData => p !== null);

        scraperLogger.info(
          `${category.name}: Fetched ${apiProducts.length} products (offset: ${offset})`
        );

        // Save products via callback
        if (this.onPageScraped && convertedProducts.length > 0) {
          const pageNumber = Math.floor(offset / this.API_LIMIT) + 1;
          const savedCount = await this.onPageScraped(convertedProducts, {
            categoryId: category.id,
            categoryName: category.name,
            pageNumber,
            totalProductsOnPage: convertedProducts.length,
          });
          scraperLogger.info(
            `${category.name}: Saved ${savedCount}/${convertedProducts.length} products`
          );
        }

        products.push(...convertedProducts);
        this.productsScraped += convertedProducts.length;

        // Check if more products available
        offset += this.API_LIMIT;

        // Limit to prevent infinite loops (max 2000 products per category)
        if (offset >= 2000) {
          scraperLogger.warn(`${category.name}: Reached max offset limit`);
          hasMore = false;
        }

        // Small delay between API calls
        await this.waitBetweenRequests();
      } catch (error) {
        this.logError(
          `Failed to fetch products for ${category.name} at offset ${offset}`,
          undefined,
          error as Error
        );
        hasMore = false;
      }
    }

    scraperLogger.info(`${category.name}: Total ${products.length} products scraped`);
    return products;
  }

  /**
   * Fetch products from the API
   */
  private async fetchProducts(
    categoryUrlKey: string,
    offset: number
  ): Promise<LotussApiProduct[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const query = JSON.stringify({
      offset,
      limit: this.API_LIMIT,
      filter: { categoryUrlKey },
      websiteCode: this.WEBSITE_CODE,
    });

    const apiUrl = `${this.config.baseUrl}/product/v2/products?q=${encodeURIComponent(query)}`;

    // Use hardcoded headers to ensure they're properly passed
    const apiHeaders = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en',
      'channel': 'web',
      'version': '2.3.8',
      'key': 'SeiRQmEDnaZXOlpfKhCjV4Bo2y6vAcW99QKmzifsgP2uCMN7wF3ahRXex84kH6qUVIWoY5Dp0GEljdAvS1JytOZcLbnBTr',
    };

    scraperLogger.debug(`Fetching from API: ${apiUrl}`);

    try {
      const response = await this.page.evaluate(
        async ({ url, headers }) => {
          try {
            const res = await fetch(url, {
              method: 'GET',
              headers: headers as HeadersInit,
            });
            const json = await res.json();
            return { ok: res.ok, status: res.status, body: json };
          } catch (err: any) {
            return { error: err.message };
          }
        },
        { url: apiUrl, headers: apiHeaders }
      );

      const result = response as { ok?: boolean; status?: number; body?: LotussApiResponse; error?: string };

      if (result.error) {
        scraperLogger.error(`API fetch error: ${result.error}`);
        return [];
      }

      if (!result.body || !result.body.status) {
        scraperLogger.error(`API error: Invalid response structure`);
        scraperLogger.debug(`Response: ${JSON.stringify(response).substring(0, 500)}`);
        return [];
      }

      const apiResponse = result.body;

      if (apiResponse.status.code !== 200) {
        scraperLogger.error(`API error: ${apiResponse.status.code} - ${apiResponse.status.message}`);
        return [];
      }

      scraperLogger.debug(`API returned ${apiResponse.data?.products?.length || 0} products (total: ${apiResponse.meta?.total})`);
      return apiResponse.data?.products || [];
    } catch (error) {
      scraperLogger.error(`Failed to fetch from API: ${error}`);
      return [];
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
      scraperLogger.debug(`Failed to convert product: ${apiProduct.name}`, error);
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
        { url: apiUrl, headers: this.config.headers }
      );

      const apiResponse = response as LotussCategoryResponse;

      if (apiResponse.status?.code !== 200) {
        scraperLogger.error(`Categories API error: ${apiResponse.status?.message}`);
        return [];
      }

      return apiResponse.data?.children || [];
    } catch (error) {
      scraperLogger.error(`Failed to fetch categories: ${error}`);
      return [];
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up Lotus's API scraper...`);

    if (this.page) {
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
    scraperLogger.info("Lotus's API scraping completed:", stats);
  }
}
