import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';

/**
 * Wolt Bela Fruta categories configuration
 * Categories from https://wolt.com/en/alb/tirana/venue/bela-fruta
 */
export const woltBelaFrutaCategories: CategoryConfig[] = [
  { id: 'ekskluzive-1', name: 'EKSKLUZIVE', url: '/items/ekskluzive-1' },
  { id: 'ekzotike-2', name: 'EKZOTIKE', url: '/items/ekzotike-2' },
  { id: 'fruta-3', name: 'FRUTA', url: '/items/fruta-3' },
  { id: 'fruta-te-thata-5', name: 'FRUTA TE THATA', url: '/items/fruta-te-thata-5' },
  { id: 'bio-fshati-6', name: 'BIO FSHATI', url: '/items/bio-fshati-6' },
  { id: 'perime-7', name: 'PERIME', url: '/items/perime-7' },
  { id: 'produkte-8', name: 'PRODUKTE', url: '/items/produkte-8' },
  { id: 'pije-9', name: 'PIJE', url: '/items/pije-9' },
  { id: 'snacks-10', name: 'SNACKS', url: '/items/snacks-10' },
  // { id: 'alkolike-12', name: 'ALKOLIKE', url: '/items/alkolike-12' },
  { id: 'fruta-te-prera-13', name: 'FRUTA TE PRERA', url: '/items/fruta-te-prera-13' },
];

/**
 * Wolt Bela Fruta scraper configuration
 */
export const woltBelaFrutaConfig: Partial<ScraperConfig> = {
  name: 'Wolt Bela Fruta',
  baseUrl: 'https://wolt.com/en/alb/tirana/venue/bela-fruta',
  categories: woltBelaFrutaCategories,
  selectors: {
    productCard: 'li[role="listitem"]',
    productName: 'h3',
    productPrice: '[data-test-id="product-price"]',
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
  ],
};

/**
 * Maps Wolt unit strings to standard unit codes
 */
function mapWoltUnit(woltUnit: string): string {
  const unitMap: Record<string, string> = {
    kilogram: 'kg',
    gram: 'g',
    liter: 'l',
    milliliter: 'ml',
    piece: 'pieces',
    pc: 'pieces',
    pcs: 'pieces',
  };
  return unitMap[woltUnit.toLowerCase()] || woltUnit;
}

/**
 * Scraper for Wolt Bela Fruta (Albania)
 * https://wolt.com/en/alb/tirana/venue/bela-fruta
 *
 * Wolt serves product data via SSR with dehydrated React Query state
 * embedded in a URL-encoded <script> tag. Products are extracted by
 * parsing this state without needing additional API calls.
 *
 * Data format:
 *   item.price: integer in smallest currency units (ALL cents, divide by 100)
 *   item.unit_price.unit: "kilogram" | "gram" | "liter" | "piece" | etc.
 *   item.unit_price.base: unit quantity (e.g. 1, 0.5, 1.5)
 *   item.images[0].url: product image URL
 */
export class WoltBelaFrutaScraper extends BaseScraper {
  private readonly VENUE_SLUG = 'bela-fruta';

  constructor(config: ScraperConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    scraperLogger.info('Initializing Wolt Bela Fruta scraper...');
    this.startTime = Date.now();

    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to venue page to establish session and cookies
    await this.page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();

    // Dismiss cookie consent if present
    await this.handleCookieConsent();

    scraperLogger.info('Wolt Bela Fruta scraper initialized');
  }

  /**
   * Dismiss Wolt cookie consent dialog
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;
    try {
      const useNecessaryBtn = await this.page.$('button:has-text("Use only necessary")');
      if (useNecessaryBtn) {
        await useNecessaryBtn.click();
        await this.page.waitForTimeout(500);
        scraperLogger.debug('Dismissed cookie consent');
      }
    } catch {
      scraperLogger.debug('No cookie consent dialog found');
    }
  }

  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];
    const categoryUrl = `${this.config.baseUrl}${category.url}`;

    scraperLogger.info(`Scraping category: ${category.name} — ${categoryUrl}`);

    try {
      await this.navigateToUrl(categoryUrl);
      await this.waitForDynamicContent();

      const pageProducts = await this.extractProductsFromDehydratedState(category);
      scraperLogger.info(`Found ${pageProducts.length} products in ${category.name}`);

      if (this.onPageScraped && pageProducts.length > 0) {
        const savedCount = await this.onPageScraped(pageProducts, {
          categoryId: category.id,
          categoryName: category.name,
          pageNumber: 1,
          totalProductsOnPage: pageProducts.length,
        });
        scraperLogger.info(`${category.name}: Saved ${savedCount}/${pageProducts.length} products`);
      }

      products.push(...pageProducts);
    } catch (error) {
      this.logError(
        `Failed to scrape category: ${category.name}`,
        categoryUrl,
        error as Error
      );
    }

    return products;
  }

  /**
   * Extracts product items from the SSR dehydrated React Query state
   * embedded in the page HTML as a URL-encoded JSON <script> tag.
   */
  private async extractProductsFromDehydratedState(category: CategoryConfig): Promise<ProductData[]> {
    if (!this.page) throw new Error('Page not initialized');

    const categorySlug = category.id;
    const venueSlug = this.VENUE_SLUG;
    const categoryUrl = `${this.config.baseUrl}${category.url}`;

    try {
      const rawItems: WoltItem[] = await this.page.evaluate(
        ({ venueSlug, categorySlug }: { venueSlug: string; categorySlug: string }) => {
          const scripts = Array.from(document.querySelectorAll('script:not([src])'));
          const dehydratedScript = scripts.find(
            (s) => s.textContent && s.textContent.includes('dehydratedAt')
          );
          if (!dehydratedScript?.textContent) return [];

          let parsed: any;
          try {
            parsed = JSON.parse(decodeURIComponent(dehydratedScript.textContent));
          } catch {
            return [];
          }

          const queries: any[] = parsed.queries || [];

          // Find category-specific query: ["venue-assortment", "category", venueSlug, categorySlug, ...]
          const catQuery = queries.find(
            (q: any) =>
              Array.isArray(q.queryKey) &&
              q.queryKey[1] === 'category' &&
              q.queryKey[2] === venueSlug &&
              q.queryKey[3] === categorySlug
          );

          if (!catQuery?.state?.data?.pages) return [];

          // Collect all items from all pages (handles infinite scroll pagination)
          const allItems: any[] = [];
          for (const page of catQuery.state.data.pages) {
            if (Array.isArray(page.items)) {
              allItems.push(...page.items);
            }
          }
          return allItems;
        },
        { venueSlug, categorySlug }
      );

      return rawItems.map((item) => this.mapWoltItemToProductData(item, category, categoryUrl));
    } catch (error) {
      scraperLogger.error(`Failed to extract dehydrated state for ${category.name}:`, error);
      await this.takeScreenshot(`wolt-dehydrated-error-${category.id}`);
      throw error;
    }
  }

  /**
   * Maps a raw Wolt item from the dehydrated state to ProductData
   */
  private mapWoltItemToProductData(
    item: WoltItem,
    category: CategoryConfig,
    categoryUrl: string
  ): ProductData {
    // Price is in smallest currency units — divide by 100 for ALL
    const price = item.price / 100;
    const originalPrice = item.original_price ? item.original_price / 100 : undefined;
    const isOnSale = !!originalPrice && originalPrice > price;

    // Unit info
    let unit: string | undefined;
    let unitQuantity: number | undefined;
    if (item.unit_price?.unit) {
      unit = mapWoltUnit(item.unit_price.unit);
      unitQuantity = item.unit_price.base ?? undefined;
    }

    // Image
    const imageUrl = item.images?.[0]?.url ?? undefined;

    return {
      name: item.name.trim(),
      price,
      currency: 'ALL',
      originalPrice: isOnSale ? originalPrice : undefined,
      isOnSale,
      imageUrl,
      productUrl: categoryUrl,
      externalId: item.id,
      brand: undefined,
      unit,
      unitQuantity,
      categoryName: category.name,
      isAvailable: item.disabled_info === null,
    };
  }

  async scrapeProductDetails(url: string): Promise<ProductData> {
    throw new Error(`scrapeProductDetails not implemented for Wolt. URL: ${url}`);
  }

  async cleanup(): Promise<void> {
    scraperLogger.info('Cleaning up Wolt Bela Fruta scraper...');
    await this.closeBrowser();
    const stats = this.getStats();
    scraperLogger.info('Wolt Bela Fruta scraping completed:', stats);
  }
}

/**
 * Internal type for raw Wolt item from dehydrated state
 */
interface WoltItem {
  id: string;
  name: string;
  price: number;
  original_price: number | null;
  disabled_info: { disable_text: string; disable_reason: string | null } | null;
  unit_price: {
    unit: string;
    base: number | null;
    price: number;
    original_price: number | null;
  } | null;
  images: Array<{ url: string; blurhash: string | null }> | null;
}
