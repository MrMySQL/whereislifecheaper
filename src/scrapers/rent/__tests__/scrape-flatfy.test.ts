import { chromium } from 'playwright';
import { scrapeFlatfy } from '../scrape-flatfy';

const closeMock = jest.fn();
const gotoMock = jest.fn();
const searchUrl = 'https://flatfy.ua/uk/search?geo_id=10009580&section_id=2&page=1';
const listingHtml = '<article class="realty-preview" id="4713104101"><span class="realty-preview-price--main">$ 1 000</span><span class="realty-preview-info">2 кімнати</span></article>';
let html: string;
let finalUrl: string;
let status: number;
const page = {
  goto: gotoMock,
  waitForSelector: jest.fn(),
  evaluate: jest.fn(),
  waitForTimeout: jest.fn(),
  content: jest.fn(async () => html),
  title: jest.fn(async () => 'ЛУН'),
  url: jest.fn(() => finalUrl),
};

jest.mock('playwright', () => ({ chromium: { launch: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  html = listingHtml;
  finalUrl = searchUrl;
  status = 200;
  gotoMock.mockReset().mockRejectedValue(new Error('navigation failed'));
  (chromium.launch as jest.Mock).mockResolvedValue({
    close: closeMock,
    newContext: jest.fn().mockResolvedValue({
      addInitScript: jest.fn(),
      newPage: jest.fn().mockResolvedValue(page),
    }),
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function respond() {
  return Promise.resolve({ status: () => status });
}

describe('scrapeFlatfy', () => {
  test('closes the browser when scraping throws after launch', async () => {
    await expect(scrapeFlatfy()).rejects.toThrow('navigation failed');
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  test('rejects an unrecognized empty page with HTTP, title and URL diagnostics', async () => {
    html = '<html><title>ЛУН</title></html>';
    gotoMock.mockImplementation(respond);
    await expect(scrapeFlatfy()).rejects.toThrow(/page 1.*no listing cards.*HTTP 200.*ЛУН.*flatfy\.ua/);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  test('rejects HTTP failures instead of reporting an empty successful scrape', async () => {
    status = 403;
    html = '<html>Forbidden</html>';
    gotoMock.mockImplementation(respond);
    await expect(scrapeFlatfy()).rejects.toThrow(/page 1.*HTTP 403/);
  });

  test('rejects a persistent first-page wall with no collected listings', async () => {
    html = '<html>DataDome captcha-delivery.com</html>';
    gotoMock.mockImplementation(respond);
    const assertion = expect(scrapeFlatfy()).rejects.toThrow(/page 1.*DataDome wall persisted/);
    await jest.runAllTimersAsync();
    await assertion;
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  test('returns a complete sample when a scoped final page reaches the page cap', async () => {
    finalUrl = 'https://flatfy.ua/uk/search?geo_id=10009580&section_id=2&page=210';
    gotoMock.mockImplementation(respond);
    const result = await scrapeFlatfy({ startPage: 210 });
    expect(result).toMatchObject({
      listings: [{ url: 'https://flatfy.ua/redirect/4713104101' }],
      degraded: undefined,
    });
  });

  test('rejects the live late-page redirect to unfiltered sale listings', async () => {
    finalUrl = 'https://flatfy.ua/uk/search';
    gotoMock.mockImplementation(respond);
    await expect(scrapeFlatfy({ startPage: 210 })).rejects.toThrow(/outside.*Kyiv.*rent/);
  });

  test.each(['empty', 'http', 'navigation', 'wall', 'redirect'])('preserves the collected sample as degraded after a later %s failure', async (failure) => {
    gotoMock.mockImplementationOnce(respond).mockImplementation(async () => {
      if (failure === 'navigation') throw new Error('navigation failed');
      html = failure === 'wall' ? '<html>DataDome captcha-delivery.com</html>' : '<html></html>';
      if (failure === 'http') status = 503;
      if (failure === 'redirect') { finalUrl = 'https://flatfy.ua/uk/search'; html = listingHtml; }
      return respond();
    });
    const resultPromise = scrapeFlatfy();
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toMatchObject({
      listings: [{ url: 'https://flatfy.ua/redirect/4713104101', priceText: '$ 1 000' }],
      degraded: expect.stringMatching(/page 2/),
    });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
