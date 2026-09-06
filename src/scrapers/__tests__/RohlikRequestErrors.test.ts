jest.mock('../../config/env', () => ({ config: { scraper: { headless: true, maxRetries: 1, timeout: 1000 } } }));
jest.mock('../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import { Page } from 'playwright';
import { SezamoScraper, sezamoConfig } from '../romania/SezamoScraper';
import { KnusprScraper, knusprConfig } from '../germany/KnusprScraper';
import { ScraperConfig } from '../../types/scraper.types';

const stores = [
  { name: 'Sezamo', Scraper: SezamoScraper, config: sezamoConfig, base: 'https://www.sezamo.ro/api/v1' },
  { name: 'Knuspr', Scraper: KnusprScraper, config: knusprConfig, base: 'https://www.knuspr.de/api/v1' },
];

const failures = [
  { kind: 'HTTP', message: 'HTTP 503 Service Unavailable' },
  { kind: 'JSON', message: 'unreadable JSON: Unexpected token <' },
  { kind: 'network', message: 'socket hang up' },
];

function json(body: unknown) {
  return { ok: () => true, json: async () => body };
}

function failedResponse(kind: string) {
  if (kind === 'network') throw new Error('socket hang up');
  if (kind === 'JSON') {
    return { ok: () => true, json: async () => { throw new SyntaxError('Unexpected token <'); } };
  }
  return { ok: () => false, status: () => 503, statusText: () => 'Service Unavailable' };
}

function fixture(store: typeof stores[number], failedUrl: string, failure: string, laterPage = false) {
  const scraper = new store.Scraper({
    ...store.config,
    supermarketId: '1',
    categories: [{ id: '42', name: 'Fruit', url: '/fruit' }],
    waitTimes: { pageLoad: 0, dynamicContent: 0, betweenRequests: 0, betweenPages: 0 },
  } as ScraperConfig);
  const ids = laterPage ? Array.from({ length: 50 }, (_, index) => index + 1) : [1];
  const products = ids.map(id => ({
    id, name: `Apple ${id}`, slug: `apple-${id}`, mainCategoryId: 42,
    unit: 'kg', textualAmount: '1 kg', badges: [], archived: false,
    premiumOnly: false, brand: null, images: [], weightedItem: false,
  }));
  const prices = ids.map(productId => ({
    productId, price: { amount: 2, currency: 'EUR' },
    pricePerUnit: { amount: 2, currency: 'EUR' }, sales: [],
  }));
  const page = {
    request: {
      get: async (url: string) => {
        if (url === failedUrl) return failedResponse(failure);
        const endpoint = new URL(url);
        if (endpoint.pathname === '/api/v1/categories/normal/42/products') {
          return json({
            categoryId: 42, categoryType: 'normal',
            productIds: endpoint.searchParams.get('page') === '0' ? ids : [],
            pageable: { pageNumber: 0, pageSize: 50, offset: 0, paged: true },
          });
        }
        if (endpoint.pathname === '/api/v1/products') return json(products);
        if (endpoint.pathname === '/api/v1/products/prices') return json(prices);
        throw new Error(`Unexpected request: ${url}`);
      },
    },
    waitForTimeout: async () => {},
  } as unknown as Page;
  Object.assign(scraper, { page });
  return scraper;
}

describe.each(stores)('$name request error attribution', store => {
  it.each(failures)('keeps the first category page URL and $kind cause when the category is lost', async failure => {
    const failedUrl = `${store.base}/categories/normal/42/products?page=0&size=50&sort=recommended&filter=`;
    const scraper = fixture(store, failedUrl, failure.kind);

    expect(await scraper.scrapeProductList()).toEqual([]);

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(scraper.getErrors()).toEqual([]);
    expect(scraper.getCategoryErrors()).toEqual([
      expect.objectContaining({ productUrl: failedUrl, message: expect.stringContaining(failure.message) }),
    ]);
  });

  it.each(failures)('keeps products and records the later category page URL and $kind cause', async failure => {
    const failedUrl = `${store.base}/categories/normal/42/products?page=1&size=50&sort=recommended&filter=`;
    const scraper = fixture(store, failedUrl, failure.kind, true);

    const products = await scraper.scrapeProductList();

    expect(products).toHaveLength(50);
    expect(products[0]).toMatchObject({ externalId: '1', name: 'Apple 1', price: 2 });
    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(scraper.getCategoryErrors()).toEqual([]);
    expect(scraper.getErrors()).toEqual([
      expect.objectContaining({ productUrl: failedUrl, message: expect.stringContaining(failure.message) }),
    ]);
  });

  describe.each(['products', 'products/prices'])('%s batch failures', endpoint => {
    it.each(failures)('preserves the exact $kind failure URL through category accounting', async failure => {
      const failedUrl = `${store.base}/${endpoint}?products=1`;
      const scraper = fixture(store, failedUrl, failure.kind);

      expect(await scraper.scrapeProductList()).toEqual([]);

      expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
      expect(scraper.getErrors()).toEqual([
        expect.objectContaining({ productUrl: failedUrl, message: expect.stringContaining(failure.message) }),
      ]);
      expect(scraper.getCategoryErrors()).toEqual([
        expect.objectContaining({ productUrl: failedUrl, message: expect.stringContaining(failure.message) }),
      ]);
    });
  });
});
