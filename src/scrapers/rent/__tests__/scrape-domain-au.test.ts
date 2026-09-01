import * as fs from 'fs';
import * as path from 'path';
import { HEADERS, scrapeDomainAu } from '../scrape-domain-au';

function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

const listPage = fixture('domain-au-list-page.html');

function ok(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as unknown as Response;
}

function status(code: number): Response {
  return { ok: false, status: code, text: async () => '' } as unknown as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('scrapeDomainAu', () => {
  test('fetches over plain HTTP rather than driving a browser', async () => {
    // domain.com.au serves the full __NEXT_DATA__ payload to a plain request
    // carrying browser headers, but returns nothing usable to Playwright. A
    // browser here is what made this source look permanently blocked.
    fetchMock.mockResolvedValueOnce(ok(listPage)).mockResolvedValue(ok(''));

    const listings = await scrapeDomainAu();

    expect(listings.length).toBeGreaterThan(0);
    expect(listings[0].source).toBe('domainau');

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/Mozilla/);
    // The bare-headers request is the one that gets a 403; these are what
    // separate a served page from a refused one.
    expect(headers['Accept-Language']).toMatch(/en-AU/);
    expect(headers['Sec-Fetch-Mode']).toBe('navigate');
  });

  test('advertises Brotli explicitly rather than inheriting the runtime default', () => {
    // This one header decides the response: `gzip, deflate, br` is served,
    // `gzip, deflate` is refused with a 403. Node's default differs by version
    // (20 omits `br`, 26 includes it), which is what made the same code pass
    // locally and 403 in CI. Pinned here so no runtime can change the request.
    const headers = HEADERS as Record<string, string>;
    expect(headers['Accept-Encoding']).toBe('gzip, deflate, br');
  });

  test('paginates and de-duplicates listings across pages', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(listPage))
      .mockResolvedValueOnce(ok(listPage)) // same page again -> no new listings
      .mockResolvedValue(ok(''));

    const listings = await scrapeDomainAu();
    const urls = listings.map((l) => l.url);

    expect(new Set(urls).size).toBe(urls.length);
  });

  test('reports the HTTP status when the first page is refused', async () => {
    // The old scraper swallowed this and returned [], which the summary logged
    // as "0 raw" - indistinguishable from a page that parsed to nothing. The
    // status is the whole diagnosis, so it has to reach the summary.
    fetchMock.mockResolvedValue(status(403));

    await expect(scrapeDomainAu()).rejects.toThrow(/403/);
  });

  test('keeps the pages it already has when a later page is refused', async () => {
    fetchMock.mockResolvedValueOnce(ok(listPage)).mockResolvedValue(status(429));

    const listings = await scrapeDomainAu();

    expect(listings.length).toBeGreaterThan(0);
  });
});
