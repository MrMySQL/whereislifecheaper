import {
  ScraperService,
  ScraperDeadlineError,
  resolveDeadlineMs,
  FALLBACK_SCRAPER_DEADLINE_MS,
  REAP_INTERVAL_MS,
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
  // Models the SQL guard: onlyIfRunning refuses a row past 'running'.
  const status = { current: 'running' };
  update.mockImplementation(async (_id: string, next: string, data?: { onlyIfRunning?: boolean }) => {
    if (data?.onlyIfRunning && status.current !== 'running') return 0;
    status.current = next;
    return 1;
  });
  const create = jest.fn().mockResolvedValue('log-1');
  const reapStaleRuns = jest.fn().mockResolvedValue(0);
  const scrapeLogRepo = { create, update, reapStaleRuns };

  mockedFactory.createFromSupermarket = jest.fn().mockReturnValue(scraper) as never;

  const productService = { bulkSaveProducts: jest.fn(async (products: unknown[]) => products.length) };
  const service = new ScraperService(
    productService as never,
    supermarketRepo as never,
    scrapeLogRepo as never,
  );
  return { service, update, scraper, status, create, reapStaleRuns };
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

  it('will not let a terminal update overwrite a row reapStaleRuns closed', async () => {
    // reapStaleRuns runs in another process, so the database is the only
    // place the two writers can be ordered.
    const scraper = fakeScraper(async () => []);
    const { update, status } = harness(scraper);

    status.current = 'failed';
    const wrote = await update('log-1', 'success', { onlyIfRunning: true });

    expect(wrote).toBe(0);
    expect(status.current).toBe('failed');
  });

  it('applies the deadline to the supermarket lookup', async () => {
    const scraper = fakeScraper(async () => []);
    const { service } = harness(scraper);
    // A wedged pool must not hold the run open before the first timed call.
    (service as never as { supermarketRepository: { findById: jest.Mock } })
      .supermarketRepository.findById.mockImplementation(() => new Promise(() => {}));

    const result = await service.runScraper('1', { deadlineMs: 50 });

    expect(result.errors[0].message).toMatch(/deadline/i);
    expect(scraper.initialize).not.toHaveBeenCalled();
  });

  it('reaps stale rows on the single-scraper path too', async () => {
    // Reaping used to live only in runAllScrapers, so `scraper:run -- voli`
    // and both API triggers left previously-stranded rows on 'running'.
    const { service, reapStaleRuns } = harness(fakeScraper(async () => []));

    await service.runScraper('1', { deadlineMs: 10_000 });

    expect(reapStaleRuns).toHaveBeenCalledTimes(1);
  });

  it('reaps once per run, not once per scraper', async () => {
    const { service, reapStaleRuns } = harness(fakeScraper(async () => []));

    await service.runScraper('1', { deadlineMs: 10_000 });
    await service.runScraper('1', { deadlineMs: 10_000 });

    expect(reapStaleRuns).toHaveBeenCalledTimes(1);
  });

  it('keeps reaping on a long-lived service instead of only once ever', async () => {
    // The API's ScraperService is module-level and lives as long as the
    // server, so a permanent memo would reap on the first trigger after boot
    // and never again.
    const { service, reapStaleRuns } = harness(fakeScraper(async () => []));
    const realNow = Date.now();

    await service.runScraper('1', { deadlineMs: 10_000 });
    expect(reapStaleRuns).toHaveBeenCalledTimes(1);

    const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + REAP_INTERVAL_MS + 1);
    try {
      await service.runScraper('1', { deadlineMs: 10_000 });
      expect(reapStaleRuns).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('retries a reap that failed once the interval has passed', async () => {
    const { service, reapStaleRuns } = harness(fakeScraper(async () => []));
    reapStaleRuns.mockRejectedValueOnce(new Error('deadlock'));
    const realNow = Date.now();

    await service.runScraper('1', { deadlineMs: 10_000 });

    const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + REAP_INTERVAL_MS + 1);
    try {
      await service.runScraper('1', { deadlineMs: 10_000 });
      // A transient failure must not disable reaping for the process lifetime.
      expect(reapStaleRuns).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('runs the scrape even if reaping fails', async () => {
    const { service, reapStaleRuns, scraper } = harness(fakeScraper(async () => []));
    reapStaleRuns.mockRejectedValueOnce(new Error('deadlock'));

    const result = await service.runScraper('1', { deadlineMs: 10_000 });

    expect(scraper.scrapeProductList).toHaveBeenCalled();
    expect(result.errors).toHaveLength(0);
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
  it.each(['0', '-1', 'abc', ''])('falls back to the default for %p', raw => {
    expect(resolveDeadlineMs(raw)).toBe(FALLBACK_SCRAPER_DEADLINE_MS);
  });

  it('falls back when the variable is unset', () => {
    // Read through the default parameter, so the real env has to be cleared
    // or this asserts against whatever the developer happens to have set.
    const previous = process.env.SCRAPER_DEADLINE_MS;
    delete process.env.SCRAPER_DEADLINE_MS;
    try {
      expect(resolveDeadlineMs()).toBe(FALLBACK_SCRAPER_DEADLINE_MS);
    } finally {
      if (previous === undefined) delete process.env.SCRAPER_DEADLINE_MS;
      else process.env.SCRAPER_DEADLINE_MS = previous;
    }
  });
});
