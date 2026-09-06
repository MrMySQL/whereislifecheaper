jest.mock('../../scrapers/base/ScraperFactory');
jest.mock('../../scrapers/scraperRegistry', () => ({
  getScraperCategories: jest.fn(() => []),
  getScraperDeadlineMs: jest.fn(() => undefined),
}));
jest.mock('../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});
jest.mock('../scrapeRunHealth', () => {
  const actual = jest.requireActual('../scrapeRunHealth');
  return { ...actual, assessScrapeResult: jest.fn(actual.assessScrapeResult) };
});

import { fakeScraper, harness, PageCallback } from './scraperServiceHarness';
import { assessScrapeResult } from '../scrapeRunHealth';

const mockedAssess = assessScrapeResult as jest.MockedFunction<typeof assessScrapeResult>;

/** A scraper that stores one product but lost most of its categories. */
function mostlyBrokenScraper(attempted: number, failed: number) {
  let registered: PageCallback | undefined;
  const product = { name: 'Milk', price: 1 };
  const scraper = fakeScraper(async () => {
    await registered!([product], { categoryName: 'Dairy', pageNumber: 1 });
    return [product];
  });
  scraper.setOnPageScrapedCallback.mockImplementation((cb: PageCallback) => {
    registered = cb;
  });
  scraper.getCategoryStats.mockReturnValue({ attempted, failed });
  scraper.getCategoryErrors.mockReturnValue(
    Array.from({ length: failed }, (_, i) => ({
      message: `Failed to scrape category: cat-${i}`,
      timestamp: new Date(),
    }))
  );
  // Page-level noise that must not be mistaken for category failures.
  scraper.getErrors.mockReturnValue([
    { message: 'Failed to scrape page 3 of Dairy', timestamp: new Date() },
  ]);
  return scraper;
}

describe('ScraperService category failure reporting', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockedAssess.mockImplementation(jest.requireActual('../scrapeRunHealth').assessScrapeResult);
  });

  it('carries the scraper category failures into the run result', async () => {
    // Auchan UA lost 16 of 16 categories to a Cloudflare block and the run
    // result still reported "Errors: 0".
    const scraper = mostlyBrokenScraper(16, 15);
    const { service } = harness(scraper);

    const result = await service.runScraper('1', { deadlineMs: 10_000 });

    expect(result.categoriesAttempted).toBe(16);
    expect(result.categoriesFailed).toBe(15);
    expect(result.categoryErrors).toHaveLength(15);
  });

  it('reports only category failures as categoryErrors, not page or product errors', async () => {
    // getErrors() is every logError() call — a lost page in an otherwise
    // healthy category included. Copying that buffer wholesale told readers
    // a category had failed when a page had.
    const scraper = mostlyBrokenScraper(16, 2);
    const { service } = harness(scraper);

    const result = await service.runScraper('1', { deadlineMs: 10_000 });

    expect(result.categoryErrors!.map(e => e.message)).toEqual([
      'Failed to scrape category: cat-0',
      'Failed to scrape category: cat-1',
    ]);
  });

  it('keeps run-level errors separate from category failures', async () => {
    // `errors` stays "the scrape itself failed" — a deadline or a throw —
    // so the callers that already treat it as fatal keep working.
    const scraper = mostlyBrokenScraper(16, 15);
    const { service } = harness(scraper);

    const result = await service.runScraper('1', { deadlineMs: 10_000 });

    expect(result.errors).toEqual([]);
  });

  it('records a run that lost most of its categories as partial, not success', async () => {
    // Storing something is not proof the scrape worked: 15 of 16 categories
    // gone is a failed run wearing a success badge in scrape_logs.
    const scraper = mostlyBrokenScraper(16, 15);
    const { service, update } = harness(scraper);

    await service.runScraper('1', { deadlineMs: 10_000 });

    expect(update).toHaveBeenCalledWith('log-1', 'partial', expect.objectContaining({
      error: expect.stringMatching(/15 of 16 categories/),
    }));
  });

  it('still records a run that lost one category as success', async () => {
    const scraper = mostlyBrokenScraper(16, 1);
    const { service, update } = harness(scraper);

    await service.runScraper('1', { deadlineMs: 10_000 });

    expect(update).toHaveBeenCalledWith('log-1', 'success', expect.anything());
  });

  it('reports a clean run as no categories failed', async () => {
    const scraper = mostlyBrokenScraper(16, 0);
    const { service } = harness(scraper);

    const result = await service.runScraper('1', { deadlineMs: 10_000 });

    expect(result.categoriesFailed).toBe(0);
    expect(result.categoryErrors).toEqual([]);
  });

  it('takes the scrape_logs status from assessScrapeResult, not a copy of its rules', async () => {
    // One definition of "degraded": whatever fails the CI run must also
    // land in scrape_logs as 'partial', with the same reasons.
    const scraper = mostlyBrokenScraper(16, 0);
    const { service, update } = harness(scraper);
    mockedAssess.mockReturnValue({ degraded: true, reasons: ['a rule only the helper knows'] });

    await service.runScraper('1', { deadlineMs: 10_000 });

    expect(mockedAssess).toHaveBeenCalledWith(expect.objectContaining({
      productsScraped: 1,
      categoriesAttempted: 16,
      categoriesFailed: 0,
    }));
    expect(update).toHaveBeenCalledWith('log-1', 'partial', expect.objectContaining({
      error: 'a rule only the helper knows',
    }));
  });

  it('records a healthy run as success with no error text', async () => {
    const scraper = mostlyBrokenScraper(16, 0);
    const { service, update } = harness(scraper);

    await service.runScraper('1', { deadlineMs: 10_000 });

    const successWrite = update.mock.calls.find(c => c[1] === 'success')!;
    expect(successWrite).toBeDefined();
    expect((successWrite[2] as { error?: string }).error).toBeUndefined();
  });

  it('reports a duration that includes the final scrape_logs write', async () => {
    const scraper = mostlyBrokenScraper(16, 0);
    const { service, update } = harness(scraper);
    const original = update.getMockImplementation()!;
    update.mockImplementation(async (...args: unknown[]) => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return original(...(args as Parameters<typeof original>));
    });

    const result = await service.runScraper('1', { deadlineMs: 10_000 });

    const finalWrite = update.mock.calls.find(c => c[1] === 'success')!;
    expect(result.duration).toBeGreaterThanOrEqual((finalWrite[2] as { duration: number }).duration + 25);
  });
});
