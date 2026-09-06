import { query } from '../../config/database';
import { PriceRepository } from '../PriceRepository';
import { QuantityInterpretation } from '../../utils/productQuantity';

jest.mock('../../config/database', () => ({ query: jest.fn() }));

const mockedQuery = query as jest.MockedFunction<typeof query>;

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
