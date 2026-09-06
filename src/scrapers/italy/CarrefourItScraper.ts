import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { extractQuantity } from '../../utils/normalizer';
import { retry, sleep } from '../../utils/retry';
import https from 'https';

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
 * Uses Demandware Search-ShowAjax JSON API - no browser needed.
 */
export class CarrefourItScraper extends BaseScraper {
  private readonly PAGE_SIZE = 25;
  private readonly MAX_PAGES_PER_CATEGORY = 200; // Safety limit

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper (no browser needed)
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Carrefour Italy scraper...');
    this.startTime = Date.now();
    this.logger.info('Carrefour Italy scraper initialized (no browser required)');
  }

  /**
   * Scrape a single category using the Demandware API
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const allProducts: ProductData[] = [];

    try {
      // Fetch first page to get total count
      const firstPage = await this.fetchPage(category.id, 0, this.PAGE_SIZE);

      if (!firstPage || !firstPage.productIds) {
        this.logger.warn(`No data returned for category ${category.name}`);
        return [];
      }

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

          if (!pageData?.productIds) {
            continue;
          }

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
          this.logger.warn(
            `Failed to fetch page ${page + 1} of ${category.name}:`,
            (error as Error).message
          );
          this.productsFailed++;
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
    return retry(
      async () => {
        const path = `/on/demandware.store/Sites-carrefour-IT-Site/it_IT/Search-ShowAjax?cgid=${encodeURIComponent(cgid)}&start=${start}&sz=${sz}&pmin=0%2C01`;

        return new Promise<DemandwareSearchResponse>((resolve, reject) => {
          const options = {
            hostname: 'www.carrefour.it',
            port: 443,
            path,
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'User-Agent': this.config.userAgents?.[0] || 'Mozilla/5.0',
              'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
              'Referer': 'https://www.carrefour.it/spesa-online/',
            },
          };

          const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
                return;
              }

              try {
                const data = JSON.parse(body);
                resolve(data);
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
          req.end();
        });
      },
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
    );
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
      const html = await new Promise<string>((resolve, reject) => {
        const path = `${categoryUrl}?start=${start}&sz=${sz}`;
        const options = {
          hostname: 'www.carrefour.it',
          port: 443,
          path,
          method: 'GET',
          headers: {
            'Accept': 'text/html',
            'User-Agent': this.config.userAgents?.[0] || 'Mozilla/5.0',
            'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
            'Referer': 'https://www.carrefour.it/spesa-online/',
          },
        };

        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        req.end();
      });

      // Parse HTML tiles: each product tile has data-pid="xxx" and a master-catalog image
      const tileBlocks = html.split('data-pid="').slice(1);
      for (const block of tileBlocks) {
        const pidMatch = block.match(/^(\d+)"/);
        if (!pidMatch) continue;

        const pid = pidMatch[1];
        // Find the first master-catalog image URL within this tile (before next tile)
        const nextTileIdx = block.indexOf('data-pid="', 100);
        const tileContent = nextTileIdx > 0 ? block.substring(0, nextTileIdx) : block.substring(0, 5000);
        const imgMatch = tileContent.match(
          /(\/on\/demandware\.static\/-\/Sites-carrefour-master-catalog-IT\/[^"]+\.(?:jpg|png|webp))/
        );

        if (imgMatch) {
          imageMap.set(pid, `https://www.carrefour.it${imgMatch[1]}`);
        }
      }
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
   * Cleanup resources (no browser to close)
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Carrefour Italy scraper...');
    const stats = this.getStats();
    this.logger.info('Carrefour Italy scraping completed:', stats);
  }
}
