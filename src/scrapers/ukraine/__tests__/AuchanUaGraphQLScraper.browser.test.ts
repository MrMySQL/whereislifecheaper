jest.mock('../../../config/env', () => ({
  config: { scraper: { headless: true, maxRetries: 0, timeout: 1000, proxyConfig: new Map() } },
}));
jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

const launch = jest.fn();
jest.mock('playwright', () => ({
  chromium: { launch: (...args: unknown[]) => launch(...args) },
}));

import * as fs from 'fs';
import * as path from 'path';
import {
  AuchanUaGraphQLScraper,
  auchanUaGraphQLConfig,
  auchanUaGraphQLCategories,
  GraphQLHttpResponse,
} from '../AuchanUaGraphQLScraper';
import { ScraperConfig } from '../../../types/scraper.types';

const BLOCK_PAGE = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'cloudflare-block-403.html'),
  'utf8'
);

const JSON_PAGE: GraphQLHttpResponse = {
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    data: {
      search: {
        page_info: { page_size: 100, total_pages: 1 },
        items: [
          {
            id: 1,
            sku: '100',
            name: 'Молоко 2.5% 1 л',
            url_key: 'moloko',
            stock_status: 'IN_STOCK',
            thumbnail: null,
            price_range: {
              minimum_price: { regular_price: { value: 49.9 }, final_price: { value: 49.9 } },
            },
          },
        ],
      },
    },
  }),
};

/**
 * Stands in for the Chromium that BaseScraper.launchBrowser() starts. Only the
 * page surface the scraper touches is implemented; `evaluate` never runs the
 * function it is given (that would fetch for real) and instead returns what
 * the in-page fetch would have produced.
 */
function fakeBrowser(response: GraphQLHttpResponse) {
  const page = {
    goto: jest.fn().mockResolvedValue({ status: () => 200 }),
    content: jest.fn().mockResolvedValue('<html></html>'),
    evaluate: jest.fn().mockResolvedValue(response),
    setExtraHTTPHeaders: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    context: () => ({ addCookies: jest.fn() }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newPage: jest.fn().mockResolvedValue(page),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { browser, page };
}

function scraperWith(response: GraphQLHttpResponse) {
  const fake = fakeBrowser(response);
  launch.mockResolvedValue(fake.browser);
  const scraper = new AuchanUaGraphQLScraper({
    ...auchanUaGraphQLConfig,
    supermarketId: '1',
    maxRetries: 0,
  } as ScraperConfig);
  const category = auchanUaGraphQLCategories[0];
  return {
    ...fake,
    scraper,
    // scrapeCategory is protected; reach it the way BaseScraper does.
    scrapeCategory: () => (scraper as unknown as { scrapeCategory: (c: typeof category) => Promise<unknown[]> }).scrapeCategory(category),
  };
}

beforeEach(() => launch.mockReset());

describe('AuchanUaGraphQLScraper issues GraphQL requests from a real browser page', () => {
  // express.auchan.ua sits behind a Cloudflare rule that 403s anything with a
  // non-browser TLS/HTTP signature: node https, curl with browser headers, and
  // Playwright's APIRequestContext (with or without browser cookies) all get
  // the 1020 page, while a fetch issued inside a Chromium page gets JSON
  // (measured 2026-09-06 from the same IP).

  it('opens the storefront in a browser during initialize', async () => {
    const { scraper, page } = scraperWith(JSON_PAGE);

    await scraper.initialize();

    expect(launch).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith('https://express.auchan.ua/', expect.anything());
  });

  it('posts the query through page.evaluate on the storefront origin', async () => {
    const { scraper, page, scrapeCategory } = scraperWith(JSON_PAGE);
    await scraper.initialize();

    const products = (await scrapeCategory()) as Array<{ name: string }>;

    expect(products.map((p) => p.name)).toEqual(['Молоко 2.5% 1 л']);
    expect(page.evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        url: 'https://express.auchan.ua/graphql/',
        body: expect.stringContaining('getCategoryProducts'),
      })
    );
  });

  it('still names a block that arrives through the browser', async () => {
    const { scraper, scrapeCategory } = scraperWith({
      status: 403,
      contentType: 'text/html; charset=UTF-8',
      body: BLOCK_PAGE,
    });
    await scraper.initialize();

    await expect(scrapeCategory()).rejects.toThrow(/Cloudflare.*403|403.*Cloudflare/);
  });

  it('names a block that already hits the storefront navigation', async () => {
    const { scraper, page } = scraperWith(JSON_PAGE);
    page.goto.mockResolvedValue({ status: () => 403 });
    page.content.mockResolvedValue(BLOCK_PAGE);

    await expect(scraper.initialize()).rejects.toThrow(/Cloudflare.*403|403.*Cloudflare/);
  });

  it('refuses to scrape before initialize has opened a page', async () => {
    const { scrapeCategory } = scraperWith(JSON_PAGE);

    await expect(scrapeCategory()).rejects.toThrow(/not initialized/i);
  });

  it('closes the browser on cleanup', async () => {
    const { scraper, browser } = scraperWith(JSON_PAGE);
    await scraper.initialize();

    await scraper.cleanup();

    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
