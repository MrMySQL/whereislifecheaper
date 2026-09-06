jest.mock('../../../config/env', () => ({ config: { scraper: { headless: true, maxRetries: 1, timeout: 1000 } } }));
jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import { MercadonaScraper, mercadonaConfig } from '../MercadonaScraper';
import { ScraperConfig } from '../../../types/scraper.types';
import { Page } from 'playwright';

/** One category whose API answers with the given HTTP status. */
class FixtureScraper extends MercadonaScraper {
  constructor(status: number, statusText: string) {
    super({
      ...mercadonaConfig,
      supermarketId: '1',
      categories: [{ id: '833', name: 'Turrones', url: '/categories/833/' }],
      waitTimes: { pageLoad: 0, dynamicContent: 0, betweenRequests: 0, betweenPages: 0 },
    } as ScraperConfig);
    this.page = {
      request: {
        get: async () => ({
          ok: () => status >= 200 && status < 300,
          status: () => status,
          statusText: () => statusText,
          json: async () => ({}),
        }),
      },
    } as unknown as Page;
  }
}

describe('MercadonaScraper category accounting', () => {
  it('records the HTTP status a category was lost to', async () => {
    // The seasonal Turrones category answers 410 Gone for most of the year.
    // "API returned no data" could not be told apart from a block; the
    // status has to reach the run report.
    const scraper = new FixtureScraper(410, 'Gone');

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(scraper.getCategoryErrors()[0].message).toMatch(/Turrones.*HTTP 410 Gone/);
    expect(scraper.getErrors()).toEqual([]);
  });

  it('records a 2xx body with neither products nor categories as a lost category', async () => {
    const scraper = new FixtureScraper(200, 'OK');

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(scraper.getCategoryErrors()[0].message).toMatch(/no products or categories array/);
  });
});
