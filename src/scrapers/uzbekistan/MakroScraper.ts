import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
// import { sleep } from '../../utils/retry';

/**
 * Makro Uzbekistan categories configuration
 * Categories from Yandex Eats / Makro store
 */
export const makroCategories: CategoryConfig[] = [
  { id: '1034', name: 'Овощи и зелень', url: '/retail/makro/catalog/1034' },
  { id: '1033', name: 'Фрукты и ягоды', url: '/retail/makro/catalog/1033' },
  { id: '1029', name: 'Мясо и птица', url: '/retail/makro/catalog/1029' },
  { id: '19280', name: 'Молоко и яйца', url: '/retail/makro/catalog/19280' },
  { id: '12881', name: 'Вода и напитки', url: '/retail/makro/catalog/12881' },
  { id: '165', name: 'Готовая еда', url: '/retail/makro/catalog/165' },
  { id: '139', name: 'Сладости', url: '/retail/makro/catalog/139' },
  { id: '178', name: 'Рыба и морепродукты', url: '/retail/makro/catalog/178' },
  { id: '147', name: 'Заморозка', url: '/retail/makro/catalog/147' },
  { id: '148', name: 'Колбасы и сосиски', url: '/retail/makro/catalog/148' },
  { id: '182', name: 'Хлеб и выпечка', url: '/retail/makro/catalog/182' },
  { id: '167', name: 'Сыры', url: '/retail/makro/catalog/167' },
  { id: '19288', name: 'Макароны и крупы', url: '/retail/makro/catalog/19288' },
  { id: '19289', name: 'Кофе и чай', url: '/retail/makro/catalog/19289' },
  { id: '38776', name: 'Все для выпечки и десертов', url: '/retail/makro/catalog/38776' },
  { id: '19283', name: 'Масло, соусы и специи', url: '/retail/makro/catalog/19283' },
  { id: '19291', name: 'Консервы и соления', url: '/retail/makro/catalog/19291' },
  { id: '30191', name: 'Орехи, снеки и чипсы', url: '/retail/makro/catalog/30191' },
  { id: '21575', name: 'Для детей', url: '/retail/makro/catalog/21575' },
  { id: '3374', name: 'Красота и гигиена', url: '/retail/makro/catalog/3374' },
  { id: '19287', name: 'Стирка и уборка', url: '/retail/makro/catalog/19287' },
  { id: '19286', name: 'Для животных', url: '/retail/makro/catalog/19286' },
  { id: '44559', name: 'Дом, дача и авто', url: '/retail/makro/catalog/44559' },
];

/**
 * Makro scraper configuration
 */
export const makroConfig: Partial<ScraperConfig> = {
  name: 'Makro',
  baseUrl: 'https://eats.yandex.com',
  categories: makroCategories,
  selectors: {
    // Not used for API-based scraping, kept for compatibility
    productCard: '[data-testid="product-card-root"]',
    productName: '.UiKitDesktopProductCard_name',
    productPrice: '.UiKitDesktopProductCard_price',
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
 * Yandex Eats API response types
 */
interface YandexMenuResponse {
  payload: {
    categories: YandexCategory[];
    goods_count: number;
  };
  meta?: {
    count: number;
  };
}

interface YandexCategory {
  id: number;
  uid: string;
  parentId: number | null;
  parent_uid?: string;
  name: string;
  available: boolean;
  items: YandexProduct[];
  categories?: YandexCategory[];
  gallery?: Array<{ url: string; type: string }>;
}

interface YandexProduct {
  id: number;
  uid: string;
  public_id: string;
  name: string;
  description?: string;
  available: boolean;
  inStock: number;
  price: number; // Price in tiyin (1/100 of sum)
  decimalPrice: string;
  promoPrice: number | null;
  decimalPromoPrice: string | null;
  promoTypes: string[];
  picture?: {
    url: string;
    scale: string;
  };
  weight?: string;
  adult: boolean;
  weight_data?: {
    price_per_kg?: string;
    quantim_value_g?: number;
  };
}

/**
 * Scraper for Makro Uzbekistan (via Yandex Eats)
 * Uses the Yandex Eats REST API for data extraction
 * Requires browser context to bypass SmartCaptcha protection
 */
export class MakroScraper extends BaseScraper {
  private readonly API_BASE = 'https://eats.yandex.com/api/v2/menu/goods';
  private readonly STORE_SLUG = 'makro_7sfx5';
  private readonly COORDINATES = { latitude: 41.311081, longitude: 69.240562 }; // Tashkent coordinates
  private deviceId: string = '';
  private sessionId: string = '';

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with browser (needed for SmartCaptcha bypass)
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Makro scraper...`);
    this.startTime = Date.now();

    // Generate device and session IDs
    this.deviceId = this.generateId();
    this.sessionId = this.generateId();

    // Launch browser to handle SmartCaptcha
    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to main page first to get cookies/pass SmartCaptcha
    scraperLogger.info('Navigating to Makro page to establish session...');
    await this.page.goto(
      `${this.config.baseUrl}/uz/retail/makro/catalog/1034?placeSlug=${this.STORE_SLUG}`,
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    );

    // Wait for SmartCaptcha and try to solve it
    // await this.handleSmartCaptcha();

    scraperLogger.info(`Makro scraper initialized`);
  }

  // /**
  //  * Handle Yandex SmartCaptcha
  //  */
  // private async handleSmartCaptcha(): Promise<void> {
  //   if (!this.page) return;

  //   try {
  //     // Wait a bit for page to settle
  //     await sleep(3000);

  //     // Check if we're on captcha page
  //     const title = await this.page.title();
  //     if (title.includes('robot') || title.includes('Robot')) {
  //       scraperLogger.info('SmartCaptcha detected, attempting to solve...');

  //       // Try to find and click the checkbox
  //       const checkbox = await this.page.$('input[type="checkbox"], .CheckboxCaptcha-Button, [class*="Checkbox"]');
  //       if (checkbox) {
  //         await checkbox.click();
  //         scraperLogger.info('Clicked captcha checkbox');
  //         await sleep(5000);
  //       }

  //       // Wait for redirect
  //       await this.page.waitForURL(url => !url.href.includes('showcaptcha'), { timeout: 30000 }).catch(() => {
  //         scraperLogger.warn('Captcha redirect timeout - may need manual intervention');
  //       });
  //     }

  //     // Verify we're on the correct page
  //     const currentUrl = this.page.url();
  //     if (currentUrl.includes('showcaptcha')) {
  //       scraperLogger.error('Still on captcha page after attempts');
  //       await this.takeScreenshot('makro-captcha-failed');
  //       throw new Error('Failed to bypass SmartCaptcha');
  //     }

  //     scraperLogger.info('Successfully passed SmartCaptcha');
  //     await this.waitForDynamicContent();

  //   } catch (error) {
  //     scraperLogger.warn('SmartCaptcha handling:', error);
  //   }
  // }

  /**
   * Generate a random ID for device/session
   */
  private generateId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const segments = [8, 12, 11, 11];
    return segments.map(len =>
      Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    ).join('-');
  }

  /**
   * Scrape a single category using REST API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    return this.scrapeCategoryViaApi(category.id, category.name);
  }

  /**
   * Scrape a single category using REST API
   */
  private async scrapeCategoryViaApi(
    categoryId: string,
    categoryName: string
  ): Promise<ProductData[]> {
    const products: ProductData[] = [];

    try {
      const categoryData = await this.fetchCategory(categoryId);

      if (!categoryData) {
        scraperLogger.warn(`Failed to fetch category ${categoryName}`);
        return products;
      }

      // Recursively collect products from nested categories
      const allProducts = this.collectProductsRecursively(categoryData.payload.categories);

      scraperLogger.info(`Category ${categoryName}: Found ${allProducts.length} products`);

      // Parse products
      const parsedProducts = this.parseProducts(allProducts, categoryName);

      // Save products via callback
      if (this.onPageScraped && parsedProducts.length > 0) {
        const savedCount = await this.onPageScraped(parsedProducts, {
          categoryId,
          categoryName,
          pageNumber: 1,
          totalProductsOnPage: parsedProducts.length,
        });
        scraperLogger.info(
          `${categoryName}: Saved ${savedCount}/${parsedProducts.length} products`
        );
      }

      products.push(...parsedProducts);
    } catch (error) {
      this.logError(
        `Failed to scrape category ${categoryName}`,
        `${this.API_BASE}?categoryId=${categoryId}`,
        error as Error
      );
    }

    return products;
  }

  /**
   * Fetch a category from the API using browser context
   */
  private async fetchCategory(categoryId: string): Promise<YandexMenuResponse | null> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = `${this.API_BASE}?auto_translate=false`;

    try {
      // Use Playwright's request context (includes cookies from browser)
      const response = await this.page.request.post(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json;charset=UTF-8',
          'x-ya-coordinates': `latitude=${this.COORDINATES.latitude},longitude=${this.COORDINATES.longitude}`,
          'x-platform': 'desktop_web',
          'x-device-id': this.deviceId,
          'x-client-session': this.sessionId,
          'x-app-version': '18.10.0',
          'accept-language': 'ru',
        },
        data: {
          slug: this.STORE_SLUG,
          categoryId: { value: parseInt(categoryId) },
          category_uid: categoryId,
          maxDepth: 100,
        },
      });

      if (!response.ok()) {
        scraperLogger.warn(`API request failed: ${response.status()} ${response.statusText()}`);
        return null;
      }

      const data: YandexMenuResponse = await response.json();
      return data;
    } catch (error) {
      scraperLogger.error(`Failed to fetch category ${categoryId}:`, error);
      return null;
    }
  }

  /**
   * Recursively collect products from nested category structure
   */
  private collectProductsRecursively(categories: YandexCategory[]): YandexProduct[] {
    const products: YandexProduct[] = [];

    for (const category of categories) {
      // If this category has products, add them
      if (category.items && category.items.length > 0) {
        products.push(...category.items);
      }

      // If this category has subcategories, recurse into them
      if (category.categories && category.categories.length > 0) {
        products.push(...this.collectProductsRecursively(category.categories));
      }
    }

    return products;
  }

  /**
   * Parse API product data into ProductData format
   */
  private parseProducts(apiProducts: YandexProduct[], categoryName: string): ProductData[] {
    const products: ProductData[] = [];

    if (!apiProducts || !Array.isArray(apiProducts)) {
      scraperLogger.warn(`No products array in API response`);
      return products;
    }

    for (const item of apiProducts) {
      try {
        // Skip unavailable products
        if (!item.available) {
          continue;
        }

        // Price is in UZS sum (the API returns whole sum, not tiyin)
        const price = item.price;
        const promoPrice = item.promoPrice ? item.promoPrice : undefined;
        const isOnSale = promoPrice !== undefined && promoPrice < price;

        // Parse unit information from weight string or weight_data
        const { unit, unitQuantity } = this.parseWeight(item.weight, item.weight_data);

        // Build image URL
        const imageUrl = item.picture?.url
          ? item.picture.url.replace('{w}x{h}', '400x400')
          : undefined;

        // Build product URL
        const productUrl = `${this.config.baseUrl}/uz/retail/makro/product/${item.public_id}?placeSlug=${this.STORE_SLUG}`;

        const product: ProductData = {
          name: item.name,
          price: isOnSale ? promoPrice! : price,
          currency: 'UZS',
          originalPrice: isOnSale ? price : undefined,
          isOnSale,
          imageUrl,
          productUrl,
          unit,
          unitQuantity,
          description: item.description,
          categoryName,
          isAvailable: item.available && item.inStock > 0,
          externalId: item.public_id,
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
   * Parse weight string and weight_data into standard unit format
   */
  private parseWeight(
    weight?: string,
    weightData?: { price_per_kg?: string; quantim_value_g?: number }
  ): { unit?: string; unitQuantity?: number } {
    // Try to parse from weight_data first (more reliable)
    if (weightData?.quantim_value_g) {
      const grams = weightData.quantim_value_g;
      if (grams >= 1000) {
        return { unit: 'kg', unitQuantity: grams / 1000 };
      }
      return { unit: 'g', unitQuantity: grams };
    }

    // Parse from weight string
    if (!weight) {
      return { unit: undefined, unitQuantity: undefined };
    }

    const normalized = weight.toLowerCase().trim();

    // Match patterns like "1 kg", "500 g", "1.5 l", "250 ml", "6 pcs"
    const match = normalized.match(/^([\d.,]+)\s*(kg|g|l|ml|шт|pcs?|pieces?|items?)/i);
    if (match) {
      const quantity = parseFloat(match[1].replace(',', '.'));
      const unitStr = match[2].toLowerCase();

      switch (unitStr) {
        case 'kg':
          return { unit: 'kg', unitQuantity: quantity };
        case 'g':
          if (quantity >= 1000) {
            return { unit: 'kg', unitQuantity: quantity / 1000 };
          }
          return { unit: 'g', unitQuantity: quantity };
        case 'l':
          return { unit: 'l', unitQuantity: quantity };
        case 'ml':
          if (quantity >= 1000) {
            return { unit: 'l', unitQuantity: quantity / 1000 };
          }
          return { unit: 'ml', unitQuantity: quantity };
        case 'шт':
        case 'pcs':
        case 'pc':
        case 'pieces':
        case 'piece':
        case 'items':
        case 'item':
          return { unit: 'pieces', unitQuantity: quantity };
        default:
          return { unit: unitStr, unitQuantity: quantity };
      }
    }

    return { unit: undefined, unitQuantity: undefined };
  }

  /**
   * Scrape detailed product information (not needed for API-based scraping)
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    // For API-based scraping, we get all details from the category endpoint
    throw new Error(`scrapeProductDetails not implemented for API-based scraper. URL: ${url}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up Makro scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Makro scraping completed:', stats);
  }
}
