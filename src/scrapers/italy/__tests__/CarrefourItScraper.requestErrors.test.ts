jest.mock('../../../config/env', () => ({ config: { scraper: {} } }));
jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { logger: stub, scraperLogger: stub, createPrefixedLogger: () => stub };
});
jest.mock('../../../utils/retry', () => ({
  ...jest.requireActual('../../../utils/retry'),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

import { CarrefourItScraper, carrefourItConfig, HttpResponse } from '../CarrefourItScraper';
import { ScraperConfig } from '../../../types/scraper.types';

const firstUrl = 'https://www.carrefour.it/on/demandware.store/Sites-carrefour-IT-Site/it_IT/Search-ShowAjax?cgid=frutta&start=0&sz=25&pmin=0%2C01';
const secondUrl = 'https://www.carrefour.it/on/demandware.store/Sites-carrefour-IT-Site/it_IT/Search-ShowAjax?cgid=frutta&start=25&sz=25&pmin=0%2C01';
const product = {
  id: '123', productName: 'Mele 1 kg', brand: 'Carrefour',
  price: { sales: { value: 2.5 } }, available: true,
};
const goodPage = JSON.stringify({ productIds: [product], countResult: 50, countResultLabel: '50 prodotti' });

// The 403 body carrefour.it served to node https on 2026-11-19 and 2026-11-22.
const blockPage = `<!DOCTYPE html>
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
<head><title>Attention Required! | Cloudflare</title></head>
<body><div id="cf-wrapper"><h1 data-translate="block_headline">Sorry, you have been blocked</h1>
<span>Cloudflare Ray ID: <strong class="font-semibold">9a1b2c3d4e5f6071</strong></span></div></body></html>`;

type Reply = { status?: number; body?: string; error?: string };

/**
 * Only the in-page fetch (httpGet) is replaced; parsing, retries and category
 * accounting run unchanged. A rejected httpGet is what page.evaluate produces
 * when the browser-side fetch throws or times out.
 */
function stubHttp(replyFor: (url: string) => Reply): void {
  jest
    .spyOn(CarrefourItScraper.prototype as unknown as { httpGet: (url: string) => Promise<HttpResponse> }, 'httpGet')
    .mockImplementation(async (url: string) => {
      const reply = replyFor(url);
      if (reply.error) throw new Error(reply.error);
      return { status: reply.status ?? 200, contentType: null, body: reply.body ?? '' };
    });
}

function scraper(): CarrefourItScraper {
  return new CarrefourItScraper({
    ...carrefourItConfig,
    supermarketId: 'carrefour-it',
    categories: [{ id: 'frutta', name: 'Frutta', url: '/spesa-online/frutta/' }],
    maxRetries: 0,
  } as ScraperConfig);
}

const failures: Array<[string, Reply, RegExp]> = [
  ['HTTP failure', { status: 503, body: 'Service unavailable' }, /HTTP 503/],
  ['invalid JSON', { body: '<html>not JSON</html>' }, /parse|JSON/i],
  ['network failure', { error: 'TypeError: Failed to fetch' }, /Failed to fetch/],
  ['request timeout', { error: 'Request timeout after 30000ms' }, /timeout/i],
  ['Cloudflare block', { status: 403, body: blockPage }, /Blocked by Cloudflare: HTTP 403.*1020.*9a1b2c3d4e5f6071/],
  ['missing productIds', { body: JSON.stringify({ countResult: 50 }) }, /productIds/],
  ['non-array productIds', { body: JSON.stringify({ productIds: {}, countResult: 50 }) }, /productIds/],
  ['missing countResult', { body: JSON.stringify({ productIds: [] }) }, /countResult/],
  ['invalid countResult', { body: JSON.stringify({ productIds: [], countResult: 'many' }) }, /countResult/],
  ['negative countResult', { body: JSON.stringify({ productIds: [], countResult: -1 }) }, /countResult/],
];

afterEach(() => jest.restoreAllMocks());

describe('Carrefour Italy Demandware request failures', () => {
  it.each(failures)('retains the first-page URL and cause for a lost category: %s', async (_label, reply, cause) => {
    stubHttp(url => url === firstUrl ? reply : { body: '' });
    const subject = scraper();

    expect(await subject.scrapeProductList()).toEqual([]);

    expect(subject.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(subject.getCategoryErrors()).toEqual([
      expect.objectContaining({ productUrl: firstUrl, message: expect.stringMatching(cause) }),
    ]);
    expect(subject.getErrors()).toEqual([]);
  });

  it.each(failures)('retains the later-page offset and cause without losing the category: %s', async (_label, reply, cause) => {
    stubHttp(url => url === firstUrl ? { body: goodPage } : url === secondUrl ? reply : { body: '' });
    const subject = scraper();

    expect((await subject.scrapeProductList()).map(p => p.name)).toEqual(['Mele 1 kg']);

    expect(subject.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(subject.getCategoryErrors()).toEqual([]);
    expect(subject.getErrors()).toEqual([
      expect.objectContaining({ productUrl: secondUrl, message: expect.stringMatching(cause) }),
    ]);
  });

  it('accepts an explicitly empty result as a clean empty category', async () => {
    stubHttp(url => ({ body: url === firstUrl ? JSON.stringify({ productIds: [], countResult: 0 }) : '' }));
    const subject = scraper();

    expect(await subject.scrapeProductList()).toEqual([]);
    expect(subject.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(subject.getCategoryErrors()).toEqual([]);
    expect(subject.getErrors()).toEqual([]);
  });
});
