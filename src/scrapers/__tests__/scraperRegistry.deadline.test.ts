// Importing the registry pulls in every scraper, and BaseScraper's logger
// validates the environment at import time. Same stub the service tests use.
jest.mock('../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import { getScraperDeadlineMs } from '../scraperRegistry';
import { FALLBACK_SCRAPER_DEADLINE_MS } from '../scraperDeadline';

describe('per-scraper deadline overrides', () => {
  it('gives Woolworths a budget long enough to reach its last category', () => {
    // The 45-minute fallback cut Woolworths on every run: 9 of 13 categories,
    // with Pantry stopped at page 60 of ~238. It needs hours, not minutes.
    const budget = getScraperDeadlineMs('WoolworthsScraper');

    expect(budget).toBeGreaterThan(FALLBACK_SCRAPER_DEADLINE_MS);
  });

  it('leaves a scraper with no override on the default budget', () => {
    expect(getScraperDeadlineMs('MigrosScraper')).toBeUndefined();
  });

  it('has no override for an unknown scraper class', () => {
    expect(getScraperDeadlineMs('NoSuchScraper')).toBeUndefined();
  });
});
