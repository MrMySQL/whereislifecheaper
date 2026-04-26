import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';

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

/** Result from reading the dehydrated state for a category page */
interface DehydratedCategoryResult {
  /** Items found (for leaf categories) */
  items: WoltItem[];
  /**
   * Sub-category slugs (for parent categories whose SSR only loads
   * the first sub-category). When non-empty, the caller should
   * navigate to each sub-slug and call extractLeafItems().
   */
  subSlugs: string[];
}

/**
 * Shared wait/retry configuration for all Wolt Albania venue scrapers.
 * Spread this into the venue-specific config objects.
 */
export const woltAlbaniaBaseConfig = {
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
 * Base scraper for any Wolt venue (Albania).
 *
 * Wolt serves product data via SSR with dehydrated React Query state
 * embedded in a URL-encoded <script> tag. Products are extracted by
 * parsing this state without needing additional API calls.
 *
 * Supports two category structures:
 *  - Leaf categories (e.g. Bela Fruta): queryKey[3] === categorySlug
 *  - Parent categories (e.g. Eco Market Kika "Ushqimore"): queryKey[3..n]
 *    contains sub-category slugs. Only the first sub-category is SSR-loaded,
 *    so the scraper navigates to each sub-category individually.
 *
 * Data format:
 *   item.price: integer in smallest currency units (ALL cents, divide by 100)
 *   item.unit_price.unit: "kilogram" | "gram" | "liter" | "piece" | etc.
 *   item.unit_price.base: unit quantity (e.g. 1, 0.5, 1.5)
 *   item.disabled_info: non-null when item is sold out
 *   item.images[0].url: product image URL
 */
export abstract class WoltVenueScraper extends BaseScraper {
  protected abstract readonly venueSlug: string;

  constructor(config: ScraperConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing ${this.config.name} scraper...`);
    this.startTime = Date.now();

    await this.launchBrowser();
    this.page = await this.createPage();

    await this.page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForDynamicContent();
    await this.handleCookieConsent();

    scraperLogger.info(`${this.config.name} scraper initialized`);
  }

  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;
    try {
      const btn = await this.page.$('button:has-text("Use only necessary")');
      if (btn) {
        await btn.click();
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

      const result = await this.readDehydratedState(category.id);

      if (result.subSlugs.length > 0) {
        // Parent category — navigate to each sub-category individually
        scraperLogger.info(
          `${category.name} is a parent category with ${result.subSlugs.length} sub-categories`
        );
        for (const subSlug of result.subSlugs) {
          const subUrl = `${this.config.baseUrl}/items/${subSlug}`;
          await this.navigateToUrl(subUrl);
          await this.waitForDynamicContent();

          const subItems = await this.extractLeafItems(subSlug, subUrl, category.name);
          scraperLogger.info(
            `  Sub-category ${subSlug}: ${subItems.length} products`
          );

          if (this.onPageScraped && subItems.length > 0) {
            const saved = await this.onPageScraped(subItems, {
              categoryId: subSlug,
              categoryName: category.name,
              pageNumber: 1,
              totalProductsOnPage: subItems.length,
            });
            scraperLogger.info(`  Saved ${saved}/${subItems.length}`);
          }

          products.push(...subItems);
          await this.waitBetweenRequests();
        }
      } else {
        // Leaf category — items already extracted
        const mapped = result.items.map((item) =>
          this.mapItem(item, category.name, categoryUrl)
        );
        scraperLogger.info(`Found ${mapped.length} products in ${category.name}`);

        if (this.onPageScraped && mapped.length > 0) {
          const saved = await this.onPageScraped(mapped, {
            categoryId: category.id,
            categoryName: category.name,
            pageNumber: 1,
            totalProductsOnPage: mapped.length,
          });
          scraperLogger.info(`${category.name}: Saved ${saved}/${mapped.length} products`);
        }

        products.push(...mapped);
      }
    } catch (error) {
      this.logError(`Failed to scrape category: ${category.name}`, categoryUrl, error as Error);
    }

    return products;
  }

  /**
   * Navigate to a known leaf sub-category URL and return its items.
   */
  private async extractLeafItems(
    subSlug: string,
    subUrl: string,
    parentCategoryName: string
  ): Promise<ProductData[]> {
    try {
      const result = await this.readDehydratedState(subSlug);
      return result.items.map((item) => this.mapItem(item, parentCategoryName, subUrl));
    } catch (error) {
      scraperLogger.error(`Failed to extract items for sub-category ${subSlug}:`, error);
      await this.takeScreenshot(`wolt-sub-error-${subSlug}`);
      return [];
    }
  }

  /**
   * Reads the SSR dehydrated React Query state and returns either:
   * - items (for a leaf/single category page), OR
   * - subSlugs (for a parent category page where items are split across sub-categories)
   */
  private async readDehydratedState(
    categorySlug: string
  ): Promise<DehydratedCategoryResult> {
    if (!this.page) throw new Error('Page not initialized');

    const venueSlug = this.venueSlug;

    try {
      const result = await this.page.evaluate(
        ({
          venueSlug,
          categorySlug,
        }: {
          venueSlug: string;
          categorySlug: string;
        }): DehydratedCategoryResult => {
          const scripts = Array.from(document.querySelectorAll('script:not([src])'));
          const dehydratedScript = scripts.find(
            (s) => s.textContent && s.textContent.includes('dehydratedAt')
          );
          if (!dehydratedScript?.textContent) return { items: [], subSlugs: [] };

          // Wolt now emits the dehydrated state as plain JSON; older deploys URL-encoded it.
          let parsed: any;
          try {
            parsed = JSON.parse(dehydratedScript.textContent);
          } catch {
            try {
              parsed = JSON.parse(decodeURIComponent(dehydratedScript.textContent));
            } catch {
              return { items: [], subSlugs: [] };
            }
          }

          const queries: any[] = parsed.queries || [];

          // Strategy 1 (legacy): per-category "category" query, still served at some leaf URLs.
          const catQuery = queries.find(
            (q: any) =>
              Array.isArray(q.queryKey) &&
              q.queryKey[1] === 'category' &&
              q.queryKey[2] === venueSlug
          );
          if (catQuery?.state?.data?.pages) {
            const pageParams: Array<{ slug: string }> = catQuery.state.data.pageParams || [];
            const firstParamSlug = pageParams[0]?.slug;

            if (firstParamSlug === categorySlug) {
              const allItems: any[] = [];
              for (const page of catQuery.state.data.pages) {
                if (Array.isArray(page.items)) allItems.push(...page.items);
              }
              if (allItems.length > 0) return { items: allItems, subSlugs: [] };
            }

            // Legacy parent-format: sub-slugs encoded in the query key tail.
            // Key: ["venue-assortment", "category", venueSlug, sub1, sub2, ..., null, null, "en", "no-user"]
            const key: any[] = catQuery.queryKey;
            const keySubSlugs: string[] = key.slice(3).filter((s: any) => typeof s === 'string');
            if (keySubSlugs.length > 0) {
              return { items: [], subSlugs: keySubSlugs };
            }
          }

          // Strategy 2 (current): consolidated "category-listing" query containing the full
          // category tree and (for some venues) a flat items[] array. Items per category are
          // derived by joining `categories[].item_ids` against the flat items list.
          const listing = queries.find(
            (q: any) =>
              Array.isArray(q.queryKey) &&
              q.queryKey[1] === 'category-listing' &&
              q.queryKey[2] === venueSlug
          );
          const data = listing?.state?.data;
          if (data && Array.isArray(data.categories)) {
            const findCat = (cats: any[]): any | null => {
              for (const c of cats) {
                if (c?.slug === categorySlug) return c;
                if (Array.isArray(c?.subcategories) && c.subcategories.length > 0) {
                  const sub = findCat(c.subcategories);
                  if (sub) return sub;
                }
              }
              return null;
            };
            const cat = findCat(data.categories);
            if (cat) {
              if (Array.isArray(cat.subcategories) && cat.subcategories.length > 0) {
                const subSlugs = cat.subcategories
                  .map((s: any) => s?.slug)
                  .filter((s: any): s is string => typeof s === 'string');
                if (subSlugs.length > 0) return { items: [], subSlugs };
              }
              if (Array.isArray(cat.item_ids) && cat.item_ids.length > 0 && Array.isArray(data.items)) {
                const idSet = new Set<string>(cat.item_ids);
                const items = data.items.filter((it: any) => idSet.has(it.id));
                return { items, subSlugs: [] };
              }
            }
          }

          return { items: [], subSlugs: [] };
        },
        { venueSlug, categorySlug }
      );

      if (result.items.length === 0 && result.subSlugs.length === 0) {
        scraperLogger.warn(
          `readDehydratedState: no items or sub-slugs found for "${categorySlug}" in venue "${venueSlug}". ` +
          `Query key format may have changed.`
        );
      }

      return result;
    } catch (error) {
      scraperLogger.error(`Failed to read dehydrated state for ${categorySlug}:`, error);
      await this.takeScreenshot(`wolt-dehydrated-error-${categorySlug}`);
      return { items: [], subSlugs: [] };
    }
  }

  private mapItem(item: WoltItem, categoryName: string, productUrl: string): ProductData {
    const price = item.price / 100;
    const originalPrice = item.original_price ? item.original_price / 100 : undefined;
    const isOnSale = !!originalPrice && originalPrice > price;

    let unit: string | undefined;
    let unitQuantity: number | undefined;
    if (item.unit_price?.unit) {
      unit = mapWoltUnit(item.unit_price.unit);
      unitQuantity = item.unit_price.base ?? undefined;
    }

    return {
      name: item.name.trim(),
      price,
      currency: 'ALL',
      originalPrice: isOnSale ? originalPrice : undefined,
      isOnSale,
      imageUrl: item.images?.[0]?.url ?? undefined,
      productUrl,
      externalId: item.id,
      brand: undefined,
      unit,
      unitQuantity,
      categoryName,
      isAvailable: item.disabled_info === null,
    };
  }

  async scrapeProductDetails(url: string): Promise<ProductData> {
    throw new Error(`scrapeProductDetails not implemented for Wolt. URL: ${url}`);
  }

  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up ${this.config.name} scraper...`);
    await this.closeBrowser();
    scraperLogger.info(`${this.config.name} scraping completed:`, this.getStats());
  }
}
