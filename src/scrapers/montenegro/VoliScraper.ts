import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { extractQuantity, parsePrice } from '../../utils/normalizer';

/**
 * Voli categories configuration
 */
export const voliCategories: CategoryConfig[] = [
  // Pića - Bezalkoholna pića (Non-alcoholic drinks)
  { id: '127', name: 'Gazirani sokovi', url: '/kategorije/127' },
  { id: '128', name: 'Energetska pića', url: '/kategorije/128' },
  { id: '129', name: 'Negazirani sokovi', url: '/kategorije/129' },
  { id: '130', name: 'Ledeni čaj i napici', url: '/kategorije/130' },
  { id: '131', name: 'Voda', url: '/kategorije/131' },
  { id: '132', name: 'Instant sokovi u prahu i suplementi', url: '/kategorije/132' },
  { id: '133', name: 'Sirupi', url: '/kategorije/133' },
  { id: '134', name: 'Hladna kafa', url: '/kategorije/134' },
  // Pića - Topli napici (Hot drinks)
  { id: '143', name: 'Kafa', url: '/kategorije/143' },
  { id: '144', name: 'Čaj', url: '/kategorije/144' },
  { id: '145', name: 'Topla čokolada', url: '/kategorije/145' },
  // Mliječni proizvodi i jaja (Dairy and eggs)
  { id: '22', name: 'Mlijeko', url: '/kategorije/22' },
  { id: '23', name: 'Jogurt, kefir i slično', url: '/kategorije/23' },
  { id: '24', name: 'Pavlake', url: '/kategorije/24' },
  { id: '25', name: 'Čokoladno mlijeko', url: '/kategorije/25' },
  { id: '26', name: 'Jaja', url: '/kategorije/26' },
  { id: '27', name: 'Mliječni deserti', url: '/kategorije/27' },
  { id: '28', name: 'Maslac i margarin', url: '/kategorije/28' },
  { id: '29', name: 'Majonez i prelivi', url: '/kategorije/29' },
  { id: '30', name: 'Edamer, gauda emental', url: '/kategorije/30' },
  { id: '31', name: 'Feta, domaći i drugi bijeli sirevi', url: '/kategorije/31' },
  { id: '32', name: 'Sirni namaz i kajmak', url: '/kategorije/32' },
  { id: '33', name: 'Parmezan i sirevi sa plijesnima', url: '/kategorije/33' },
  { id: '34', name: 'Mozzarella i drugi meki sirevi', url: '/kategorije/34' },
  { id: '35', name: 'Ostali delikatesni sirevi', url: '/kategorije/35' },
  { id: '36', name: 'Kozji i ovčiji sir', url: '/kategorije/36' },
  { id: '37', name: 'Tost i topljeni sirevi', url: '/kategorije/37' },
  { id: '38', name: 'Dimljeni sirevi', url: '/kategorije/38' },
  { id: '39', name: 'Biljni sirevi', url: '/kategorije/39' },
  { id: '40', name: 'Surutka', url: '/kategorije/40' },
  // Voće i povrće (Fruits and vegetables)
  { id: '146', name: 'Voće', url: '/kategorije/146' },
  { id: '147', name: 'Povrće', url: '/kategorije/147' },
  { id: '248', name: 'Pakovane salate i svježe začinsko bilje', url: '/kategorije/248' },
  { id: '148', name: 'Organsko voće i povrće', url: '/kategorije/148' },
  { id: '149', name: 'Pečurke', url: '/kategorije/149' },
  { id: '150', name: 'Orašasti plodovi i sjemenke', url: '/kategorije/150' },
  { id: '151', name: 'Dehidrirano voće', url: '/kategorije/151' },
  { id: '152', name: 'Zimnica', url: '/kategorije/152' },
  { id: '153', name: 'Sosevi i pelati', url: '/kategorije/153' },
  { id: '154', name: 'Kečap', url: '/kategorije/154' },
  { id: '155', name: 'Masline', url: '/kategorije/155' },
  { id: '156', name: 'Namazi', url: '/kategorije/156' },
  { id: '157', name: 'Kompoti', url: '/kategorije/157' },
  // Sve za doručak (Breakfast)
  { id: '43', name: 'Kremovi', url: '/kategorije/43' },
  { id: '44', name: 'Cerealije (musli, corn flakes)', url: '/kategorije/44' },
  { id: '45', name: 'Džemovi i marmelade', url: '/kategorije/45' },
  { id: '46', name: 'Med', url: '/kategorije/46' },
  { id: '47', name: 'Dodaci za mliječne napitke', url: '/kategorije/47' },
  // Mesara i ribara (Butcher and fish - excluding Svinjetina)
  { id: '158', name: 'Roštilj', url: '/kategorije/158' },
  { id: '160', name: 'Junetina', url: '/kategorije/160' },
  { id: '161', name: 'Piletina', url: '/kategorije/161' },
  { id: '162', name: 'Jagnjetina', url: '/kategorije/162' },
  { id: '163', name: 'Ćuretina', url: '/kategorije/163' },
  { id: '164', name: 'Teletina', url: '/kategorije/164' },
  { id: '165', name: 'Smrznuta piletina', url: '/kategorije/165' },
  { id: '166', name: 'Smrznuta ćuretina', url: '/kategorije/166' },
  { id: '243', name: 'Smrznuta junetina', url: '/kategorije/243' },
  { id: '167', name: 'Morska riba smrznuto', url: '/kategorije/167' },
  { id: '168', name: 'Plodovi mora smrznuto', url: '/kategorije/168' },
  { id: '169', name: 'Panirani riblji proizvodi smrznuto', url: '/kategorije/169' },
  { id: '170', name: 'Slatkovodna riba', url: '/kategorije/170' },
  { id: '171', name: 'Morska riba', url: '/kategorije/171' },
  // Suhomesnati proizvodi i konzerve (Cured meats and canned goods)
  { id: '172', name: 'Trajni suhomesnati proizvodi', url: '/kategorije/172' },
  { id: '173', name: 'Trajne kobasice', url: '/kategorije/173' },
  { id: '174', name: 'Šunke i mortadele', url: '/kategorije/174' },
  { id: '175', name: 'Viršle i kobasice', url: '/kategorije/175' },
  { id: '176', name: 'Bareni suhomesnati proizvodi', url: '/kategorije/176' },
  { id: '177', name: 'Parizeri i salame', url: '/kategorije/177' },
  { id: '178', name: 'Paštete', url: '/kategorije/178' },
  { id: '179', name: 'Mesni naresci', url: '/kategorije/179' },
  { id: '180', name: 'Gotova jela', url: '/kategorije/180' },
  { id: '181', name: 'Tuna', url: '/kategorije/181' },
  { id: '182', name: 'Tuna salata', url: '/kategorije/182' },
  { id: '183', name: 'Sardine', url: '/kategorije/183' },
  { id: '184', name: 'Riblje paštete i namazi', url: '/kategorije/184' },
  { id: '185', name: 'Skuša', url: '/kategorije/185' },
  { id: '186', name: 'Ostali riblji proizvodi', url: '/kategorije/186' },
  { id: '187', name: 'Inćun', url: '/kategorije/187' },
  // Osnovne namirnice (Basic groceries)
  { id: '75', name: 'Tjestenina', url: '/kategorije/75' },
  { id: '76', name: 'Maslinovo i druga ulja', url: '/kategorije/76' },
  { id: '77', name: 'Pirinač', url: '/kategorije/77' },
  { id: '78', name: 'Suncokretovo ulje', url: '/kategorije/78' },
  { id: '79', name: 'Brašno', url: '/kategorije/79' },
  { id: '80', name: 'Šećer i so', url: '/kategorije/80' },
  { id: '81', name: 'Sirće', url: '/kategorije/81' },
];

/**
 * Voli scraper configuration
 */
export const voliConfig: Partial<ScraperConfig> = {
  name: 'Voli',
  baseUrl: 'https://voli.me',
  categories: voliCategories,
  selectors: {
    productCard: 'a[href*="/proizvod/"]',
    productName: 'img',
    productPrice: '.price',
    productImage: 'img',
    productUrl: 'a[href*="/proizvod/"]',
  },
  waitTimes: {
    pageLoad: 1000,        // Voli loads fast, no need for long waits
    dynamicContent: 1000,  // Products load with initial render
    betweenRequests: 1000, // Minimal delay between categories
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

/**
 * Scraper for Voli Montenegro (voli.me)
 * Montenegro's leading supermarket chain
 */
export class VoliScraper extends BaseScraper {
  constructor(config: ScraperConfig) {
    super(config);
  }

  private getFirstUrlFromSrcSet(srcset?: string | null): string | undefined {
    if (!srcset) return undefined;

    const firstEntry = srcset
      .split(',')
      .map(part => part.trim())
      .find(Boolean);

    if (!firstEntry) return undefined;
    return firstEntry.split(/\s+/)[0];
  }

  private normalizeImageUrl(url?: string | null): string | undefined {
    if (!url) return undefined;

    const trimmed = url.trim();
    if (!trimmed || trimmed.startsWith('data:')) return undefined;

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.startsWith('//')) {
      return `https:${trimmed}`;
    }

    if (trimmed.startsWith('/')) {
      return `${this.config.baseUrl}${trimmed}`;
    }

    return `${this.config.baseUrl}/${trimmed.replace(/^\.?\//, '')}`;
  }

  private isDefaultImage(url: string): boolean {
    return url.includes('/storage/images/products/default-image/default.png');
  }

  private async extractImageUrl(imgElement: any): Promise<string | undefined> {
    const candidates = [
      await imgElement.getAttribute('data-src'),
      await imgElement.getAttribute('data-lazy-src'),
      await imgElement.getAttribute('data-original'),
      this.getFirstUrlFromSrcSet(await imgElement.getAttribute('data-srcset')),
      this.getFirstUrlFromSrcSet(await imgElement.getAttribute('srcset')),
      await imgElement.getAttribute('src'),
    ]
      .map(url => this.normalizeImageUrl(url))
      .filter((url): url is string => !!url);

    if (candidates.length === 0) return undefined;

    const uniqueCandidates = Array.from(new Set(candidates));
    const nonDefault = uniqueCandidates.find(url => !this.isDefaultImage(url));
    return nonDefault || uniqueCandidates[0];
  }

  /**
   * Initialize the scraper
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing Voli scraper...`);
    this.startTime = Date.now();
    await this.launchBrowser();
    this.page = await this.createPage();
    this.logger.info(`Voli scraper initialized`);
  }

  /**
   * Scrape a single category page
   */
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const fullUrl = `${this.config.baseUrl}${category.url}`;
    return this.scrapeCategoryPage(fullUrl, category.id, category.name);
  }

  /**
   * Scrape a single category page
   * Voli doesn't use traditional pagination - products are loaded all at once
   * Saves products via callback after page is scraped
   */
  private async scrapeCategoryPage(
    url: string,
    categoryId: string,
    categoryName: string
  ): Promise<ProductData[]> {
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

      this.logger.debug(`Found ${pageProducts.length} products`);

      // Save products via callback (Voli loads all products at once, so pageNumber is always 1)
      if (this.onPageScraped && pageProducts.length > 0) {
        const savedCount = await this.onPageScraped(pageProducts, {
          categoryId,
          categoryName,
          pageNumber: 1,
          totalProductsOnPage: pageProducts.length,
        });
        this.logger.info(
          `${categoryName}: Saved ${savedCount}/${pageProducts.length} products`
        );
      }

      products.push(...pageProducts);
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
        this.logger.debug('Accepted cookie consent');
        await this.page.waitForTimeout(500);
      }
    } catch (error) {
      // Cookie consent may not appear, that's fine
      this.logger.debug('No cookie consent found or already accepted');
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
      // Wait for product items to load (short timeout - products usually load with page)
      // Voli uses generic elements containing links to /proizvod/
      await this.page.waitForSelector('a[href*="/proizvod/"]', {
        timeout: 1000,
      }).catch(() => {
        // Products may already be loaded or category may be empty
        this.logger.debug('Product selector wait timed out (may already be loaded)');
      });

      // Get all product containers - they are parent elements of product links
      // Looking for elements that contain product link, name, and price
      const productContainers = await this.page.$$('a[href*="/proizvod/"]');

      this.logger.debug(`Found ${productContainers.length} product links`);

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

      this.logger.debug(`Found ${productLinks.length} unique products`);

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
        this.logger.debug(`No parent container found for ${productUrl}`);
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
        this.logger.debug(`Product name not found for ${productUrl}`);
        return null;
      }

      // Extract price from parent container
      // Price format: "X.XX€" with optional "/kg" or "/kom"
      const containerText = await parentContainer.evaluate((el: Element) => el.textContent || '');

      // Parse prices - look for Euro amounts
      const priceMatches = containerText.match(/(\d+[.,]\d{2})€/g);

      if (!priceMatches || priceMatches.length === 0) {
        this.logger.debug(`Price not found for product: ${name}`);
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
        this.logger.debug(`Could not parse price for product: ${name}`);
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
        imageUrl = await this.extractImageUrl(imgElement);
      }

      // Build full product URL
      const fullUrl = productUrl.startsWith('http')
        ? productUrl
        : `${this.config.baseUrl}${productUrl}`;
      const externalIdMatch = fullUrl.match(/\/proizvod\/([a-zA-Z0-9_-]+)/i);
      const externalId = externalIdMatch ? externalIdMatch[1] : undefined;

      const productData: ProductData = {
        name,
        price,
        currency: 'EUR',
        originalPrice,
        isOnSale: !!originalPrice,
        imageUrl,
        productUrl: fullUrl,
        externalId,
        brand: undefined,
        unit,
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

    // Extract image URL from detail page with lazy-load fallbacks
    let imageUrl: string | undefined;
    const detailImage = await this.page.$(
      'img[data-src*="/storage/images/products/"], img[src*="/storage/images/products/"], img[alt]'
    );
    if (detailImage) {
      imageUrl = await this.extractImageUrl(detailImage);
    }

    // Extract unit
    let unit: string | undefined;
    if (pageContent.includes('/kg')) {
      unit = 'kg';
    } else if (pageContent.includes('/kom')) {
      unit = 'pieces';
    }

    // Extract quantity from name
    const quantityInfo = extractQuantity(name);
    const externalIdMatch = url.match(/\/proizvod\/([a-zA-Z0-9_-]+)/i);
    const externalId = externalIdMatch ? externalIdMatch[1] : undefined;

    const productData: ProductData = {
      name,
      price,
      currency: 'EUR',
      originalPrice,
      isOnSale: !!originalPrice,
      imageUrl,
      productUrl: url,
      externalId,
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
    this.logger.info(`Cleaning up Voli scraper...`);
    await this.closeBrowser();

    const stats = this.getStats();
    this.logger.info('Voli scraping completed:', stats);
  }
}
