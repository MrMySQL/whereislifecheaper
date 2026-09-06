import { assessScrapeResult } from '../scrapeRunHealth';
import { ScrapeResult } from '../../types/scraper.types';

function result(overrides: Partial<ScrapeResult> = {}): ScrapeResult {
  return {
    supermarketId: '1',
    products: [],
    scrapedAt: new Date(),
    duration: 1000,
    productsScraped: 100,
    productsFailed: 0,
    errors: [],
    categoryErrors: [],
    categoriesAttempted: 16,
    categoriesFailed: 0,
    ...overrides,
  };
}

const failures = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ message: `Failed to scrape category: cat-${i}`, timestamp: new Date() }));

describe('assessScrapeResult', () => {
  it('passes a healthy run', () => {
    expect(assessScrapeResult(result()).degraded).toBe(false);
  });

  it('fails a run that stored nothing', () => {
    // Auchan UA on 2026-09-04: blocked, 0 products, still exited the scraper cleanly.
    const health = assessScrapeResult(result({ productsScraped: 0 }));

    expect(health.degraded).toBe(true);
    expect(health.reasons.join(' ')).toMatch(/stored 0 products/i);
  });

  it('fails a run whose scrape itself errored', () => {
    // Woolworths hitting its deadline: real data stored, run still truncated.
    const health = assessScrapeResult(result({
      errors: [{ message: 'Scraper exceeded its 45 minute deadline', timestamp: new Date() }],
    }));

    expect(health.degraded).toBe(true);
    expect(health.reasons.join(' ')).toMatch(/deadline/i);
  });

  it('fails a run that lost half its categories despite storing products', () => {
    const health = assessScrapeResult(result({
      categoriesFailed: 8,
      categoryErrors: failures(8),
    }));

    expect(health.degraded).toBe(true);
    expect(health.reasons.join(' ')).toMatch(/8 of 16 categories/);
  });

  it('tolerates a single dead category', () => {
    // Mercadona's seasonal Turrones returns 410 Gone on every run. One dead
    // category is not a failed scrape, and must not paint the job red daily.
    const health = assessScrapeResult(result({
      categoriesFailed: 1,
      categoryErrors: failures(1),
    }));

    expect(health.degraded).toBe(false);
  });

  it('judges a scraper that reports no category counts on its products alone', () => {
    // Scrapers that override scrapeProductList never touch the counters.
    const health = assessScrapeResult(result({
      categoriesAttempted: 0,
      categoriesFailed: 0,
      categoryErrors: undefined,
    }));

    expect(health.degraded).toBe(false);
  });
});
