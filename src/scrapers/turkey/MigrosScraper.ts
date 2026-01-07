import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig } from '../../types/scraper.types';
import { scraperLogger } from '../../utils/logger';
import { extractQuantity, parsePrice } from '../../utils/normalizer';

/**
 * Scraper for Migros Turkey (migros.com.tr)
 */
export class MigrosScraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config);
  }

  /**
   * Initialize the scraper
   */
  async initialize(): Promise<void> {
    scraperLogger.info(`Initializing Migros scraper...`);
    this.startTime = Date.now();
    await this.launchBrowser();
    this.page = await this.createPage();
    scraperLogger.info(`Migros scraper initialized`);
  }

  /**
   * Scrape product list from all category pages
   */
  async scrapeProductList(): Promise<ProductData[]> {
    const allProducts: ProductData[] = [];

    scraperLogger.info(`Starting to scrape Migros categories...`);

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
   * Scrape a single category page with pagination
   */
  private async scrapeCategoryPage(url: string): Promise<ProductData[]> {
    const products: ProductData[] = [];
    let currentPage = 1;
    let hasNextPage = true;

    while (hasNextPage && currentPage <= 5) {
      // Limit to 5 pages per category for now
      try {
        const pageUrl = currentPage === 1 ? url : `${url}?page=${currentPage}`;
        await this.navigateToUrl(pageUrl);
        await this.waitForDynamicContent();

        // Handle anti-bot if needed
        await this.handleAntiBot();

        // Get products from current page
        const pageProducts = await this.extractProductsFromPage();
        products.push(...pageProducts);

        scraperLogger.debug(
          `Page ${currentPage}: Found ${pageProducts.length} products`
        );

        // Check if there's a next page
        hasNextPage = await this.hasNextPage();

        if (hasNextPage) {
          currentPage++;
          await this.waitBetweenRequests();
        }
      } catch (error) {
        this.logError(
          `Failed to scrape page ${currentPage} of ${url}`,
          url,
          error as Error
        );
        hasNextPage = false;
      }
    }

    return products;
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
      await this.page.waitForSelector(this.config.selectors.productCard, {
        timeout: 10000,
      }).catch(() => {
        scraperLogger.warn('Product cards not found on page');
      });

      // Get all product card elements
      const productCards = await this.page.$$(this.config.selectors.productCard);

      scraperLogger.debug(`Found ${productCards.length} product cards`);

      for (const card of productCards) {
        try {
          const product = await this.extractProductFromCard(card);
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
   * Extract product data from a single product card
   */
  private async extractProductFromCard(card: any): Promise<ProductData | null> {
    try {
      // Extract product image element (contains name in alt attribute)
      const imageElement = await card.$(this.config.selectors.productImage || 'img.product-image');

      // Get product name from image alt attribute (Migros specific)
      const name = imageElement
        ? await imageElement.getAttribute('alt') || ''
        : '';

      if (!name) {
        scraperLogger.debug('Product name not found in image alt, skipping');
        return null;
      }

      // Extract price
      const priceElement = await card.$(this.config.selectors.productPrice);
      const priceText = priceElement
        ? (await priceElement.textContent())?.trim() || ''
        : '';
      const price = parsePrice(priceText);

      if (!price) {
        scraperLogger.debug(`Price not found for product: ${name}`);
        return null;
      }

      // Extract product URL
      const urlElement = await card.$(this.config.selectors.productUrl || 'a[href*="-p-"]');
      const productUrl = urlElement
        ? await urlElement.getAttribute('href') || ''
        : '';

      const fullUrl = productUrl.startsWith('http')
        ? productUrl
        : `${this.config.baseUrl}${productUrl}`;

      // Extract image URL
      const imageUrl = imageElement
        ? await imageElement.getAttribute('src') || ''
        : '';

      // Extract original price (if on sale)
      const originalPriceElement = await card.$(
        this.config.selectors.productOriginalPrice || '.old-price'
      );
      const originalPriceText = originalPriceElement
        ? (await originalPriceElement.textContent())?.trim() || ''
        : '';
      const originalPrice = originalPriceText ? parsePrice(originalPriceText) ?? undefined : undefined;

      // Extract brand if available
      const brandElement = await card.$(this.config.selectors.productBrand || '.brand');
      const brand = brandElement
        ? (await brandElement.textContent())?.trim() || undefined
        : undefined;

      // Extract quantity from name
      const quantityInfo = extractQuantity(name);

      const productData: ProductData = {
        name,
        price,
        currency: 'TRY',
        originalPrice,
        isOnSale: !!originalPrice,
        imageUrl: imageUrl || undefined,
        productUrl: fullUrl,
        brand,
        unit: quantityInfo?.unit,
        unitQuantity: quantityInfo?.value,
        isAvailable: true,
      };

      return productData;
    } catch (error) {
      scraperLogger.debug('Error extracting product from card:', error);
      return null;
    }
  }

  /**
   * Scrape detailed product information
   * This can be used for individual product pages if needed
   */
  async scrapeProductDetails(url: string): Promise<ProductData> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    await this.navigateToUrl(url);
    await this.waitForDynamicContent();

    // Extract detailed product information
    const name = await this.extractText(this.config.selectors.productName);
    const priceText = await this.extractText(this.config.selectors.productPrice);
    const price = parsePrice(priceText);

    if (!price) {
      throw new Error(`Could not extract price from ${url}`);
    }

    const imageUrl = await this.extractAttribute(
      this.config.selectors.productImage || 'img',
      'src'
    );

    const originalPriceText = await this.extractText(
      this.config.selectors.productOriginalPrice || '.old-price'
    );
    const originalPrice = originalPriceText ? parsePrice(originalPriceText) ?? undefined : undefined;

    const brand = await this.extractText(this.config.selectors.productBrand || '.brand');

    const quantityInfo = extractQuantity(name);

    const productData: ProductData = {
      name,
      price,
      currency: 'TRY',
      originalPrice,
      isOnSale: !!originalPrice,
      imageUrl: imageUrl || undefined,
      productUrl: url,
      brand: brand || undefined,
      unit: quantityInfo?.unit,
      unitQuantity: quantityInfo?.value,
      isAvailable: true,
    };

    this.productsScraped++;
    return productData;
  }

  /**
   * Check if there's a next page
   */
  private async hasNextPage(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const nextPageSelector = this.config.selectors.nextPage || '.next-page';
      const nextPageButton = await this.page.$(nextPageSelector);

      if (!nextPageButton) return false;

      // Check if button is disabled
      const isDisabled = await nextPageButton.getAttribute('disabled');
      const ariaDisabled = await nextPageButton.getAttribute('aria-disabled');

      return !isDisabled && ariaDisabled !== 'true';
    } catch (error) {
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    scraperLogger.info(`Cleaning up Migros scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    scraperLogger.info('Migros scraping completed:', stats);
  }
}
