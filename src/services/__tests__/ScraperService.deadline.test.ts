import {
  ScraperService,
  ScraperDeadlineError,
  resolveDeadlineMs,
  FALLBACK_SCRAPER_DEADLINE_MS,
} from '../ScraperService';
import { ScraperFactory } from '../../scrapers/base/ScraperFactory';

jest.mock('../../scrapers/base/ScraperFactory');
jest.mock('../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return {
    scraperLogger: stub,
    logger: stub,
    createPrefixedLogger: () => stub,
  };
});

const mockedFactory = ScraperFactory as jest.Mocked<typeof ScraperFactory>;

type PageCallback = (products: unknown[], pageInfo: unknown) => Promise<number>;

/** Minimal BaseScraper stand-in whose scrapeProductList we control. */
function fakeScraper(scrapeProductList: () => Promise<unknown[]>) {
  return {
    setRunId: jest.fn(),
    setOnPageScrapedCallback: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
    scrapeProductList: jest.fn(scrapeProductList),
    cleanup: jest.fn().mockResolvedValue(undefined),
  };
}

function harness(scraper: ReturnType<typeof fakeScraper>) {
  const update = jest.fn().mockResolvedValue(undefined);
  const supermarketRepo = {
    findById: jest.fn().mockResolvedValue({
      id: '1', name: 'Testmarket', is_active: true, scraper_class: 'TestScraper',
    }),
  };
  const scrapeLogRepo = { create: jest.fn().mockResolvedValue('log-1'), update };

  mockedFactory.createFromSupermarket = jest.fn().mockReturnValue(scraper) as never;

  const productService = { bulkSaveProducts: jest.fn(async (products: unknown[]) => products.length) };
  const service = new ScraperService(
    productService as never,
    supermarketRepo as never,
    scrapeLogRepo as never,
  );
  return { service, update, scraper };
}

describe('ScraperService per-scraper deadline', () => {
  afterEach(() => jest.clearAllMocks());

  it('gives up on a scraper that never returns, instead of hanging forever', async () => {
    // The Woolworths failure mode: scrapeProductList never settles.
    const scraper = fakeScraper(() => new Promise<unknown[]>(() => {}));
    const { service, update } = harness(scraper);

    const result = await service.runScraper('1', { deadlineMs: 50 });

    expect(result.productsScraped).toBe(0);
    expect(result.errors[0].message).toMatch(/deadline/i);
    expect(update).toHaveBeenCalledWith('log-1', 'failed', expect.objectContaining({
      error: expect.stringMatching(/deadline/i),
    }));
  });

  it('always closes the browser when the deadline fires', async () => {
    const scraper = fakeScraper(() => new Promise<unknown[]>(() => {}));
    const { service } = harness(scraper);

    await service.runScraper('1', { deadlineMs: 50 });

    // cleanup() is what actually stops the work — Promise.race alone does not.
    expect(scraper.cleanup).toHaveBeenCalledTimes(1);
  });

  it('records a scraper that finishes but stores nothing as partial, not success', async () => {
    // The REWE failure mode: returns cleanly, yields no storable products.
    const scraper = fakeScraper(async () => []);
    const { service, update } = harness(scraper);

    const result = await service.runScraper('1', { deadlineMs: 10_000 });

    expect(result.productsScraped).toBe(0);
    expect(update).toHaveBeenCalledWith('log-1', 'partial', expect.objectContaining({
      productsScraped: 0,
    }));
  });

  it('records a scraper that stores products as success', async () => {
    // Drive the service's own page callback — the one that increments the
    // stored count — instead of replacing it, so the success branch of the
    // partial/success classification is actually exercised.
    let registered: PageCallback | undefined;
    const product = { name: 'Milk', price: 1 };
    const scraper = fakeScraper(async () => {
      await registered!([product], { categoryName: 'Dairy', pageNumber: 1 });
      return [product];
    });
    scraper.setOnPageScrapedCallback.mockImplementation((cb: PageCallback) => {
      registered = cb;
    });

    const { service, update } = harness(scraper);

    const result = await service.runScraper('1', { deadlineMs: 10_000 });

    expect(result.productsScraped).toBe(1);
    expect(scraper.cleanup).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('log-1', 'success', expect.objectContaining({
      productsScraped: 1,
    }));
  });

  it('applies the deadline to initialize(), not just the scrape', async () => {
    // A browser that never launches holds the run open just as effectively as
    // a scrape that never returns.
    const scraper = fakeScraper(async () => []);
    scraper.initialize.mockImplementation(() => new Promise(() => {}));
    const { service, update } = harness(scraper);

    const result = await service.runScraper('1', { deadlineMs: 50 });

    expect(scraper.scrapeProductList).not.toHaveBeenCalled();
    expect(result.errors[0].message).toMatch(/deadline/i);
    expect(update).toHaveBeenCalledWith('log-1', 'failed', expect.objectContaining({
      error: expect.stringMatching(/deadline/i),
    }));
  });

  it('closes an in-flight scrape log on shutdown', async () => {
    let release: (() => void) | undefined;
    const scraper = fakeScraper(() => new Promise<unknown[]>(resolve => {
      release = () => resolve([]);
    }));
    const { service, update } = harness(scraper);

    const run = service.runScraper('1', { deadlineMs: 10_000 });
    await new Promise(r => setImmediate(r));

    expect(await service.markInFlightFailed('SIGTERM')).toBe(1);
    expect(update).toHaveBeenCalledWith('log-1', 'failed', { error: 'SIGTERM' });

    release!();
    await run;
  });

  it('ScraperDeadlineError reports the budget it blew', () => {
    expect(new ScraperDeadlineError(45 * 60 * 1000).message).toContain('45 minute');
  });
});

describe('resolveDeadlineMs', () => {
  it('uses the configured value when it is a positive number', () => {
    expect(resolveDeadlineMs('60000')).toBe(60_000);
  });

  // Configuration must never be able to switch the safeguard off.
  it.each(['0', '-1', 'abc', '', undefined])('falls back to the default for %p', raw => {
    expect(resolveDeadlineMs(raw)).toBe(FALLBACK_SCRAPER_DEADLINE_MS);
  });
});
