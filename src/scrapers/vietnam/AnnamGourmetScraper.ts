import { BaseScraper, RequestFailure } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { extractQuantity } from '../../utils/normalizer';

/**
 * Annam Gourmet subcategories - grocery store in Hanoi (Xuan Dieu location)
 * Uses explicit subcategories because Magento's AJAX endpoint doesn't cascade
 * products from child categories into root category listings.
 */
export const annamGourmetCategories: CategoryConfig[] = [
  // Fresh Food subcategories (root category doesn't cascade via Magento AJAX)
  { id: 'fresh-butter', name: 'Butter', url: 'fresh-food/butter' },
  { id: 'fresh-cheese', name: 'Cheese', url: 'fresh-food/cheese' },
  { id: 'fresh-delicatessen', name: 'Delicatessen', url: 'fresh-food/delicatessen' },
  { id: 'fresh-desserts', name: 'Desserts', url: 'fresh-food/desserts' },
  { id: 'fresh-eggs', name: 'Eggs', url: 'fresh-food/eggs' },
  { id: 'fresh-fish-and-seafood', name: 'Fish & Seafood', url: 'fresh-food/fish-and-seafood' },
  { id: 'fresh-milk', name: 'Fresh Milk', url: 'fresh-food/fresh-milk' },
  { id: 'fresh-fruits', name: 'Fruits', url: 'fresh-food/fruits' },
  { id: 'fresh-meat', name: 'Meat', url: 'fresh-food/meat' },
  { id: 'fresh-processed-meat', name: 'Processed Meat', url: 'fresh-food/processed-meat' },
  { id: 'fresh-vegetables', name: 'Vegetables', url: 'fresh-food/vegetables' },
  { id: 'fresh-yogurt-and-cream', name: 'Yogurt & Cream', url: 'fresh-food/yogurt-and-cream' },
  // Salty Grocery subcategories
  { id: 'salty-baking-essentials', name: 'Baking Essentials', url: 'salty-grocery/baking-essentials' },
  { id: 'salty-canned-food', name: 'Canned Food', url: 'salty-grocery/canned-food' },
  { id: 'salty-dried-beans', name: 'Dried Beans', url: 'salty-grocery/dried-beans' },
  { id: 'salty-dried-vegetables', name: 'Dried Vegetables', url: 'salty-grocery/dried-vegetables' },
  { id: 'salty-flavors-of-the-world', name: 'Flavors of the World', url: 'salty-grocery/flavors-of-the-world' },
  { id: 'salty-oil-and-vinegar', name: 'Oil & Vinegar', url: 'salty-grocery/oil-and-vinegar' },
  { id: 'salty-pasta-and-noodles', name: 'Pasta & Noodles', url: 'salty-grocery/pasta-and-noodles' },
  { id: 'salty-ready-to-cook', name: 'Ready to Cook', url: 'salty-grocery/ready-to-cook' },
  { id: 'salty-rice', name: 'Rice', url: 'salty-grocery/rice' },
  { id: 'salty-sauce-and-condiments', name: 'Sauce & Condiments', url: 'salty-grocery/sauce-and-condiments' },
  { id: 'salty-seasoning', name: 'Seasoning', url: 'salty-grocery/seasoning' },
  { id: 'salty-soup-vermicelli', name: 'Soup Vermicelli', url: 'salty-grocery/soup-vermicelli' },
  // Sweet Grocery subcategories
  { id: 'sweet-biscuits-and-cakes', name: 'Biscuits & Cakes', url: 'sweet-grocery/biscuits-and-cakes' },
  { id: 'sweet-breakfast', name: 'Breakfast', url: 'sweet-grocery/breakfast' },
  { id: 'sweet-canned-fruits', name: 'Canned Fruits', url: 'sweet-grocery/canned-fruits' },
  { id: 'sweet-chocolate-and-confectionery', name: 'Chocolate & Confectionery', url: 'sweet-grocery/chocolate-and-confectionery' },
  { id: 'sweet-hot-and-cold-brews', name: 'Hot & Cold Brews', url: 'sweet-grocery/hot-and-cold-brews' },
  { id: 'sweet-processed-dairy', name: 'Processed Dairy Products', url: 'sweet-grocery/processed-dairy-products' },
  { id: 'sweet-snacks-nuts-dried-fruits', name: 'Snacks, Nuts & Dried Fruits', url: 'sweet-grocery/snacks-nuts-and-dried-fruits' },
  // Frozen Food subcategories
  { id: 'frozen-fish-and-seafood', name: 'Frozen Fish & Seafood', url: 'frozen-food/frozen-fish-and-seafood' },
  { id: 'frozen-fruits', name: 'Frozen Fruits', url: 'frozen-food/frozen-fruits' },
  { id: 'frozen-meat', name: 'Frozen Meat', url: 'frozen-food/frozen-meat' },
  { id: 'frozen-pastry-and-bakery', name: 'Frozen Pastry & Bakery', url: 'frozen-food/frozen-pastry-and-bakery' },
  { id: 'frozen-ready-to-cook', name: 'Frozen Ready to Cook', url: 'frozen-food/frozen-ready-to-cook' },
  { id: 'frozen-vegetables', name: 'Frozen Vegetables', url: 'frozen-food/frozen-vegetables' },
  { id: 'frozen-ice-cream', name: 'Ice Cream', url: 'frozen-food/ice-cream' },
  { id: 'frozen-other', name: 'Other Frozen Goods', url: 'frozen-food/other-frozen-goods' },
  // Pastry & Bakery subcategories
  { id: 'pastry-bakery', name: 'Bakery', url: 'pastry-and-bakery/bakery' },
  { id: 'pastry-salted', name: 'Salted Pastry', url: 'pastry-and-bakery/salted-pastry' },
  { id: 'pastry-sweet', name: 'Sweet Pastry', url: 'pastry-and-bakery/sweet-pastry' },
  { id: 'pastry-viennoiserie', name: 'Viennoiserie', url: 'pastry-and-bakery/viennoiserie' },
  // Beverages subcategories
  { id: 'bev-beer', name: 'Beer', url: 'beverages/beer' },
  { id: 'bev-champagne', name: 'Champagne', url: 'beverages/champagne' },
  { id: 'bev-cider', name: 'Cider', url: 'beverages/cider' },
  { id: 'bev-juices', name: 'Juices', url: 'beverages/juices' },
  { id: 'bev-orange-wine', name: 'Orange Wine', url: 'beverages/orange-wine' },
  { id: 'bev-red-wine', name: 'Red Wine', url: 'beverages/red-wine' },
  { id: 'bev-rose-wine', name: 'Rosé Wine', url: 'beverages/rose-wine' },
  { id: 'bev-soft-drinks', name: 'Soft Drinks', url: 'beverages/soft-drinks' },
  { id: 'bev-sparkling-wine', name: 'Sparkling Wine', url: 'beverages/sparkling-wine' },
  { id: 'bev-spirits', name: 'Spirits', url: 'beverages/spirits' },
  { id: 'bev-syrup', name: 'Syrup', url: 'beverages/syrup' },
  { id: 'bev-water', name: 'Water', url: 'beverages/water' },
  { id: 'bev-white-wine', name: 'White Wine', url: 'beverages/white-wine' },
];

/**
 * Annam Gourmet scraper configuration
 */
export const annamGourmetConfig: Partial<ScraperConfig> = {
  name: 'Annam Gourmet',
  baseUrl: 'https://shop.annam-gourmet.com/hn-xd',
  categories: annamGourmetCategories,
  selectors: {
    productCard: '.product-item',
    productName: '.product-item-link',
    productPrice: '.price-box .price',
    productImage: '.product-image-photo',
    productUrl: '.product-item-link',
    productOriginalPrice: '.old-price .price',
  },
  waitTimes: {
    pageLoad: 2000,
    dynamicContent: 1000,
    betweenRequests: 500,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/** Raw product data extracted from HTML */
interface RawProduct {
  name: string;
  productUrl: string;
  imageUrl: string;
  subcategory: string;
  normalPrice: string;
  specialPrice: string;
  oldPrice: string;
  externalId: string;
}

const NO_PRODUCTS_MARKER = "can't find products matching";
/** Minimum HTML length that could contain a product — anything shorter is empty */
const MIN_HTML_LENGTH = 200;

/**
 * Scraper for Annam Gourmet Vietnam (shop.annam-gourmet.com)
 * Hanoi location (hn-xd = Ha Noi - Xuan Dieu store)
 *
 * Uses Magento's ajax=1 endpoint to fetch product listing HTML via fetch()
 * (much faster than full page loads). Browser session is only needed to
 * establish cookies — all category pages are fetched via the API.
 *
 * Pagination: increments ?p=N until the response contains
 * "We can't find products matching the selection".
 */
export class AnnamGourmetScraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize — launch browser and visit homepage to get session cookies.
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Annam Gourmet scraper...');
    this.startTime = Date.now();

    await this.launchBrowser();
    this.page = await this.createPage();

    this.logger.info('Navigating to Annam Gourmet homepage to establish session...');
    await this.page.goto(this.config.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await this.waitForDynamicContent();

    // Dismiss cookie consent if present
    try {
      const btn = await this.page.$('button:has-text("Allow Cookies")');
      if (btn) {
        await btn.click();
        this.logger.info('Cookie consent accepted');
      }
    } catch {
      // not present
    }

    this.logger.info('Annam Gourmet scraper initialized');
  }

  /**
   * Scrape a single root category using ajax=1 with pagination.
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    if (!this.page) throw new Error('Page not initialized');

    const allProducts: ProductData[] = [];
    const baseUrl = `${this.config.baseUrl}/${category.url}.html`;
    let page = 1;
    let consecutiveEmpty = 0;
    let categoryFailure: { error: Error; url: string } | undefined;
    const MAX_CONSECUTIVE_EMPTY = 3;

    this.logger.info(`Scraping category: ${category.name}`);

    while (true) {
      const ajaxUrl = `${baseUrl}?ajax=1&product_list_limit=36&p=${page}`;
      const pageFailure: { error?: RequestFailure } = {};
      const fetchPage = async (): Promise<string | null> => {
        try {
          return await this.fetchAjaxPage(ajaxUrl);
        } catch (error) {
          if (!(error instanceof RequestFailure)) throw error;
          // Keep HTTP failures available if the retry also fails, without
          // reporting a transient failure that the retry recovers from.
          pageFailure.error = error;
          return null;
        }
      };

      try {
        const html = await fetchPage();

        // Definitive end: the server explicitly says no products
        if (html && html.includes(NO_PRODUCTS_MARKER)) {
          this.logger.info(`${category.name}: no more products at page ${page}`);
          break;
        }

        // Empty response — the server occasionally returns blank pages
        // (caching quirk). Retry once, then skip and keep trying.
        if (!html || html.length < MIN_HTML_LENGTH) {
          // Retry the same page once before giving up on it
          await this.waitBetweenRequests();
          const retryHtml = await fetchPage();
          if (retryHtml && retryHtml.includes(NO_PRODUCTS_MARKER)) {
            this.logger.info(`${category.name}: no more products at page ${page} (retry)`);
            break;
          }
          if (retryHtml && retryHtml.length >= MIN_HTML_LENGTH) {
            // Retry succeeded — same handling as the main path below.
            const retryProducts = this.parseProductsFromHtml(retryHtml, category.name);
            if (retryProducts.length === 0) {
              this.logger.info(`${category.name}: 0 products parsed at page ${page} (retry), stopping`);
              break;
            }
            consecutiveEmpty = 0;
            if (this.onPageScraped) {
              const saved = await this.onPageScraped(retryProducts, {
                categoryId: category.id,
                categoryName: category.name,
                pageNumber: page,
                totalProductsOnPage: retryProducts.length,
              });
              this.logger.info(
                `${category.name} page ${page} (retry): Saved ${saved}/${retryProducts.length} products`
              );
            }
            allProducts.push(...retryProducts);
            page++;
            await this.waitBetweenRequests();
            continue;
          }

          consecutiveEmpty++;
          // The page is given up here. A category that ends with no products
          // after this counts as lost; a genuinely empty one is answered with
          // NO_PRODUCTS_MARKER above, not with blank pages.
          if (pageFailure.error) {
            categoryFailure ??= { error: pageFailure.error, url: pageFailure.error.url };
          }
          this.logError(
            `${category.name} page ${page}: empty or failed response after retry (${consecutiveEmpty} consecutive)` +
              (pageFailure.error ? `: ${pageFailure.error.message}` : ''),
            ajaxUrl,
            pageFailure.error,
          );
          if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
            this.logger.info(`${category.name}: ${MAX_CONSECUTIVE_EMPTY} consecutive empty pages, stopping`);
            break;
          }
          page++;
          await this.waitBetweenRequests();
          continue;
        }

        consecutiveEmpty = 0;
        const pageProducts = this.parseProductsFromHtml(html, category.name);

        if (pageProducts.length === 0) {
          this.logger.info(`${category.name}: 0 products parsed at page ${page}, stopping`);
          break;
        }

        // Save incrementally
        if (this.onPageScraped) {
          const saved = await this.onPageScraped(pageProducts, {
            categoryId: category.id,
            categoryName: category.name,
            pageNumber: page,
            totalProductsOnPage: pageProducts.length,
          });
          this.logger.info(
            `${category.name} page ${page}: Saved ${saved}/${pageProducts.length} products`
          );
        }

        allProducts.push(...pageProducts);
        page++;

        await this.waitBetweenRequests();
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        const failedUrl = error instanceof RequestFailure ? error.url : ajaxUrl;
        categoryFailure ??= { error: failure, url: failedUrl };
        this.logError(
          `Failed to scrape ${category.name} page ${page}: ${failure.message}`,
          failedUrl,
          failure,
        );
        break;
      }
    }

    if (allProducts.length === 0 && categoryFailure) {
      this.failCategory(category, categoryFailure.error, categoryFailure.url);
    }
    this.logger.info(`${category.name}: Total ${allProducts.length} products scraped`);
    return allProducts;
  }

  /**
   * Fetch a category page via Magento's ajax=1 endpoint.
   * Uses page.evaluate(fetch) to run inside the browser context so that
   * session cookies are included automatically (page.request doesn't carry them).
   * Returns the products_list HTML string, or null for an empty response.
   * HTTP failures retain their URL and status for the caller's retry/reporting.
   */
  private async fetchAjaxPage(url: string): Promise<string | null> {
    if (!this.page) return null;

    const result = await this.page.evaluate(async (fetchUrl: string) => {
      const resp = await fetch(fetchUrl, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!resp.ok) return { error: resp.status };
      const json = await resp.json();
      return { html: json.html?.products_list || null };
    }, url);

    if ('error' in result) {
      // Plain logger: the caller retries the page once and records it only
      // if the retry fails too.
      this.logger.warn(`Ajax request failed: HTTP ${result.error} for ${url}`);
      throw new RequestFailure(url, `HTTP ${result.error}`);
    }

    return result.html;
  }

  /**
   * Parse product data from the Magento product-list HTML fragment.
   * Uses regex extraction — no DOM/browser needed.
   */
  private parseProductsFromHtml(html: string, categoryName: string): ProductData[] {
    const rawProducts = this.extractRawProducts(html);
    const products: ProductData[] = [];

    for (const raw of rawProducts) {
      try {
        if (!raw.name || !raw.productUrl) continue;

        const currentPriceStr = raw.specialPrice || raw.normalPrice;
        const price = this.parseVndPrice(currentPriceStr);
        if (!price || price <= 0) continue;

        const originalPrice = raw.oldPrice ? this.parseVndPrice(raw.oldPrice) : undefined;
        const isOnSale = !!originalPrice && originalPrice > price;

        const quantityInfo = extractQuantity(raw.name);

        products.push({
          name: raw.name,
          price,
          currency: 'VND',
          originalPrice: isOnSale ? originalPrice : undefined,
          isOnSale,
          imageUrl: raw.imageUrl || undefined,
          productUrl: raw.productUrl,
          externalId: raw.externalId || undefined,
          unit: quantityInfo?.unit,
          unitQuantity: quantityInfo?.value,
          categoryName: raw.subcategory || categoryName,
          isAvailable: true,
        });

        this.productsScraped++;
      } catch (error) {
        this.productsFailed++;
        this.logger.debug(`Failed to parse product: ${raw.name}`, error);
      }
    }

    return products;
  }

  /**
   * Extract raw product data from Magento HTML using regex.
   *
   * Each product follows this Magento structure:
   *   <li class="item product product-item">
   *     <a class="product photo product-item-photo" href="URL">
   *       <img class="product-image-photo" src="IMG" alt="NAME">
   *     </a>
   *     <div class="categories">SUBCATEGORY</div>
   *     <a class="product-item-link" href="URL">NAME</a>
   *     <span class="price">PRICE₫</span>
   *   </li>
   */
  private extractRawProducts(html: string): RawProduct[] {
    const products: RawProduct[] = [];

    // Split by product-item boundaries
    const chunks = html.split(/class="item product product-item"/);
    // First chunk is before the first product — skip it
    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Product URL & name from product-item-link
      const linkMatch = chunk.match(
        /class="product-item-link"\s+href="([^"]+)"[^>]*>\s*([^<]+)/
      );
      if (!linkMatch) continue;

      const productUrl = linkMatch[1].trim();
      const name = this.decodeHtmlEntities(linkMatch[2].trim());

      // Image — prefer data-src (lazy-loaded real URL) over src (may be blank placeholder)
      const dataSrcMatch = chunk.match(/class="product-image-photo[^"]*"[^>]*data-src="([^"]+)"/);
      const srcMatch = chunk.match(/class="product-image-photo[^"]*"[^>]*src="([^"]+)"/);
      const rawImageUrl = dataSrcMatch ? dataSrcMatch[1] : (srcMatch ? srcMatch[1] : '');
      const imageUrl = rawImageUrl.includes('lazyloading') ? '' : rawImageUrl;

      // Subcategory
      const catMatch = chunk.match(
        /class="categories">([^<]+)</
      );
      const subcategory = catMatch ? catMatch[1].trim() : '';

      // Prices — find all class="price">VALUE occurrences in this chunk.
      // Magento wraps prices in: normal-price > price-container > price-wrapper > price
      // For sale items: old-price and special-price wrappers.
      // Simple approach: just grab the first class="price"> match as the current price.
      const allPrices = [...chunk.matchAll(/class="price">([^<]+)/g)].map(m => m[1].trim());

      // For sale items, old-price appears before special-price in the DOM
      const hasOldPrice = chunk.includes('old-price');
      let normalPrice = '';
      let specialPrice = '';
      let oldPrice = '';

      if (hasOldPrice && allPrices.length >= 2) {
        oldPrice = allPrices[0];
        specialPrice = allPrices[1];
      } else if (allPrices.length > 0) {
        normalPrice = allPrices[0];
      }

      // External ID from URL slug
      const idMatch = productUrl.match(/\/id\/(\d+)\//);
      const slugMatch = productUrl.match(/\/([^/]+)\.html$/);

      products.push({
        name,
        productUrl,
        imageUrl,
        subcategory,
        normalPrice,
        specialPrice,
        oldPrice,
        externalId: idMatch ? idMatch[1] : (slugMatch ? slugMatch[1] : ''),
      });
    }

    return products;
  }

  /**
   * Decode common HTML entities in product names.
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x20;/g, ' ');
  }

  /**
   * Parse Vietnamese Dong price string to number.
   * "52,000₫" -> 52000, "1,250,000₫" -> 1250000
   */
  private parseVndPrice(priceStr: string): number | null {
    if (!priceStr) return null;
    const cleaned = priceStr.replace(/[₫\s]/g, '').replace(/,/g, '');
    const price = parseInt(cleaned, 10);
    return isNaN(price) ? null : price;
  }

  /**
   * Scrape detailed product information from a product page.
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    if (!this.page) throw new Error('Page not initialized');

    await this.navigateToUrl(url);
    await this.waitForDynamicContent();

    const name = await this.page.$eval(
      '.page-title .base',
      (el) => el.textContent?.trim() || ''
    );
    if (!name) throw new Error(`Could not extract product name from ${url}`);

    const priceStr = await this.page.$eval(
      '.price-box .price',
      (el) => el.textContent?.trim() || ''
    );
    const price = this.parseVndPrice(priceStr);
    if (!price) throw new Error(`Could not extract price from ${url}`);

    const imageUrl = await this.page.$eval(
      '.gallery-placeholder img',
      (el) => el.getAttribute('src') || ''
    ).catch(() => '');

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
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Annam Gourmet scraper...');
    await this.closeBrowser();

    const stats = this.getStats();
    this.logger.info('Annam Gourmet scraping completed:', stats);
  }
}
