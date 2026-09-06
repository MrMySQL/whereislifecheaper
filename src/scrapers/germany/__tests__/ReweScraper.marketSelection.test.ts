jest.mock('../../../config/env', () => ({
  config: { scraper: { headless: true, maxRetries: 1, timeout: 1000, proxyConfig: new Map() } },
}));
jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import {
  ReweScraper,
  MarketConfiguration,
  assertPricedPage,
  deliveryMarketFor,
} from '../ReweScraper';
import { ScraperConfig } from '../../../types/scraper.types';

const ZIP = '10115';

/** What /api/marketselection/configuration returns before any choice is made. */
const NO_MARKET: MarketConfiguration = {
  selectedService: null,
  selectedMarket: null,
  customerZipCode: null,
};

/** What it returns once Lieferservice for 10115 has been chosen. */
const BERLIN_DELIVERY: MarketConfiguration = {
  selectedService: 'DELIVERY',
  selectedMarket: '240557',
  customerZipCode: ZIP,
};

function config(): ScraperConfig {
  return {
    supermarketId: '17',
    name: 'REWE',
    baseUrl: 'https://www.rewe.de',
    categories: [],
    selectors: { productCard: '', productName: '', productPrice: '' },
    waitTimes: { pageLoad: 0, dynamicContent: 0, betweenRequests: 0 },
    maxRetries: 1,
    concurrentPages: 1,
  };
}

/**
 * Stands in for Playwright's page during market selection. `configurations`
 * is what successive reads of the configuration endpoint return, the last one
 * repeating forever; the UI calls are recorded so a test can assert whether
 * the zip flow ran at all.
 */
function fakePage(configurations: MarketConfiguration[]) {
  const reads = [...configurations];
  let readCount = 0;
  const calls: string[] = [];
  const locator = (selector: string) => ({
    waitFor: async () => { calls.push(`waitFor ${selector}`); },
    fill: async (value: string) => { calls.push(`fill ${selector} ${value}`); },
    click: async () => { calls.push(`click ${selector}`); },
  });
  return {
    calls,
    goto: async () => { calls.push('goto'); },
    title: async () => 'REWE Onlineshop',
    waitForTimeout: async () => {},
    $: async () => null,
    evaluate: async () => {
      readCount++;
      return reads.length > 1 ? reads.shift() : reads[0];
    },
    get readCount() { return readCount; },
    locator,
    waitForResponse: async () => ({ ok: () => true, status: () => 200 }),
  };
}

function scraperWith(page: ReturnType<typeof fakePage>) {
  const scraper = new ReweScraper(config());
  (scraper as unknown as { page: unknown }).page = page;
  return scraper;
}

describe('deliveryMarketFor', () => {
  it('returns the market id when delivery is selected for the requested zip', () => {
    expect(deliveryMarketFor(BERLIN_DELIVERY, ZIP)).toBe('240557');
  });

  it('returns null before any market has been chosen', () => {
    // This is what every run from May to August saw, and still logged
    // "Delivery market selected successfully" because the page contained '€'.
    expect(deliveryMarketFor(NO_MARKET, ZIP)).toBeNull();
  });

  it('returns null for pickup — pickup prices belong to a different market', () => {
    expect(deliveryMarketFor({ ...BERLIN_DELIVERY, selectedService: 'PICKUP' }, ZIP)).toBeNull();
  });

  it('returns null when the session carries a different zip', () => {
    expect(deliveryMarketFor({ ...BERLIN_DELIVERY, customerZipCode: '80331' }, ZIP)).toBeNull();
  });
});

describe('ReweScraper.selectDeliveryMarket', () => {
  it('throws when the site still reports no market after the zip flow', async () => {
    // 2026-08-01: the old selectors clicked a paragraph and a non-existent
    // button, nothing was selected, and the scraper paginated 1,919 pages
    // of "Preis abhängig vom Standort" as a success.
    const page = fakePage([NO_MARKET]);
    const scraper = scraperWith(page);

    await expect(
      (scraper as unknown as { selectDeliveryMarket: () => Promise<void> }).selectDeliveryMarket()
    ).rejects.toThrow(/market/i);
    expect((scraper as unknown as { marketSelected: boolean }).marketSelected).toBe(false);
  });

  it('keeps reading until the reload after the 201 makes the market visible', async () => {
    // userselections answers 201 with no cookie; the session only reports the
    // market after the shop reloads itself. Reading once, right after the
    // response, saw null on 2026-09-06 and failed a selection that had worked.
    const page = fakePage([NO_MARKET, NO_MARKET, NO_MARKET, BERLIN_DELIVERY]);
    const scraper = scraperWith(page);

    await (scraper as unknown as { selectDeliveryMarket: () => Promise<void> }).selectDeliveryMarket();

    expect((scraper as unknown as { marketSelected: boolean }).marketSelected).toBe(true);
    expect(page.readCount).toBe(4);
  });

  it('walks zip → submit → Lieferservice and accepts the market the site then reports', async () => {
    const page = fakePage([NO_MARKET, BERLIN_DELIVERY]);
    const scraper = scraperWith(page);

    await (scraper as unknown as { selectDeliveryMarket: () => Promise<void> }).selectDeliveryMarket();

    expect((scraper as unknown as { marketSelected: boolean }).marketSelected).toBe(true);
    expect(page.calls).toEqual(
      expect.arrayContaining([
        `fill [data-testid="zip-code-input"] ${ZIP}`,
        'click [data-testid="gbmc_zipCodeSubmit"]',
        expect.stringMatching(/^click .*service-btn/),
      ])
    );
  });

  it('skips the zip flow when the persistent session already has the market', async () => {
    const page = fakePage([BERLIN_DELIVERY]);
    const scraper = scraperWith(page);

    await (scraper as unknown as { selectDeliveryMarket: () => Promise<void> }).selectDeliveryMarket();

    expect((scraper as unknown as { marketSelected: boolean }).marketSelected).toBe(true);
    expect(page.calls.filter(c => c.startsWith('fill') || c.startsWith('click'))).toEqual([]);
  });
});

describe('assertPricedPage', () => {
  const priced = (n: number) => Array.from({ length: n }, (_, i) => ({ price: 1 + i }));
  const unpriced = (n: number) => Array.from({ length: n }, () => ({ price: 0 }));

  it('throws when a full page has products but none carries a price', () => {
    expect(() => assertPricedPage(unpriced(40), 'Obst & Gemüse', 1)).toThrow(/Obst & Gemüse.*market/i);
  });

  it('accepts a page where at least some products are priced', () => {
    expect(() => assertPricedPage([...priced(30), ...unpriced(10)], 'Obst & Gemüse', 1)).not.toThrow();
  });

  it('accepts an empty page — an empty category is not a lost market', () => {
    expect(() => assertPricedPage([], 'Tierbedarf', 1)).not.toThrow();
  });
});
