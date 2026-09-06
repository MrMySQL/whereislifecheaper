jest.mock('../../../config/env', () => ({ config: { scraper: { headless: true, maxRetries: 1, timeout: 1000 } } }));
jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import { Page } from 'playwright';
import { ScraperConfig } from '../../../types/scraper.types';
import { AnnamGourmetScraper, annamGourmetConfig } from '../AnnamGourmetScraper';

const firstUrl = 'https://shop.annam-gourmet.com/hn-xd/fresh-food/cheese.html?ajax=1&product_list_limit=36&p=1';
const secondUrl = 'https://shop.annam-gourmet.com/hn-xd/fresh-food/cheese.html?ajax=1&product_list_limit=36&p=2';
const noProducts = "We can't find products matching the selection";
const productHtml = `<li class="item product product-item">
  <a class="product-item-link" href="https://shop.annam-gourmet.com/cheddar.html">Cheddar 200g</a>
  <img class="product-image-photo" src="https://shop.annam-gourmet.com/cheddar.jpg">
  <span class="price">100,000₫</span>
</li>`;

type Answer = string | number | Error;

class FixtureScraper extends AnnamGourmetScraper {
  constructor() {
    super({
      ...annamGourmetConfig,
      supermarketId: 'annam',
      categories: [{ id: 'cheese', name: 'Cheese', url: 'fresh-food/cheese' }],
    } as ScraperConfig);
    this.page = {
      // Execute the production browser callback against the stub HTTP transport.
      evaluate: async (callback: (url: string) => unknown, url: string) => callback(url),
    } as unknown as Page;
  }

  protected async waitBetweenRequests(): Promise<void> {}
}

function fixture(answers: Answer[]) {
  const queue = [...answers];
  const urls: string[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    urls.push(String(input));
    const answer = queue.length > 1 ? queue.shift()! : queue[0];
    if (answer instanceof Error) throw answer;
    return typeof answer === 'number'
      ? new Response('', { status: answer, statusText: 'Service Unavailable' })
      : new Response(JSON.stringify({ html: { products_list: answer } }), { status: 200 });
  });
  return { scraper: new FixtureScraper(), urls };
}

afterEach(() => jest.restoreAllMocks());

describe('Annam Gourmet AJAX request errors', () => {
  it.each([false, true])('retains transport error details when earlier products exist: %s', async (hasProducts) => {
    const error = new TypeError('Failed to fetch: connection reset');
    const { scraper, urls } = fixture(hasProducts ? [productHtml, error] : [error]);

    expect(await scraper.scrapeProductList()).toHaveLength(hasProducts ? 1 : 0);

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: hasProducts ? 0 : 1 });
    const reported = hasProducts ? scraper.getErrors() : scraper.getCategoryErrors();
    expect(reported).toEqual([expect.objectContaining({
      productUrl: hasProducts ? secondUrl : firstUrl,
      message: expect.stringContaining('Failed to fetch: connection reset'),
      stack: error.stack,
    })]);
    // Transport errors still terminate the category immediately, as before.
    expect(urls).toEqual(hasProducts ? [firstUrl, secondUrl] : [firstUrl]);
  });

  it('retains the first exhausted HTTP failure and exact page URL in category reporting', async () => {
    const { scraper, urls } = fixture([503]);

    expect(await scraper.scrapeProductList()).toEqual([]);

    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(scraper.getCategoryErrors()).toEqual([expect.objectContaining({
      productUrl: firstUrl,
      message: expect.stringMatching(/Cheese.*HTTP 503/),
      stack: expect.stringContaining('RequestFailure: HTTP 503'),
    })]);
    expect(urls).toEqual([firstUrl, firstUrl, secondUrl, secondUrl,
      'https://shop.annam-gourmet.com/hn-xd/fresh-food/cheese.html?ajax=1&product_list_limit=36&p=3',
      'https://shop.annam-gourmet.com/hn-xd/fresh-food/cheese.html?ajax=1&product_list_limit=36&p=3']);
  });

  it('retains a failed later page as an error without losing already parsed products', async () => {
    const { scraper } = fixture([productHtml, 503, 503, noProducts]);
    const products = await scraper.scrapeProductList();

    expect(products).toEqual([expect.objectContaining({ name: 'Cheddar 200g', price: 100000 })]);
    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(scraper.getCategoryErrors()).toEqual([]);
    expect(scraper.getErrors()).toEqual([expect.objectContaining({
      productUrl: secondUrl,
      message: expect.stringContaining('HTTP 503'),
      stack: expect.stringContaining('RequestFailure: HTTP 503'),
    })]);
  });

  it.each([[503, ''], ['', 503]])('preserves the HTTP cause when paired with a blank response (%s, %s)', async (first, retry) => {
    const { scraper } = fixture([first, retry, noProducts]);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryErrors()).toEqual([expect.objectContaining({
      productUrl: firstUrl,
      message: expect.stringContaining('HTTP 503'),
      stack: expect.stringContaining('RequestFailure: HTTP 503'),
    })]);
  });

  it('does not report a recovered HTTP retry as a failed category or page', async () => {
    const { scraper, urls } = fixture([503, productHtml, noProducts]);

    expect(await scraper.scrapeProductList()).toHaveLength(1);

    expect(urls).toEqual([firstUrl, firstUrl, secondUrl]);
    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(scraper.getCategoryErrors()).toEqual([]);
    expect(scraper.getErrors()).toEqual([]);
  });

  it('accepts an explicit no-products retry as a genuinely empty category', async () => {
    const { scraper, urls } = fixture([503, noProducts]);

    expect(await scraper.scrapeProductList()).toEqual([]);

    expect(urls).toEqual([firstUrl, firstUrl]);
    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(scraper.getCategoryErrors()).toEqual([]);
    expect(scraper.getErrors()).toEqual([]);
  });

  it('still retries and gives up after three consecutive blank pages', async () => {
    const { scraper, urls } = fixture(['']);

    expect(await scraper.scrapeProductList()).toEqual([]);

    expect(urls).toHaveLength(6);
    expect(scraper.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(scraper.getErrors()).toHaveLength(3);
    expect(scraper.getCategoryErrors()[0].message).toContain('empty or failed response after retry');
  });
});
