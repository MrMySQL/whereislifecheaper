import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';

/**
 * Auchan Moscow (Hypermarket) categories configuration
 * Categories from Yandex Eda / Auchan store (asan_giper)
 * Store slug: ashan_g4zvs
 * Updated: 2026-02-03 from website navigation
 */
export const auchanMoscowCategories: CategoryConfig[] = [
  // Молочные продукты (Dairy)
  { id: '2910', name: 'Молоко, яйца', url: '/retail/asan_giper/catalog/2910' },
  { id: '167', name: 'Сыры', url: '/retail/asan_giper/catalog/167' },
  { id: '15714', name: 'Йогурты и десерты', url: '/retail/asan_giper/catalog/15714' },
  { id: '222879', name: 'Кефир, творог', url: '/retail/asan_giper/catalog/222879' },

  // Овощной прилавок (Vegetables)
  { id: '1034', name: 'Овощи и зелень', url: '/retail/asan_giper/catalog/1034' },
  { id: '1033', name: 'Фрукты и ягоды', url: '/retail/asan_giper/catalog/1033' },
  { id: '7135', name: 'Сухофрукты и орехи', url: '/retail/asan_giper/catalog/7135' },

  // Сладкое и снеки (Sweets and snacks)
  { id: '8992', name: 'Чипсы, снеки', url: '/retail/asan_giper/catalog/8992' },
  { id: '35396', name: 'Конфеты и шоколад', url: '/retail/asan_giper/catalog/35396' },
  { id: '363608', name: 'Печенье и вафли', url: '/retail/asan_giper/catalog/363608' },
  { id: '33906', name: 'Торты, пирожные', url: '/retail/asan_giper/catalog/33906' },
  { id: '425302', name: 'Мармелад и зефир', url: '/retail/asan_giper/catalog/425302' },
  { id: '222632', name: 'Леденцы и жвачка', url: '/retail/asan_giper/catalog/222632' },
  { id: '222880', name: 'Варенье, сиропы', url: '/retail/asan_giper/catalog/222880' },

  // Мясо и птица (Meat and poultry)
  { id: '1029', name: 'Мясо и птица', url: '/retail/asan_giper/catalog/1029' },
  { id: '54540', name: 'Колбаса и сосиски', url: '/retail/asan_giper/catalog/54540' },
  { id: '220387', name: 'Закуски и паштеты', url: '/retail/asan_giper/catalog/220387' },
  { id: '178', name: 'Рыба и морепродукты', url: '/retail/asan_giper/catalog/178' },

  // Заморозка (Frozen)
  { id: '905', name: 'Мороженое', url: '/retail/asan_giper/catalog/905' },
  { id: '5209', name: 'Полуфабрикаты', url: '/retail/asan_giper/catalog/5209' },
  { id: '20606', name: 'Пельмени и вареники', url: '/retail/asan_giper/catalog/20606' },
  { id: '2907', name: 'Овощи и фрукты замороженные', url: '/retail/asan_giper/catalog/2907' },
  { id: '220378', name: 'Мясо, рыба замороженные', url: '/retail/asan_giper/catalog/220378' },

  // Вода и напитки (Drinks)
  { id: '14582', name: 'Вода', url: '/retail/asan_giper/catalog/14582' },
  { id: '220375', name: 'Газировка', url: '/retail/asan_giper/catalog/220375' },
  { id: '90813', name: 'Соки и морсы', url: '/retail/asan_giper/catalog/90813' },
  { id: '220388', name: 'Холодный чай и кофе', url: '/retail/asan_giper/catalog/220388' },

  // Хлеб и выпечка (Bread and bakery)
  { id: '1028', name: 'Хлеб', url: '/retail/asan_giper/catalog/1028' },
  { id: '78279', name: 'Выпечка и тесто', url: '/retail/asan_giper/catalog/78279' },
  { id: '222882', name: 'Хлебцы, сушки', url: '/retail/asan_giper/catalog/222882' },

  // Бакалея (Grocery)
  { id: '25367', name: 'Макароны, крупы', url: '/retail/asan_giper/catalog/25367' },
  { id: '220389', name: 'Сухие завтраки и каши', url: '/retail/asan_giper/catalog/220389' },
  { id: '70215', name: 'Кофе и какао', url: '/retail/asan_giper/catalog/70215' },
  { id: '158', name: 'Чай', url: '/retail/asan_giper/catalog/158' },
  { id: '19283', name: 'Масло, соусы и специи', url: '/retail/asan_giper/catalog/19283' },
  { id: '19291', name: 'Консервы и соления', url: '/retail/asan_giper/catalog/19291' },

  // Готовая еда (Ready-made food)
  { id: '290456', name: 'Готовая еда', url: '/retail/asan_giper/catalog/290456' },
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

        // Parse unit information from weight string, weight_data, or product name
        let { unit, unitQuantity } = this.parseWeight(item.weight, item.weight_data);

        // If no unit found in API fields, try to extract from product name
        if (!unit && !unitQuantity) {
          ({ unit, unitQuantity } = this.parseWeightFromName(item.name));
        }

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
   * Parse weight from product name (fallback when API doesn't provide weight fields)
   * Handles Cyrillic units: г (grams), кг (kilograms), л (liters), мл (milliliters)
   */
  private parseWeightFromName(name: string): { unit?: string; unitQuantity?: number } {
    if (!name) {
      return { unit: undefined, unitQuantity: undefined };
    }

    // Match patterns like "300г", "1.5кг", "500мл", "2л", "6шт" anywhere in the string
    // Supports both Cyrillic (г, кг, л, мл, шт) and Latin (g, kg, l, ml) units
    // Note: \b doesn't work with Cyrillic, so we use (?![а-яa-z]) negative lookahead instead
    const match = name.match(/([\d.,]+)\s*(кг|мл|г|л|шт|kg|ml|g|l)(?![а-яa-z])/i);
    if (match) {
      const quantity = parseFloat(match[1].replace(',', '.'));
      const unitStr = match[2].toLowerCase();

      switch (unitStr) {
        case 'кг':
        case 'kg':
          return { unit: 'kg', unitQuantity: quantity };
        case 'г':
        case 'g':
          if (quantity >= 1000) {
            return { unit: 'kg', unitQuantity: quantity / 1000 };
          }
          return { unit: 'g', unitQuantity: quantity };
        case 'л':
        case 'l':
          return { unit: 'l', unitQuantity: quantity };
        case 'мл':
        case 'ml':
          if (quantity >= 1000) {
            return { unit: 'l', unitQuantity: quantity / 1000 };
          }
          return { unit: 'ml', unitQuantity: quantity };
        case 'шт':
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
