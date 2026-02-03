import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';

/**
 * Auchan Moscow (Hypermarket) categories configuration
 * Categories from Yandex Eda / Auchan store (asan_giper)
 * Store slug: ashan_g4zvs
 */
export const auchanMoscowCategories: CategoryConfig[] = [
  { id: '1034', name: 'Овощи и зелень', url: '/retail/asan_giper/catalog/1034' },
  { id: '1033', name: 'Фрукты и ягоды', url: '/retail/asan_giper/catalog/1033' },
  { id: '1029', name: 'Мясо и птица', url: '/retail/asan_giper/catalog/1029' },
  { id: '1028', name: 'Молоко и яйца', url: '/retail/asan_giper/catalog/1028' },
  { id: '167', name: 'Сыры', url: '/retail/asan_giper/catalog/167' },
  { id: '178', name: 'Рыба и морепродукты', url: '/retail/asan_giper/catalog/178' },
  { id: '158', name: 'Готовая еда', url: '/retail/asan_giper/catalog/158' },
  { id: '19279', name: 'Хлеб и выпечка', url: '/retail/asan_giper/catalog/19279' },
  { id: '19283', name: 'Масло, соусы и специи', url: '/retail/asan_giper/catalog/19283' },
  { id: '19291', name: 'Консервы и соления', url: '/retail/asan_giper/catalog/19291' },
  { id: '14547', name: 'Заморозка', url: '/retail/asan_giper/catalog/14547' },
  { id: '14564', name: 'Колбаса и сосиски', url: '/retail/asan_giper/catalog/14564' },
  { id: '14581', name: 'Макароны, крупы', url: '/retail/asan_giper/catalog/14581' },
  { id: '14582', name: 'Кофе и чай', url: '/retail/asan_giper/catalog/14582' },
  { id: '15667', name: 'Сладкое и снеки', url: '/retail/asan_giper/catalog/15667' },
  { id: '15714', name: 'Вода и напитки', url: '/retail/asan_giper/catalog/15714' },
  { id: '11265', name: 'Бакалея', url: '/retail/asan_giper/catalog/11265' },
  { id: '20606', name: 'Для детей', url: '/retail/asan_giper/catalog/20606' },
  { id: '21849', name: 'Красота и гигиена', url: '/retail/asan_giper/catalog/21849' },
  { id: '21857', name: 'Стирка и уборка', url: '/retail/asan_giper/catalog/21857' },
  { id: '123029', name: 'Для животных', url: '/retail/asan_giper/catalog/123029' },
  { id: '111504', name: 'Дом и сад', url: '/retail/asan_giper/catalog/111504' },
];

/**
 * Auchan Moscow scraper configuration
 */
export const auchanMoscowConfig: Partial<ScraperConfig> = {
  name: 'Auchan Moscow',
  baseUrl: 'https://eda.yandex.ru',
  categories: auchanMoscowCategories,
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
  price: number; // Price in kopeks (1/100 of ruble)
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
 * Scraper for Auchan Moscow (via Yandex Eats)
 * Uses the Yandex Eats REST API for data extraction
 * Requires browser context to bypass SmartCaptcha protection
 */
export class AuchanMoscowScraper extends BaseScraper {
  private readonly API_BASE = 'https://eda.yandex.ru/api/v2/menu/goods';
  private readonly STORE_SLUG = 'ashan_g4zvs'; // Auchan Hypermarket store slug on Yandex Eda
  private readonly COORDINATES = { latitude: 55.7558, longitude: 37.6173 }; // Moscow coordinates
  private deviceId: string = '';
  private sessionId: string = '';

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with browser (needed for SmartCaptcha bypass)
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing Auchan Moscow scraper...`);
    this.startTime = Date.now();

    // Launch browser to handle SmartCaptcha
    await this.launchBrowser();
    this.page = await this.createPage();

    this.logger.info(`Auchan Moscow scraper initialized`);
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
        this.logger.warn(`Failed to fetch category ${categoryName}`);
        return products;
      }

      // Recursively collect products from nested categories
      const allProducts = this.collectProductsRecursively(categoryData.payload.categories);

      this.logger.info(`Category ${categoryName}: Found ${allProducts.length} products`);

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
        this.logger.info(
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
        this.logger.warn(`API request failed: ${response.status()} ${response.statusText()}`);
        return null;
      }

      const data: YandexMenuResponse = await response.json();
      return data;
    } catch (error) {
      this.logger.error(`Failed to fetch category ${categoryId}:`, error);
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
      this.logger.warn(`No products array in API response`);
      return products;
    }

    for (const item of apiProducts) {
      try {
        // Skip unavailable products
        if (!item.available) {
          continue;
        }

        // Price is in RUB (the API returns whole rubles)
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
        const productUrl = `${this.config.baseUrl}/retail/asan_giper/product/${item.public_id}?placeSlug=${this.STORE_SLUG}`;

        const product: ProductData = {
          name: item.name,
          price: isOnSale ? promoPrice! : price,
          currency: 'RUB',
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
        this.logger.debug(`Failed to parse product: ${item.name}`, error);
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
    this.logger.info(`Cleaning up Auchan Moscow scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    this.logger.info('Auchan Moscow scraping completed:', stats);
  }
}
