import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';

/**
 * Arbuz.kz categories configuration
 */
export const arbuzCategories: CategoryConfig[] = [
  { id: '225164', name: 'Fruits & Vegetables', url: '/api/v1/shop/catalog/225164' },
  { id: '225161', name: 'Dairy & Eggs', url: '/api/v1/shop/catalog/225161' },
  { id: '225162', name: 'Meat & Poultry', url: '/api/v1/shop/catalog/225162' },
  { id: '225752', name: 'Fish & Seafood', url: '/api/v1/shop/catalog/225752' },
  { id: '225167', name: 'Deli Meats', url: '/api/v1/shop/catalog/225167' },
  { id: '225183', name: 'Frozen Foods', url: '/api/v1/shop/catalog/225183' },
  { id: '14', name: 'Beverages', url: '/api/v1/shop/catalog/14' },
  { id: '225165', name: 'Bread & Bakery', url: '/api/v1/shop/catalog/225165' },
  { id: '225166', name: 'Snacks & Sweets', url: '/api/v1/shop/catalog/225166' },
  { id: '225169', name: 'Pasta, Rice & Grains', url: '/api/v1/shop/catalog/225169' },
  { id: '225602', name: 'Snacks', url: '/api/v1/shop/catalog/225602' },
  { id: '19', name: 'Baby & Kids', url: '/api/v1/shop/catalog/19' },
  { id: '16', name: 'Household & Cleaning', url: '/api/v1/shop/catalog/16' },
  { id: '224407', name: 'Personal Care', url: '/api/v1/shop/catalog/224407' },
  { id: '20', name: 'Pet Supplies', url: '/api/v1/shop/catalog/20' },
];

/**
 * Arbuz scraper configuration
 */
export const arbuzConfig: Partial<ScraperConfig> = {
  name: 'Arbuz',
  baseUrl: 'https://arbuz.kz',
  categories: arbuzCategories,
  selectors: {
    // Not used for API-based scraping, kept for compatibility
    productCard: '.product-card',
    productName: '.product-title',
    productPrice: '.product-price',
    productImage: '.product-image img',
    productUrl: 'a',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 3000,
    betweenRequests: 1500,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/**
 * Arbuz.kz API response types
 */
interface ArbuzApiResponse {
  data: {
    id: string;
    name: string;
    products: {
      data: ArbuzProduct[];
    };
    catalogs?: ArbuzCatalog[];
  };
  $layout?: unknown;
}

interface ArbuzCatalog {
  id: string;
  name: string;
  uri: string;
}

interface ArbuzProduct {
  id: string;
  name: string;
  brandName?: string;
  measure: string; // 'шт', 'кг', 'г', 'л', 'мл'
  weight?: string;
  priceActual: number;
  pricePrevious?: number;
  discount?: string;
  isAvailable: boolean;
  uri: string;
  image?: string;
  barcode?: string;
}

/**
 * Scraper for Arbuz.kz Kazakhstan (arbuz.kz)
 * Uses the REST API for efficient data extraction
 * Browser context is needed to establish session and obtain auth token
 */
export class ArbuzScraper extends BaseScraper {
  private readonly API_BASE = 'https://arbuz.kz/api/v1';
  private readonly CITY = 'almaty'; // Hardcoded to Almaty (largest city)

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with browser (needed to establish session)
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Arbuz.kz API scraper...`);
    this.startTime = Date.now();

    // Launch browser to handle session establishment
    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to main page to establish session and obtain auth token
    scraperLogger.info('Navigating to Arbuz.kz homepage to establish session...');
    await this.page.goto(`${this.config.baseUrl}/ru/${this.CITY}`, { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();

    // Handle any anti-bot measures
    await this.handleAntiBot();

    scraperLogger.info(`Arbuz.kz API scraper initialized`);
  }

  /**
   * Scrape a single category using REST API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    return this.scrapeCategoryViaApi(category.id, category.name);
  }

  /**
   * Scrape a single category using REST API with pagination
   */
  private async scrapeCategoryViaApi(
    categoryId: string,
    categoryName: string
  ): Promise<ProductData[]> {
    const products: ProductData[] = [];
    let page = 1;
    const limit = 40;
    let hasMore = true;

    while (hasMore) {
      try {
        await this.waitBetweenRequests();

        const pageData = await this.fetchCategoryPage(categoryId, page, limit);

        if (!pageData) {
          hasMore = false;
          break;
        }

        // API response structure: { data: { products: { data: [...] }, ... }, $layout: ... }
        const productsArray = pageData.data?.products?.data || [];

        if (productsArray.length === 0) {
          hasMore = false;
          break;
        }

        const pageProducts = this.parseProducts(productsArray);

        // Save products after each page via callback
        if (this.onPageScraped && pageProducts.length > 0) {
          const savedCount = await this.onPageScraped(pageProducts, {
            categoryId,
            categoryName,
            pageNumber: page,
            totalProductsOnPage: pageProducts.length,
          });
          scraperLogger.info(
            `Page ${page} of ${categoryName}: Saved ${savedCount}/${pageProducts.length} products`
          );
        }

        products.push(...pageProducts);

        // Check if we should continue pagination
        if (productsArray.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (error) {
        this.logError(
          `Failed to scrape page ${page} of ${categoryName}`,
          `${this.API_BASE}/shop/catalog/${categoryId}?page=${page}`,
          error as Error
        );
        hasMore = false;
      }
    }

    scraperLogger.info(`Category ${categoryName}: Scraped ${products.length} products across ${page} pages`);
    return products;
  }

  /**
   * Fetch a single category page from the API using browser context
   */
  private async fetchCategoryPage(
    categoryId: string,
    page: number,
    limit: number
  ): Promise<ArbuzApiResponse | null> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = `${this.API_BASE}/shop/catalog/${categoryId}?where[available][e]=0&limit=${limit}&page=${page}`;

    try {
      // Use Playwright's request context (includes cookies from browser)
      const response = await this.page.request.get(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        },
      });

      if (!response.ok()) {
        scraperLogger.warn(`API request failed: ${response.status()} ${response.statusText()}`);
        return null;
      }

      const data: ArbuzApiResponse = await response.json();
      return data;
    } catch (error) {
      scraperLogger.error(`Failed to fetch ${url}:`, error);
      return null;
    }
  }

  /**
   * Parse API product data into ProductData format
   */
  private parseProducts(apiProducts: ArbuzProduct[]): ProductData[] {
    const products: ProductData[] = [];

    if (!apiProducts || !Array.isArray(apiProducts)) {
      scraperLogger.warn(`No products array in API response`);
      return products;
    }

    for (const item of apiProducts) {
      try {
        // Skip unavailable products
        if (!item.isAvailable) {
          continue;
        }

        const price = item.priceActual;
        const originalPrice = item.pricePrevious && item.pricePrevious > 0
          ? item.pricePrevious
          : undefined;
        const isOnSale = !!originalPrice && originalPrice > price;

        // Parse unit information from measure field
        const { unit, unitQuantity } = this.parseUnit(item.measure, item.weight, item.name);

        // Build product URL
        const productUrl = item.uri.startsWith('http')
          ? item.uri
          : `${this.config.baseUrl}${item.uri}`;

        // Build image URL
        const imageUrl = item.image?.startsWith('http')
          ? item.image
          : item.image
            ? `${this.config.baseUrl}${item.image}`
            : undefined;

        const product: ProductData = {
          name: item.name,
          price,
          currency: 'KZT',
          originalPrice,
          isOnSale,
          imageUrl,
          productUrl,
          brand: item.brandName,
          unit,
          unitQuantity,
          isAvailable: true,
          externalId: item.id,
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
   * Parse Arbuz unit format to standard format
   * Russian units: шт (pieces), кг (kg), г (g), л (l), мл (ml)
   */
  private parseUnit(
    measure: string,
    weight?: string,
    name?: string
  ): { unit?: string; unitQuantity?: number } {
    // Map Russian units to standard units
    const unitMap: Record<string, string> = {
      'шт': 'pieces',
      'кг': 'kg',
      'г': 'g',
      'л': 'l',
      'мл': 'ml',
    };

    const unit = unitMap[measure] || measure;

    // Try to extract quantity from weight field (e.g., "1 шт", "500 г", "1.5 кг")
    if (weight) {
      const quantityMatch = weight.match(/^([\d.,]+)\s*/);
      if (quantityMatch) {
        const quantity = parseFloat(quantityMatch[1].replace(',', '.'));
        if (!isNaN(quantity)) {
          return { unit, unitQuantity: quantity };
        }
      }
    }

    // Try to extract quantity from product name (e.g., "Молоко 1 л", "Сахар 1 кг")
    if (name) {
      // Match patterns like "500 г", "1 кг", "1.5 л", "250 мл"
      const nameMatch = name.match(/([\d.,]+)\s*(кг|г|л|мл|шт)/i);
      if (nameMatch) {
        const quantity = parseFloat(nameMatch[1].replace(',', '.'));
        const extractedUnit = unitMap[nameMatch[2].toLowerCase()] || nameMatch[2].toLowerCase();
        if (!isNaN(quantity)) {
          return { unit: extractedUnit, unitQuantity: quantity };
        }
      }
    }

    // Default to 1 for pieces
    if (unit === 'pieces') {
      return { unit, unitQuantity: 1 };
    }

    return { unit, unitQuantity: undefined };
  }

  /**
   * Scrape detailed product information (not needed for API-based scraping)
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    // For API-based scraping, we get all details from the list endpoint
    // This method is kept for interface compatibility
    throw new Error(`scrapeProductDetails not implemented for API-based scraper. URL: ${url}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up Arbuz.kz API scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Arbuz.kz scraping completed:', stats);
  }
}
