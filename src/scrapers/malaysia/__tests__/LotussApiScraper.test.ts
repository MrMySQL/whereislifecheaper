import { LotussApiScraper } from '../LotussApiScraper';
import { CategoryConfig, ProductData, ScraperConfig } from '../../../types/scraper.types';

jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

const CATEGORY: CategoryConfig = { id: '3189', name: 'Fresh Produce', url: 'fresh-produce' };

function apiProduct(sku: number) {
  return {
    id: sku,
    sku: String(sku),
    urlKey: `product-${sku}`,
    name: `PRODUCT ${sku}`,
    stockStatus: 'IN_STOCK',
    sellingType: 'qty',
    weightPerPiece: 0,
    unitOfWeight: 'Each',
    unitOfQuantity: 'Each',
    priceRange: {
      minimumPrice: {
        regularPrice: { value: 6.99, currency: 'MYR' },
        finalPrice: { value: 6.99, currency: 'MYR' },
        discount: { amountOff: 0, percentOff: 0 },
      },
    },
    breadcrumb: [{ id: 3189, name: 'Fresh Produce', urlKey: 'fresh-produce' }],
  };
}

function config(): ScraperConfig {
  return {
    supermarketId: '221',
    name: 'Lotuss',
    baseUrl: 'https://api-o2o.lotuss.com.my/lotuss-mobile-bff',
    categories: [CATEGORY],
    selectors: { productCard: '', productName: '', productPrice: '' },
    waitTimes: { pageLoad: 0, dynamicContent: 0, betweenRequests: 0 },
    maxRetries: 1,
    concurrentPages: 1,
  };
}

/**
 * Stands in for Playwright's page. Only `request.get` is exercised: the scraper
 * must not need a DOM. `pages` is keyed by the offset the scraper asks for, so a
 * test can assert exactly which offsets were requested.
 */
function fakePage(pages: Record<number, unknown[] | 'error'>) {
  const requested: number[] = [];
  return {
    requested,
    request: {
      get: jest.fn(async (url: string) => {
        const q = JSON.parse(decodeURIComponent(url.split('q=')[1]));
        const offset = q.offset ?? 0;
        requested.push(offset);
        const body = pages[offset];
        if (body === 'error') {
          return { ok: () => false, status: () => 500, statusText: () => 'Server Error', json: async () => ({}) };
        }
        // Past the end the API repeats its last page rather than returning [].
        const products = body ?? pages[Math.max(...Object.keys(pages).map(Number))] ?? [];
        return { ok: () => true, status: () => 200, statusText: () => 'OK', json: async () => ({ data: { products } }) };
      }),
    },
  };
}

function build(pages: Record<number, unknown[] | 'error'>) {
  const scraper = new LotussApiScraper(config());
  const page = fakePage(pages);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (scraper as any).page = page;
  const saved: ProductData[] = [];
  scraper.setOnPageScrapedCallback(async (products) => {
    saved.push(...products);
    return products.length;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scrapeCategory = (scraper as any).scrapeCategory.bind(scraper) as (c: CategoryConfig) => Promise<ProductData[]>;
  return { scraper, page, saved, scrapeCategory };
}

describe('LotussApiScraper category pagination', () => {
  it('walks offsets until a short page and returns every product', async () => {
    const { page, saved, scrapeCategory } = build({
      0: Array.from({ length: 100 }, (_, i) => apiProduct(1000 + i)),
      100: Array.from({ length: 100 }, (_, i) => apiProduct(2000 + i)),
      200: Array.from({ length: 42 }, (_, i) => apiProduct(3000 + i)),
    });

    const products = await scrapeCategory(CATEGORY);

    expect(page.requested).toEqual([0, 100, 200]);
    expect(products).toHaveLength(242);
    expect(saved).toHaveLength(242);
  });

  it('stops when the API repeats a page instead of ending', async () => {
    // Only offset 0 is defined, so every later offset replays it — the real
    // API's behaviour once you page past the end of a category.
    const { page, scrapeCategory } = build({
      0: Array.from({ length: 100 }, (_, i) => apiProduct(1000 + i)),
    });

    const products = await scrapeCategory(CATEGORY);

    expect(products).toHaveLength(100);
    expect(page.requested.length).toBeLessThanOrEqual(2);
  });

  it('keeps the products it already has when a later page fails', async () => {
    const { saved, scrapeCategory } = build({
      0: Array.from({ length: 100 }, (_, i) => apiProduct(1000 + i)),
      100: 'error',
    });

    const products = await scrapeCategory(CATEGORY);

    expect(products).toHaveLength(100);
    expect(saved).toHaveLength(100);
  });

  it('records an error when a page request fails, so the run cannot report clean', async () => {
    const { scraper, scrapeCategory } = build({ 0: 'error' });

    const products = await scrapeCategory(CATEGORY);

    expect(products).toHaveLength(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((scraper as any).errors.length).toBeGreaterThan(0);
  });

  it('returns an empty category without recording an error', async () => {
    const { scraper, scrapeCategory } = build({ 0: [] });

    const products = await scrapeCategory(CATEGORY);

    expect(products).toHaveLength(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((scraper as any).errors).toHaveLength(0);
  });
});
