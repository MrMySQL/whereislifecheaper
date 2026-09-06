jest.mock('../../../config/env', () => ({ config: { scraper: { headless: true, maxRetries: 1, timeout: 1000 } } }));
jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import { MigrosScraper, migrosConfig } from '../MigrosScraper';
import { ScraperConfig } from '../../../types/scraper.types';
import { Page } from 'playwright';

type ApiAnswer = { successful: boolean; data?: unknown } | { httpStatus: number };

/** One category; each request answers with the next entry, the last repeating. */
class FixtureScraper extends MigrosScraper {
  constructor(answers: ApiAnswer[]) {
    super({
      ...migrosConfig,
      supermarketId: '1',
      categories: [{ id: 'fruit', name: 'Fruit', url: '/fruit' }],
      waitTimes: { pageLoad: 0, dynamicContent: 0, betweenRequests: 0, betweenPages: 0 },
    } as ScraperConfig);
    const queue = [...answers];
    this.page = {
      request: {
        get: async () => {
          const answer = (queue.length > 1 ? queue.shift() : queue[0]) as ApiAnswer;
          const status = 'httpStatus' in answer ? answer.httpStatus : 200;
          return {
            ok: () => status < 400,
            status: () => status,
            statusText: () => (status === 503 ? 'Service Unavailable' : 'OK'),
            json: async () => answer,
          };
        },
      },
    } as unknown as Page;
  }
}

const item = (sku: string) => ({
  sku, name: 'Elma Golden Kg', prettyName: `elma-${sku}`, status: 'IN_SALE',
  shownPrice: 10495, regularPrice: 10495, discountRate: 0, unit: 'GRAM', unitAmount: 1000,
});
const page = (items: unknown[], pageCount = 1) => ({
  successful: true,
  data: { searchInfo: { pageCount, hitCount: items.length, storeProductInfos: items } },
});

describe('MigrosScraper category accounting', () => {
  it('reports the category lost when the API answers unsuccessful for its first page', async () => {
    // Before this, an unsuccessful first page was a logger.warn and an empty
    // array: invisible to categoriesFailed, so a run that lost every
    // category to it could still be recorded as healthy.
    const scraper = new FixtureScraper([{ successful: false }]);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(scraper.getCategoryErrors()[0].message).toMatch(/Fruit.*unsuccessful/);
    expect(scraper.getErrors()).toEqual([]);
  });

  it('records the HTTP status when the first page request fails', async () => {
    const scraper = new FixtureScraper([{ httpStatus: 503 }]);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(scraper.getCategoryErrors()[0].message).toMatch(/Fruit.*HTTP 503 Service Unavailable/);
    expect(scraper.getCategoryErrors()[0].productUrl).toMatch(/\/fruit-c-\d+$|fruit$/);
    expect(scraper.getErrors()).toEqual([]);
  });

  it('reports the category lost when the first page has no products array', async () => {
    const malformed = { successful: true, data: { searchInfo: { pageCount: 1, hitCount: 0 } } };
    const scraper = new FixtureScraper([malformed]);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(scraper.getCategoryErrors()[0].message).toMatch(/no products array/);
  });

  it.each([
    ['missing data', undefined],
    ['null data', null],
    ['missing searchInfo', {}],
    ['null searchInfo', { searchInfo: null }],
    ['missing page count', { searchInfo: { hitCount: 1, storeProductInfos: [item('a')] } }],
  ])('keeps the request URL when a successful response has %s', async (_label, data) => {
    const scraper = new FixtureScraper([{ successful: true, data }]);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(scraper.getErrors()).toEqual([]);
    expect(scraper.getCategoryErrors()[0]).toEqual(expect.objectContaining({
      productUrl: 'https://www.migros.com.tr/rest/search/screens/fruit',
      message: expect.stringMatching(/Unexpected API response/),
    }));
  });

  it('keeps earlier products and the page URL when a later response is malformed', async () => {
    const scraper = new FixtureScraper([page([item('a')], 2), { successful: true, data: {} }]);

    const products = await scraper.scrapeProductList();

    expect(products).toHaveLength(1);
    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(scraper.getCategoryErrors()).toEqual([]);
    expect(scraper.getErrors()[0]).toEqual(expect.objectContaining({
      productUrl: 'https://www.migros.com.tr/rest/search/screens/fruit?sayfa=2',
      message: expect.stringMatching(/Unexpected API response/),
    }));
  });

  it('keeps a category that lost a later page, with the page error on record', async () => {
    const scraper = new FixtureScraper([page([item('a')], 2), { successful: false }]);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(scraper.getCategoryErrors()).toEqual([]);
    expect(scraper.getErrors().map(e => e.message)).toEqual([
      expect.stringMatching(/page 2 of Fruit/),
    ]);
  });
});
