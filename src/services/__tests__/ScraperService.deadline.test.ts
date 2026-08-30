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
  update.mockImplementation(async (_id: string, next: string, data?: { onlyIfRunning?: boolean }) => {
    if (data?.onlyIfRunning && status.current !== 'running') return 0;
    status.current = next;
    return 1;
  });
  const failIfRunning = jest.fn(async () => {
    if (status.current !== 'running') return 0;
    status.current = 'failed';
    return 1;
  });
  const create = jest.fn().mockResolvedValue('log-1');
  const scrapeLogRepo = { create, update, failIfRunning };

  mockedFactory.createFromSupermarket = jest.fn().mockReturnValue(scraper) as never;

  const productService = { bulkSaveProducts: jest.fn(async (products: unknown[]) => products.length) };
  const service = new ScraperService(
    productService as never,
    supermarketRepo as never,
    scrapeLogRepo as never,
  );
  return { service, update, scraper, failIfRunning, status, create };
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
    const { service, failIfRunning, status } = harness(scraper);

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
  });

  it('will not let a terminal update overwrite a row shutdown already closed', async () => {
    // The in-process flag is read one await before the write lands, so the
    // guard that actually orders the two writers is the SQL one.
    const scraper = fakeScraper(async () => []);
    const { update, status } = harness(scraper);

    status.current = 'failed';
    const wrote = await update('log-1', 'success', { onlyIfRunning: true });

    expect(wrote).toBe(0);
    expect(status.current).toBe('failed');
  });

  it('closes a scrape log created after its run was abandoned', async () => {
    // create() outlives the setup deadline: the row still gets inserted, and
    // nothing in runScraper is left to close it.
    let finishCreate: ((id: string) => void) | undefined;
    const scraper = fakeScraper(async () => []);
    const { service, failIfRunning, create } = harness(scraper);
    create.mockImplementation(() => new Promise<string>(resolve => { finishCreate = resolve; }));

    const result = await service.runScraper('1', { deadlineMs: 50 });
    expect(result.errors[0].message).toMatch(/deadline/i);

    // The insert lands after the deadline already gave up on it.
    finishCreate!('log-late');
    await new Promise(r => setImmediate(r));

    expect(failIfRunning).toHaveBeenCalledWith('log-late', expect.stringMatching(/abandoned/i));
  });

  it('waits for an insert still in flight before shutdown returns', async () => {
    // The row exists in the database but its id has not reached inFlightLogs
    // yet, so an unguarded markInFlightFailed would return and let the
    // process exit with the row stranded on 'running'.
    let finishCreate: ((id: string) => void) | undefined;
    const scraper = fakeScraper(async () => []);
    const { service, failIfRunning, create } = harness(scraper);
    create.mockImplementation(() => new Promise<string>(resolve => { finishCreate = resolve; }));

    const run = service.runScraper('1', { deadlineMs: 10_000 });
    await new Promise(r => setImmediate(r));
    expect(finishCreate).toBeDefined();

    // Signal arrives mid-insert. Shutdown must still be waiting: if it
    // returns here the caller exits the process and the row is stranded.
    let settled = false;
    const shutdown = service.markInFlightFailed('SIGTERM', 2000).then(n => { settled = true; return n; });
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(settled).toBe(false);

    finishCreate!('log-mid');
    await shutdown;

    expect(settled).toBe(true);
    expect(failIfRunning).toHaveBeenCalledWith('log-mid', expect.any(String));
    void run;
  });

  it('closes known rows even when another insert never lands', async () => {
    // With concurrent scrapers, one wedged insert must not hold every other
    // scraper's row on 'running' until the forced exit fires.
    const scraper = fakeScraper(() => new Promise<unknown[]>(() => {}));
    const { service, failIfRunning, create } = harness(scraper);

    // First run registers log-known; second run's insert never settles.
    create.mockResolvedValueOnce('log-known');
    const runA = service.runScraper('1', { deadlineMs: 10_000 });
    await new Promise(r => setImmediate(r));

    let finishB: ((id: string) => void) | undefined;
    create.mockImplementationOnce(() => new Promise<string>(res => { finishB = res; }));
    const runB = service.runScraper('2', { deadlineMs: 10_000 });
    await new Promise(r => setImmediate(r));

    // Generous grace: the point is that log-known does not wait for it.
    const shutdown = service.markInFlightFailed('SIGTERM', 5000);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    expect(failIfRunning).toHaveBeenCalledWith('log-known', 'SIGTERM');

    finishB!('log-b');
    await shutdown;
    void runA; void runB;
  });

  it('records the signal on a row created after shutdown began', async () => {
    let finishCreate: ((id: string) => void) | undefined;
    const scraper = fakeScraper(async () => []);
    const { service, failIfRunning, create } = harness(scraper);
    create.mockImplementation(() => new Promise<string>(resolve => { finishCreate = resolve; }));

    const run = service.runScraper('1', { deadlineMs: 10_000 });
    await new Promise(r => setImmediate(r));

    const shutdown = service.markInFlightFailed('Process received SIGTERM', 2000);
    finishCreate!('log-late');
    await shutdown;

    // The row's error_message is the only record of why it stopped.
    expect(failIfRunning).toHaveBeenCalledWith('log-late', 'Process received SIGTERM');
    void run;
  });

  it('does not open a new scrape log once shutdown has begun', async () => {
    const scraper = fakeScraper(async () => []);
    const { service, create } = harness(scraper);

    await service.markInFlightFailed('SIGTERM');
    const result = await service.runScraper('1', { deadlineMs: 10_000 });

    expect(create).not.toHaveBeenCalled();
    expect(result.errors[0].message).toMatch(/shutting down/i);
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
