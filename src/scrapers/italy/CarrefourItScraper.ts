import { BaseScraper, RequestFailure } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { extractQuantity } from '../../utils/normalizer';
import { retry, sleep } from '../../utils/retry';
import { config as envConfig } from '../../config/env';
import { describeCloudflarePage, isRetryableOpenError, openPastCloudflare } from '../../utils/cloudflare';

const ORIGIN = 'https://www.carrefour.it';
/** Opened first so the API calls are same-origin fetches from a page Cloudflare let through. */
const STOREFRONT_URL = `${ORIGIN}/spesa-online/`;
const REQUEST_TIMEOUT_MS = 30000;
const RESPONSE_SNIPPET_CHARS = 200;

/** What an in-page fetch returns to Node. */
export interface HttpResponse {
  status: number;
  contentType: string | null;
  body: string;
}

function snippet(body: string): string {
  return body.replace(/\s+/g, ' ').trim().substring(0, RESPONSE_SNIPPET_CHARS);
}

/**
 * Paging and filter query shared by the JSON product request and the HTML page
 * that supplies its images. Both must ask for the same product set: without the
 * `pmin` price filter the HTML page lists a different selection, so beyond the
 * first page few products from the JSON (often none) appear in it.
 */
export function pageQuery(start: number, sz: number): string {
  return `start=${start}&sz=${sz}&pmin=0%2C01`;
}

const TILE_IMAGE_SRC =
  /\b(?:data-)?src="(\/on\/demandware\.static\/-\/Sites-carrefour-master-catalog-IT\/[^"\s]+)"/;

/**
 * Map product id → image URL from a rendered category page.
 *
 * Each tile's <img> names its single image file in `data-src` (lazy-loaded
 * tiles) or plain `src` (the first few tiles on a page are eager-loaded and
 * have no `data-src`); a tile never carries both. That attribute is used rather
 * than `data-srcset`, a comma-separated list of CDN renditions whose static path
 * can name an extension that does not exist (e.g. `-1.png` where only `-1.jpg`
 * is stored), and which a greedy match captures as one broken URL.
 */
export function parseTileImages(html: string): Map<string, string> {
  const images = new Map<string, string>();
  for (const block of html.split('data-pid="').slice(1)) {
    const pid = block.match(/^(\d+)"/)?.[1];
    if (!pid || images.has(pid)) continue;

    // Search only this tile, not the next one
    const nextTileIdx = block.indexOf('data-pid="', 100);
    const tile = nextTileIdx > 0 ? block.substring(0, nextTileIdx) : block.substring(0, 5000);
    const src = tile.match(TILE_IMAGE_SRC)?.[1];
    if (src) images.set(pid, `https://www.carrefour.it${src.replace(/&amp;/g, '&')}`);
  }
  return images;
}

/**
 * Demandware API response types for Carrefour Italy
 */
interface DemandwareProduct {
  uuid: string;
  id: string;
  productName: string;
  brand: string;
  productType: string;
  price: {
    sales?: { value: number; currency: string; formatted: string; decimalPrice: string };
    list?: { value: number; currency: string; formatted: string; decimalPrice: string };
  };
  unitPrice?: {
    sales?: { value: number; currency: string; formatted: string; decimalPrice: string };
  };
  unitData?: {
    unit: string;
    unitLaw: string;
    value: string;
    conversion: string;
  };
  available: boolean;
  isFood: boolean;
  primaryCategory: string;
  primaryCategoryName: string;
  discountPercentage: string;
  variableWeight: boolean;
  impression: {
    name: string;
    id: string;
    price: string;
    brand: string;
    category: string;
    dimension52: string; // package size e.g. "0.85 kg"
    dimension53: string; // "food" or "non_food"
  };
}

interface DemandwareSearchResponse {
  productIds: DemandwareProduct[];
  countResult: number;
  countResultLabel: string;
}

/**
 * Turn a raw Search-ShowAjax response into a validated page, or throw an error
 * that says what actually came back: a Cloudflare page, a non-2xx status, a
 * non-JSON body, or JSON of the wrong shape. Every page is validated here,
 * while its exact URL is still available to the caller for error reporting.
 */
export function interpretSearchResponse(res: HttpResponse): DemandwareSearchResponse {
  const cloudflare = describeCloudflarePage(res.body);
  if (cloudflare) {
    throw new Error(`Blocked by Cloudflare: HTTP ${res.status}, ${cloudflare}`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}: ${snippet(res.body)}`);
  }

  let data: DemandwareSearchResponse;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error(
      `Failed to parse response as JSON (content-type ${res.contentType ?? 'unknown'}): ${snippet(res.body)}`
    );
  }
  if (!Array.isArray(data?.productIds)) {
    throw new Error('Unexpected API response: productIds is not an array');
  }
  if (!Number.isInteger(data.countResult) || data.countResult < 0) {
    throw new Error('Unexpected API response: countResult is not a non-negative integer');
  }
  return data;
}

/**
 * Carrefour Italy food categories (14 categories)
 */
export const carrefourItCategories: CategoryConfig[] = [
  { id: 'frutta', name: 'Frutta e verdura', url: '/spesa-online/frutta-e-verdura/frutta/' },
  { id: 'carne', name: 'Carne', url: '/spesa-online/carne/' },
  { id: 'pesce', name: 'Pesce', url: '/spesa-online/pesce/' },
  { id: 'salumi-e-formaggi', name: 'Formaggi e salumi', url: '/spesa-online/salumi-e-formaggi/' },
  { id: 'gastronomia', name: 'Gastronomia', url: '/spesa-online/gastronomia/' },
  { id: 'uova-latte-e-latticini', name: 'Uova, latte e latticini', url: '/spesa-online/uova-latte-e-latticini/' },
  { id: 'dolci-e-prima-colazione', name: 'Dolci e prima colazione', url: '/spesa-online/dolci-e-prima-colazione/' },
  { id: 'acqua-e-analcolici', name: 'Acqua, succhi e bibite', url: '/spesa-online/acqua-e-analcolici/' },
  { id: 'pasta-riso-e-farina', name: 'Pasta, riso e farina', url: '/spesa-online/pasta-riso-e-farina/' },
  { id: 'condimenti-e-conserve', name: 'Condimenti e conserve', url: '/spesa-online/condimenti-e-conserve/' },
  { id: 'pane-e-snack-salati', name: 'Pane e snack salati', url: '/spesa-online/pane-e-snack-salati/' },
  { id: 'gelati-e-surgelati', name: 'Surgelati e gelati', url: '/spesa-online/gelati-e-surgelati/' },
  { id: 'birra-vino-e-liquori', name: 'Birra, vino e liquori', url: '/spesa-online/birra-vino-e-liquori/' },
  { id: 'stili-alimentari', name: 'Stili alimentari', url: '/spesa-online/stili-alimentari/' },
];

/**
 * Carrefour Italy scraper configuration
 */
export const carrefourItConfig: Partial<ScraperConfig> = {
  name: 'Carrefour Italy',
  baseUrl: 'https://www.carrefour.it',
  categories: carrefourItCategories,
  selectors: {
    productCard: '',
    productName: '',
    productPrice: '',
  },
  waitTimes: {
    pageLoad: 0,
    dynamicContent: 0,
    betweenRequests: 1500,
    betweenPages: 500,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/**
 * API-based scraper for Carrefour Italy (carrefour.it)
 * Uses the Demandware Search-ShowAjax JSON API, called from inside a browser
 * page — see httpGet() for why.
 */
export class CarrefourItScraper extends BaseScraper {
  private readonly PAGE_SIZE = 25;
  private readonly MAX_PAGES_PER_CATEGORY = 200; // Safety limit

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Launch a browser and open the storefront, so that the API requests can be
   * issued as same-origin fetches from a page Cloudflare has let through.
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Carrefour Italy scraper (browser context)...');
    this.startTime = Date.now();

    await this.launchBrowser();
    this.page = await this.createPage();

    const outcome = await this.retryOnFailure(
      () => openPastCloudflare(this.page!, STOREFRONT_URL, envConfig.scraper.timeout),
      'Open storefront',
      isRetryableOpenError
    );
    this.logger.info(`Carrefour Italy scraper initialized (storefront open, ${outcome})`);
  }

  /**
   * GET a carrefour.it URL and return the raw HTTP response.
   *
   * The request is issued from inside the browser page (page.evaluate + fetch)
   * rather than from Node. Between the Daily Scrapes of 2026-11-16 and
   * 2026-11-19 carrefour.it started answering node https (the previous
   * transport) and curl with Cloudflare's "Sorry, you have been blocked" page
   * (HTTP 403) on every Search-ShowAjax call, while the same URL fetched from a
   * headed Chromium page on the same IP returns JSON. Same precedent as
   * AuchanUaGraphQLScraper.
   *
   * Overridden in tests to replace the network hop.
   */
  protected async httpGet(url: string, accept: string): Promise<HttpResponse> {
    if (!this.page) {
      throw new Error('Page not initialized: call initialize() before scraping');
    }

    return this.page.evaluate(
      async ({ url, accept, timeoutMs }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            credentials: 'include',
            headers: { Accept: accept, 'X-Requested-With': 'XMLHttpRequest' },
            signal: controller.signal,
          });
          return {
            status: res.status,
            contentType: res.headers.get('content-type'),
            body: await res.text(),
          };
        } catch (e) {
          throw new Error(controller.signal.aborted ? `Request timeout after ${timeoutMs}ms` : String(e));
        } finally {
          clearTimeout(timer);
        }
      },
      { url, accept, timeoutMs: REQUEST_TIMEOUT_MS }
    );
  }

  /**
   * Scrape a single category using the Demandware API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const allProducts: ProductData[] = [];

    try {
      // Fetch first page to get total count
      const firstPage = await this.fetchPage(category.id, 0, this.PAGE_SIZE);

      const totalProducts = firstPage.countResult;
      const totalPages = Math.min(
        Math.ceil(totalProducts / this.PAGE_SIZE),
        this.MAX_PAGES_PER_CATEGORY
      );

      this.logger.info(
        `Category ${category.name}: ${totalProducts} products, ${totalPages} pages to fetch`
      );

      // Fetch image URLs from the HTML page (JSON API returns images:[])
      const firstPageImages = await this.fetchPageImages(category.url, 0, this.PAGE_SIZE);

      // Process first page
      const firstPageProducts = firstPage.productIds
        .map((item) => this.transformProduct(item, firstPageImages))
        .filter((p): p is ProductData => p !== null);

      if (this.onPageScraped && firstPageProducts.length > 0) {
        const savedCount = await this.onPageScraped(firstPageProducts, {
          categoryId: category.id,
          categoryName: category.name,
          pageNumber: 1,
          totalProductsOnPage: firstPageProducts.length,
        });
        this.logger.info(
          `${category.name} page 1/${totalPages}: Saved ${savedCount}/${firstPageProducts.length} products`
        );
      }

      allProducts.push(...firstPageProducts);
      this.productsScraped += firstPageProducts.length;

      // Fetch remaining pages sequentially
      for (let page = 1; page < totalPages; page++) {
        const start = page * this.PAGE_SIZE;

        try {
          const pageData = await this.fetchPage(category.id, start, this.PAGE_SIZE);

          const pageImages = await this.fetchPageImages(category.url, start, this.PAGE_SIZE);

          const products = pageData.productIds
            .map((item) => this.transformProduct(item, pageImages))
            .filter((p): p is ProductData => p !== null);

          if (products.length > 0) {
            if (this.onPageScraped) {
              const savedCount = await this.onPageScraped(products, {
                categoryId: category.id,
                categoryName: category.name,
                pageNumber: page + 1,
                totalProductsOnPage: products.length,
              });
              this.logger.info(
                `${category.name} page ${page + 1}/${totalPages}: Saved ${savedCount}/${products.length} products`
              );
            }

            allProducts.push(...products);
            this.productsScraped += products.length;
          }

          // Wait between pages
          await sleep(this.config.waitTimes.betweenPages || 500);
        } catch (error) {
          const url = error instanceof RequestFailure ? error.url : undefined;
          const detail = error instanceof Error ? error.message : String(error);
          this.logError(`Failed to fetch page ${page + 1} of ${category.name}: ${detail}`, url, error as Error);
        }
      }

      this.logger.info(
        `Category ${category.name}: scraped ${allProducts.length} total products from ${totalPages} pages`
      );
    } catch (error) {
      this.failCategory(category, error);
    }

    return allProducts;
  }

  /**
   * Fetch a single page from the Demandware Search-ShowAjax API
   */
  private async fetchPage(
    cgid: string,
    start: number,
    sz: number
  ): Promise<DemandwareSearchResponse> {
    const url = `${ORIGIN}/on/demandware.store/Sites-carrefour-IT-Site/it_IT/Search-ShowAjax?cgid=${encodeURIComponent(cgid)}&${pageQuery(start, sz)}`;
    return retry(
      async () => interpretSearchResponse(await this.httpGet(url, 'application/json')),
      {
        maxRetries: this.config.maxRetries,
        initialDelay: 1000,
        onRetry: (attempt, error) => {
          this.logger.warn(
            `API request retry ${attempt} for category ${cgid}, start=${start}:`,
            error.message
          );
        },
      }
    ).catch(error => {
      throw new RequestFailure(url, error instanceof Error ? error.message : String(error));
    });
  }

  /**
   * Fetch product image URLs from the HTML category page.
   * The JSON API returns images:[], but the rendered HTML tiles contain image URLs.
   */
  private async fetchPageImages(
    categoryUrl: string,
    start: number,
    sz: number
  ): Promise<Map<string, string>> {
    const imageMap = new Map<string, string>();

    try {
      const res = await this.httpGet(`${ORIGIN}${categoryUrl}?${pageQuery(start, sz)}`, 'text/html');
      const html = res.status >= 200 && res.status < 300 ? res.body : '';

      for (const [pid, url] of parseTileImages(html)) imageMap.set(pid, url);
    } catch (error) {
      this.logger.debug('Failed to fetch page images:', (error as Error).message);
    }

    return imageMap;
  }

  /**
   * Transform a Demandware product to ProductData
   */
  private transformProduct(item: DemandwareProduct, imageMap?: Map<string, string>): ProductData | null {
    try {
      const price = item.price.sales?.value ?? item.price.list?.value;

      // Skip products with no valid price
      if (!price || price <= 0) {
        return null;
      }

      // Determine if product is on sale
      const discountPct = parseFloat(item.discountPercentage) || 0;
      const isOnSale = discountPct > 0;
      const originalPrice = isOnSale ? item.price.list?.value : undefined;

      // Extract unit and quantity from unitData or fallback to dimension52
      let unit: string | undefined;
      let unitQuantity: number | undefined;

      if (item.unitData?.unit && item.unitData?.value) {
        unit = item.unitData.unit;
        unitQuantity = parseFloat(item.unitData.value) || undefined;
      } else if (item.impression?.dimension52) {
        const quantityInfo = extractQuantity(item.impression.dimension52);
        if (quantityInfo) {
          unit = quantityInfo.unit;
          unitQuantity = quantityInfo.value;
        }
      }

      // Fallback: try extracting from product name
      if (!unit) {
        const nameQuantity = extractQuantity(item.productName);
        if (nameQuantity) {
          unit = nameQuantity.unit;
          unitQuantity = nameQuantity.value;
        }
      }

      const productUrl = `https://www.carrefour.it/p/${item.id}.html`;
      const imageUrl = imageMap?.get(item.id);

      return {
        name: item.productName,
        price,
        currency: 'EUR',
        originalPrice,
        isOnSale,
        imageUrl,
        productUrl,
        externalId: item.id,
        brand: item.brand || undefined,
        unit,
        unitQuantity,
        isAvailable: item.available,
      };
    } catch (error) {
      this.logger.debug('Error transforming product:', error);
      return null;
    }
  }

  /**
   * Not needed - all data comes from list API
   */
  async scrapeProductDetails(_url: string): Promise<ProductData> {
    throw new Error(
      'scrapeProductDetails is not needed - all data is fetched via Search-ShowAjax API'
    );
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Carrefour Italy scraper...');
    await this.closeBrowser();
    const stats = this.getStats();
    this.logger.info('Carrefour Italy scraping completed:', stats);
  }
}
