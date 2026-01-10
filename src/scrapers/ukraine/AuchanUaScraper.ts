import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { extractQuantity } from '../../utils/normalizer';
import { ElementHandle } from 'playwright';

/**
 * Scraper for Auchan Ukraine (auchan.ua)
 * Ukraine's major hypermarket chain
 */
export class AuchanUaScraper extends BaseScraper {
  private readonly MAX_PAGES_PER_CATEGORY = 50; // Safety limit

  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Auchan Ukraine scraper...`);
    this.startTime = Date.now();
    await this.launchBrowser();
    this.page = await this.createPage();
    scraperLogger.info(`Auchan Ukraine scraper initialized`);
  }

  /**
   * Scrape a single category
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const fullUrl = `${this.config.baseUrl}${category.url}`;
    return this.scrapeCategoryPages(fullUrl, category.id, category.name);
  }

  /**
   * Scrape all pages of a category
   */
  private async scrapeCategoryPages(
    baseUrl: string,
    categoryId: string,
    categoryName: string
  ): Promise<ProductData[]> {
    const allProducts: ProductData[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages && currentPage <= this.MAX_PAGES_PER_CATEGORY) {
      try {
        // Build URL for current page
        const pageUrl = currentPage === 1
          ? baseUrl
          : `${baseUrl}l/page-${currentPage}/`;

        scraperLogger.debug(`Scraping page ${currentPage}: ${pageUrl}`);

        await this.navigateToUrl(pageUrl);
        await this.waitForDynamicContent();

        // Handle cookie consent on first page
        if (currentPage === 1) {
          await this.handleCookieConsent();
        }

        // Handle anti-bot measures
        await this.handleAntiBot();

        // Extract products from current page
        const pageProducts = await this.extractProductsFromPage();

        scraperLogger.debug(`Found ${pageProducts.length} products on page ${currentPage}`);

        if (pageProducts.length === 0) {
          // No products found, stop pagination
          hasMorePages = false;
          break;
        }

        // Save products via callback
        if (this.onPageScraped && pageProducts.length > 0) {
          const savedCount = await this.onPageScraped(pageProducts, {
            categoryId,
            categoryName,
            pageNumber: currentPage,
            totalProductsOnPage: pageProducts.length,
          });
          scraperLogger.info(
            `${categoryName} page ${currentPage}: Saved ${savedCount}/${pageProducts.length} products`
          );
        }

        allProducts.push(...pageProducts);

        // Check if there's a next page
        hasMorePages = await this.hasNextPage(currentPage);

        if (hasMorePages) {
          currentPage++;
          await this.waitBetweenRequests();
        }
      } catch (error) {
        this.logError(
          `Failed to scrape page ${currentPage} of ${categoryName}`,
          baseUrl,
          error as Error
        );
        // Continue to next category instead of stopping
        break;
      }
    }

    scraperLogger.info(`Category ${categoryName}: scraped ${allProducts.length} total products from ${currentPage} pages`);
    return allProducts;
  }

  /**
   * Handle cookie consent popup
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    try {
      // Look for the "Погоджуюся" (I agree) button
      const cookieButton = await this.page.$('button:has-text("Погоджуюся")');
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
   * Check if there's a next page
   */
  private async hasNextPage(currentPage: number): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Look for pagination links - check if next page number exists
      const nextPageLink = await this.page.$(`a[href*="page-${currentPage + 1}"]`);

      // Also check for "Вперед" (Forward) button
      if (!nextPageLink) {
        const forwardButton = await this.page.$('a:has-text("Вперед")');
        return forwardButton !== null;
      }

      return nextPageLink !== null;
    } catch (error) {
      return false;
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
      // Wait for product cards to load
      // Products are wrapped in generic containers with links to product pages
      await this.page.waitForSelector('a[href*="/ua/"][href$="/"]', {
        timeout: 10000,
      }).catch(() => {
        scraperLogger.warn('Product links not found on page');
      });

      // Get all product containers by looking for elements with price info
      // The pattern is: product card containers containing product links and price info
      const productContainers = await this.page.$$('a[href*="/ua/"]');

      // Filter to only product links (not category links)
      // Product links end with a product ID pattern like "-123456/"
      const productLinks: { url: string; element: ElementHandle }[] = [];
      const seenUrls = new Set<string>();

      for (const link of productContainers) {
        const href = await link.getAttribute('href');
        if (href && this.isProductUrl(href) && !seenUrls.has(href)) {
          seenUrls.add(href);
          productLinks.push({ url: href, element: link });
        }
      }

      scraperLogger.debug(`Found ${productLinks.length} unique product links`);

      // Extract product data from each product
      for (const { url, element } of productLinks) {
        try {
          const product = await this.extractProductData(url, element);
          if (product) {
            products.push(product);
            this.productsScraped++;
          }
        } catch (error) {
          this.productsFailed++;
          scraperLogger.debug(`Failed to extract product from ${url}:`, error);
        }
      }
    } catch (error) {
      scraperLogger.error('Failed to extract products from page:', error);
      await this.takeScreenshot('auchan-extract-products-error');
      throw error;
    }

    return products;
  }

  /**
   * Check if a URL is a product URL
   * Product URLs look like: /ua/product-name-12345/
   */
  private isProductUrl(url: string): boolean {
    // Product URLs match pattern: /ua/something-with-numbers-at-end/
    // And contain a product ID (usually 6+ digits at the end)
    const productPattern = /\/ua\/[a-z0-9-]+-\d{4,}\/?$/;

    // Exclude category pages and other non-product pages
    const excludePatterns = [
      /\/kategorije\//,
      /\/promotions?\//,
      /\/map\//,
      /\/blog\//,
      /\/brand\//,
      /\/compare\//,
      /\/l\/page-\d+\//,
      /\/l\/brand-/,
      /\/l\/shipping/,
      /\/l\/organic/,
      /\/l\/cereals_type/,
      /\/l\/country_all/,
    ];

    if (excludePatterns.some(pattern => pattern.test(url))) {
      return false;
    }

    return productPattern.test(url);
  }

  /**
   * Extract product data from a product element
   */
  private async extractProductData(
    productUrl: string,
    linkElement: ElementHandle
  ): Promise<ProductData | null> {
    if (!this.page) return null;

    try {
      // Extract product name from image alt or link text
      const imgElement = await linkElement.$('img');
      let name = '';

      if (imgElement) {
        name = (await imgElement.getAttribute('alt')) || '';
      }

      if (!name) {
        name = (await linkElement.textContent()) || '';
      }

      name = name.trim();

      if (!name || name.length < 2) {
        return null;
      }

      // Find the parent container text that holds price info (has "грн" text)
      const containerText = await linkElement.evaluate((el: Element): string => {
        // Go up to find the container that holds price info
        let parent = el.parentElement;
        let depth = 0;
        while (parent && depth < 10) {
          const text = parent.textContent || '';
          if (text.includes('грн')) {
            return text;
          }
          parent = parent.parentElement;
          depth++;
        }
        // Fallback: return the parent's text content
        return el.parentElement?.parentElement?.parentElement?.textContent || '';
      });

      // Parse prices - look for Ukrainian Hryvnia amounts
      // Format: "123,45 грн" or "123.45 грн"
      const priceMatches = containerText.match(/(\d+[\s,.]?\d*)\s*грн/g);

      if (!priceMatches || priceMatches.length === 0) {
        return null;
      }

      // Parse price values
      let price: number | null = null;
      let originalPrice: number | undefined;

      // Extract numeric values from price strings
      const parsePriceValue = (priceStr: string): number | null => {
        // Remove "грн" and whitespace, normalize separators
        const cleaned = priceStr
          .replace(/грн/gi, '')
          .replace(/\s/g, '')
          .replace(',', '.');
        const value = parseFloat(cleaned);
        return isNaN(value) ? null : value;
      };

      if (priceMatches.length >= 2) {
        // Might be discounted - first is original, second is sale price
        // But need to verify by checking if there's a discount indicator
        const hasDiscount = containerText.includes('%') ||
                           containerText.includes('Акція') ||
                           containerText.includes('знижка');

        if (hasDiscount) {
          // First price is original, last is current sale price
          originalPrice = parsePriceValue(priceMatches[0]) || undefined;
          price = parsePriceValue(priceMatches[priceMatches.length - 1]);
        } else {
          // Just use the first price
          price = parsePriceValue(priceMatches[0]);
        }
      } else {
        price = parsePriceValue(priceMatches[0]);
      }

      if (!price || price <= 0) {
        return null;
      }

      // Extract image URL
      let imageUrl: string | undefined;
      if (imgElement) {
        imageUrl = (await imgElement.getAttribute('src')) || undefined;
        // Handle relative URLs
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `${this.config.baseUrl}${imageUrl}`;
        }
      }

      // Extract quantity from product name
      const quantityInfo = extractQuantity(name);

      // Build full product URL
      const fullUrl = productUrl.startsWith('http')
        ? productUrl
        : `${this.config.baseUrl}${productUrl}`;

      // Extract external ID from URL (the numeric part at the end)
      const idMatch = productUrl.match(/-(\d{4,})\/?$/);
      const externalId = idMatch ? idMatch[1] : undefined;

      const productData: ProductData = {
        name,
        price,
        currency: 'UAH',
        originalPrice,
        isOnSale: originalPrice !== undefined && originalPrice > price,
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

    // Extract product name
    const name = await this.extractText('h1');

    if (!name) {
      throw new Error(`Could not extract product name from ${url}`);
    }

    // Extract price from page content
    const pageContent = await this.page.content();
    const priceMatches = pageContent.match(/(\d+[\s,.]?\d*)\s*грн/g);

    if (!priceMatches || priceMatches.length === 0) {
      throw new Error(`Could not extract price from ${url}`);
    }

    // Parse prices
    const parsePriceValue = (priceStr: string): number | null => {
      const cleaned = priceStr
        .replace(/грн/gi, '')
        .replace(/\s/g, '')
        .replace(',', '.');
      const value = parseFloat(cleaned);
      return isNaN(value) ? null : value;
    };

    let price: number | null = null;
    let originalPrice: number | undefined;

    if (priceMatches.length >= 2) {
      const hasDiscount = pageContent.includes('%') ||
                         pageContent.includes('Акція') ||
                         pageContent.includes('знижка');
      if (hasDiscount) {
        originalPrice = parsePriceValue(priceMatches[0]) || undefined;
        price = parsePriceValue(priceMatches[priceMatches.length - 1]);
      } else {
        price = parsePriceValue(priceMatches[0]);
      }
    } else {
      price = parsePriceValue(priceMatches[0]);
    }

    if (!price) {
      throw new Error(`Could not parse price from ${url}`);
    }

    // Extract image URL
    const imageUrl = await this.extractAttribute('img[alt]', 'src');

    // Extract quantity from name
    const quantityInfo = extractQuantity(name);

    // Extract external ID from URL
    const idMatch = url.match(/-(\d{4,})\/?$/);
    const externalId = idMatch ? idMatch[1] : undefined;

    const productData: ProductData = {
      name,
      price,
      currency: 'UAH',
      originalPrice,
      isOnSale: originalPrice !== undefined && originalPrice > price,
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
    scraperLogger.info(`Cleaning up Auchan Ukraine scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Auchan Ukraine scraping completed:', stats);
  }
}
