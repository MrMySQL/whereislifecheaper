jest.mock('../../../config/env', () => ({ config: { scraper: {} } }));
jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { logger: stub, scraperLogger: stub, createPrefixedLogger: () => stub };
});
jest.mock('../../../utils/retry', () => ({
  ...jest.requireActual('../../../utils/retry'),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

import https from 'https';
import { EventEmitter } from 'events';
import { CarrefourItScraper, carrefourItConfig } from '../CarrefourItScraper';
import { ScraperConfig } from '../../../types/scraper.types';

const firstUrl = 'https://www.carrefour.it/on/demandware.store/Sites-carrefour-IT-Site/it_IT/Search-ShowAjax?cgid=frutta&start=0&sz=25&pmin=0%2C01';
const secondUrl = 'https://www.carrefour.it/on/demandware.store/Sites-carrefour-IT-Site/it_IT/Search-ShowAjax?cgid=frutta&start=25&sz=25&pmin=0%2C01';
const product = {
  id: '123', productName: 'Mele 1 kg', brand: 'Carrefour',
  price: { sales: { value: 2.5 } }, available: true,
};
const goodPage = JSON.stringify({ productIds: [product], countResult: 50, countResultLabel: '50 prodotti' });

type Reply = { status?: number; body?: string; error?: string; timeout?: boolean };

/** Only the external HTTPS hop is replaced; parsing and category accounting run unchanged. */
function stubHttps(replyFor: (url: string) => Reply): void {
  jest.spyOn(https, 'request').mockImplementation(((options: https.RequestOptions, onResponse: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & {
      setTimeout: (ms: number, callback: () => void) => void;
      destroy: () => void;
      end: () => void;
    };
    let timeout: () => void;
    req.setTimeout = (_ms, callback) => { timeout = callback; };
    req.destroy = () => undefined;
    req.end = () => queueMicrotask(() => {
      const reply = replyFor(`https://${options.hostname}${options.path}`);
      if (reply.error) { req.emit('error', new Error(reply.error)); return; }
      if (reply.timeout) { timeout(); return; }
      const res = Object.assign(new EventEmitter(), { statusCode: reply.status ?? 200 });
      onResponse(res);
      res.emit('data', reply.body ?? '');
      res.emit('end');
    });
    return req;
  }) as typeof https.request);
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
  ['network failure', { error: 'ECONNRESET' }, /ECONNRESET/],
  ['request timeout', { timeout: true }, /timeout/i],
  ['missing productIds', { body: JSON.stringify({ countResult: 50 }) }, /productIds/],
  ['non-array productIds', { body: JSON.stringify({ productIds: {}, countResult: 50 }) }, /productIds/],
  ['missing countResult', { body: JSON.stringify({ productIds: [] }) }, /countResult/],
  ['invalid countResult', { body: JSON.stringify({ productIds: [], countResult: 'many' }) }, /countResult/],
  ['negative countResult', { body: JSON.stringify({ productIds: [], countResult: -1 }) }, /countResult/],
];

afterEach(() => jest.restoreAllMocks());

describe('Carrefour Italy Demandware request failures', () => {
  it.each(failures)('retains the first-page URL and cause for a lost category: %s', async (_label, reply, cause) => {
    stubHttps(url => url === firstUrl ? reply : { body: '' });
    const subject = scraper();

    expect(await subject.scrapeProductList()).toEqual([]);

    expect(subject.getCategoryStats()).toEqual({ attempted: 1, failed: 1 });
    expect(subject.getCategoryErrors()).toEqual([
      expect.objectContaining({ productUrl: firstUrl, message: expect.stringMatching(cause) }),
    ]);
    expect(subject.getErrors()).toEqual([]);
  });

  it.each(failures)('retains the later-page offset and cause without losing the category: %s', async (_label, reply, cause) => {
    stubHttps(url => url === firstUrl ? { body: goodPage } : url === secondUrl ? reply : { body: '' });
    const subject = scraper();

    expect((await subject.scrapeProductList()).map(p => p.name)).toEqual(['Mele 1 kg']);

    expect(subject.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(subject.getCategoryErrors()).toEqual([]);
    expect(subject.getErrors()).toEqual([
      expect.objectContaining({ productUrl: secondUrl, message: expect.stringMatching(cause) }),
    ]);
  });

  it('accepts an explicitly empty result as a clean empty category', async () => {
    stubHttps(url => ({ body: url === firstUrl ? JSON.stringify({ productIds: [], countResult: 0 }) : '' }));
    const subject = scraper();

    expect(await subject.scrapeProductList()).toEqual([]);
    expect(subject.getCategoryStats()).toEqual({ attempted: 1, failed: 0 });
    expect(subject.getCategoryErrors()).toEqual([]);
    expect(subject.getErrors()).toEqual([]);
  });
});
