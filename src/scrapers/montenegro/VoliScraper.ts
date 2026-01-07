import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { extractQuantity, parsePrice } from '../../utils/normalizer';

/**
 * Scraper for Voli Montenegro (voli.me)
 * Montenegro's leading supermarket chain
 */
export class VoliScraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Voli scraper...`);
    this.startTime = Date.now();
    await this.launchBrowser();
    this.page = await this.createPage();
    scraperLogger.info(`Voli scraper initialized`);
  }

  /**
   * Scrape product list from all category pages
   */
  async scrapeProductList(): Promise<ProductData[]> {
    const allProducts: ProductData[] = [];

    scraperLogger.info(`Starting to scrape Voli categories...`);

    for (const categoryUrl of this.config.categoryUrls) {
      try {
        const fullUrl = `${this.config.baseUrl}${categoryUrl}`;
        scraperLogger.info(`Scraping category: ${categoryUrl}`);

        const categoryProducts = await this.scrapeCategoryPage(fullUrl);
        allProducts.push(...categoryProducts);

        scraperLogger.info(
          `Scraped ${categoryProducts.length} products from ${categoryUrl}`
        );

        // Wait between categories
        await this.waitBetweenRequests();
      } catch (error) {
        this.logError(
          `Failed to scrape category: ${categoryUrl}`,
          undefined,
          error as Error
        );
      }
    }

    scraperLogger.info(`Total products scraped: ${allProducts.length}`);
    return allProducts;
  }

  /**
   * Scrape a single category page
   * Voli doesn't use traditional pagination - products are loaded all at once
   */
  private async scrapeCategoryPage(url: string): Promise<ProductData[]> {
    const products: ProductData[] = [];

    try {
      await this.navigateToUrl(url);
      await this.waitForDynamicContent();

      // Handle cookie consent if it appears
      await this.handleCookieConsent();

      // Handle anti-bot if needed
      await this.handleAntiBot();

      // Get products from current page
      const pageProducts = await this.extractProductsFromPage();
      products.push(...pageProducts);

      scraperLogger.debug(`Found ${pageProducts.length} products`);
    } catch (error) {
      this.logError(
        `Failed to scrape category ${url}`,
        url,
        error as Error
      );
    }

    return products;
  }

  /**
   * Handle cookie consent popup
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    try {
      // Look for cookie consent button
      const cookieButton = await this.page.$('button:has-text("Prihvatite kolačiće")');
      if (cookieButton) {
        await cookieButton.click();
        scraperLogger.debug('Accepted cookie consent');
        await this.page.waitForTimeout(500);
      }
    } catch (error) {
      // Cookie consent may not appear, that's fine
      scraperLogger.debug('No cookie consent found or already accepted');
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
      // Wait for product items to load
      // Voli uses generic elements containing links to /proizvod/
      await this.page.waitForSelector('a[href*="/proizvod/"]', {
        timeout: 5000,
      }).catch(() => {
        scraperLogger.warn('Product links not found on page');
      });

      // Get all product containers - they are parent elements of product links
      // Looking for elements that contain product link, name, and price
      const productContainers = await this.page.$$('a[href*="/proizvod/"]');

      scraperLogger.debug(`Found ${productContainers.length} product links`);

      // Group by unique product URLs to avoid duplicates
      const seenUrls = new Set<string>();
      const productLinks: { url: string; element: any }[] = [];

      for (const link of productContainers) {
        const href = await link.getAttribute('href');
        if (href && !seenUrls.has(href)) {
          seenUrls.add(href);
          productLinks.push({ url: href, element: link });
        }
      }

      scraperLogger.debug(`Found ${productLinks.length} unique products`);

      // Extract product data from each unique product
      for (const { url, element } of productLinks) {
        try {
          const product = await this.extractProductData(url, element);
          if (product) {
            products.push(product);
            this.productsScraped++;
          }
        } catch (error) {
          this.productsFailed++;
          scraperLogger.debug('Failed to extract product:', error);
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
   * Extract product data from a product link and its parent container
   */
  private async extractProductData(productUrl: string, linkElement: any): Promise<ProductData | null> {
    if (!this.page) return null;

    try {
      // Find the parent container that holds all product info
      // The product card structure has the link as a child, we need to find the container
      const parentContainer = await linkElement.evaluateHandle((el: Element) => {
        // Go up to find the container that holds price info
        let parent = el.parentElement;
        while (parent) {
          // Check if this parent contains price text (has € symbol)
          if (parent.textContent?.includes('€')) {
            return parent;
          }
          parent = parent.parentElement;
        }
        return el.parentElement?.parentElement;
      });

      if (!parentContainer) {
        scraperLogger.debug(`No parent container found for ${productUrl}`);
        return null;
      }

      // Extract product name from image alt or link text
      const imgElement = await linkElement.$('img');
      let name = '';

      if (imgElement) {
        name = await imgElement.getAttribute('alt') || '';
      }

      if (!name) {
        // Try to get name from link text
        name = await linkElement.textContent() || '';
      }

      name = name.trim();

      if (!name) {
        scraperLogger.debug(`Product name not found for ${productUrl}`);
        return null;
      }

      // Extract price from parent container
      // Price format: "X.XX€" with optional "/kg" or "/kom"
      const containerText = await parentContainer.evaluate((el: Element) => el.textContent || '');

      // Parse prices - look for Euro amounts
      const priceMatches = containerText.match(/(\d+[.,]\d{2})€/g);

      if (!priceMatches || priceMatches.length === 0) {
        scraperLogger.debug(`Price not found for product: ${name}`);
        return null;
      }

      // If there are multiple prices, the last one is usually the current price (for discounted items)
      // and the first one is the original price
      let price: number | null = null;
      let originalPrice: number | undefined;

      if (priceMatches.length >= 2) {
        // Discounted product - first is original, last is sale price
        originalPrice = parsePrice(priceMatches[0]) || undefined;
        price = parsePrice(priceMatches[priceMatches.length - 1]);
      } else {
        price = parsePrice(priceMatches[0]);
      }

      if (!price) {
        scraperLogger.debug(`Could not parse price for product: ${name}`);
        return null;
      }

      // Extract quantity from name if present (e.g., "Coca cola 0.33 l")
      const quantityInfo = extractQuantity(name);

      // Determine unit - prefer extracted quantity unit over page pricing unit
      // /kg and /kom on the page indicate PRICING unit (price per kg or per piece)
      // but the product name contains the ACTUAL quantity (e.g., 0.33 l, 500 g)
      let unit: string | undefined = quantityInfo?.unit;

      // If no quantity extracted from name, use page pricing unit as fallback
      if (!unit) {
        if (containerText.includes('/kg')) {
          unit = 'kg';
        } else if (containerText.includes('/kom')) {
          unit = 'pieces';
        }
      }

      // Extract image URL
      let imageUrl: string | undefined;
      if (imgElement) {
        imageUrl = await imgElement.getAttribute('src') || undefined;
      }

      // Build full product URL
      const fullUrl = productUrl.startsWith('http')
        ? productUrl
        : `${this.config.baseUrl}${productUrl}`;

      const productData: ProductData = {
        name,
        price,
        currency: 'EUR',
        originalPrice,
        isOnSale: !!originalPrice,
        imageUrl,
        productUrl: fullUrl,
        brand: undefined,
        unit,
        unitQuantity: quantityInfo?.value,
        isAvailable: true,
      };

      return productData;
    } catch (error) {
      scraperLogger.debug('Error extracting product data:', error);
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

    // Handle cookie consent if needed
    await this.handleCookieConsent();

    // Extract product name from h4 heading
    const name = await this.extractText('h4');

    // Extract price - look for the current price element
    const pageContent = await this.page.content();
    const priceMatches = pageContent.match(/(\d+[.,]\d{2})€/g);

    if (!priceMatches || priceMatches.length === 0) {
      throw new Error(`Could not extract price from ${url}`);
    }

    // Parse prices
    let price: number | null = null;
    let originalPrice: number | undefined;

    if (priceMatches.length >= 2) {
      // Check if it's a discounted product by looking for discount indicator
      const hasDiscount = pageContent.includes('%-') || pageContent.includes('Popust');
      if (hasDiscount) {
        price = parsePrice(priceMatches[priceMatches.length - 1]);
        originalPrice = parsePrice(priceMatches[0]) || undefined;
      } else {
        price = parsePrice(priceMatches[0]);
      }
    } else {
      price = parsePrice(priceMatches[0]);
    }

    if (!price) {
      throw new Error(`Could not parse price from ${url}`);
    }

    // Extract image URL
    const imageUrl = await this.extractAttribute('img[alt]', 'src');

    // Extract unit
    let unit: string | undefined;
    if (pageContent.includes('/kg')) {
      unit = 'kg';
    } else if (pageContent.includes('/kom')) {
      unit = 'pieces';
    }

    // Extract quantity from name
    const quantityInfo = extractQuantity(name);

    const productData: ProductData = {
      name,
      price,
      currency: 'EUR',
      originalPrice,
      isOnSale: !!originalPrice,
      imageUrl: imageUrl || undefined,
      productUrl: url,
      brand: undefined,
      unit: unit || quantityInfo?.unit,
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
    scraperLogger.info(`Cleaning up Voli scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Voli scraping completed:', stats);
  }
}
