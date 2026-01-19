import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { extractQuantity, parsePrice } from '../../utils/normalizer';

/**
 * Lotus's Malaysia categories configuration
 * Categories are based on the main grocery sections available on lotuss.com.my
 */
export const lotussCategories: CategoryConfig[] = [
  // Main grocery categories
  { id: 'fresh-produce', name: 'Fresh Produce', url: '/en/category/fresh-produce' },
  { id: 'meat-poultry', name: 'Meat & Poultry', url: '/en/category/meat-poultry' },
  { id: 'chilled-frozen', name: 'Chilled & Frozen', url: '/en/category/chilled-frozen' },
  { id: 'bakery', name: 'Bakery', url: '/en/category/bakery' },
  { id: 'beverages', name: 'Beverages', url: '/en/category/beverages' },
  { id: 'grocery', name: 'Grocery', url: '/en/category/grocery' },
  { id: 'baby', name: 'Baby', url: '/en/category/baby' },
  { id: 'household', name: 'Household', url: '/en/category/household' },
  { id: 'health-beauty', name: 'Health & Beauty', url: '/en/category/health-beauty' },
  { id: 'pets', name: 'Pets', url: '/en/category/pets' },
  { id: 'home-gardening', name: 'Home & Gardening', url: '/en/category/home-gardening' },
  { id: 'appliances', name: 'Appliances', url: '/en/category/appliances' },
  { id: 'av-tech', name: 'AV & Tech', url: '/en/category/av-tech' },
  { id: 'sports-leisure', name: 'Sports & Leisure', url: '/en/category/sports-leisure' },
  { id: 'office-bags-stationery', name: 'Office, Bags & Stationery', url: '/en/category/office-bags-stationery' },
];

/**
 * Lotus's scraper configuration
 */
export const lotussConfig: Partial<ScraperConfig> = {
  name: "Lotus's",
  baseUrl: 'https://www.lotuss.com.my',
  categories: lotussCategories,
  selectors: {
    productCard: '[data-testid="product-card"], .product-card, [class*="ProductCard"]',
    productName: '[data-testid="product-name"], .product-name, [class*="productName"]',
    productPrice: '[data-testid="product-price"], .product-price, [class*="Price"]',
    productImage: 'img[src*="product"], img[data-testid="product-image"]',
    productUrl: 'a[href*="/product/"]',
    pagination: '[data-testid="pagination"], .pagination',
    nextPage: '[data-testid="next-page"], button[aria-label="Next"]',
  },
  waitTimes: {
    pageLoad: 3000,        // SPA needs more time to render
    dynamicContent: 3000,  // Wait for products to load
    betweenRequests: 2000, // Be respectful to the server
    betweenPages: 1500,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  ],
};

/**
 * Scraper for Lotus's Malaysia (lotuss.com.my)
 * Malaysia's largest hypermarket chain (formerly Tesco Malaysia)
 */
export class LotussScraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Lotus's scraper...`);
    this.startTime = Date.now();
    await this.launchBrowser();
    this.page = await this.createPage();

    // Navigate to homepage first to establish session
    await this.navigateToUrl(this.config.baseUrl);
    await this.waitForDynamicContent();

    // Handle cookie consent
    await this.handleCookieConsent();

    scraperLogger.info(`Lotus's scraper initialized`);
  }

  /**
   * Scrape a single category page
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const fullUrl = `${this.config.baseUrl}${category.url}`;
    return this.scrapeCategoryWithPagination(fullUrl, category.id, category.name);
  }

  /**
   * Scrape a category with pagination support
   */
  private async scrapeCategoryWithPagination(
    baseUrl: string,
    categoryId: string,
    categoryName: string
  ): Promise<ProductData[]> {
    const products: ProductData[] = [];
    let pageNumber = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      try {
        const url = pageNumber === 1 ? baseUrl : `${baseUrl}?page=${pageNumber}`;
        scraperLogger.info(`Scraping ${categoryName} page ${pageNumber}: ${url}`);

        await this.navigateToUrl(url);
        await this.waitForDynamicContent();
        await this.handleAntiBot();

        // Wait for products to load
        const productsLoaded = await this.waitForProducts();

        if (!productsLoaded) {
          scraperLogger.warn(`No products found on ${categoryName} page ${pageNumber}`);
          hasMorePages = false;
          continue;
        }

        // Extract products from current page
        const pageProducts = await this.extractProductsFromPage(categoryName);

        scraperLogger.info(`Found ${pageProducts.length} products on page ${pageNumber}`);

        if (pageProducts.length === 0) {
          hasMorePages = false;
          continue;
        }

        // Save products via callback
        if (this.onPageScraped && pageProducts.length > 0) {
          const savedCount = await this.onPageScraped(pageProducts, {
            categoryId,
            categoryName,
            pageNumber,
            totalProductsOnPage: pageProducts.length,
          });
          scraperLogger.info(
            `${categoryName} page ${pageNumber}: Saved ${savedCount}/${pageProducts.length} products`
          );
        }

        products.push(...pageProducts);

        // Check for next page
        hasMorePages = await this.hasNextPage();

        if (hasMorePages) {
          pageNumber++;
          await this.waitBetweenPages();
        }

        // Limit pages to prevent infinite loops
        if (pageNumber > 10) {
          scraperLogger.warn(`Reached page limit for ${categoryName}`);
          hasMorePages = false;
        }
      } catch (error) {
        this.logError(
          `Failed to scrape ${categoryName} page ${pageNumber}`,
          baseUrl,
          error as Error
        );
        hasMorePages = false;
      }
    }

    return products;
  }

  /**
   * Wait for products to load on the page
   */
  private async waitForProducts(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Lotus's uses product-grid-item class for product cards
      const selectors = [
        '.product-grid-item',
        'a[href*="/product/"]',
        '[class*="product-grid"]',
      ];

      for (const selector of selectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 10000 });
          scraperLogger.debug(`Found products using selector: ${selector}`);
          return true;
        } catch {
          // Try next selector
        }
      }

      // Take screenshot for debugging if no products found
      await this.takeScreenshot('no-products-found');
      return false;
    } catch (error) {
      scraperLogger.debug('Error waiting for products:', error);
      return false;
    }
  }

  /**
   * Handle cookie consent popup
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    try {
      // Common cookie consent button selectors
      const consentSelectors = [
        'button:has-text("Accept")',
        'button:has-text("Accept All")',
        'button:has-text("I Accept")',
        '[data-testid="cookie-accept"]',
        '.cookie-accept',
        '#onetrust-accept-btn-handler',
      ];

      for (const selector of consentSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            scraperLogger.debug(`Accepted cookies using: ${selector}`);
            await this.page.waitForTimeout(1000);
            return;
          }
        } catch {
          // Try next selector
        }
      }

      scraperLogger.debug('No cookie consent found or already accepted');
    } catch (error) {
      scraperLogger.debug('Error handling cookie consent:', error);
    }
  }

  /**
   * Check if there's a next page
   */
  private async hasNextPage(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const nextSelectors = [
        '[data-testid="next-page"]:not([disabled])',
        'button[aria-label="Next"]:not([disabled])',
        '.pagination-next:not(.disabled)',
        'a[aria-label="Next page"]',
      ];

      for (const selector of nextSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Wait between pages
   */
  private async waitBetweenPages(): Promise<void> {
    const delay = this.config.waitTimes.betweenPages || 1500;
    const jitter = Math.random() * 500;
    await this.page?.waitForTimeout(delay + jitter);
  }

  /**
   * Extract products from the current page
   */
  private async extractProductsFromPage(categoryName: string): Promise<ProductData[]> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const products: ProductData[] = [];

    try {
      // Get all product grid items (Lotus's specific selector)
      const productCards = await this.page.$$('.product-grid-item');

      scraperLogger.debug(`Found ${productCards.length} product cards`);

      if (productCards.length === 0) {
        // Fallback to product links
        const productLinks = await this.page.$$('a[href*="/product/"]');
        scraperLogger.debug(`Fallback: Found ${productLinks.length} product links`);
      }

      // Extract data from each product card
      for (const card of productCards) {
        try {
          const product = await this.extractProductFromCard(card, categoryName);
          if (product) {
            products.push(product);
            this.productsScraped++;
          }
        } catch (error) {
          this.productsFailed++;
          scraperLogger.debug('Failed to extract product from card:', error);
        }
      }
    } catch (error) {
      scraperLogger.error('Failed to extract products from page:', error);
      await this.takeScreenshot('extract-products-error');
      throw error;
    }

    return products;
  }

  /**
   * Extract product data from a product card element
   */
  private async extractProductFromCard(
    card: any,
    categoryName: string
  ): Promise<ProductData | null> {
    try {
      // Get the product link
      const linkElement = await card.$('a[href*="/product/"]');
      if (!linkElement) {
        return null;
      }

      const productUrl = await linkElement.getAttribute('href');
      if (!productUrl) {
        return null;
      }

      // Get all text from the card
      const cardText = await card.textContent() || '';

      // Extract product name - it's usually the main text before RM price
      // Format: "PRODUCT NAME[quantity]RM[price]"
      const nameMatch = cardText.match(/^(.+?)(?:\d+[gGkKlLmM]+[^\d]*)?RM/);
      let name = nameMatch ? nameMatch[1].trim() : '';

      // If no match, try getting text from the link
      if (!name) {
        name = await linkElement.textContent() || '';
        name = name.trim();
      }

      if (!name) {
        return null;
      }

      // Extract price - look for RM followed by digits
      const priceMatch = cardText.match(/RM\s*(\d+\.?\d*)/);
      if (!priceMatch) {
        scraperLogger.debug(`Price not found in: ${cardText.substring(0, 100)}`);
        return null;
      }

      const price = parseFloat(priceMatch[1]);
      if (isNaN(price) || price <= 0) {
        return null;
      }

      // Check for original price (sale item) - look for second RM price
      const allPrices = cardText.match(/RM\s*(\d+\.?\d*)/g);
      let originalPrice: number | undefined;

      if (allPrices && allPrices.length >= 2) {
        const prices = allPrices.map((p: string) => parseFloat(p.replace(/RM\s*/, '')));
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        if (maxPrice !== minPrice) {
          originalPrice = maxPrice;
        }
      }

      // Extract quantity from name
      const quantityInfo = extractQuantity(name);

      // Get image URL
      let imageUrl: string | undefined;
      const imgElement = await card.$('img');
      if (imgElement) {
        imageUrl = await imgElement.getAttribute('src') || undefined;
        // Skip placeholder images
        if (imageUrl?.includes('product_default_thumbnail')) {
          imageUrl = undefined;
        }
      }

      // Build full product URL
      const fullUrl = productUrl.startsWith('http')
        ? productUrl
        : `${this.config.baseUrl}${productUrl}`;

      // Extract external ID from URL
      const externalIdMatch = productUrl.match(/\/product\/(?:.*-)?(\d+)$/);
      const externalId = externalIdMatch ? externalIdMatch[1] : undefined;

      const productData: ProductData = {
        name,
        price,
        currency: 'MYR',
        originalPrice,
        isOnSale: !!originalPrice,
        imageUrl,
        productUrl: fullUrl,
        externalId,
        brand: undefined,
        unit: quantityInfo?.unit,
        unitQuantity: quantityInfo?.value,
        categoryName,
        isAvailable: true,
      };

      return productData;
    } catch (error) {
      scraperLogger.debug('Error extracting product from card:', error);
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

    // Wait for product details to load
    await this.page.waitForSelector('h1, [data-testid="product-title"]', { timeout: 10000 }).catch(() => {});

    // Extract product name
    const name = await this.extractText('h1') ||
                 await this.extractText('[data-testid="product-title"]') ||
                 await this.extractText('.product-title');

    if (!name) {
      throw new Error(`Could not extract product name from ${url}`);
    }

    // Extract price
    const pageContent = await this.page.content();
    const priceMatches = pageContent.match(/RM\s*(\d+\.?\d*)/gi);

    if (!priceMatches || priceMatches.length === 0) {
      throw new Error(`Could not extract price from ${url}`);
    }

    const prices = priceMatches.map((p: string) => parsePrice(p)).filter((p: number | null): p is number => p !== null);

    let price = prices[0];
    let originalPrice: number | undefined;

    if (prices.length >= 2) {
      originalPrice = Math.max(...prices);
      price = Math.min(...prices);
      if (originalPrice === price) {
        originalPrice = undefined;
      }
    }

    if (!price) {
      throw new Error(`Could not parse price from ${url}`);
    }

    // Extract image
    const imageUrl = await this.extractAttribute('img[data-testid="product-image"]', 'src') ||
                     await this.extractAttribute('.product-image img', 'src') ||
                     await this.extractAttribute('img[alt*="product"]', 'src');

    // Extract quantity from name
    const quantityInfo = extractQuantity(name);

    // Extract external ID from URL
    const externalIdMatch = url.match(/\/product\/(?:.*-)?(\d+)$/);
    const externalId = externalIdMatch ? externalIdMatch[1] : undefined;

    const productData: ProductData = {
      name,
      price,
      currency: 'MYR',
      originalPrice,
      isOnSale: !!originalPrice,
      imageUrl: imageUrl || undefined,
      productUrl: url,
      externalId,
      brand: undefined,
      unit: quantityInfo?.unit,
      unitQuantity: quantityInfo?.value,
      isAvailable: true,
    };

    this.productsScraped++;
    return productData;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up Lotus's scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info("Lotus's scraping completed:", stats);
  }
}
