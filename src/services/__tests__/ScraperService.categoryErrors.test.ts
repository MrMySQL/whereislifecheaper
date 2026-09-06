jest.mock('../../scrapers/base/ScraperFactory');
jest.mock('../../scrapers/scraperRegistry', () => ({
  getScraperCategories: jest.fn(() => []),
  getScraperDeadlineMs: jest.fn(() => undefined),
}));
jest.mock('../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import { fakeScraper, harness, PageCallback } from './scraperServiceHarness';

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
  scraper.getErrors.mockReturnValue(
    Array.from({ length: failed }, (_, i) => ({
      message: `Failed to scrape category: cat-${i}`,
      timestamp: new Date(),
    }))
  );
  return scraper;
}

describe('ScraperService category failure reporting', () => {
  afterEach(() => jest.clearAllMocks());

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
});
