import { query } from '../../config/database';
import { PriceRepository, PRICE_PERIOD_MAX_GAP_DAYS } from '../PriceRepository';
import { QuantityInterpretation } from '../../utils/productQuantity';

jest.mock('../../config/database', () => ({ query: jest.fn() }));

const mockedQuery = query as jest.MockedFunction<typeof query>;

/** The observation the write sent, as the SQL's jsonb_to_recordset receives it. */
function sentObservation(): Record<string, unknown> {
  const [sql, params] = mockedQuery.mock.calls[0];
  expect(sql).toContain('INSERT INTO prices');
  expect(params?.[1]).toBe(PRICE_PERIOD_MAX_GAP_DAYS);
  const observations = JSON.parse(params?.[0] as string);
  expect(observations).toHaveLength(1);
  return observations[0];
}

describe('PriceRepository.recordPrice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedQuery.mockResolvedValue({
      rows: [{ continued: '0', inserted: '1' }], rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    });
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

      expect(sentObservation()).toEqual({
        idx: 0, mapping_id: 12, price: 6, currency: 'EUR', original_price: null,
        is_on_sale: false, price_per_unit: null, quantity_info: quantityInfo,
      });
    },
  );

  test('retains the legacy unit price for a record without quantity interpretation', async () => {
    await new PriceRepository().recordPrice('12', {
      price: 6, currency: 'EUR', isOnSale: false, pricePerUnit: 3,
    });

    expect(sentObservation()).toMatchObject({ price_per_unit: 3, quantity_info: null });
  });

  test('reports how many observations continued or opened a period', async () => {
    await expect(new PriceRepository().recordPrice('12', {
      price: 6, currency: 'EUR', isOnSale: false,
    })).resolves.toEqual({ continued: 0, inserted: 1 });
  });

  test('skips an unusable price without querying', async () => {
    await expect(new PriceRepository().recordPrice('12', {
      price: 0, currency: 'EUR', isOnSale: false,
    })).resolves.toEqual({ continued: 0, inserted: 0 });
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
