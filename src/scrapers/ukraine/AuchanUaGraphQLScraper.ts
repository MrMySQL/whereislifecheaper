import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { extractQuantity } from '../../utils/normalizer';
import { retry, sleep } from '../../utils/retry';
import https from 'https';

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

/**
 * High-performance GraphQL-based scraper for Auchan Ukraine
 * Uses direct API calls instead of browser automation for much faster scraping
 */
export class AuchanUaGraphQLScraper extends BaseScraper {
  private readonly PAGE_SIZE = 100; // Max products per request
  private readonly MAX_CONCURRENT_PAGES = 5; // Parallel page requests
  private readonly MAX_PAGES_PER_CATEGORY = 100; // Safety limit

  /**
   * Initialize the scraper (no browser needed)
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Auchan Ukraine GraphQL scraper...`);
    this.startTime = Date.now();
    scraperLogger.info(`Auchan Ukraine GraphQL scraper initialized (no browser required)`);
  }

  /**
   * Scrape a single category using GraphQL API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const graphqlCategory = category as GraphQLCategoryConfig;

    // Get the GraphQL category ID
    const categoryId = graphqlCategory.graphqlId || this.getCategoryIdFromUrl(category.url);

    if (!categoryId) {
      scraperLogger.warn(`No GraphQL ID found for category: ${category.id}`);
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

    try {
      // First, get the first page to determine total pages
      const firstPage = await this.fetchProductsPage(categoryId, 1);

      if (!firstPage?.data?.search) {
        scraperLogger.warn(`No data returned for category ${categoryName}`);
        return [];
      }

      const totalPages = Math.min(
        firstPage.data.search.page_info.total_pages,
        this.MAX_PAGES_PER_CATEGORY
      );

      scraperLogger.info(
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
        scraperLogger.info(
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

                if (!pageData?.data?.search?.items) {
                  return { pageNum, products: [] };
                }

                const products = this.transformProducts(pageData.data.search.items);
                return { pageNum, products };
              } catch (error) {
                scraperLogger.warn(
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
                scraperLogger.info(
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

      scraperLogger.info(
        `Category ${categoryName}: scraped ${allProducts.length} total products from ${totalPages} pages`
      );
    } catch (error) {
      scraperLogger.error(
        `Failed to scrape category ${categoryName}:`,
        (error as Error).message
      );
      this.logError(
        `Failed to scrape category: ${categoryName}`,
        undefined,
        error as Error
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

        return new Promise<GraphQLSearchResponse>((resolve, reject) => {
          const options = {
            hostname: 'express.auchan.ua',
            port: 443,
            path: '/graphql/',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'store': 'ua',
              'User-Agent': this.config.userAgents?.[0] || 'Mozilla/5.0',
              'Content-Length': Buffer.byteLength(requestBody),
            },
          };

          const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                const data = JSON.parse(body);
                if (data.errors && data.errors.length > 0) {
                  reject(new Error(data.errors[0].message));
                } else {
                  resolve(data);
                }
              } catch (e) {
                reject(new Error(`Failed to parse response: ${body.substring(0, 200)}`));
              }
            });
          });

          req.on('error', reject);
          req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
          req.write(requestBody);
          req.end();
        });
      },
      {
        maxRetries: this.config.maxRetries,
        initialDelay: 1000,
        onRetry: (attempt, error) => {
          scraperLogger.warn(
            `GraphQL request retry ${attempt} for category ${categoryId}, page ${pageNum}:`,
            error.message
          );
        },
      }
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
      scraperLogger.debug('Error transforming product:', error);
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
   * Cleanup resources (no browser to close)
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up Auchan Ukraine GraphQL scraper...`);

    const stats = this.getStats();
    scraperLogger.info('Auchan Ukraine GraphQL scraping completed:', stats);
  }
}
