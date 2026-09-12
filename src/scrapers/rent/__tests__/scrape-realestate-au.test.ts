import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { scrapeRealestateAu } from '../scrape-realestate-au';

jest.mock('playwright', () => ({ chromium: { launch: jest.fn() } }));

const listPage = fs.readFileSync(path.join(__dirname, 'fixtures/realestate-au-list-page.html'), 'utf8');
const emptyPage = `<script>window.ArgonautExchange=${JSON.stringify({
  'resi-property_listing-experience-web': {
    urqlClientCache: JSON.stringify({
      search: { data: JSON.stringify({ rentSearch: { results: { exact: { items: [] } } } }) },
    }),
  },
})};</script>`;
const goto = jest.fn();
const content = jest.fn();
const close = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  goto.mockResolvedValue({ ok: () => false, status: () => 429 });
  content.mockResolvedValue('<html></html>');
  (chromium.launch as jest.Mock).mockResolvedValue({
    close,
    newContext: async () => ({
      addInitScript: async () => undefined,
      newPage: async () => ({ goto, content, waitForTimeout: async () => undefined }),
    }),
  });
});

test('reports the HTTP refusal instead of returning an empty listing sample', async () => {
  await expect(scrapeRealestateAu()).rejects.toThrow(/realestateau.*page 1.*HTTP 429/);
  expect(close).toHaveBeenCalledTimes(1);
});

test('rejects a successful HTTP response without a search payload', async () => {
  goto.mockResolvedValue({ ok: () => true, status: () => 200 });

  await expect(scrapeRealestateAu()).rejects.toThrow(/search payload/i);
});

test('marks a sample partial when a later successful response loses its search payload', async () => {
  goto.mockResolvedValue({ ok: () => true, status: () => 200 });
  content.mockResolvedValueOnce(listPage).mockResolvedValue('<html></html>');

  const result = await scrapeRealestateAu();

  expect(result).toMatchObject({
    listings: [expect.objectContaining({ source: 'realestateau' }), expect.objectContaining({ source: 'realestateau' })],
    degraded: expect.stringMatching(/search payload.*partial/i),
  });
});

test('ends cleanly when the search payload explicitly contains no more listings', async () => {
  goto.mockResolvedValue({ ok: () => true, status: () => 200 });
  content.mockResolvedValueOnce(listPage).mockResolvedValue(emptyPage);

  const result = await scrapeRealestateAu();

  expect(result.listings).toHaveLength(2);
  expect(result.degraded).toBeUndefined();
});

test('preserves listings as degraded when a later page is refused', async () => {
  goto.mockResolvedValueOnce({ ok: () => true, status: () => 200 });
  content.mockResolvedValue(listPage);

  const result = await scrapeRealestateAu();

  expect(result).toMatchObject({
    listings: [expect.objectContaining({ source: 'realestateau' }), expect.objectContaining({ source: 'realestateau' })],
    degraded: expect.stringMatching(/HTTP 429.*partial/),
  });
});

test('preserves listings as degraded when a later navigation fails', async () => {
  goto.mockResolvedValueOnce({ ok: () => true, status: () => 200 }).mockRejectedValue(new Error('navigation timeout'));
  content.mockResolvedValue(listPage);

  const result = await scrapeRealestateAu();

  expect(result).toMatchObject({
    listings: [expect.objectContaining({ source: 'realestateau' }), expect.objectContaining({ source: 'realestateau' })],
    degraded: expect.stringMatching(/navigation timeout.*partial/),
  });
});
