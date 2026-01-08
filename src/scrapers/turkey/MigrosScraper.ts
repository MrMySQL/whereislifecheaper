import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';

/**
 * Migros API response types
 */
interface MigrosApiResponse {
  successful: boolean;
  data: {
    searchInfo: {
      pageCount: number;
      hitCount: number;
      storeProductInfos: MigrosProduct[];
    };
  };
}

interface MigrosProduct {
  id: number;
  sku: string;
  name: string;
  brand?: {
    name: string;
    id: number;
    prettyName: string;
  };
  category?: {
    name: string;
    id: number;
    prettyName: string;
  };
  images?: Array<{
    urls: {
      PRODUCT_LIST: string;
      PRODUCT_DETAIL: string;
    };
  }>;
  prettyName: string;
  status: string;
  unit: 'GRAM' | 'PIECE' | 'LITRE' | 'MILLILITER';
  unitAmount: number;
  regularPrice: number;  // in kuruş (1/100 TRY)
  shownPrice: number;    // in kuruş
  discountRate: number;
}

/**
 * Scraper for Migros Turkey (migros.com.tr)
 * Uses the REST API via Playwright for efficient data extraction
 * Browser context is needed to bypass Cloudflare protection
 */
export class MigrosScraper extends BaseScraper {
  private readonly API_BASE = 'https://www.migros.com.tr/rest/search/screens';

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper with browser (needed for Cloudflare bypass)
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Migros API scraper...`);
    this.startTime = Date.now();

    // Launch browser to handle Cloudflare
    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to main page first to get cookies/pass Cloudflare
    scraperLogger.info('Navigating to Migros homepage to establish session...');
    await this.page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();

    // Handle any Cloudflare challenge
    await this.handleAntiBot();

    scraperLogger.info(`Migros API scraper initialized`);
  }

  /**
   * Scrape a single category using REST API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    return this.scrapeCategoryViaApi(category.url, category.id, category.name);
  }

  /**
   * Scrape a single category using REST API with pagination
   */
  private async scrapeCategoryViaApi(
    categoryUrl: string,
    categoryId: string,
    categoryName: string
  ): Promise<ProductData[]> {
    const products: ProductData[] = [];

    // Convert URL like /meyve-sebze-c-2 to API slug meyve-sebze-c-2
    const categorySlug = categoryUrl.replace(/^\//, '');

    // First request to get total page count
    const firstPageData = await this.fetchCategoryPage(categorySlug, 1);

    if (!firstPageData?.successful) {
      scraperLogger.warn(`Failed to fetch category ${categoryName}: API returned unsuccessful`);
      return products;
    }

    const totalPages = firstPageData.data.searchInfo.pageCount;
    const totalProducts = firstPageData.data.searchInfo.hitCount;

    scraperLogger.info(`Category ${categoryName}: ${totalProducts} products across ${totalPages} pages`);

    // Process first page
    const firstPageProducts = this.parseProducts(firstPageData.data.searchInfo.storeProductInfos);

    // Save products after first page via callback
    if (this.onPageScraped && firstPageProducts.length > 0) {
      const savedCount = await this.onPageScraped(firstPageProducts, {
        categoryId,
        categoryName,
        pageNumber: 1,
        totalProductsOnPage: firstPageProducts.length,
      });
      scraperLogger.info(
        `Page 1/${totalPages} of ${categoryName}: Saved ${savedCount}/${firstPageProducts.length} products`
      );
    }

    products.push(...firstPageProducts);

    // Process remaining pages
    for (let page = 2; page <= totalPages; page++) {
      try {
        await this.waitBetweenRequests();

        const pageData = await this.fetchCategoryPage(categorySlug, page);

        if (!pageData?.successful) {
          scraperLogger.warn(`Failed to fetch page ${page} of ${categoryName}`);
          continue;
        }

        const pageProducts = this.parseProducts(pageData.data.searchInfo.storeProductInfos);

        // Save products after each page via callback
        if (this.onPageScraped && pageProducts.length > 0) {
          const savedCount = await this.onPageScraped(pageProducts, {
            categoryId,
            categoryName,
            pageNumber: page,
            totalProductsOnPage: pageProducts.length,
          });
          scraperLogger.info(
            `Page ${page}/${totalPages} of ${categoryName}: Saved ${savedCount}/${pageProducts.length} products`
          );
        }

        products.push(...pageProducts);

      } catch (error) {
        this.logError(
          `Failed to scrape page ${page} of ${categoryName}`,
          `${this.API_BASE}/${categorySlug}?sayfa=${page}`,
          error as Error
        );
      }
    }

    return products;
  }

  /**
   * Fetch a single category page from the API using browser context
   */
  private async fetchCategoryPage(categorySlug: string, page: number): Promise<MigrosApiResponse | null> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = page === 1
      ? `${this.API_BASE}/${categorySlug}`
      : `${this.API_BASE}/${categorySlug}?sayfa=${page}`;

    try {
      // Use Playwright's request context (includes cookies from browser)
      const response = await this.page.request.get(url, {
        headers: {
          'Accept': 'application/json',
          'X-PWA': 'true',
          'X-FORWARDED-REST': 'true',
        },
      });

      if (!response.ok()) {
        scraperLogger.warn(`API request failed: ${response.status()} ${response.statusText()}`);
        return null;
      }

      const data: MigrosApiResponse = await response.json();
      return data;
    } catch (error) {
      scraperLogger.error(`Failed to fetch ${url}:`, error);
      return null;
    }
  }

  /**
   * Parse API product data into ProductData format
   */
  private parseProducts(apiProducts: MigrosProduct[]): ProductData[] {
    const products: ProductData[] = [];

    if (!apiProducts || !Array.isArray(apiProducts)) {
      scraperLogger.warn(`No products array in API response`);
      return products;
    }

    for (const item of apiProducts) {
      try {
        // Skip products not in sale
        if (item.status !== 'IN_SALE') {
          continue;
        }

        // Convert kuruş to TRY (divide by 100)
        const price = item.shownPrice / 100;
        const regularPrice = item.regularPrice / 100;
        const isOnSale = item.discountRate > 0 || item.shownPrice < item.regularPrice;

        // Parse unit information
        const { unit, unitQuantity } = this.parseUnit(item.unit, item.unitAmount);

        // Get image URL
        const imageUrl = item.images?.[0]?.urls?.PRODUCT_DETAIL;

        // Build product URL
        const productUrl = `${this.config.baseUrl}/${item.prettyName}`;

        const product: ProductData = {
          name: item.name,
          price,
          currency: 'TRY',
          originalPrice: isOnSale ? regularPrice : undefined,
          isOnSale,
          imageUrl,
          productUrl,
          brand: item.brand?.name,
          unit,
          unitQuantity,
          isAvailable: true,
          externalId: item.sku,
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
   * Parse Migros unit format to standard format
   */
  private parseUnit(unit: string, unitAmount: number): { unit?: string; unitQuantity?: number } {
    switch (unit) {
      case 'GRAM':
        // unitAmount is typically 1000 for kg
        if (unitAmount >= 1000) {
          return { unit: 'kg', unitQuantity: unitAmount / 1000 };
        }
        return { unit: 'g', unitQuantity: unitAmount };

      case 'PIECE':
        return { unit: 'pieces', unitQuantity: unitAmount };

      case 'LITRE':
        return { unit: 'l', unitQuantity: unitAmount };

      case 'MILLILITER':
        if (unitAmount >= 1000) {
          return { unit: 'l', unitQuantity: unitAmount / 1000 };
        }
        return { unit: 'ml', unitQuantity: unitAmount };

      default:
        return { unit: undefined, unitQuantity: undefined };
    }
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
    scraperLogger.info(`Cleaning up Migros API scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Migros scraping completed:', stats);
  }
}
