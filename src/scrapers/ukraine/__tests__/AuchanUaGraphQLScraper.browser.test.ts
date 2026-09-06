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

const CHALLENGE_PAGE = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>
<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=a36a86f48add70a9"></script>
</head><body><div id="challenge-running">Checking your browser</div></body></html>`;

// The real <title> of https://express.auchan.ua/ as loaded in Chromium on
// 2026-09-06. "ДОДОму" is Auchan's own delivery brand name.
const STOREFRONT_PAGE =
  '<html><head><title>ДОДОму — швидка доставка продуктів у Києві, Львові, Дніпрі, Одесі | Auchan Україна</title></head></html>';

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

function scraperWith(response: GraphQLHttpResponse, overrides: Partial<ScraperConfig> = {}) {
  const fake = fakeBrowser(response);
  launch.mockResolvedValue(fake.browser);
  const scraper = new AuchanUaGraphQLScraper({
    ...auchanUaGraphQLConfig,
    supermarketId: '1',
    maxRetries: 0,
    ...overrides,
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
    expect(page.goto).toHaveBeenCalledWith('https://express.auchan.ua/', {
      waitUntil: 'domcontentloaded',
      timeout: 1000, // config.scraper.timeout from the env mock above
    });
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
        timeoutMs: 30000,
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
    // A 1020 block never clears on its own: no settle wait, one snapshot.
    expect(page.content).toHaveBeenCalledTimes(1);
  });

  it('waits for a managed challenge to clear instead of failing on the interstitial', async () => {
    // A real browser auto-solves "Just a moment..." a few seconds after
    // domcontentloaded, then navigates to the storefront. The first snapshot
    // still shows the interstitial; that is not a failure yet.
    const { scraper, page } = scraperWith(JSON_PAGE);
    page.goto.mockResolvedValue({ status: () => 503 });
    page.content
      .mockResolvedValueOnce(CHALLENGE_PAGE)
      .mockRejectedValueOnce(new Error('Execution context was destroyed, most likely because of a navigation'))
      .mockResolvedValue(STOREFRONT_PAGE);

    await scraper.initialize();

    expect(page.goto).toHaveBeenCalledTimes(1);
  });

  it('tolerates the auto-solve navigation landing on the very first snapshot', async () => {
    const { scraper, page } = scraperWith(JSON_PAGE);
    page.goto.mockResolvedValue({ status: () => 503 });
    page.content
      .mockRejectedValueOnce(new Error('Execution context was destroyed, most likely because of a navigation'))
      .mockResolvedValue(STOREFRONT_PAGE);

    await scraper.initialize();

    expect(page.goto).toHaveBeenCalledTimes(1);
  });

  it('names a challenge that persists past the settle window', async () => {
    // Cloudflare usually sends challenges as 403/503, but the body is the
    // reliable signal, and goto() can also return no response object at all.
    const { scraper, page } = scraperWith(JSON_PAGE);
    page.goto.mockResolvedValue({ status: () => 200 });
    page.content.mockResolvedValue(CHALLENGE_PAGE);

    await expect(scraper.initialize()).rejects.toThrow(/Cloudflare challenge/);
    expect(page.content.mock.calls.length).toBeGreaterThan(1);
  });

  it('retries a transient failure of the storefront navigation', async () => {
    const { scraper, page } = scraperWith(JSON_PAGE, { maxRetries: 1 });
    page.goto
      .mockRejectedValueOnce(new Error('page.goto: net::ERR_CONNECTION_RESET'))
      .mockResolvedValueOnce({ status: () => 200 });

    await scraper.initialize();

    expect(page.goto).toHaveBeenCalledTimes(2);
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
