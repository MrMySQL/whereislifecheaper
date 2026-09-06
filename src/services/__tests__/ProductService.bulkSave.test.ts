jest.mock('../../config/database', () => ({
  getClient: jest.fn(async () => ({ query: jest.fn(), release: jest.fn() })),
  query: jest.fn(),
}));
const warn = jest.fn();
jest.mock('../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: (...a: unknown[]) => warn(...a), error: jest.fn(), debug: jest.fn() };
  return { scraperLogger: stub, logger: stub, createPrefixedLogger: () => stub };
});

import { ProductService } from '../ProductService';
import { ProductData } from '../../types/scraper.types';
import { ProductRepository, ProductMappingRepository, PriceRepository } from '../../repositories';

function product(name: string, sku: string): ProductData {
  return {
    name,
    price: 10,
    currency: 'UAH',
    isOnSale: false,
    productUrl: `https://express.auchan.ua/${sku}/`,
    externalId: sku,
    isAvailable: true,
  };
}

/** Every product is new, so the whole page goes through batchCreateProductsAndMappings. */
function harness() {
  const mappingRepo = {
    batchFindMappingsByExternalIds: jest.fn().mockResolvedValue([]),
    batchFindMappingsByUrls: jest.fn().mockResolvedValue([]),
    batchFindMappingsByNameAndBrand: jest.fn().mockResolvedValue([]),
    batchUpdateExistingProducts: jest.fn().mockResolvedValue(undefined),
    batchCreateProductsAndMappings: jest.fn(async (products: ProductData[]) =>
      products.map((_, i) => `mapping-${i}`)
    ),
    recordObservations: jest.fn().mockResolvedValue(undefined),
  };
  const priceRepo = { batchInsertPrices: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductService(
    {} as ProductRepository,
    mappingRepo as unknown as ProductMappingRepository,
    priceRepo as unknown as PriceRepository
  );
  return { service, mappingRepo, priceRepo };
}

beforeEach(() => warn.mockClear());

describe('ProductService.bulkSaveProducts and products without a name', () => {
  // Auchan Express, Daily Scrape 2026-09-01 (run 33486310692): 4 items came
  // back from the GraphQL API with name = null and nothing but an image URL.
  // products.name is NOT NULL, so the UNNEST insert failed with 23502 for the
  // whole batch — twice — and the run fell back to per-product saves.

  it('drops a product whose name is null before it reaches the repository', async () => {
    const { service, mappingRepo } = harness();
    const nameless = { ...product('', 'ghost'), name: null as unknown as string, externalId: undefined };

    const saved = await service.bulkSaveProducts(
      [product('Молоко 2.5% 1 л', '100'), nameless, product('Хліб житній', '101')],
      '7',
      'UAH'
    );

    expect(mappingRepo.batchCreateProductsAndMappings).toHaveBeenCalledTimes(1);
    const created = mappingRepo.batchCreateProductsAndMappings.mock.calls[0][0] as ProductData[];
    expect(created.map((p) => p.name)).toEqual(['Молоко 2.5% 1 л', 'Хліб житній']);
    expect(saved).toBe(2);
  });

  it('treats an empty or whitespace-only name the same way', async () => {
    const { service, mappingRepo } = harness();

    await service.bulkSaveProducts(
      [product('', '1'), product('   ', '2'), product('Сир', '3')],
      '7',
      'UAH'
    );

    const created = mappingRepo.batchCreateProductsAndMappings.mock.calls[0][0] as ProductData[];
    expect(created.map((p) => p.name)).toEqual(['Сир']);
  });

  it('says how many it dropped, so the loss is visible in the run log', async () => {
    const { service } = harness();
    const nameless = { ...product('', 'ghost'), name: null as unknown as string };

    await service.bulkSaveProducts([nameless, nameless, product('Сир', '3')], '7', 'UAH');

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/2 .*without a name/i), expect.anything());
  });

  it('saves nothing and touches no repository when every product is nameless', async () => {
    const { service, mappingRepo } = harness();
    const nameless = { ...product('', 'ghost'), name: null as unknown as string };

    const saved = await service.bulkSaveProducts([nameless], '7', 'UAH');

    expect(saved).toBe(0);
    expect(mappingRepo.batchFindMappingsByExternalIds).not.toHaveBeenCalled();
    expect(mappingRepo.batchCreateProductsAndMappings).not.toHaveBeenCalled();
  });
});
