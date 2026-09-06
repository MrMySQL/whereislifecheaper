import { ScraperFactory } from '../../scrapers/base/ScraperFactory';
import { ScraperService } from '../ScraperService';

/**
 * Shared fixtures for the ScraperService tests.
 *
 * Not a test file: jest collects only *.test.ts. The module mocks these rely
 * on (ScraperFactory, scraperRegistry, logger) must be declared by each test
 * file, since jest.mock is hoisted per-module.
 */

export type PageCallback = (products: unknown[], pageInfo: unknown) => Promise<number>;

/** Minimal BaseScraper stand-in whose scrapeProductList we control. */
export function fakeScraper(scrapeProductList: () => Promise<unknown[]>) {
  return {
    setRunId: jest.fn(),
    setOnPageScrapedCallback: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
    scrapeProductList: jest.fn(scrapeProductList),
    cleanup: jest.fn().mockResolvedValue(undefined),
    getErrors: jest.fn(() => [] as unknown[]),
    getCategoryErrors: jest.fn(() => [] as unknown[]),
    getCategoryStats: jest.fn(() => ({ attempted: 0, failed: 0 })),
  };
}

export function harness(scraper: ReturnType<typeof fakeScraper>) {
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

  const mockedFactory = ScraperFactory as jest.Mocked<typeof ScraperFactory>;
  mockedFactory.createFromSupermarket = jest.fn().mockReturnValue(scraper) as never;

  const productService = { bulkSaveProducts: jest.fn(async (products: unknown[]) => products.length) };
  const service = new ScraperService(
    productService as never,
    supermarketRepo as never,
    scrapeLogRepo as never,
  );
  return { service, update, scraper, status, create, reapStaleRuns };
}
