import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { extractQuantity } from '../../utils/normalizer';

/**
 * Haravan/Shopify product JSON format
 */
interface HaravanProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: HaravanVariant[];
  images: HaravanImage[];
  body_html?: string;
}

interface HaravanVariant {
  id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
  barcode: string | null;
  weight: number;
  weight_unit: string;
  inventory_quantity: number;
  available: boolean;
}

interface HaravanImage {
  id: number;
  src: string;
}

interface HaravanProductsResponse {
  products: HaravanProduct[];
}

/**
 * Organica categories - organic grocery store available in Hanoi
 * Uses Haravan (Vietnamese Shopify) JSON API endpoints
 */
export const organicaCategories: CategoryConfig[] = [
  { id: 'vegetables', name: 'Vegetables', url: 'rau-cu-qua' },
  { id: 'fruits', name: 'Fruits', url: 'trai-cay' },
  { id: 'meat-seafood', name: 'Meat & Seafood', url: 'thit-thuy-hai-san' },
  { id: 'beverages', name: 'Beverages', url: 'thuc-uong' },
  { id: 'grains-seeds', name: 'Grains, Beans & Seeds', url: 'ngu-coc-dau-hat' },
  { id: 'spices-cooking', name: 'Spices & Cooking Ingredients', url: 'gia-vi-nguyen-lieu-nau-an' },
  { id: 'processed-foods', name: 'Processed Foods', url: 'san-pham-che-bien' },
  { id: 'non-food', name: 'Non-Food', url: 'phi-thuc-pham' },
  { id: 'okitchen', name: 'Okitchen', url: 'okitchen' },
  { id: 'organic-powder', name: 'Organic Vegetable Powder', url: 'botraucuhuucoosoil' },
];

/**
 * Organica scraper configuration
 */
export const organicaConfig: Partial<ScraperConfig> = {
  name: 'Organica',
  baseUrl: 'https://www.organica.vn',
  categories: organicaCategories,
  selectors: {
    productCard: '',
    productName: '',
    productPrice: '',
  },
  waitTimes: {
    pageLoad: 2000,
    dynamicContent: 1000,
    betweenRequests: 800,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/**
 * Scraper for Organica Vietnam (organica.vn)
 * Uses Haravan (Vietnamese Shopify) JSON API for efficient data extraction.
 * Organica is an organic grocery store with locations in Hanoi, HCMC, and Da Nang.
 *
 * API endpoints:
 * - Product listing: /collections/{handle}/products.json?page=N
 * - Single product: /products/{handle}.json
 */
export class OrganicaScraper extends BaseScraper {
  private readonly PRODUCTS_PER_PAGE = 25;

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper - launch browser and establish session
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Organica scraper...');
    this.startTime = Date.now();

    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to homepage to establish session cookies
    this.logger.info('Navigating to Organica homepage to establish session...');
    await this.page.goto(this.config.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await this.waitForDynamicContent();

    this.logger.info('Organica scraper initialized');
  }

  /**
   * Scrape a single category using the JSON API with pagination
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const allProducts: ProductData[] = [];
    let page = 1;
    let hasMore = true;

    this.logger.info(`Scraping category: ${category.name} (${category.url})`);

    while (hasMore) {
      try {
        const apiProducts = await this.fetchCategoryPage(category.url, page);

        // A failed request throws out to the catch below; an empty page is
        // the end of the category.
        if (apiProducts.length === 0) {
          hasMore = false;
          break;
        }

        const products = this.parseProducts(apiProducts, category.name);

        // Save products incrementally via callback
        if (this.onPageScraped && products.length > 0) {
          const savedCount = await this.onPageScraped(products, {
            categoryId: category.id,
            categoryName: category.name,
            pageNumber: page,
            totalProductsOnPage: products.length,
          });
          this.logger.info(
            `${category.name} page ${page}: Saved ${savedCount}/${products.length} products`
          );
        }

        allProducts.push(...products);

        // If we got fewer products than the page size, we've reached the end
        if (apiProducts.length < this.PRODUCTS_PER_PAGE) {
          hasMore = false;
        } else {
          page++;
          await this.waitBetweenRequests();
        }
      } catch (error) {
        // Giving the category up; BaseScraper decides whether that lost it
        // or truncated it.
        this.failCategory(category, error, `${this.config.baseUrl}/collections/${category.url}/products.json?page=${page}`);
        hasMore = false;
      }
    }

    this.logger.info(`${category.name}: Total ${allProducts.length} products scraped`);
    return allProducts;
  }

  /**
   * Fetch a single page of products from the Haravan JSON API
   */
  private async fetchCategoryPage(
    collectionHandle: string,
    page: number
  ): Promise<HaravanProduct[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const url = `${this.config.baseUrl}/collections/${collectionHandle}/products.json?page=${page}`;

    const response = await this.page.request.get(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()} ${response.statusText()}`);
    }
    const data: HaravanProductsResponse = await response.json();
    if (!Array.isArray(data?.products)) {
      throw new Error('Unexpected API response: no products array');
    }
    return data.products;
  }

  /**
   * Parse Haravan product data into ProductData format
   */
  private parseProducts(apiProducts: HaravanProduct[], categoryName: string): ProductData[] {
    const products: ProductData[] = [];

    for (const item of apiProducts) {
      try {
        const product = this.convertProduct(item, categoryName);
        if (product) {
          products.push(product);
          this.productsScraped++;
        }
      } catch (error) {
        this.productsFailed++;
        this.logger.debug(`Failed to parse product: ${item.title}`, error);
      }
    }

    return products;
  }

  /**
   * Convert a single Haravan product to ProductData format
   */
  private convertProduct(item: HaravanProduct, categoryName: string): ProductData | null {
    // Use the first variant (default variant) for pricing
    const variant = item.variants?.[0];
    if (!variant) {
      this.logger.debug(`Product ${item.title} has no variants, skipping`);
      return null;
    }

    // Parse price - Haravan stores prices as strings
    const price = this.parseHaravanPrice(variant.price);
    if (!price || price <= 0) {
      this.logger.debug(`Product ${item.title} has invalid price: ${variant.price}`);
      return null;
    }

    // Check for sale price
    const compareAtPrice = variant.compare_at_price
      ? this.parseHaravanPrice(variant.compare_at_price)
      : null;
    const isOnSale = compareAtPrice !== null && compareAtPrice > price;

    // Extract quantity from product title
    const quantityInfo = extractQuantity(item.title);

    // Parse weight from variant if no quantity found in title
    let unit = quantityInfo?.unit;
    let unitQuantity = quantityInfo?.value;
    if (!unit && variant.weight > 0 && variant.weight_unit) {
      unit = variant.weight_unit.toLowerCase();
      unitQuantity = variant.weight;
    }

    // Build image URL
    const imageUrl = item.images?.[0]?.src;

    // Build product URL
    const productUrl = `${this.config.baseUrl}/products/${item.handle}`;

    return {
      name: item.title,
      price,
      currency: 'VND',
      originalPrice: isOnSale ? compareAtPrice! : undefined,
      isOnSale,
      imageUrl,
      productUrl,
      externalId: String(item.id),
      brand: item.vendor || undefined,
      unit,
      unitQuantity,
      categoryName: item.product_type || categoryName,
      isAvailable: variant.available,
    };
  }

  /**
   * Parse Haravan price string to number.
   * Haravan stores prices as strings, sometimes in hundredths (e.g., "19500000" for 195,000 VND).
   * Vietnamese Dong has no decimal subdivisions, so real prices are whole numbers.
   */
  private parseHaravanPrice(priceStr: string): number | null {
    if (!priceStr) return null;

    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) return null;

    // Haravan/Shopify stores prices in hundredths of the currency unit
    // For VND: "19500000" means 195,000 VND (divide by 100)
    // Heuristic: if price > 10,000,000 it's likely in hundredths
    // (Most Vietnamese grocery items cost between 5,000 and 5,000,000 VND)
    if (price > 10_000_000) {
      return price / 100;
    }

    return price;
  }

  /**
   * Scrape detailed product information via JSON API
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    // Extract handle from URL: /products/{handle}
    const handleMatch = url.match(/\/products\/([^/?]+)/);
    if (!handleMatch) {
      throw new Error(`Could not extract product handle from ${url}`);
    }

    const jsonUrl = `${this.config.baseUrl}/products/${handleMatch[1]}.json`;

    const response = await this.page.request.get(jsonUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok()) {
      throw new Error(`API request failed: ${response.status()} for ${jsonUrl}`);
    }

    const data = await response.json();
    const product = this.convertProduct(data.product, '');

    if (!product) {
      throw new Error(`Failed to parse product from ${jsonUrl}`);
    }

    return product;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Organica scraper...');
    await this.closeBrowser();

    const stats = this.getStats();
    this.logger.info('Organica scraping completed:', stats);
  }
}
