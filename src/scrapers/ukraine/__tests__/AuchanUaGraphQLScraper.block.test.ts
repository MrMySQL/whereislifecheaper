jest.mock('../../../config/env', () => ({
  config: { scraper: { headless: true, maxRetries: 0, timeout: 1000, proxyConfig: new Map() } },
}));
jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import * as fs from 'fs';
import * as path from 'path';
import {
  AuchanUaGraphQLScraper,
  auchanUaGraphQLConfig,
  auchanUaGraphQLCategories,
  GraphQLHttpResponse,
} from '../AuchanUaGraphQLScraper';
import { ScraperConfig } from '../../../types/scraper.types';

// The body express.auchan.ua/graphql/ returned on 2026-09-06: Cloudflare's
// "Sorry, you have been blocked" (error 1020) page with HTTP 403. The same
// template was logged 64 times as "Failed to parse response" on the 2026-09-04
// Daily Scrape (run 33849987203).
const BLOCK_PAGE = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'cloudflare-block-403.html'),
  'utf8'
);

const CHALLENGE_PAGE = `<!DOCTYPE html><html lang="en-US"><head>
<title>Just a moment...</title>
<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=a36a86f48add70a9"></script>
</head><body><div id="challenge-running">Checking your browser before accessing express.auchan.ua.</div></body></html>`;

function graphqlPage(items: unknown[], totalPages = 1) {
  return JSON.stringify({ data: { search: { page_info: { page_size: 100, total_pages: totalPages }, items } } });
}

const item = (sku: string, name: string | null) => ({
  id: 1,
  sku,
  name,
  url_key: `product-${sku}`,
  stock_status: 'IN_STOCK',
  thumbnail: { url: 'https://img.auchan.ua/rx/q_90,ofmt_webp/auchan.ua/x.jpg' },
  price_range: {
    minimum_price: { regular_price: { value: 49.9 }, final_price: { value: 49.9 } },
  },
});

/** Replaces the network hop with a canned HTTP response. */
class FixtureScraper extends AuchanUaGraphQLScraper {
  constructor(private readonly responder: (requestBody: string) => GraphQLHttpResponse) {
    super({ ...auchanUaGraphQLConfig, supermarketId: '1', maxRetries: 0 } as ScraperConfig);
  }
  protected async postGraphQL(requestBody: string): Promise<GraphQLHttpResponse> {
    return this.responder(requestBody);
  }
  run() {
    return this.scrapeCategory(auchanUaGraphQLCategories[0]);
  }
}

describe('AuchanUaGraphQLScraper when Cloudflare answers instead of the API', () => {
  it('names a 403 block page as a Cloudflare block, with the status and Ray ID', async () => {
    const scraper = new FixtureScraper(() => ({
      status: 403,
      contentType: 'text/html; charset=UTF-8',
      body: BLOCK_PAGE,
    }));

    const error = await scraper.run().catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Cloudflare/);
    expect((error as Error).message).toMatch(/403/);
    expect((error as Error).message).toMatch(/blocked/i);
    expect((error as Error).message).toMatch(/a36a86609964f7ef/);
    expect((error as Error).message).not.toMatch(/Failed to parse/);
  });

  it('names a "Just a moment" interstitial as a Cloudflare challenge', async () => {
    const scraper = new FixtureScraper(() => ({
      status: 503,
      contentType: 'text/html; charset=UTF-8',
      body: CHALLENGE_PAGE,
    }));

    await expect(scraper.run()).rejects.toThrow(/Cloudflare challenge.*503|503.*Cloudflare challenge/);
  });

  it('reports a non-Cloudflare HTTP error by its status', async () => {
    const scraper = new FixtureScraper(() => ({
      status: 502,
      contentType: 'text/html',
      body: '<html><body>Bad Gateway</body></html>',
    }));

    await expect(scraper.run()).rejects.toThrow(/HTTP 502/);
  });

  it('lets the block escape scrapeCategory so the category counts as failed', async () => {
    // BaseScraper (and the #41 category accounting) only see a failed category
    // when scrapeCategory throws. Swallowing the error and returning [] made a
    // 16/16 block look like a clean run with zero products.
    const scraper = new FixtureScraper(() => ({ status: 403, contentType: 'text/html', body: BLOCK_PAGE }));

    await expect(scraper.run()).rejects.toThrow();
  });

  it.each([
    ['data is null', JSON.stringify({ data: null })],
    ['search is missing', JSON.stringify({ data: {} })],
    ['items is not a list', JSON.stringify({ data: { search: { page_info: { page_size: 100, total_pages: 1 }, items: null } } })],
    // Math.min(undefined, 100) is NaN: only page 1 would be scraped, reported as success.
    ['total_pages is missing', JSON.stringify({ data: { search: { page_info: { page_size: 100 }, items: [] } } })],
    ['total_pages is not a number', JSON.stringify({ data: { search: { page_info: { page_size: 100, total_pages: '3' }, items: [] } } })],
  ])('fails a 200 JSON payload without the expected shape (%s)', async (_label, body) => {
    // A well-formed JSON body that is not a search result used to log
    // "No data returned" and return [], which counts as a clean, empty
    // category. Only a real search result with an item list may pass.
    const scraper = new FixtureScraper(() => ({ status: 200, contentType: 'application/json', body }));

    await expect(scraper.run()).rejects.toThrow(/Unexpected GraphQL payload/);
  });

  it('still returns products from a normal JSON page', async () => {
    const scraper = new FixtureScraper(() => ({
      status: 200,
      contentType: 'application/json',
      body: graphqlPage([item('100', 'Молоко 2.5% 1 л')]),
    }));

    const products = await scraper.run();

    expect(products.map((p) => p.name)).toEqual(['Молоко 2.5% 1 л']);
  });
});
