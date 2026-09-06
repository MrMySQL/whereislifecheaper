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

/**
 * The shape most real scrapers have: a try/catch around the whole category
 * that logs and returns whatever was collected, so nothing ever reaches
 * BaseScraper's catch.
 */
class SwallowingScraper extends PartlyBrokenScraper {
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    try {
      return await super.scrapeCategory(category);
    } catch (error) {
      this.failCategory(category, error, `https://example.test${category.url}`);
      return [];
    }
  }
}

/** Per-page loop: page errors are logged and the loop carries on. */
class PagedScraper extends BaseScraper {
  constructor(private readonly pageOutcomes: Record<string, Array<'ok' | 'fail'>>) {
    super(testConfig());
  }
  async initialize(): Promise<void> {}
  async cleanup(): Promise<void> {}
  async scrapeProductDetails(): Promise<ProductData> {
    throw new Error('not used');
  }
  protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
    const products: ProductData[] = [];
    (this.pageOutcomes[category.name] ?? ['ok']).forEach((outcome, i) => {
      if (outcome === 'fail') {
        this.logError(`Failed to scrape page ${i + 1} of ${category.name}`, `${category.url}?page=${i + 1}`);
      } else {
        products.push({ name: `${category.name} p${i + 1}`, price: 1, currency: 'EUR' } as ProductData);
      }
    });
    return products;
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

    const errors = scraper.getCategoryErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Meat/);
    expect(scraper.getErrors()).toEqual([]);
  });

  it('counts nothing failed when every category succeeds', async () => {
    const scraper = new PartlyBrokenScraper([]);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 4, failed: 0 });
    expect(scraper.getErrors()).toEqual([]);
  });

  it('counts a category the scraper caught and swallowed as failed', async () => {
    // Fourteen scrapers wrap scrapeCategory in their own try/catch and return
    // an empty array. Auchan UA was one of them: 16 categories blocked, none
    // thrown, and the counters that were meant to catch exactly this stayed 0.
    const scraper = new SwallowingScraper(['Meat', 'Fish']);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 4, failed: 2 });
    expect(scraper.getCategoryErrors().map(e => e.message)).toEqual([
      expect.stringMatching(/Meat/),
      expect.stringMatching(/Fish/),
    ]);
  });

  it('keeps category failures out of the page-and-product error buffer', async () => {
    const scraper = new SwallowingScraper(['Meat']);

    await scraper.scrapeProductList();

    expect(scraper.getErrors()).toEqual([]);
    expect(scraper.getCategoryErrors()).toHaveLength(1);
    expect(scraper.getCategoryErrors()[0].productUrl).toBe('https://example.test/meat');
  });

  it('counts a category once when it is marked failed and then thrown', async () => {
    class MarkAndThrow extends PartlyBrokenScraper {
      protected async scrapeCategory(category: CategoryConfig): Promise<ProductData[]> {
        try {
          return await super.scrapeCategory(category);
        } catch (error) {
          this.failCategory(category, error);
          throw error;
        }
      }
    }
    const scraper = new MarkAndThrow(['Meat']);

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 4, failed: 1 });
    expect(scraper.getCategoryErrors()).toHaveLength(1);
  });

  it('treats a category that produced nothing but page errors as failed', async () => {
    // Migros, Arbuz, Spar and friends log each page and carry on. When the
    // first page is the one that is blocked, the category quietly yields [].
    const scraper = new PagedScraper({ Meat: ['fail'], Fish: ['fail', 'fail'] });

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 4, failed: 2 });
    expect(scraper.getCategoryErrors().map(e => e.message)).toEqual([
      expect.stringMatching(/Meat.*1 error/),
      expect.stringMatching(/Fish.*2 errors/),
    ]);
    // The page errors themselves stay where they were.
    expect(scraper.getErrors()).toHaveLength(3);
  });

  it('does not fail a category that lost a page but still produced products', async () => {
    const scraper = new PagedScraper({ Meat: ['ok', 'fail', 'ok'] });

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 4, failed: 0 });
    expect(scraper.getCategoryErrors()).toEqual([]);
    expect(scraper.getErrors()).toHaveLength(1);
  });

  it('does not fail a category that is legitimately empty', async () => {
    const scraper = new PagedScraper({ Meat: [] });

    await scraper.scrapeProductList();

    expect(scraper.getCategoryStats()).toEqual({ attempted: 4, failed: 0 });
  });
});
