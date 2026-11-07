import { query } from '../../config/database';
import { PriceRepository } from '../PriceRepository';
import { QuantityInterpretation } from '../../utils/productQuantity';

jest.mock('../../config/database', () => ({ query: jest.fn() }));

const mockedQuery = query as jest.MockedFunction<typeof query>;

describe('PriceRepository.cleanupOld', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 7, command: 'DELETE', oid: 0, fields: [] });
  });

  test('deletes rows past the window but keeps each mapping\'s newest price', async () => {
    await expect(new PriceRepository().cleanupOld(30)).resolves.toBe(7);
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toContain('DELETE FROM prices');
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('newer.product_mapping_id = p.product_mapping_id');
    expect(params).toEqual([30]);
  });

  test.each([0, -1, 1.5, NaN])('rejects invalid retention %p without querying', async (days) => {
    await expect(new PriceRepository().cleanupOld(days)).rejects.toThrow('daysToKeep');
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

describe('PriceRepository.recordPrice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });
  });

  test.each(['unknown', 'conflict'] as const)(
    'preserves quantity abstention for %s contents despite a legacy unit price',
    async (status) => {
      const quantityInfo: QuantityInterpretation = {
        version: 1, status, contentQuantity: null, contentUnit: null,
        priceBasis: 'package', comparablePrice: null, evidence: [],
      };
      await new PriceRepository().recordPrice('12', {
        price: 6, currency: 'EUR', isOnSale: false, pricePerUnit: 3, quantityInfo,
      });

      expect(mockedQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO prices'), [
        '12', 6, 'EUR', null, false, null, JSON.stringify(quantityInfo),
      ]);
    },
  );

  test('retains the legacy unit price for a record without quantity interpretation', async () => {
    await new PriceRepository().recordPrice('12', {
      price: 6, currency: 'EUR', isOnSale: false, pricePerUnit: 3,
    });

    expect(mockedQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO prices'), [
      '12', 6, 'EUR', null, false, 3, null,
    ]);
  });
});
