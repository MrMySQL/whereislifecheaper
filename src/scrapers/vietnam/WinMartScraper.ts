import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { extractQuantity } from '../../utils/normalizer';

/**
 * WinMart API product response
 */
interface WinMartProduct {
  id: string;
  itemNo: string;
  name: string;
  shortDescription: string;
  seoName: string;
  price: number;
  salePrice: number;
  brandName: string;
  barcode: string;
  sku: string;
  mediaUrl: string;
  uom: string;
  uomName: string;
  quantity: number;
  quantityPerUnit: number;
  categoryName: string;
  promotionType?: string;
  isAlcohol: boolean;
  mediaItems?: Array<{ mediaUrl: string }>;
}

interface WinMartCategoryResponse {
  data: {
    name: string;
    description: string;
    seoName: string;
    items: WinMartProduct[];
  };
}

/**
 * WinMart grocery categories - major Vietnamese supermarket chain
 * Focused on food and beverage categories, excluding household/personal care
 */
export const winMartCategories: CategoryConfig[] = [
  { id: 'vegetables-fruits', name: 'Vegetables & Fruits', url: 'rau-cu-trai-cay--c02' },
  { id: 'meat-seafood', name: 'Fresh Meat & Seafood', url: 'thit-hai-san-tuoi--c03' },
  { id: 'dairy', name: 'Dairy', url: 'sua-cac-loai--c08' },
  { id: 'eggs-tofu', name: 'Eggs & Tofu', url: 'trung-dau-hu--c33' },
  { id: 'processed-foods', name: 'Processed Foods', url: 'thuc-pham-che-bien--c04' },
  { id: 'frozen-foods', name: 'Frozen Foods', url: 'thuc-pham-dong-lanh--c05' },
  { id: 'dry-foods', name: 'Dry Foods', url: 'thuc-pham-kho--c06' },
  { id: 'instant-noodles', name: 'Instant Noodles & Foods', url: 'mi-thuc-pham-an-lien--c34' },
  { id: 'spices', name: 'Spices & Condiments', url: 'gia-vi--c35' },
  { id: 'confectionery', name: 'Confectionery', url: 'banh-keo--c07' },
  { id: 'beverages', name: 'Beverages', url: 'do-uong-giai-khat--c09' },
];

/**
 * WinMart scraper configuration
 */
export const winMartConfig: Partial<ScraperConfig> = {
  name: 'WinMart',
  baseUrl: 'https://winmart.vn',
  categories: winMartCategories,
  selectors: {
    productCard: '',
    productName: '',
    productPrice: '',
  },
  waitTimes: {
    pageLoad: 3000,
    dynamicContent: 1500,
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
 * Scraper for WinMart Vietnam (winmart.vn)
 * Vietnam's largest supermarket chain, part of Masan Group (WinCommerce).
 *
 * Uses the CrownX REST API (api-crownx.winmart.vn) to fetch product listings
 * by category with pagination. The browser session establishes cookies and
 * the default store (Hanoi, storeCode=1535).
 *
 * API endpoint:
 *   GET /it/api/web/v3/item/category?slug={seoName}&storeCode=1535&storeGroupCode=1998&pageNumber=N&pageSize=40
 *
 * Pagination: no total count returned — stops when items.length < pageSize.
 */
export class WinMartScraper extends BaseScraper {
  private static readonly API_BASE = 'https://api-crownx.winmart.vn';
  private static readonly STORE_CODE = '1535'; // Hanoi store
  private static readonly STORE_GROUP_CODE = '1998';
  private static readonly PAGE_SIZE = 40;

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize — launch browser and visit homepage to establish session cookies.
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing WinMart scraper...');
    this.startTime = Date.now();

    await this.launchBrowser();
    this.page = await this.createPage();

    this.logger.info('Navigating to WinMart homepage to establish session...');
    await this.page.goto(this.config.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await this.waitForDynamicContent();

    this.logger.info('WinMart scraper initialized');
  }

  /**
   * Scrape a single category using the CrownX API with pagination.
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    if (!this.page) throw new Error('Page not initialized');

    const allProducts: ProductData[] = [];
    let pageNumber = 1;

    this.logger.info(`Scraping category: ${category.name} (${category.url})`);

    while (true) {
      try {
        const items = await this.fetchCategoryPage(category.url, pageNumber);

        // A failed request throws out to the catch below; an empty page is
        // the end of the category.
        if (items.length === 0) {
          this.logger.info(`${category.name}: no more products at page ${pageNumber}`);
          break;
        }

        const products = this.parseProducts(items, category.name);

        if (this.onPageScraped && products.length > 0) {
          const saved = await this.onPageScraped(products, {
            categoryId: category.id,
            categoryName: category.name,
            pageNumber,
            totalProductsOnPage: products.length,
          });
          this.logger.info(
            `${category.name} page ${pageNumber}: Saved ${saved}/${products.length} products`
          );
        }

        allProducts.push(...products);

        if (items.length < WinMartScraper.PAGE_SIZE) {
          this.logger.info(`${category.name}: last page reached at page ${pageNumber}`);
          break;
        }

        pageNumber++;
        await this.waitBetweenRequests();
      } catch (error) {
        // Giving the category up; BaseScraper decides whether that lost it
        // or truncated it.
        this.failCategory(
          category,
          error,
          `${WinMartScraper.API_BASE}/it/api/web/v3/item/category?slug=${category.url}&pageNumber=${pageNumber}`,
        );
        break;
      }
    }

    this.logger.info(`${category.name}: Total ${allProducts.length} products scraped`);
    return allProducts;
  }

  /**
   * Fetch a page of products from the CrownX API.
   */
  private async fetchCategoryPage(
    slug: string,
    pageNumber: number,
  ): Promise<WinMartProduct[]> {
    if (!this.page) throw new Error('Page not initialized');

    const url =
      `${WinMartScraper.API_BASE}/it/api/web/v3/item/category` +
      `?orderByDesc=true` +
      `&pageNumber=${pageNumber}` +
      `&pageSize=${WinMartScraper.PAGE_SIZE}` +
      `&slug=${slug}` +
      `&storeCode=${WinMartScraper.STORE_CODE}` +
      `&storeGroupCode=${WinMartScraper.STORE_GROUP_CODE}`;

    const response = await this.page.request.get(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!response.ok()) {
      throw new Error(`HTTP ${response.status()} ${response.statusText()}`);
    }
    const data: WinMartCategoryResponse = await response.json();
    if (!Array.isArray(data?.data?.items)) {
      throw new Error('Unexpected API response: no items array');
    }
    return data.data.items;
  }

  /**
   * Convert API products to ProductData format.
   */
  private parseProducts(items: WinMartProduct[], categoryName: string): ProductData[] {
    const products: ProductData[] = [];

    for (const item of items) {
      try {
        const product = this.convertProduct(item, categoryName);
        if (product) {
          products.push(product);
          this.productsScraped++;
        }
      } catch (error) {
        this.productsFailed++;
        this.logger.debug(`Failed to parse product: ${item.name}`, error);
      }
    }

    return products;
  }

  /**
   * Convert a single WinMart API product to ProductData.
   */
  private convertProduct(item: WinMartProduct, categoryName: string): ProductData | null {
    if (!item.name || !item.salePrice) {
      return null;
    }

    const price = item.salePrice;
    if (price <= 0) return null;

    const isOnSale = item.price > item.salePrice;
    const originalPrice = isOnSale ? item.price : undefined;

    // Extract quantity from product name
    const quantityInfo = extractQuantity(item.name);

    // Parse unit from UoM field as fallback
    let unit = quantityInfo?.unit;
    let unitQuantity = quantityInfo?.value;
    if (!unit) {
      const parsed = this.parseUom(item.uom);
      if (parsed) {
        unit = parsed.unit;
        unitQuantity = parsed.value;
      }
    }

    const productUrl = `${this.config.baseUrl}/${item.seoName}`;
    const imageUrl = item.mediaUrl || item.mediaItems?.[0]?.mediaUrl;

    return {
      name: item.name,
      price,
      currency: 'VND',
      originalPrice,
      isOnSale,
      imageUrl: imageUrl || undefined,
      productUrl,
      externalId: item.itemNo,
      brand: item.brandName && item.brandName !== 'NOBRAND' ? item.brandName : undefined,
      unit,
      unitQuantity,
      categoryName: item.categoryName || categoryName,
      isAvailable: item.quantity > 0,
    };
  }

  /**
   * Parse WinMart UoM codes into standard unit/value.
   * Common UoMs: KG (Kg), G4 (Gói 4), HOP (Hộp), CHAI (Chai), LON (Lon), etc.
   */
  private parseUom(uom: string): { unit: string; value: number } | null {
    if (!uom) return null;

    const upper = uom.toUpperCase();
    if (upper === 'KG') return { unit: 'kg', value: 1 };
    if (upper === 'G') return { unit: 'g', value: 1 };

    // "G4" = Gói 4, "G6" = Gói 6 - packs of N items
    const packMatch = upper.match(/^G(\d+)$/);
    if (packMatch) return { unit: 'pieces', value: parseInt(packMatch[1], 10) };

    // Single-unit types
    if (['HOP', 'CHAI', 'LON', 'GOI', 'TUI', 'BICH'].includes(upper)) {
      return { unit: 'pieces', value: 1 };
    }

    return null;
  }

  /**
   * Scrape detailed product information from a product page.
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    if (!this.page) throw new Error('Page not initialized');

    await this.navigateToUrl(url);
    await this.waitForDynamicContent();

    const name = await this.extractText('.product-detail-name');
    if (!name) throw new Error(`Could not extract product name from ${url}`);

    const priceStr = await this.extractText('.product-detail-price .price');
    const price = priceStr ? parseInt(priceStr.replace(/[^\d]/g, ''), 10) : null;
    if (!price) throw new Error(`Could not extract price from ${url}`);

    const imageUrl = await this.extractAttribute('.product-detail-image img', 'src');
    const quantityInfo = extractQuantity(name);

    return {
      name,
      price,
      currency: 'VND',
      isOnSale: false,
      productUrl: url,
      imageUrl: imageUrl || undefined,
      unit: quantityInfo?.unit,
      unitQuantity: quantityInfo?.value,
      isAvailable: true,
    };
  }

  /**
   * Cleanup resources.
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up WinMart scraper...');
    await this.closeBrowser();

    const stats = this.getStats();
    this.logger.info('WinMart scraping completed:', stats);
  }
}
