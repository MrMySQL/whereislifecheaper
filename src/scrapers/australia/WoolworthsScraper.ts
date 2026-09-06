import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as path from 'path';
import * as os from 'os';

// Woolworths is fronted by Akamai Bot Manager which blocks vanilla headless
// Chromium with a 403 on its JSON API. Stealth + persistent context lets the
// site set the `_abck` validation cookie that the API requires.
chromium.use(stealth());

/**
 * Woolworths AU top-level grocery categories.
 * IDs come from `GET /apis/ui/PiesCategoriesWithSpecials` (NodeId field).
 * Marketing/non-grocery nodes (Specials, Everyday Market, Back to School, Front of Store) are excluded.
 *
 * Drugstore and homewares nodes (Beauty, Personal Care, Health & Wellness,
 * Cleaning & Maintenance, Baby, Pet, Electronics, Home & Lifestyle) are also
 * excluded — see `woolworthsNonGroceryCategories` below. They are the largest
 * nodes on the site and none of them feed the grocery basket comparison.
 */
export const woolworthsCategories: CategoryConfig[] = [
  { id: '1-E5BEE36E', name: 'Fruit & Veg', url: '/shop/browse/fruit-veg' },
  { id: '1_D5A2236', name: 'Poultry, Meat & Seafood', url: '/shop/browse/poultry-meat-seafood' },
  { id: '1_8AD6702', name: 'Dinner', url: '/shop/browse/dinner' },
  { id: '1_3151F6F', name: 'Deli', url: '/shop/browse/deli' },
  { id: '1_6E4F4E4', name: 'Dairy, Eggs & Fridge', url: '/shop/browse/dairy-eggs-fridge' },
  { id: '1_DEB537E', name: 'Bakery', url: '/shop/browse/bakery' },
  { id: '1_9E92C35', name: 'Lunch Box', url: '/shop/browse/lunch-box' },
  { id: '1_ACA2FC2', name: 'Freezer', url: '/shop/browse/freezer' },
  { id: '1_717445A', name: 'Snacks & Confectionery', url: '/shop/browse/snacks-confectionery' },
  { id: '1_39FD49C', name: 'Pantry', url: '/shop/browse/pantry' },
  { id: '1_F229FBE', name: 'International Foods', url: '/shop/browse/international-foods' },
  { id: '1_5AF3A0A', name: 'Drinks', url: '/shop/browse/drinks' },
  { id: '1_8E4DA6F', name: 'Beer, Wine & Spirits', url: '/shop/browse/beer-wine-spirits' },
];

/**
 * Non-grocery nodes, kept here so they are documented rather than lost.
 *
 * These were scraped until 2026-08 and were the direct cause of the daily
 * workflow hitting its 6-hour CI timeout: on the 2026-08-01 run they consumed
 * 2h42m before the job was killed part-way through Baby, with Pet, Electronics
 * and Home & Lifestyle never reached. They are bounded but very long — the API
 * returns 36 genuinely-new stockcodes per page over ~280 pages each, so the
 * duplicate-page guard never trips.
 *
 * `--categories=` filters `woolworthsCategories`, so these are not reachable
 * from the CLI while they live here — spread them back into the array above to
 * scrape them, and raise the per-scraper deadline in ScraperService if you do.
 */
export const woolworthsNonGroceryCategories: CategoryConfig[] = [
  { id: '1_8D61DD6', name: 'Beauty', url: '/shop/browse/beauty' },
  { id: '1_894D0A8', name: 'Personal Care', url: '/shop/browse/personal-care' },
  { id: '1_9851658', name: 'Health & Wellness', url: '/shop/browse/health-wellness' },
  { id: '1_2432B58', name: 'Cleaning & Maintenance', url: '/shop/browse/cleaning-maintenance' },
  { id: '1_717A94B', name: 'Baby', url: '/shop/browse/baby' },
  { id: '1_61D6FEB', name: 'Pet', url: '/shop/browse/pet' },
  { id: '1_B863F57', name: 'Electronics', url: '/shop/browse/electronics' },
  { id: '1_DEA3ED5', name: 'Home & Lifestyle', url: '/shop/browse/home-lifestyle' },
];

export const woolworthsConfig: Partial<ScraperConfig> = {
  name: 'Woolworths',
  baseUrl: 'https://www.woolworths.com.au',
  categories: woolworthsCategories,
  selectors: {
    productCard: '',
    productName: '',
    productPrice: '',
  },
  waitTimes: {
    pageLoad: 3000,
    dynamicContent: 2000,
    betweenRequests: 600,
    betweenPages: 400,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

interface WoolworthsProduct {
  Stockcode: number;
  Name: string;
  DisplayName?: string;
  Brand?: string | null;
  Description?: string;
  UrlFriendlyName?: string;
  Price: number | null;
  WasPrice?: number | null;
  CupPrice?: number | null;
  CupMeasure?: string | null;
  PackageSize?: string | null;
  Unit?: string | null;
  MediumImageFile?: string | null;
  LargeImageFile?: string | null;
  SmallImageFile?: string | null;
  IsAvailable?: boolean;
  IsInStock?: boolean;
  IsOnSpecial?: boolean;
  SavingsAmount?: number;
}

interface WoolworthsBundle {
  Products: WoolworthsProduct[];
}

interface WoolworthsCategoryResponse {
  Bundles: WoolworthsBundle[];
  TotalRecordCount: number;
  Success: boolean;
}

/**
 * Scraper for Woolworths Australia (woolworths.com.au).
 *
 * Uses the public REST endpoints that power the website:
 *   POST /apis/ui/browse/category  → paginated product list per category
 *
 * A real browser session is required so the request carries the
 * fulfilment/postcode cookies the API expects. We default to a Sydney
 * delivery area (postcode 2000) which the site assigns automatically.
 */
export class WoolworthsScraper extends BaseScraper {
  private readonly API_URL = 'https://www.woolworths.com.au/apis/ui/browse/category';
  private readonly PAGE_SIZE = 36;
  private browserContext: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;

  constructor(config: ScraperConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Woolworths AU API scraper (stealth)...');
    this.startTime = Date.now();

    await this.launchStealthBrowser();

    this.logger.info('Establishing Woolworths session...');
    await this.page!.goto(`${this.config.baseUrl}/shop/browse/fruit-veg`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    // Give Akamai bot-manager scripts time to evaluate the browser and set _abck
    await this.page!.waitForTimeout(6000);
    await this.handleCookieConsent();
    await this.page!.waitForTimeout(2000);

    this.logger.info('Woolworths AU API scraper initialized');
  }

  private async launchStealthBrowser(): Promise<void> {
    const sessionDir = path.join(os.tmpdir(), 'woolworths-scraper-session');
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS === 'true';
    this.logger.info(`Browser mode: ${isHeadless ? 'headless' : 'headed'}`);

    this.browserContext = await chromium.launchPersistentContext(sessionDir, {
      headless: isHeadless,
      args: [
        ...(isHeadless ? ['--headless=new'] : []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
      viewport: { width: 1920, height: 1080 },
      userAgent: this.getUserAgent(),
      locale: 'en-AU',
      timezoneId: 'Australia/Sydney',
    });

    const pages = this.browserContext.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browserContext.newPage();
    this.logger.info('Stealth browser launched');
  }

  private async handleCookieConsent(): Promise<void> {
    if (!this.page) return;

    const selectors = [
      '#onetrust-accept-btn-handler',
      'button:has-text("Accept All Cookies")',
      'button:has-text("Accept all")',
      'button:has-text("Accept")',
    ];

    for (const selector of selectors) {
      try {
        const btn = await this.page.$(selector);
        if (btn) {
          await btn.click();
          await this.page.waitForTimeout(500);
          this.logger.debug('Cookie consent accepted');
          return;
        }
      } catch {
        // try next
      }
    }
  }

  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];
    const seenStockcodes = new Set<string>();
    let pageNumber = 1;
    let totalRecordCount = Infinity;
    // Some Woolworths categories (notably non-grocery like Home & Lifestyle)
    // return a wildly inflated TotalRecordCount and then keep echoing back the
    // same featured/sponsored products on every subsequent page, so neither
    // the count-based loop bound nor a `length === 0` check ever terminates.
    // Track seen Stockcodes and stop once two consecutive pages contribute
    // nothing new — that is the real end of the catalog.
    let consecutivePagesWithoutNewProducts = 0;
    const STOP_AFTER_DUPE_PAGES = 2;

    while ((pageNumber - 1) * this.PAGE_SIZE < totalRecordCount) {
      const response = await this.fetchCategoryPage(category, pageNumber);

      if (!response || !response.Success) {
        // Giving the category up; BaseScraper decides whether that lost it
        // or truncated it.
        this.failCategory(category, `empty or failed response on page ${pageNumber}`, this.API_URL);
        break;
      }

      totalRecordCount = response.TotalRecordCount ?? 0;

      const pageProducts: ProductData[] = [];
      let newApiProducts = 0;
      let duplicateApiProducts = 0;
      for (const bundle of response.Bundles || []) {
        for (const apiProduct of bundle.Products || []) {
          const stockcode = apiProduct.Stockcode?.toString();
          if (!stockcode) continue;
          if (seenStockcodes.has(stockcode)) {
            duplicateApiProducts++;
            continue;
          }
          seenStockcodes.add(stockcode);
          newApiProducts++;
          const product = this.convertApiProduct(apiProduct, category.name);
          if (product) pageProducts.push(product);
        }
      }

      this.logger.info(
        `${category.name}: page ${pageNumber} → ${pageProducts.length} new products (${duplicateApiProducts} duplicates, total ${totalRecordCount})`
      );

      if (this.onPageScraped && pageProducts.length > 0) {
        const saved = await this.onPageScraped(pageProducts, {
          categoryId: category.id,
          categoryName: category.name,
          pageNumber,
          totalProductsOnPage: pageProducts.length,
        });
        this.logger.info(
          `${category.name} page ${pageNumber}: saved ${saved}/${pageProducts.length}`
        );
      }

      products.push(...pageProducts);
      this.productsScraped += pageProducts.length;

      if (newApiProducts === 0) {
        consecutivePagesWithoutNewProducts++;
        if (consecutivePagesWithoutNewProducts >= STOP_AFTER_DUPE_PAGES) {
          this.logger.info(
            `${category.name}: stopping at page ${pageNumber} after ${consecutivePagesWithoutNewProducts} consecutive pages with no new products (end of real catalog)`
          );
          break;
        }
      } else {
        consecutivePagesWithoutNewProducts = 0;
      }

      pageNumber++;
      await this.page?.waitForTimeout(this.config.waitTimes.betweenPages || 400);
    }

    return products;
  }

  private async fetchCategoryPage(
    category: CategoryConfig,
    pageNumber: number
  ): Promise<WoolworthsCategoryResponse | null> {
    if (!this.page) throw new Error('Page not initialized');

    const body = {
      categoryId: category.id,
      pageNumber,
      pageSize: this.PAGE_SIZE,
      sortType: 'TraderRelevance',
      url: category.url,
      location: category.url,
      formatObject: JSON.stringify({ name: category.name }),
      isSpecial: false,
      isBundle: false,
      isMobile: false,
      filters: [],
      token: '',
      gpBoost: 0,
      isHideUnavailableProducts: false,
      isRegisteredRewardCardPromotion: null,
      enableAdReRanking: false,
      groupEdmVariants: true,
      categoryVersion: 'v2',
    };

    // Issue the request from inside the real browser context (page.evaluate) rather
    // than via Playwright's APIRequestContext: the latter is fingerprinted/blocked
    // by Akamai Bot Manager on woolworths.com.au and times out.
    return this.retryOnFailure(async () => {
      const result = await this.page!.evaluate(
        async ({ url, body }) => {
          const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
          });
          const text = await res.text();
          return { status: res.status, ok: res.ok, body: text };
        },
        { url: this.API_URL, body }
      );

      if (!result.ok) {
        throw new Error(
          `Woolworths API ${result.status} for ${category.name} p${pageNumber}`
        );
      }

      return JSON.parse(result.body) as WoolworthsCategoryResponse;
    }, `fetchCategoryPage ${category.name} p${pageNumber}`);
  }

  private convertApiProduct(
    p: WoolworthsProduct,
    categoryName: string
  ): ProductData | null {
    if (p.Price == null || !p.Name) return null;

    const isOnSale =
      !!p.IsOnSpecial || (p.WasPrice != null && p.WasPrice > p.Price);
    const originalPrice =
      p.WasPrice != null && p.WasPrice > p.Price ? p.WasPrice : undefined;

    const slug = p.UrlFriendlyName || `${p.Stockcode}`;
    const productUrl = `${this.config.baseUrl}/shop/productdetails/${p.Stockcode}/${slug}`;
    const imageUrl =
      p.LargeImageFile || p.MediumImageFile || p.SmallImageFile || undefined;

    const { unit, unitQuantity } = this.parsePackageSize(
      p.PackageSize || '',
      p.Unit || '',
      p.CupMeasure || ''
    );

    return {
      name: p.DisplayName || p.Name,
      price: p.Price,
      currency: 'AUD',
      originalPrice,
      isOnSale,
      imageUrl,
      productUrl,
      externalId: p.Stockcode.toString(),
      brand: p.Brand || undefined,
      unit,
      unitQuantity,
      description: p.Description || undefined,
      categoryName,
      isAvailable: p.IsAvailable !== false && p.IsInStock !== false,
    };
  }

  /**
   * Woolworths exposes pack info across three fields:
   *   PackageSize  e.g. "200g", "1.25 Litre", "each", "10 Pack"
   *   Unit         e.g. "Each", "Per 1Kg"
   *   CupMeasure   e.g. "100G", "1L", "1EA"
   * Try them in order until we get a usable (unit, quantity) pair.
   */
  private parsePackageSize(
    packageSize: string,
    unit: string,
    cupMeasure: string
  ): { unit?: string; unitQuantity?: number } {
    for (const candidate of [packageSize, cupMeasure, unit]) {
      const parsed = this.parseSizeString(candidate);
      if (parsed.unit) return parsed;
    }
    return {};
  }

  private parseSizeString(text: string): { unit?: string; unitQuantity?: number } {
    if (!text) return {};
    const cleaned = text.toLowerCase().trim().replace(/^per\s+/, '');

    const multiPack = cleaned.match(
      /(\d+)\s*(?:x|pack|pk)\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter)\b/
    );
    if (multiPack) {
      const count = parseInt(multiPack[1], 10);
      const size = parseFloat(multiPack[2]);
      return this.normalizeUnit(multiPack[3], count * size);
    }

    const standard = cleaned.match(
      /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter|ea)\b/
    );
    if (standard) {
      return this.normalizeUnit(standard[2], parseFloat(standard[1]));
    }

    const piecesWithCount = cleaned.match(/(\d+)\s*(pack|pk|pieces?|pcs?)\b/);
    if (piecesWithCount) {
      return { unit: 'pieces', unitQuantity: parseInt(piecesWithCount[1], 10) };
    }

    if (/\b(each|ea)\b/.test(cleaned)) {
      return { unit: 'pieces', unitQuantity: 1 };
    }

    return {};
  }

  private normalizeUnit(
    rawUnit: string,
    quantity: number
  ): { unit?: string; unitQuantity?: number } {
    switch (rawUnit) {
      case 'kg':
        return { unit: 'kg', unitQuantity: quantity };
      case 'g':
        return quantity >= 1000
          ? { unit: 'kg', unitQuantity: quantity / 1000 }
          : { unit: 'g', unitQuantity: quantity };
      case 'l':
      case 'litre':
      case 'liter':
        return { unit: 'l', unitQuantity: quantity };
      case 'ml':
        return quantity >= 1000
          ? { unit: 'l', unitQuantity: quantity / 1000 }
          : { unit: 'ml', unitQuantity: quantity };
      case 'ea':
        return { unit: 'pieces', unitQuantity: quantity };
      default:
        return { unit: rawUnit, unitQuantity: quantity };
    }
  }

  async scrapeProductDetails(url: string): Promise<ProductData> {
    throw new Error(
      `scrapeProductDetails not implemented for Woolworths (API-based scraper). URL: ${url}`
    );
  }

  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Woolworths AU API scraper...');
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
      this.page = null;
    }
    this.logger.info('Woolworths AU scraping completed:', this.getStats());
  }
}
