import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';

/**
 * Mercadona API response types
 */
interface MercadonaCategoryResponse {
  id: number;
  name: string;
  order: number;
  categories?: MercadonaCategoryResponse[];
  products?: MercadonaProduct[];
}

interface MercadonaProduct {
  id: string;
  slug: string;
  display_name: string;
  packaging?: string;
  thumbnail: string;
  share_url: string;
  price_instructions: {
    unit_price: string;
    bulk_price?: string;
    unit_size?: number;
    size_format?: string;
    reference_price?: string;
    reference_format?: string;
    previous_unit_price?: string | null;
    price_decreased?: boolean;
    is_pack?: boolean;
    is_new?: boolean;
  };
  badges?: {
    is_water?: boolean;
    requires_age_check?: boolean;
  };
}

/**
 * Scraper for Mercadona Spain (tienda.mercadona.es)
 * Uses the REST API for efficient data extraction
 * Requires browser context to establish session with postal code
 */
export class MercadonaScraper extends BaseScraper {
  private readonly API_BASE = 'https://tienda.mercadona.es/api';
  private readonly POSTAL_CODE = '28001'; // Madrid postal code

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with browser (needed to set postal code)
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Mercadona API scraper...`);
    this.startTime = Date.now();

    // Launch browser to handle postal code entry
    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to main page to trigger postal code dialog
    scraperLogger.info('Navigating to Mercadona to establish session...');
    await this.page.goto('https://tienda.mercadona.es', { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();

    // Enter postal code to unlock the site
    await this.enterPostalCode();

    scraperLogger.info(`Mercadona API scraper initialized`);
  }

  /**
   * Enter postal code to establish delivery zone
   */
  private async enterPostalCode(): Promise<void> {
    if (!this.page) return;

    try {
      // Wait for postal code input field
      const postalInput = await this.page.waitForSelector('input[name="postalCode"]', {
        timeout: 10000,
      }).catch(() => null);

      if (postalInput) {
        scraperLogger.info(`Entering postal code: ${this.POSTAL_CODE}`);
        await postalInput.fill(this.POSTAL_CODE);

        // Click the submit button
        const submitButton = await this.page.$('button[type="submit"]');
        if (submitButton) {
          await submitButton.click();
          await this.waitForDynamicContent();
        }

        scraperLogger.info('Postal code entered successfully');
      } else {
        // Postal code may already be set from previous session
        scraperLogger.debug('Postal code input not found - session may already be established');
      }
    } catch (error) {
      scraperLogger.warn('Failed to enter postal code:', error);
    }
  }

  /**
   * Scrape a single category using REST API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    // Category URL format: the ID is in the URL (e.g., "112" from category config)
    const categoryId = category.id;
    return this.scrapeCategoryViaApi(categoryId, category.name);
  }

  /**
   * Scrape a single category using REST API
   * Handles nested categories recursively
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
      const allProducts = this.collectProductsRecursively(categoryData);

      scraperLogger.info(`Category ${categoryName}: Found ${allProducts.length} products`);

      // Parse and save products
      const parsedProducts = this.parseProducts(allProducts);

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
        `${this.API_BASE}/categories/${categoryId}/`,
        error as Error
      );
    }

    return products;
  }

  /**
   * Fetch a category from the API using browser context
   */
  private async fetchCategory(categoryId: string): Promise<MercadonaCategoryResponse | null> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = `${this.API_BASE}/categories/${categoryId}/`;

    try {
      // Use Playwright's request context (includes cookies from browser)
      const response = await this.page.request.get(url, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok()) {
        scraperLogger.warn(`API request failed: ${response.status()} ${response.statusText()}`);
        return null;
      }

      const data: MercadonaCategoryResponse = await response.json();
      return data;
    } catch (error) {
      scraperLogger.error(`Failed to fetch ${url}:`, error);
      return null;
    }
  }

  /**
   * Recursively collect products from nested category structure
   */
  private collectProductsRecursively(category: MercadonaCategoryResponse): MercadonaProduct[] {
    const products: MercadonaProduct[] = [];

    // If this category has products, add them
    if (category.products && category.products.length > 0) {
      products.push(...category.products);
    }

    // If this category has subcategories, recurse into them
    if (category.categories && category.categories.length > 0) {
      for (const subCategory of category.categories) {
        products.push(...this.collectProductsRecursively(subCategory));
      }
    }

    return products;
  }

  /**
   * Parse API product data into ProductData format
   */
  private parseProducts(apiProducts: MercadonaProduct[]): ProductData[] {
    const products: ProductData[] = [];

    if (!apiProducts || !Array.isArray(apiProducts)) {
      scraperLogger.warn(`No products array in API response`);
      return products;
    }

    for (const item of apiProducts) {
      try {
        const priceInfo = item.price_instructions;

        // Parse unit price (string to number)
        const price = parseFloat(priceInfo.unit_price);
        if (isNaN(price)) {
          scraperLogger.debug(`Could not parse price for product: ${item.display_name}`);
          continue;
        }

        // Check for sale/discount
        const previousPrice = priceInfo.previous_unit_price
          ? parseFloat(priceInfo.previous_unit_price)
          : undefined;
        const isOnSale = priceInfo.price_decreased || (previousPrice && previousPrice > price);

        // Parse unit information
        const { unit, unitQuantity } = this.parseUnit(priceInfo.size_format, priceInfo.unit_size);

        // Extract brand from display name (Hacendado, Mercadona, etc.)
        const brand = this.extractBrand(item.display_name);

        const product: ProductData = {
          name: item.display_name,
          price,
          currency: 'EUR',
          originalPrice: isOnSale ? previousPrice : undefined,
          isOnSale: !!isOnSale,
          imageUrl: item.thumbnail,
          productUrl: item.share_url,
          brand,
          unit,
          unitQuantity,
          isAvailable: true,
          externalId: item.id,
        };

        products.push(product);
        this.productsScraped++;
      } catch (error) {
        this.productsFailed++;
        scraperLogger.debug(`Failed to parse product: ${item.display_name}`, error);
      }
    }

    return products;
  }

  /**
   * Parse Mercadona unit format to standard format
   */
  private parseUnit(sizeFormat?: string, unitSize?: number): { unit?: string; unitQuantity?: number } {
    if (!sizeFormat || !unitSize) {
      return { unit: undefined, unitQuantity: undefined };
    }

    // Normalize the format string
    const format = sizeFormat.toLowerCase();

    switch (format) {
      case 'kg':
        return { unit: 'kg', unitQuantity: unitSize };
      case 'g':
        if (unitSize >= 1000) {
          return { unit: 'kg', unitQuantity: unitSize / 1000 };
        }
        return { unit: 'g', unitQuantity: unitSize };
      case 'l':
        return { unit: 'l', unitQuantity: unitSize };
      case 'ml':
        if (unitSize >= 1000) {
          return { unit: 'l', unitQuantity: unitSize / 1000 };
        }
        return { unit: 'ml', unitQuantity: unitSize };
      case 'cl':
        // Convert centiliters to liters
        return { unit: 'l', unitQuantity: unitSize / 100 };
      case 'ud':
      case 'uds':
      case 'unidad':
      case 'unidades':
        return { unit: 'pieces', unitQuantity: unitSize };
      default:
        return { unit: format, unitQuantity: unitSize };
    }
  }

  /**
   * Extract brand from product display name
   * Mercadona's private labels: Hacendado, Bosque Verde, Deliplus, Compy
   */
  private extractBrand(displayName: string): string | undefined {
    const knownBrands = [
      'Hacendado',
      'Bosque Verde',
      'Deliplus',
      'Compy',
      'Hacendado Artesano',
    ];

    for (const brand of knownBrands) {
      if (displayName.includes(brand)) {
        return brand;
      }
    }

    // Try to extract brand from end of name (common pattern: "Product Name BrandName")
    // This is a simplified approach - not all products have brand in name
    return undefined;
  }

  /**
   * Scrape detailed product information (not needed for API-based scraping)
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    // For API-based scraping, we get all details from the category endpoint
    // This method is kept for interface compatibility
    throw new Error(`scrapeProductDetails not implemented for API-based scraper. URL: ${url}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up Mercadona API scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Mercadona scraping completed:', stats);
  }
}
