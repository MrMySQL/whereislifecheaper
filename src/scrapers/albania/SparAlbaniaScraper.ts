import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { extractQuantity, parsePrice } from '../../utils/normalizer';

/**
 * SPAR Albania categories configuration
 * Categories are organized by product type with their URL slugs
 */
export const sparAlbaniaCategories: CategoryConfig[] = [
  // Main food categories
  { id: 'ushqimore', name: 'Ushqimore (Food)', url: '/product-category/ushqimore/' },
  { id: 'pije', name: 'Pije (Beverages)', url: '/product-category/pije-2/' },
  { id: 'produkte-te-fresketa', name: 'Produkte të freskëta (Fresh Products)', url: '/product-category/produkte-te-fresketa-2/' },

  // Household and personal care
  { id: 'detergjent-kozmetike', name: 'Detergjente & Kozmetike (Detergents & Cosmetics)', url: '/product-category/detergjent-kozmetike/' },
  { id: 'shtepia', name: 'Shtëpia (Home)', url: '/product-category/shtepia/' },

  // Special categories
  { id: 'produkte-spar', name: 'Produkte Spar (SPAR Products)', url: '/product-category/produkte-spar/' },
  { id: 'produkte-italiane', name: 'Produkte Italiane (Italian Products)', url: '/product-category/produkte-italiane/' },

  // Other
  // { id: 'lodra', name: 'Lodra (Toys)', url: '/product-category/lodra/' },
  // { id: 'artikuj-shkollor', name: 'Artikuj Shkollore (School Supplies)', url: '/product-category/artikuj-shkollor/' },
];

/**
 * SPAR Albania scraper configuration
 */
export const sparAlbaniaConfig: Partial<ScraperConfig> = {
  name: 'SPAR Albania',
  baseUrl: 'https://shop.spar.al',
  categories: sparAlbaniaCategories,
  selectors: {
    productCard: 'article',
    productName: 'h4 a',
    productPrice: '.woocommerce-Price-amount',
    productImage: 'figure img',
    productUrl: 'h4 a',
    pagination: 'ul.page-numbers',
    nextPage: 'a.next',
  },
  waitTimes: {
    pageLoad: 2000,
    dynamicContent: 1500,
    betweenRequests: 1500,
    betweenPages: 1000,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/**
 * Scraper for SPAR Albania (shop.spar.al)
 * Albania's leading international supermarket chain
 *
 * Website uses WooCommerce with standard pagination.
 * Products are displayed 16 per page.
 * Prices are in Albanian Lek (ALL), shown as "LEKE" on the site.
 */
export class SparAlbaniaScraper extends BaseScraper {
  private readonly PRODUCTS_PER_PAGE = 16;

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing SPAR Albania scraper...');
    this.startTime = Date.now();
    await this.launchBrowser();
    this.page = await this.createPage();
    this.logger.info('SPAR Albania scraper initialized');
  }

  /**
   * Scrape a single category with pagination
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];
    let pageNumber = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const pageUrl = pageNumber === 1
        ? `${this.config.baseUrl}${category.url}`
        : `${this.config.baseUrl}${category.url}page/${pageNumber}/`;

      this.logger.info(`Scraping ${category.name} - Page ${pageNumber}: ${pageUrl}`);

      try {
        await this.navigateToUrl(pageUrl);
        await this.waitForDynamicContent();

        // Handle cookie consent on first page
        if (pageNumber === 1) {
          await this.handleCookieConsent();
        }

        // Get total products count from page
        const totalProducts = await this.getTotalProductsCount();
        const totalPages = Math.ceil(totalProducts / this.PRODUCTS_PER_PAGE);

        this.logger.debug(`Category has ${totalProducts} products across ${totalPages} pages`);

        // Extract products from current page
        const pageProducts = await this.extractProductsFromPage();

        this.logger.info(`Found ${pageProducts.length} products on page ${pageNumber}`);

        // Save products via callback
        if (this.onPageScraped && pageProducts.length > 0) {
          const savedCount = await this.onPageScraped(pageProducts, {
            categoryId: category.id,
            categoryName: category.name,
            pageNumber,
            totalProductsOnPage: pageProducts.length,
          });
          this.logger.info(
            `${category.name} page ${pageNumber}: Saved ${savedCount}/${pageProducts.length} products`
          );
        }

        products.push(...pageProducts);

        // Check if there are more pages
        hasMorePages = pageNumber < totalPages && pageProducts.length > 0;
        pageNumber++;

        if (hasMorePages) {
          await this.waitBetweenRequests();
        }
      } catch (error) {
        this.logError(
          `Failed to scrape ${category.name} page ${pageNumber}`,
          pageUrl,
          error as Error
        );
        // Continue to next page on error
        hasMorePages = false;
      }
    }

    return products;
  }

  /**
   * Handle cookie consent popup
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    try {
      // Look for the "PRANO" (Accept) button
      const cookieButton = await this.page.$('button:has-text("PRANO")');
      if (cookieButton) {
        await cookieButton.click();
        this.logger.debug('Accepted cookie consent');
        await this.page.waitForTimeout(500);
      }
    } catch (error) {
      this.logger.debug('No cookie consent found or already accepted');
    }
  }

  /**
   * Get total products count from the results text
   * Format: "Showing 1–16 of 733 results"
   */
  private async getTotalProductsCount(): Promise<number> {
    if (!this.page) return 0;

    try {
      const resultsText = await this.page.textContent('.woocommerce-result-count');
      if (!resultsText) return 0;

      // Match pattern like "Showing 1–16 of 733 results"
      const match = resultsText.match(/of\s+(\d+)\s+results/i);
      if (match) {
        return parseInt(match[1], 10);
      }

      // Try alternate pattern "Showing the single result"
      if (resultsText.includes('single result')) {
        return 1;
      }

      return 0;
    } catch (error) {
      this.logger.debug('Could not get total products count');
      return 0;
    }
  }

  /**
   * Extract products from the current page
   */
  private async extractProductsFromPage(): Promise<ProductData[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const products: ProductData[] = [];

    try {
      // Wait for product articles to load
      await this.page.waitForSelector('article', { timeout: 5000 }).catch(() => {
        this.logger.debug('Product selector wait timed out');
      });

      // Get all product articles
      const productArticles = await this.page.$$('ul.products > li article, .products article');

      this.logger.debug(`Found ${productArticles.length} product articles`);

      for (const article of productArticles) {
        try {
          const product = await this.extractProductData(article);
          if (product) {
            products.push(product);
            this.productsScraped++;
          }
        } catch (error) {
          this.productsFailed++;
          this.logger.debug('Failed to extract product:', error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to extract products from page:', error);
      await this.takeScreenshot('extract-products-error');
      throw error;
    }

    return products;
  }

  /**
   * Extract product data from an article element
   */
  private async extractProductData(article: any): Promise<ProductData | null> {
    try {
      // Extract product URL and name from h4 > a
      const nameLink = await article.$('h4 a');
      if (!nameLink) {
        this.logger.debug('No name link found in article');
        return null;
      }

      const name = await nameLink.textContent();
      const productUrl = await nameLink.getAttribute('href');

      if (!name || !productUrl) {
        this.logger.debug('Missing name or URL');
        return null;
      }

      // Extract price - SPAR uses format "269 LEKE"
      // Price is in nested elements, we need to get all text content
      const priceContainer = await article.$('.price, [class*="price"]');
      let price: number | null = null;
      let originalPrice: number | undefined;

      if (priceContainer) {
        const priceText = await priceContainer.textContent();
        if (priceText) {
          // Parse prices - look for numbers followed by LEKE
          // Format: "269 LEKE" or "299 LEKE 269 LEKE" (for sale items)
          const priceMatches = priceText.match(/(\d+(?:[.,]\d+)?)\s*LEKE/gi);

          if (priceMatches && priceMatches.length > 0) {
            if (priceMatches.length >= 2) {
              // Multiple prices indicate sale - first is original, last is current
              originalPrice = parsePrice(priceMatches[0]) || undefined;
              price = parsePrice(priceMatches[priceMatches.length - 1]);
            } else {
              price = parsePrice(priceMatches[0]);
            }
          }
        }
      }

      // If no price found from price container, try getting from article text
      if (!price) {
        const articleText = await article.textContent();
        const priceMatches = articleText?.match(/(\d+(?:[.,]\d+)?)\s*LEKE/gi);
        if (priceMatches && priceMatches.length > 0) {
          price = parsePrice(priceMatches[priceMatches.length - 1]);
        }
      }

      if (!price) {
        this.logger.debug(`Could not parse price for product: ${name}`);
        return null;
      }

      // Extract image URL
      let imageUrl: string | undefined;
      const imgElement = await article.$('figure img, .attachment-woocommerce_thumbnail');
      if (imgElement) {
        imageUrl = await imgElement.getAttribute('src') ||
                   await imgElement.getAttribute('data-src') ||
                   undefined;
      }

      // Extract unit from the short description element (e.g., "1L", "500g", "Paraboiled 1Kg")
      // This is often more accurate than parsing from the product name
      let quantityInfo = null;
      const shortDescElement = await article.$('.loop-short-desc');
      if (shortDescElement) {
        const shortDescText = await shortDescElement.textContent();
        if (shortDescText) {
          const cleanedText = shortDescText.trim().replace(/\u00A0/g, ' '); // Remove &nbsp;
          quantityInfo = extractQuantity(cleanedText);
          if (quantityInfo) {
            this.logger.debug(`Extracted unit from short-desc for "${name}": ${quantityInfo.value}${quantityInfo.unit}`);
          }
        }
      }

      // Fall back to extracting quantity from product name if not found in short description
      if (!quantityInfo) {
        quantityInfo = extractQuantity(name.trim());
      }

      // Build full product URL if relative
      const fullUrl = productUrl.startsWith('http')
        ? productUrl
        : `${this.config.baseUrl}${productUrl}`;
      const externalId = await this.extractExternalId(article, fullUrl);

      const productData: ProductData = {
        name: name.trim(),
        price,
        currency: 'ALL', // Albanian Lek
        originalPrice,
        isOnSale: !!originalPrice,
        imageUrl,
        productUrl: fullUrl,
        externalId,
        brand: undefined,
        unit: quantityInfo?.unit,
        unitQuantity: quantityInfo?.value,
        isAvailable: true,
      };

      return productData;
    } catch (error) {
      this.logger.debug('Error extracting product data:', error);
      return null;
    }
  }

  /**
   * Scrape detailed product information from a product page
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    await this.navigateToUrl(url);
    await this.waitForDynamicContent();
    await this.handleCookieConsent();

    // Extract product name
    const name = await this.extractText('h1.product_title, .product_title');
    if (!name) {
      throw new Error(`Could not extract product name from ${url}`);
    }

    // Extract price
    const priceText = await this.page.textContent('.price');
    if (!priceText) {
      throw new Error(`Could not extract price from ${url}`);
    }

    const priceMatches = priceText.match(/(\d+(?:[.,]\d+)?)\s*LEKE/gi);
    if (!priceMatches || priceMatches.length === 0) {
      throw new Error(`Could not parse price from ${url}`);
    }

    let price: number | null = null;
    let originalPrice: number | undefined;

    if (priceMatches.length >= 2) {
      originalPrice = parsePrice(priceMatches[0]) || undefined;
      price = parsePrice(priceMatches[priceMatches.length - 1]);
    } else {
      price = parsePrice(priceMatches[0]);
    }

    if (!price) {
      throw new Error(`Could not parse price value from ${url}`);
    }

    // Extract image
    const imageUrl = await this.extractAttribute(
      '.woocommerce-product-gallery__image img, .wp-post-image',
      'src'
    );

    // Extract description
    const description = await this.extractText('.woocommerce-product-details__short-description');

    // Extract quantity from name
    const quantityInfo = extractQuantity(name);

    const productData: ProductData = {
      name,
      price,
      currency: 'ALL',
      originalPrice,
      isOnSale: !!originalPrice,
      imageUrl: imageUrl || undefined,
      productUrl: url,
      externalId: this.extractExternalIdFromUrl(url),
      description: description || undefined,
      brand: undefined,
      unit: quantityInfo?.unit,
      unitQuantity: quantityInfo?.value,
      isAvailable: true,
    };

    this.productsScraped++;
    return productData;
  }

  private normalizeExternalId(rawId?: string | null): string | undefined {
    if (!rawId) return undefined;

    const trimmed = rawId.trim();
    if (!trimmed) return undefined;

    try {
      return decodeURIComponent(trimmed).normalize('NFC').toLowerCase();
    } catch {
      return trimmed.normalize('NFC').toLowerCase();
    }
  }

  private extractExternalIdFromUrl(url: string): string | undefined {
    const match = url.match(/\/product\/([^/?#]+)(?:[/?#]|$)/i);
    return this.normalizeExternalId(match?.[1]);
  }

  private async extractExternalId(article: any, fullUrl: string): Promise<string | undefined> {
    try {
      const articleDataId = await article.getAttribute('data-product_id');
      const normalizedArticleId = this.normalizeExternalId(articleDataId);
      if (normalizedArticleId) {
        return normalizedArticleId;
      }

      const nestedDataIdElement = await article.$('[data-product_id]');
      if (nestedDataIdElement) {
        const nestedDataId = await nestedDataIdElement.getAttribute('data-product_id');
        const normalizedNestedId = this.normalizeExternalId(nestedDataId);
        if (normalizedNestedId) {
          return normalizedNestedId;
        }
      }

      const articleClass = await article.getAttribute('class');
      const articleClassId = articleClass?.match(/\bpost-(\d+)\b/)?.[1];
      const normalizedArticleClassId = this.normalizeExternalId(articleClassId);
      if (normalizedArticleClassId) {
        return normalizedArticleClassId;
      }

      const listItemClass = await article.evaluate((el: Element) => {
        const listItem = el.closest('li');
        return listItem?.getAttribute('class') || '';
      });
      const listItemClassId = listItemClass?.match(/\bpost-(\d+)\b/)?.[1];
      const normalizedListItemClassId = this.normalizeExternalId(listItemClassId);
      if (normalizedListItemClassId) {
        return normalizedListItemClassId;
      }
    } catch {
      this.logger.debug('Could not extract external ID from article, using URL fallback');
    }

    return this.extractExternalIdFromUrl(fullUrl);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up SPAR Albania scraper...');
    await this.closeBrowser();

    const stats = this.getStats();
    this.logger.info('SPAR Albania scraping completed:', stats);
  }
}
