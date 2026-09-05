import { BaseScraper } from '../base/BaseScraper';
import { ProductData, ScraperConfig, CategoryConfig } from '../../types/scraper.types';
import { BrowserContext, chromium } from 'playwright';
import * as path from 'path';
import * as os from 'os';

// Coles is fronted by Imperva Incapsula. Incapsula's fingerprinter flags
// the playwright-extra/stealth overrides AND it flags persistent contexts
// (the cookie+cache state of a returning headless profile is itself a
// signal). A vanilla `chromium.launch()` + fresh context — same shape as
// playwright-mcp — passes the JS challenge cleanly.

/**
 * Coles AU top-level grocery categories.
 * IDs are the URL slugs (e.g. /browse/{slug}); they double as the category
 * key passed to the Next.js data endpoint.
 *
 * Excluded: Liquorland (separate brand), Tobacco (restricted), and marketing
 * landing pages (Down Down, Big Pack Value, Bonus Credit, Back to School).
 */
export const colesCategories: CategoryConfig[] = [
  { id: 'meat-seafood', name: 'Meat & Seafood', url: '/browse/meat-seafood' },
  { id: 'fruit-vegetables', name: 'Fruit & Vegetables', url: '/browse/fruit-vegetables' },
  { id: 'dairy-eggs-fridge', name: 'Dairy, Eggs & Fridge', url: '/browse/dairy-eggs-fridge' },
  { id: 'bakery', name: 'Bakery', url: '/browse/bakery' },
  { id: 'deli', name: 'Deli', url: '/browse/deli' },
  { id: 'pantry', name: 'Pantry', url: '/browse/pantry' },
  { id: 'dietary-world-foods', name: 'Dietary & World Foods', url: '/browse/dietary-world-foods' },
  { id: 'chips-chocolates-snacks', name: 'Chips, Chocolates & Snacks', url: '/browse/chips-chocolates-snacks' },
  { id: 'drinks', name: 'Drinks', url: '/browse/drinks' },
  { id: 'frozen', name: 'Frozen', url: '/browse/frozen' },
  { id: 'cleaning-laundry', name: 'Cleaning & Laundry', url: '/browse/cleaning-laundry' },
  { id: 'health-beauty', name: 'Health & Beauty', url: '/browse/health-beauty' },
  { id: 'baby', name: 'Baby', url: '/browse/baby' },
  { id: 'pet', name: 'Pet', url: '/browse/pet' },
  { id: 'home-garden', name: 'Home & Garden', url: '/browse/home-garden' },
];

export const colesConfig: Partial<ScraperConfig> = {
  name: 'Coles',
  baseUrl: 'https://www.coles.com.au',
  categories: colesCategories,
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
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  ],
};

interface ColesImageUri {
  altText?: string;
  type?: string;
  uri: string;
}

interface ColesPricingUnit {
  quantity?: number;
  ofMeasureQuantity?: number;
  ofMeasureUnits?: string;
  ofMeasureType?: string | null;
  price?: number;
  isWeighted?: boolean;
  isIncremental?: boolean;
}

interface ColesPricing {
  now: number | null;
  was: number | null;
  unit?: ColesPricingUnit;
  comparable?: string;
  promotionType?: string | null;
  onlineSpecial?: boolean;
  saveAmount?: number | null;
}

interface ColesProduct {
  _type: string; // 'PRODUCT' for catalog items
  id: number;
  name: string;
  brand?: string | null;
  description?: string;
  size?: string;
  availability: boolean;
  availabilityType?: string;
  imageUris?: ColesImageUri[];
  pricing?: ColesPricing;
  adId?: string | null;
}

interface ColesSearchResults {
  noOfResults: number;
  start: number;
  pageSize: number;
  results: ColesProduct[];
}

interface ColesPageData {
  pageProps: {
    searchResults?: ColesSearchResults;
  };
}

/**
 * Reverse-engineering notes for Coles AU (coles.com.au).
 *
 * The site exposes a real GraphQL endpoint at POST /api/graphql with
 * operations such as `GetCrossCategory`, `GetProductDetails`, and
 * `GetProductSearchSuggestions`. However, the *catalog browse* listings
 * are NOT exposed via GraphQL — they are server-rendered by Next.js and
 * hydrated through the standard Next.js data endpoint:
 *
 *   GET /_next/data/{buildId}/en/browse/{slug}.json?slug={slug}&page={N}
 *
 * That endpoint returns the same `searchResults.results` array that
 * Coles' web app renders, with `noOfResults`, `pageSize` (48), `start`,
 * and full product objects (id, name, brand, size, availability, pricing,
 * imageUris, etc.). It is what powers every ?page=N navigation on the
 * site, so it is the closest thing to a public API for the catalog.
 *
 * The buildId is published as `window.__NEXT_DATA__.buildId`; we read it
 * once per scrape session by loading any browse page in a real browser
 * (which is also required to satisfy Akamai Bot Manager's `_abck` cookie).
 */
export class ColesScraper extends BaseScraper {
  private readonly IMAGE_CDN = 'https://cdn.productimages.coles.com.au/productimages';
  private buildId: string | null = null;
  private browserContext: BrowserContext | null = null;
  private connectedOverCdp = false;

  constructor(config: ScraperConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Coles AU scraper (stealth)...');
    this.startTime = Date.now();

    await this.launchStealthBrowser();

    this.logger.info('Establishing Coles session (Incapsula challenge)...');
    await this.solveIncapsulaChallenge();
    await this.handleCookieConsent();
    await this.page!.waitForTimeout(1000);

    this.buildId = await this.extractBuildId();
    if (!this.buildId) {
      throw new Error('Failed to extract Next.js buildId from coles.com.au');
    }
    this.logger.info(`Coles AU scraper initialized (buildId=${this.buildId})`);
  }

  private async launchStealthBrowser(): Promise<void> {
    // Optional escape hatch: connect to an already-running Chrome over CDP
    // (e.g. one launched manually with --remote-debugging-port). Useful for
    // local dev where Incapsula keeps challenging fresh automation profiles.
    const cdpUrl = process.env.COLES_CDP_URL;
    if (cdpUrl) {
      this.logger.info(`Connecting to existing Chrome via CDP: ${cdpUrl}`);
      const browser = await chromium.connectOverCDP(cdpUrl);
      const contexts = browser.contexts();
      this.browserContext = contexts.length > 0 ? contexts[0] : await browser.newContext();
      const pages = this.browserContext.pages();
      this.page = pages.find((p) => p.url().includes('coles.com.au')) || pages[0] || await this.browserContext.newPage();
      this.connectedOverCdp = true;
      this.logger.info('Connected over CDP');
      return;
    }

    const isHeadless = process.env.PLAYWRIGHT_HEADLESS === 'true';
    this.logger.info(`Browser mode: ${isHeadless ? 'headless' : 'headed'}`);

    // Persistent profile + system Chrome with `AutomationControlled` (the
    // *blink* feature) disabled by name (not via --disable-blink-features,
    // which Incapsula still flags). Mirrors the launch shape used by
    // @playwright/mcp, which loads coles.com.au cleanly.
    const profileDir = path.join(os.tmpdir(), 'coles-scraper-chrome-profile');
    const launchArgs = [
      ...(isHeadless ? ['--headless=new'] : []),
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-features=AutomationControlled,HttpsUpgrades,Translate,OptimizationHints,MediaRouter',
      '--no-default-browser-check',
      '--no-first-run',
    ];

    try {
      this.browserContext = await chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless: isHeadless,
        args: launchArgs,
        viewport: { width: 1920, height: 1080 },
        userAgent: this.getUserAgent(),
        locale: 'en-AU',
        timezoneId: 'Australia/Sydney',
        extraHTTPHeaders: { 'Accept-Language': 'en-AU,en;q=0.9' },
      });
      this.logger.info('Launched system Chrome (persistent profile)');
    } catch (err) {
      this.logger.warn(`System Chrome unavailable, using bundled Chromium: ${(err as Error).message}`);
      this.browserContext = await chromium.launchPersistentContext(profileDir, {
        headless: isHeadless,
        args: launchArgs,
        viewport: { width: 1920, height: 1080 },
        userAgent: this.getUserAgent(),
        locale: 'en-AU',
        timezoneId: 'Australia/Sydney',
        extraHTTPHeaders: { 'Accept-Language': 'en-AU,en;q=0.9' },
      });
    }

    // Hide the webdriver flag and a couple of other automation tells before page JS runs.
    await this.browserContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-AU', 'en'] });
    });

    const pages = this.browserContext.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browserContext.newPage();
  }

  /**
   * Coles is fronted by Imperva Incapsula. The first request returns a tiny
   * HTML page that loads `/_Incapsula_Resource?...`, which sets the
   * `incap_ses_*` / `visid_incap_*` cookies and then expects a reload to
   * deliver the real content. Loop a few times, reloading after each
   * `networkidle`, until `__NEXT_DATA__` shows up.
   */
  private async solveIncapsulaChallenge(): Promise<void> {
    if (!this.page) return;

    // Already-validated CDP session: no need to re-do the challenge.
    if (this.page.url().includes('coles.com.au')) {
      const hasNext = await this.page.evaluate(() => !!document.getElementById('__NEXT_DATA__'));
      if (hasNext) {
        this.logger.info('CDP session already past Incapsula challenge');
        return;
      }
    }

    for (let attempt = 1; attempt <= 5; attempt++) {
      const resp = await this.page.goto(`${this.config.baseUrl}/browse`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      const status = resp?.status() ?? 0;

      try {
        await this.page.waitForLoadState('networkidle', { timeout: 15000 });
      } catch {
        // OK - networkidle may not fire if long-poll connections are open
      }

      const diag = await this.page.evaluate(() => ({
        hasNext: !!document.getElementById('__NEXT_DATA__'),
        title: document.title,
        bodyLen: document.body?.innerText?.length || 0,
        scripts: Array.from(document.scripts).slice(0, 5).map(s => s.src || s.id || s.textContent?.slice(0, 60)),
      }));
      this.logger.info(`Incapsula attempt ${attempt}: status=${status} ${JSON.stringify(diag)}`);
      if (diag.hasNext) return;

      // Give the Incapsula JS extra time to complete its handshake before retrying.
      await this.page.waitForTimeout(3000);
    }
    throw new Error('Coles Incapsula challenge did not yield Next.js shell after 5 attempts');
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

  private async extractBuildId(): Promise<string | null> {
    if (!this.page) return null;
    return this.page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el || !el.textContent) return null;
      try {
        const data = JSON.parse(el.textContent);
        return data?.buildId ?? null;
      } catch {
        return null;
      }
    });
  }

  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];
    let pageNumber = 1;
    let totalPages = Infinity;

    while (pageNumber <= totalPages) {
      const response = await this.fetchCategoryPage(category, pageNumber);

      if (!response?.pageProps?.searchResults) {
        this.logger.warn(
          `${category.name}: empty/failed response on page ${pageNumber}, stopping`
        );
        break;
      }

      const sr = response.pageProps.searchResults;
      const pageSize = sr.pageSize || 48;
      totalPages = Math.max(1, Math.ceil((sr.noOfResults || 0) / pageSize));

      const pageProducts: ProductData[] = [];
      for (const apiProduct of sr.results || []) {
        const product = this.convertApiProduct(apiProduct, category.name);
        if (product) pageProducts.push(product);
      }

      this.logger.info(
        `${category.name}: page ${pageNumber}/${totalPages} → ${pageProducts.length} products (total ${sr.noOfResults})`
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

      if (pageProducts.length === 0) break;

      pageNumber++;
      await this.page?.waitForTimeout(this.config.waitTimes.betweenPages || 400);
    }

    return products;
  }

  private async fetchCategoryPage(
    category: CategoryConfig,
    pageNumber: number
  ): Promise<ColesPageData | null> {
    if (!this.page) throw new Error('Page not initialized');
    if (!this.buildId) throw new Error('buildId not initialized');

    const slug = category.id;
    const dataUrl = `${this.config.baseUrl}/_next/data/${encodeURIComponent(this.buildId)}/en/browse/${encodeURIComponent(slug)}.json?slug=${encodeURIComponent(slug)}&page=${pageNumber}`;

    // Fetch from inside the real browser context (page.evaluate). Playwright's
    // APIRequestContext is fingerprinted/blocked by Akamai Bot Manager.
    return this.retryOnFailure(async () => {
      const result = await this.page!.evaluate(
        async (url) => {
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          const text = await res.text();
          return { status: res.status, ok: res.ok, body: text };
        },
        dataUrl
      );

      // 404 most commonly means our buildId is stale (Coles redeployed).
      // Refresh it and retry once at the higher level.
      if (result.status === 404) {
        this.logger.warn(
          `Coles buildId may be stale (404 for ${slug} p${pageNumber}); refreshing`
        );
        await this.refreshBuildId();
        throw new Error(`Coles 404 - refreshed buildId, will retry`);
      }

      if (!result.ok) {
        throw new Error(`Coles data ${result.status} for ${slug} p${pageNumber}`);
      }

      return JSON.parse(result.body) as ColesPageData;
    }, `fetchCategoryPage ${category.name} p${pageNumber}`);
  }

  private async refreshBuildId(): Promise<void> {
    if (!this.page) return;
    await this.page.goto(`${this.config.baseUrl}/browse`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await this.page.waitForTimeout(2000);
    const fresh = await this.extractBuildId();
    if (fresh) {
      this.buildId = fresh;
      this.logger.info(`Refreshed Coles buildId: ${fresh}`);
    }
  }

  private convertApiProduct(
    p: ColesProduct,
    categoryName: string
  ): ProductData | null {
    if (p._type !== 'PRODUCT') return null;
    if (!p.name) return null;
    if (p.adId) return null; // skip sponsored ad slots

    const pricing = p.pricing;
    const now = pricing?.now;
    if (now == null || now <= 0) return null;

    const was = pricing?.was;
    const isOnSale =
      pricing?.promotionType === 'SPECIAL' ||
      (was != null && was > 0 && was > now);
    const originalPrice = isOnSale && was != null && was > now ? was : undefined;

    const imagePath = p.imageUris?.find((i) => i.type === 'default')?.uri
      || p.imageUris?.[0]?.uri;
    const imageUrl = imagePath ? `${this.IMAGE_CDN}${imagePath}` : undefined;

    const productUrl = `${this.config.baseUrl}/product/${p.id}`;

    const { unit, unitQuantity } = this.parsePackageInfo(p.size, pricing?.unit);

    return {
      name: p.name,
      price: now,
      currency: 'AUD',
      originalPrice,
      isOnSale,
      imageUrl,
      productUrl,
      externalId: p.id.toString(),
      brand: p.brand || undefined,
      unit,
      unitQuantity,
      description: p.description || undefined,
      categoryName,
      isAvailable: p.availability !== false,
    };
  }

  /**
   * Coles exposes pack info two ways:
   *   size  e.g. "200g", "1L", "10 Pack", "approx. 130g"
   *   pricing.unit  e.g. { quantity: 130, ofMeasureUnits: "g", isWeighted: true }
   * Try `size` first; fall back to the structured unit object.
   */
  private parsePackageInfo(
    size: string | undefined,
    pricingUnit: ColesPricingUnit | undefined
  ): { unit?: string; unitQuantity?: number } {
    const fromSize = this.parseSizeString(size || '');
    if (fromSize.unit) return fromSize;

    if (pricingUnit?.quantity && pricingUnit.ofMeasureUnits) {
      return this.normalizeUnit(
        pricingUnit.ofMeasureUnits.toLowerCase(),
        pricingUnit.quantity
      );
    }
    return {};
  }

  private parseSizeString(text: string): { unit?: string; unitQuantity?: number } {
    if (!text) return {};
    const cleaned = text.toLowerCase().trim().replace(/^approx\.?\s*/, '');

    const multiPack = cleaned.match(
      /(\d+)\s*(?:x|pack|pk)\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter)\b/
    );
    if (multiPack) {
      const count = parseInt(multiPack[1], 10);
      const sz = parseFloat(multiPack[2]);
      return this.normalizeUnit(multiPack[3], count * sz);
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
      `scrapeProductDetails not implemented for Coles (API-based scraper). URL: ${url}`
    );
  }

  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Coles AU scraper...');
    if (this.browserContext && !this.connectedOverCdp) {
      await this.browserContext.close();
    }
    this.browserContext = null;
    this.page = null;
    this.logger.info('Coles AU scraping completed:', this.getStats());
  }
}
