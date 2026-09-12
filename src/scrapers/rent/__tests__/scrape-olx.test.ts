import { chromium } from 'playwright';
import { scrapeOlx } from '../scrape-olx';

jest.mock('playwright', () => ({ chromium: { launch: jest.fn() } }));

const card = '<div data-cy="l-card"><a href="/d/uk/obyavlenie/test-ID123.html"><h4>2 кімнати</h4></a><p data-testid="ad-price">20000 грн.</p></div>';

function browserWithPage(html: string, status = 200) {
  const page = {
    goto: jest.fn().mockResolvedValue({ status: () => status }),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    content: jest.fn().mockResolvedValue(html),
  };
  const browser = {
    newContext: jest.fn().mockResolvedValue({ newPage: async () => page }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  (chromium.launch as jest.Mock).mockResolvedValue(browser);
  return { browser, page };
}

describe('scrapeOlx', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  test('returns a listing once when it repeats within and across pages', async () => {
    const { browser } = browserWithPage(card + card);
    const result = scrapeOlx();
    await jest.runAllTimersAsync();
    expect((await result).listings).toHaveLength(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  test('rejects HTTP failures rather than treating them as an empty result', async () => {
    const { browser } = browserWithPage('<h1>Request blocked</h1>', 403);
    await expect(scrapeOlx()).rejects.toThrow(/403/);
    expect(browser.close).toHaveBeenCalled();
  });

  test('rejects a first page without parseable listings', async () => {
    browserWithPage('<h1>Unexpected markup</h1>');
    await expect(scrapeOlx()).rejects.toThrow(/no listings/i);
  });

  test.each(['HTTP error', 'navigation timeout'])('preserves collected listings after a later %s', async failure => {
    const { page, browser } = browserWithPage(card);
    page.goto.mockReset().mockResolvedValueOnce({ status: () => 200 });
    if (failure === 'HTTP error') page.goto.mockResolvedValueOnce({ status: () => 403 });
    else page.goto.mockRejectedValueOnce(new Error('navigation timed out'));
    const result = scrapeOlx();
    const checked = expect(result).resolves.toMatchObject({
      listings: [expect.objectContaining({ source: 'olx', priceText: '20000 грн.' })],
      degraded: expect.stringMatching(/page 2.*partial/),
    });
    await Promise.all([checked, jest.runAllTimersAsync()]);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
  test.each(['<h1>Verify you are human</h1>', '<main>Changed search markup</main>'])(
    'marks a later HTTP 200 page without listing evidence as partial: %s', async html => {
      const { page, browser } = browserWithPage(card);
      page.content.mockResolvedValueOnce(card).mockResolvedValueOnce(html);
      page.waitForSelector.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('selector timeout'));
      const result = scrapeOlx();
      const checked = expect(result).resolves.toMatchObject({
        listings: [expect.objectContaining({ source: 'olx' })],
        degraded: expect.stringMatching(/page 2.*no listings.*partial/),
      });
      await Promise.all([checked, jest.runAllTimersAsync()]);
      expect(browser.close).toHaveBeenCalledTimes(1);
    },
  );

  test('ends cleanly when structured state explicitly reports zero results', async () => {
    const { page, browser } = browserWithPage(card);
    const state = { listing: { listing: { totalElements: 0, ads: [] } } };
    const html = `<script id="olx-init-config">window.__PRERENDERED_STATE__ = ${JSON.stringify(JSON.stringify(state))};</script>`;
    page.content.mockResolvedValueOnce(card).mockResolvedValueOnce(html);
    page.waitForSelector.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('selector timeout'));
    const result = scrapeOlx();
    await jest.runAllTimersAsync();
    expect(await result).toMatchObject({ listings: [expect.objectContaining({ source: 'olx' })], degraded: undefined });
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  test('does not mistake an empty ads array with positive result count for end of results', async () => {
    const { page } = browserWithPage(card);
    const state = { listing: { listing: { totalElements: 1000, ads: [] } } };
    page.content.mockResolvedValueOnce(card).mockResolvedValueOnce(
      `<script id="olx-init-config">window.__PRERENDERED_STATE__ = ${JSON.stringify(JSON.stringify(state))};</script>`,
    );
    const checked = expect(scrapeOlx()).resolves.toMatchObject({ degraded: expect.stringMatching(/page 2.*partial/) });
    await Promise.all([checked, jest.runAllTimersAsync()]);
  });

});
