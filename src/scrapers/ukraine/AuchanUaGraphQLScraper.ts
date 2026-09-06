import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { extractQuantity } from '../../utils/normalizer';
import { retry, sleep } from '../../utils/retry';
import { config as envConfig } from '../../config/env';

/**
 * Origin the GraphQL requests must come from. The storefront is opened in a
 * real browser page first, and every query is a same-origin fetch from that
 * page — see postGraphQL() for why.
 */
const STOREFRONT_ORIGIN = 'https://express.auchan.ua';
const GRAPHQL_URL = `${STOREFRONT_ORIGIN}/graphql/`;
const REQUEST_TIMEOUT_MS = 30000;
/** How often to re-read the storefront while a Cloudflare challenge is auto-solving. */
const CHALLENGE_POLL_MS = 500;

/**
 * GraphQL category configuration with API IDs
 */
interface GraphQLCategoryConfig extends CategoryConfig {
  graphqlId: string;
}

/**
 * GraphQL response types
 */
interface GraphQLProductItem {
  id: number;
  sku: string;
  name: string;
  url_key: string;
  stock_status: string;
  thumbnail: { url: string } | null;
  price_range: {
    minimum_price: {
      regular_price: { value: number };
      final_price: { value: number };
      discount?: { amount_off: number; percent_off: number };
    };
  };
}

interface GraphQLPageInfo {
  page_size: number;
  total_pages: number;
}

interface GraphQLSearchResponse {
  data: {
    search: {
      page_info: GraphQLPageInfo;
      items: GraphQLProductItem[];
    };
  };
  errors?: Array<{ message: string }>;
}

/** Raw HTTP response from the GraphQL endpoint, before any interpretation. */
export interface GraphQLHttpResponse {
  status: number;
  contentType: string | null;
  body: string;
}

/**
 * Category ID mapping from URL keys to GraphQL IDs
 * These are top-level food category IDs for express.auchan.ua GraphQL API
 */
const CATEGORY_ID_MAP: Record<string, string> = {
  'frukty-ovochi-solinnja': '23608',
  'mjaso': '23643',
  'ryba': '23673',
  'mjaso-kovbasni-vyroby-ta-syry': '23709',
  'hlib-ta-hlibobulochni-vyroby': '23745',
  'kulinarija': '23780',
  'molochni-produkty-ta-jajcja': '23815',
  'zamorozhena-produkcija': '23850',
  'bakalija': '23880',
  'tovary-svitu': '23928',
  'konservacija': '23964',
  'sousy-ta-prypravy': '23958',
  'solodoschi': '23985',
  'chypsy-sneky': '24025',
  'chaj-kava': '24067',
  'napoi': '24093',
};

/**
 * Auchan Express Ukraine top-level food categories
 * Uses express.auchan.ua API endpoint
 */
export const auchanUaGraphQLCategories: GraphQLCategoryConfig[] = [
  { id: 'frukty-ovochi-solinnja', name: 'Фрукти, овочі, соління', url: '/frukti-ovochi-solinnja1/', graphqlId: '23608' },
  { id: 'mjaso', name: "М'ясо", url: '/m-jaso/', graphqlId: '23643' },
  { id: 'ryba', name: 'Риба', url: '/riba/', graphqlId: '23673' },
  { id: 'mjaso-kovbasni-vyroby-ta-syry', name: "М'ясо-ковбасні вироби та сири", url: '/m-jaso-kovbasni-virobi-ta-siri/', graphqlId: '23709' },
  { id: 'hlib-ta-hlibobulochni-vyroby', name: 'Хліб та хлібобулочні вироби', url: '/hlib-ta-hlibobulochni-virobi/', graphqlId: '23745' },
  { id: 'kulinarija', name: 'Кулінарія', url: '/kulinaria-1/', graphqlId: '23780' },
  { id: 'molochni-produkty-ta-jajcja', name: 'Молочні продукти та яйця', url: '/molochni-produkti-ta-jajcja/', graphqlId: '23815' },
  { id: 'zamorozhena-produkcija', name: 'Заморожена продукція', url: '/zamorozhena-produkcija/', graphqlId: '23850' },
  { id: 'bakalija', name: 'Бакалія', url: '/bakaleya-1/', graphqlId: '23880' },
  { id: 'tovary-svitu', name: 'Товари світу', url: '/tovary-svity-1/', graphqlId: '23928' },
  { id: 'konservacija', name: 'Консервація', url: '/konservasia-1/', graphqlId: '23964' },
  { id: 'sousy-ta-prypravy', name: 'Соуси та приправи', url: '/konservi-sousi-pripravi/', graphqlId: '23958' },
  { id: 'solodoschi', name: 'Солодощі', url: '/solodohy-1/', graphqlId: '23985' },
  { id: 'chypsy-sneky', name: 'Чипси, снеки', url: '/chipsy-sneki/', graphqlId: '24025' },
  { id: 'chaj-kava', name: 'Чай, кава', url: '/chaj-kava/', graphqlId: '24067' },
  { id: 'napoi', name: 'Напої', url: '/napoi/', graphqlId: '24093' },
];

/**
 * Auchan Express Ukraine GraphQL scraper configuration
 */
export const auchanUaGraphQLConfig: Partial<ScraperConfig> = {
  name: 'Auchan Express Ukraine (GraphQL)',
  baseUrl: 'https://express.auchan.ua',
  categories: auchanUaGraphQLCategories,
  selectors: {
    productCard: '',
    productName: '',
    productPrice: '',
  },
  waitTimes: {
    pageLoad: 0,
    dynamicContent: 0,
    betweenRequests: 100, // Small delay between API calls
    betweenPages: 50,
  },
  maxRetries: 3,
  concurrentPages: 5, // Can handle more concurrent requests with API
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/**
 * GraphQL query for fetching products
 */
const PRODUCTS_QUERY = `
query getCategoryProducts($filter: ProductAttributeFilterInput, $pageSize: Int, $currentPage: Int, $sort: ProductAttributeSortInput) {
  search: productsV2(
    filter: $filter
    pageSize: $pageSize
    currentPage: $currentPage
    sort: $sort
  ) {
    page_info {
      page_size
      total_pages
    }
    items {
      id
      sku
      name
      url_key
      stock_status
      thumbnail {
        url
      }
      price_range {
        minimum_price {
          regular_price {
            value
          }
          final_price {
            value
          }
          discount {
            amount_off
            percent_off
          }
        }
      }
    }
  }
}`;

const RESPONSE_SNIPPET_CHARS = 200;

function snippet(body: string): string {
  return body.replace(/\s+/g, ' ').trim().substring(0, RESPONSE_SNIPPET_CHARS);
}

/**
 * Recognise Cloudflare's own HTML (served instead of the origin's JSON) and
 * say which kind it is. Returns null for anything that is not a Cloudflare page.
 *
 * Two distinct things can come back:
 *  - the 1020 "Sorry, you have been blocked" page — a firewall rule matched
 *    (IP, ASN, country, or request signature); no amount of JS solving helps.
 *  - the "Just a moment..." interstitial — a managed challenge that a real
 *    browser can pass.
 * Telling them apart in the log is what stops the next person from reading
 * "<!DOCTYPE html>" as a parse error again (Daily Scrape 2026-09-04).
 */
export type CloudflarePageKind = 'block' | 'challenge' | 'error';

export interface CloudflarePage {
  kind: CloudflarePageKind;
  description: string;
}

export function classifyCloudflarePage(body: string): CloudflarePage | null {
  const head = body.substring(0, 20000);
  const rayId =
    head.match(/Cloudflare Ray ID:\s*<strong[^>]*>([0-9a-f]+)/i)?.[1] ??
    head.match(/[?&]ray=([0-9a-f]+)/i)?.[1];
  const ray = rayId ? ` (Ray ID ${rayId})` : '';

  if (/data-translate="block_headline"|Sorry, you have been blocked/i.test(head)) {
    return {
      kind: 'block',
      description: `Cloudflare block page "Sorry, you have been blocked" (error 1020)${ray}`,
    };
  }
  if (/cdn-cgi\/challenge-platform|Just a moment|cf-chl|challenge-running/i.test(head)) {
    return { kind: 'challenge', description: `Cloudflare challenge page "Just a moment..."${ray}` };
  }
  if (/Attention Required! \| Cloudflare|cf-error-details|id="cf-wrapper"/i.test(head)) {
    return { kind: 'error', description: `Cloudflare error page${ray}` };
  }
  return null;
}

export function describeCloudflarePage(body: string): string | null {
  return classifyCloudflarePage(body)?.description ?? null;
}

/**
 * Turn the raw HTTP response into a GraphQL payload, or throw an error that
 * says what actually came back: a Cloudflare page, a non-2xx status, a
 * non-JSON body, or GraphQL-level errors.
 */
export function interpretGraphQLResponse(res: GraphQLHttpResponse): GraphQLSearchResponse {
  const cloudflare = describeCloudflarePage(res.body);
  if (cloudflare) {
    throw new Error(`Blocked by Cloudflare: HTTP ${res.status}, ${cloudflare}`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status} from express.auchan.ua/graphql/: ${snippet(res.body)}`);
  }

  let data: GraphQLSearchResponse;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error(
      `Non-JSON response from express.auchan.ua/graphql/ (HTTP ${res.status}, ` +
        `content-type ${res.contentType ?? 'unknown'}): ${snippet(res.body)}`
    );
  }
  if (data.errors && data.errors.length > 0) {
    throw new Error(`GraphQL error: ${data.errors[0].message}`);
  }
  // Well-formed JSON that is not a search result (data: null, a different
  // query's shape, an error envelope without `errors`) must not pass as an
  // empty category.
  const search = data?.data?.search;
  const totalPages = search?.page_info?.total_pages;
  if (
    !search ||
    !Array.isArray(search.items) ||
    !Number.isInteger(totalPages) ||
    totalPages < 0
  ) {
    throw new Error(
      `Unexpected GraphQL payload from express.auchan.ua/graphql/ (HTTP ${res.status}): ${snippet(res.body)}`
    );
  }
  return data;
}

/**
 * High-performance GraphQL-based scraper for Auchan Ukraine.
 * Uses the site's GraphQL API instead of DOM scraping; the requests themselves
 * are issued from a real browser page to get past Cloudflare (see postGraphQL).
 */
export class AuchanUaGraphQLScraper extends BaseScraper {
  private readonly PAGE_SIZE = 100; // Max products per request
  private readonly MAX_CONCURRENT_PAGES = 5; // Parallel page requests
  private readonly MAX_PAGES_PER_CATEGORY = 100; // Safety limit

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Launch a browser and open the storefront, so that the GraphQL queries can
   * be issued as same-origin fetches from a page Cloudflare has let through.
   * The navigation is retried like every GraphQL page is: a transient blip on
   * the one request that gates the whole run must not end the run.
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing Auchan Ukraine GraphQL scraper (browser context)...`);
    this.startTime = Date.now();

    await this.launchBrowser();
    this.page = await this.createPage();

    const outcome = await this.retryOnFailure(() => this.openStorefront(), 'Open storefront');

    this.logger.info(`Auchan Ukraine GraphQL scraper initialized (storefront open, ${outcome})`);
  }

  /**
   * Navigate to the storefront and make sure what loaded is the storefront.
   *
   * The body is inspected regardless of status: Cloudflare normally serves
   * its pages with 403/503, but the markup is the reliable signal, and goto()
   * can return no response object at all. A managed challenge ("Just a
   * moment...") is something a real browser solves on its own a few seconds
   * after domcontentloaded, so that one is given time to clear; a 1020 block
   * never clears and fails at once.
   */
  private async openStorefront(): Promise<string> {
    const page = this.page!;
    const response = await page.goto(`${STOREFRONT_ORIGIN}/`, {
      waitUntil: 'domcontentloaded',
      timeout: envConfig.scraper.timeout,
    });
    const status = response?.status() ?? 0;

    const settleDeadline = Date.now() + envConfig.scraper.timeout;
    let cloudflare = classifyCloudflarePage(await page.content());
    const sawChallenge = cloudflare?.kind === 'challenge';
    while (cloudflare?.kind === 'challenge' && Date.now() < settleDeadline) {
      await sleep(CHALLENGE_POLL_MS);
      try {
        cloudflare = classifyCloudflarePage(await page.content());
      } catch {
        // The auto-solve navigates away mid-read; the next poll sees the new page.
      }
    }

    if (cloudflare) {
      throw new Error(
        `Blocked by Cloudflare when opening ${STOREFRONT_ORIGIN}: HTTP ${status}, ${cloudflare.description}`
      );
    }
    if (sawChallenge) {
      // The status belongs to the interstitial (usually 403/503), not to the
      // storefront the browser navigated to after solving it.
      return `challenge cleared, first load was HTTP ${status}`;
    }
    if (status >= 400) {
      throw new Error(`HTTP ${status} when opening ${STOREFRONT_ORIGIN}`);
    }
    return `HTTP ${status}`;
  }

  /**
   * Scrape a single category using GraphQL API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const graphqlCategory = category as GraphQLCategoryConfig;

    // Get the GraphQL category ID
    const categoryId = graphqlCategory.graphqlId || this.getCategoryIdFromUrl(category.url);

    if (!categoryId) {
      this.logger.warn(`No GraphQL ID found for category: ${category.id}`);
      return [];
    }

    return this.scrapeCategoryViaGraphQL(categoryId, category.id, category.name);
  }

  /**
   * Extract category ID from URL using the mapping
   */
  private getCategoryIdFromUrl(url: string): string | null {
    // Extract the URL key from the path (e.g., /ua/krupy/ -> krupy)
    const match = url.match(/\/ua\/([^/]+)\/?$/);
    if (match) {
      return CATEGORY_ID_MAP[match[1]] || null;
    }
    return null;
  }

  /**
   * Scrape all products from a category using GraphQL
   */
  private async scrapeCategoryViaGraphQL(
    categoryId: string,
    categorySlug: string,
    categoryName: string
  ): Promise<ProductData[]> {
    const allProducts: ProductData[] = [];

    // No try/catch here on purpose: a category that cannot even load its first
    // page (Cloudflare block, origin 5xx, schema change) must reject so that
    // BaseScraper counts it as a failed category. Swallowing the error and
    // returning [] made the 16/16 block on 2026-09-04 look like a clean run
    // with zero products. Individual later pages are still tolerated below.
    {
      // First, get the first page to determine total pages
      const firstPage = await this.fetchProductsPage(categoryId, 1);

      const totalPages = Math.min(
        firstPage.data.search.page_info.total_pages,
        this.MAX_PAGES_PER_CATEGORY
      );

      this.logger.info(
        `Category ${categoryName}: ${totalPages} pages to fetch (${this.PAGE_SIZE} products/page)`
      );

      // Process first page
      const firstPageProducts = this.transformProducts(firstPage.data.search.items);

      if (this.onPageScraped && firstPageProducts.length > 0) {
        const savedCount = await this.onPageScraped(firstPageProducts, {
          categoryId: categorySlug,
          categoryName,
          pageNumber: 1,
          totalProductsOnPage: firstPageProducts.length,
        });
        this.logger.info(
          `${categoryName} page 1/${totalPages}: Saved ${savedCount}/${firstPageProducts.length} products`
        );
      }

      allProducts.push(...firstPageProducts);
      this.productsScraped += firstPageProducts.length;

      // Fetch remaining pages in parallel batches
      if (totalPages > 1) {
        const remainingPages = Array.from(
          { length: totalPages - 1 },
          (_, i) => i + 2
        );

        // Process in batches to avoid overwhelming the server
        for (let i = 0; i < remainingPages.length; i += this.MAX_CONCURRENT_PAGES) {
          const batch = remainingPages.slice(i, i + this.MAX_CONCURRENT_PAGES);

          const batchResults = await Promise.all(
            batch.map(async (pageNum) => {
              try {
                const pageData = await this.fetchProductsPage(categoryId, pageNum);
                const products = this.transformProducts(pageData.data.search.items);
                return { pageNum, products };
              } catch (error) {
                this.logger.warn(
                  `Failed to fetch page ${pageNum} of ${categoryName}:`,
                  (error as Error).message
                );
                this.productsFailed++;
                return { pageNum, products: [] };
              }
            })
          );

          // Process batch results
          for (const { pageNum, products } of batchResults) {
            if (products.length > 0) {
              if (this.onPageScraped) {
                const savedCount = await this.onPageScraped(products, {
                  categoryId: categorySlug,
                  categoryName,
                  pageNumber: pageNum,
                  totalProductsOnPage: products.length,
                });
                this.logger.info(
                  `${categoryName} page ${pageNum}/${totalPages}: Saved ${savedCount}/${products.length} products`
                );
              }

              allProducts.push(...products);
              this.productsScraped += products.length;
            }
          }

          // Small delay between batches
          if (i + this.MAX_CONCURRENT_PAGES < remainingPages.length) {
            await sleep(this.config.waitTimes.betweenRequests);
          }
        }
      }

      this.logger.info(
        `Category ${categoryName}: scraped ${allProducts.length} total products from ${totalPages} pages`
      );
    }

    return allProducts;
  }

  /**
   * Fetch a single page of products from the GraphQL API
   */
  private async fetchProductsPage(
    categoryId: string,
    pageNum: number
  ): Promise<GraphQLSearchResponse> {
    return retry(
      async () => {
        const variables = {
          currentPage: pageNum,
          filter: { category_id: { eq: categoryId } },
          pageSize: this.PAGE_SIZE,
          sort: { position: 'ASC' },
        };

        const requestBody = JSON.stringify({
          query: PRODUCTS_QUERY,
          operationName: 'getCategoryProducts',
          variables,
        });

        const res = await this.postGraphQL(requestBody);
        return interpretGraphQLResponse(res);
      },
      {
        maxRetries: this.config.maxRetries,
        initialDelay: 1000,
        onRetry: (attempt, error) => {
          this.logger.warn(
            `GraphQL request retry ${attempt} for category ${categoryId}, page ${pageNum}:`,
            error.message
          );
        },
      }
    );
  }

  /**
   * POST a GraphQL request body and return the raw HTTP response.
   *
   * The request is issued from inside the browser page (page.evaluate + fetch)
   * rather than from Node. express.auchan.ua is behind a Cloudflare rule that
   * 403s non-browser TLS/HTTP signatures: node https (the previous transport),
   * curl with browser headers, and Playwright's APIRequestContext — with or
   * without the page's cookies — all received the 1020 block page on
   * 2026-09-06, while a fetch from a Chromium page on the same IP got JSON.
   * Same precedent as WoolworthsScraper vs Akamai.
   *
   * Overridden in tests to replace the network hop.
   */
  protected async postGraphQL(requestBody: string): Promise<GraphQLHttpResponse> {
    if (!this.page) {
      throw new Error('Page not initialized: call initialize() before scraping');
    }

    return this.page.evaluate(
      async ({ url, body, timeoutMs }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              store: 'ua',
            },
            body,
            signal: controller.signal,
          });
          return {
            status: res.status,
            contentType: res.headers.get('content-type'),
            body: await res.text(),
          };
        } finally {
          clearTimeout(timer);
        }
      },
      { url: GRAPHQL_URL, body: requestBody, timeoutMs: REQUEST_TIMEOUT_MS }
    );
  }

  /**
   * Transform GraphQL response items to ProductData
   */
  private transformProducts(items: GraphQLProductItem[]): ProductData[] {
    return items
      .map((item) => this.transformProduct(item))
      .filter((p): p is ProductData => p !== null);
  }

  /**
   * Transform a single GraphQL product item to ProductData
   */
  private transformProduct(item: GraphQLProductItem): ProductData | null {
    try {
      const { minimum_price } = item.price_range;
      const regularPrice = minimum_price.regular_price.value;
      const finalPrice = minimum_price.final_price.value;
      const discountPercent = minimum_price.discount?.percent_off ?? 0;
      const isOnSale = discountPercent > 0 || regularPrice > finalPrice;

      // Skip products with invalid prices or placeholder prices (99999 UAH)
      if (!finalPrice || finalPrice <= 0 || finalPrice >= 99999) {
        return null;
      }

      // Extract quantity from product name
      const quantityInfo = extractQuantity(item.name);

      // Build full product URL
      const productUrl = `https://express.auchan.ua/${item.url_key}/`;

      // Extract image URL (handle possible null)
      // Add size modifiers to reduce image size (w_312,h_312)
      const imageUrl = item.thumbnail?.url
        ? this.transformImageUrl(item.thumbnail.url)
        : undefined;

      const productData: ProductData = {
        name: item.name,
        price: finalPrice,
        currency: 'UAH',
        originalPrice: isOnSale ? regularPrice : undefined,
        isOnSale,
        imageUrl,
        productUrl,
        externalId: item.sku,
        brand: undefined, // Brand is not available in the basic query
        unit: quantityInfo?.unit,
        unitQuantity: quantityInfo?.value,
        isAvailable: item.stock_status === 'IN_STOCK',
      };

      return productData;
    } catch (error) {
      this.logger.debug('Error transforming product:', error);
      return null;
    }
  }

  /**
   * Transform Auchan image URL to include size modifiers for smaller images
   * Converts: https://img.auchan.ua/rx/q_90,ofmt_webp/...
   * To: https://img.auchan.ua/rx/q_90,ofmt_webp,w_312,h_312/...
   */
  private transformImageUrl(url: string): string {
    // Match the pattern with image modifiers and add size parameters
    return url.replace(
      /\/rx\/([^/]+)\/auchan\.ua\//,
      '/rx/$1,w_312,h_312/auchan.ua/'
    );
  }

  /**
   * Scrape detailed product information (not needed with GraphQL, but required by interface)
   */
  async scrapeProductDetails(_url: string): Promise<ProductData> {
    // The GraphQL API provides all necessary details in the list query
    // This method is kept for interface compatibility
    throw new Error(
      'scrapeProductDetails is not needed with GraphQL scraper - all data is fetched in list query'
    );
  }

  /**
   * Close the browser and report stats
   */
  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up Auchan Ukraine GraphQL scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    this.logger.info('Auchan Ukraine GraphQL scraping completed:', stats);
  }
}
