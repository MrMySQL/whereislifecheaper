jest.mock('../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import { BaseScraper } from '../base/BaseScraper';
import { CategoryConfig, ProductData, ScraperConfig } from '../../types/scraper.types';

const categories: CategoryConfig[] = [
  { id: 'a', name: 'Dairy', url: '/dairy' },
  { id: 'b', name: 'Meat', url: '/meat' },
  { id: 'c', name: 'Fish', url: '/fish' },
  { id: 'd', name: 'Bread', url: '/bread' },
];

function testConfig(): ScraperConfig {
  return {
    supermarketId: '1',
    name: 'Testmarket',
    baseUrl: 'https://example.test',
    categories,
    selectors: { productCard: '', productName: '', productPrice: '' },
    waitTimes: { pageLoad: 0, dynamicContent: 0, betweenRequests: 0, betweenPages: 0 },
    maxRetries: 1,
    concurrentPages: 1,
  };
}

/** Fails whichever categories are named, scrapes one product from the rest. */
class PartlyBrokenScraper extends BaseScraper {
  constructor(private readonly failing: string[]) {
    super(testConfig());
  }
  async initialize(): Promise<void> {}
  async cleanup(): Promise<void> {}
  async scrapeProductDetails(): Promise<ProductData> {
    throw new Error('not used');
  }
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    if (this.failing.includes(category.name)) {
      throw new Error(`${category.name} is blocked`);
    }
    return [{ name: `${category.name} product`, price: 1, currency: 'EUR' } as ProductData];
  }
}

describe('BaseScraper category accounting', () => {
  it('reports how many categories were attempted and how many failed', async () => {
    // Auchan UA lost all 16 categories to a Cloudflare block on 2026-09-04 and
    // the run result still said "Errors: 0" — nothing counted the casualties.
    const scraper = new PartlyBrokenScraper(['Meat', 'Fish']);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 4, failed: 2 });
  });

  it('exposes the errors it collected for the failed categories', async () => {
    const scraper = new PartlyBrokenScraper(['Meat']);

    await scraper.scrapeProductList();

    const errors = scraper.getErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Meat/);
  });

  it('counts nothing failed when every category succeeds', async () => {
    const scraper = new PartlyBrokenScraper([]);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 4, failed: 0 });
    expect(scraper.getErrors()).toEqual([]);
  });
});
