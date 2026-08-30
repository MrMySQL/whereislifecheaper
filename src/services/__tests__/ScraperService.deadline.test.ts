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
  // Models the SQL guard: only a row still 'running' can be closed this way.
  const status = { current: 'running' };
  update.mockImplementation(async (_id: string, next: string) => { status.current = next; });
  const failIfRunning = jest.fn(async () => {
    if (status.current !== 'running') return 0;
    status.current = 'failed';
    return 1;
  });
  const scrapeLogRepo = { create: jest.fn().mockResolvedValue('log-1'), update, failIfRunning };

  mockedFactory.createFromSupermarket = jest.fn().mockReturnValue(scraper) as never;

  const productService = { bulkSaveProducts: jest.fn(async (products: unknown[]) => products.length) };
  const service = new ScraperService(
    productService as never,
    supermarketRepo as never,
    scrapeLogRepo as never,
  );
  return { service, update, scraper, failIfRunning, status };
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

  it('closes an in-flight scrape log on shutdown, and the scrape cannot reopen it', async () => {
    let release: (() => void) | undefined;
    const scraper = fakeScraper(() => new Promise<unknown[]>(resolve => {
      release = () => resolve([]);
    }));
    const { service, update, failIfRunning, status } = harness(scraper);

    const run = service.runScraper('1', { deadlineMs: 10_000 });
    await new Promise(r => setImmediate(r));

    expect(await service.markInFlightFailed('SIGTERM')).toBe(1);
    expect(failIfRunning).toHaveBeenCalledWith('log-1', 'SIGTERM');
    expect(status.current).toBe('failed');

    // Let the scrape finish. Without the shuttingDown guard it would write
    // 'partial' over the shutdown's 'failed'.
    release!();
    await run;

    expect(status.current).toBe('failed');
    expect(update).not.toHaveBeenCalledWith('log-1', 'partial', expect.anything());
  });

  it('does not overwrite a run that completed before shutdown landed', async () => {
    const scraper = fakeScraper(async () => []);
    const { service, failIfRunning, status } = harness(scraper);

    await service.runScraper('1', { deadlineMs: 10_000 });
    expect(status.current).toBe('partial');

    // runScraper drops the id once it closes the row, so shutdown has nothing
    // left to close and cannot clobber the status it earned.
    expect(await service.markInFlightFailed('SIGTERM')).toBe(0);
    expect(failIfRunning).not.toHaveBeenCalled();
    expect(status.current).toBe('partial');
  });

  it('keeps a log id for retry when closing it fails', async () => {
    let release: (() => void) | undefined;
    const scraper = fakeScraper(() => new Promise<unknown[]>(resolve => {
      release = () => resolve([]);
    }));
    const { service, failIfRunning } = harness(scraper);

    const run = service.runScraper('1', { deadlineMs: 10_000 });
    await new Promise(r => setImmediate(r));

    failIfRunning.mockRejectedValueOnce(new Error('connection lost'));
    expect(await service.markInFlightFailed('SIGTERM')).toBe(0);

    // Still tracked, so a second attempt closes it rather than stranding the
    // row on 'running' until reapStaleRuns catches it 8 hours later.
    expect(await service.markInFlightFailed('SIGTERM')).toBe(1);

    release!();
    await run;
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
