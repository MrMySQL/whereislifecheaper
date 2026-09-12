import { chromium } from 'playwright';
import { scrapeDomria } from '../scrape-domria';

jest.mock('playwright', () => ({ chromium: { launch: jest.fn() } }));

const card = '<section class="realty-item"><a class="realty-link" href="/uk/realty-test-123.html">Apartment</a><b>20000 грн.</b><div class="realty-char"><span class="point-before">2 кімнати</span></div></section>';

function browserWithPage(html: string, status = 200) {
  const page = {
    goto: jest.fn().mockResolvedValue({ status: () => status }),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    content: jest.fn().mockResolvedValue(html),
  };
  const browser = {
    newContext: jest.fn().mockResolvedValue({ newPage: async () => page }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  (chromium.launch as jest.Mock).mockResolvedValue(browser);
  return { browser, page };
}

describe('scrapeDomria', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  test('returns a listing once when it repeats within and across pages', async () => {
    const { browser } = browserWithPage(card + card);
    const result = scrapeDomria();
    await jest.runAllTimersAsync();
    expect((await result).listings).toHaveLength(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  test('rejects HTTP failures rather than treating them as an empty result', async () => {
    const { browser } = browserWithPage('<h1>Request blocked</h1>', 403);
    await expect(scrapeDomria()).rejects.toThrow(/403/);
    expect(browser.close).toHaveBeenCalled();
  });

  test('rejects a first page without parseable listings', async () => {
    browserWithPage('<h1>Unexpected markup</h1>');
    await expect(scrapeDomria()).rejects.toThrow(/no listings/i);
  });

  test.each(['HTTP error', 'navigation timeout'])('preserves collected listings after a later %s', async failure => {
    const { page, browser } = browserWithPage(card);
    page.goto.mockReset().mockResolvedValueOnce({ status: () => 200 });
    if (failure === 'HTTP error') page.goto.mockResolvedValueOnce({ status: () => 403 });
    else page.goto.mockRejectedValueOnce(new Error('navigation timed out'));
    const result = scrapeDomria();
    const checked = expect(result).resolves.toMatchObject({
      listings: [expect.objectContaining({ source: 'domria', priceText: '20000 грн.' })],
      degraded: expect.stringMatching(/page 2.*partial/),
    });
    await Promise.all([checked, jest.runAllTimersAsync()]);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
  test.each(['<h1>Verify you are human</h1>', '<main>Changed search markup</main>'])(
    'marks a later HTTP 200 page without listing evidence as partial: %s', async html => {
      const { page, browser } = browserWithPage(card);
      page.content.mockResolvedValueOnce(card).mockResolvedValueOnce(html);
      const result = scrapeDomria();
      const checked = expect(result).resolves.toMatchObject({
        listings: [expect.objectContaining({ source: 'domria' })],
        degraded: expect.stringMatching(/page 2.*no listings.*partial/),
      });
      await Promise.all([checked, jest.runAllTimersAsync()]);
      expect(browser.close).toHaveBeenCalledTimes(1);
    },
  );

  test('collects new listings on a later page containing both old and new duplicates', async () => {
    const { page, browser } = browserWithPage(card);
    const secondCard = card.replace('123.html', '456.html');
    page.content.mockResolvedValueOnce(card).mockResolvedValueOnce(card + secondCard + secondCard);
    const result = scrapeDomria();
    await jest.runAllTimersAsync();
    const sample = await result;
    expect(sample.listings.map(listing => listing.url)).toEqual([
      'https://dom.ria.com/uk/realty-test-123.html',
      'https://dom.ria.com/uk/realty-test-456.html',
    ]);
    expect(sample.degraded).toBeUndefined();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

});
