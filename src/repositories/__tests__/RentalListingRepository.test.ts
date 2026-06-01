jest.mock('../../config/database', () => ({ query: jest.fn() }));
import { query } from '../../config/database';
import { RentalListingRepository } from '../RentalListingRepository';
import { RentListingNormalized } from '../../scrapers/rent/types';

const mockQuery = query as jest.Mock;

function listing(over: Partial<RentListingNormalized> = {}): RentListingNormalized {
  return {
    source: 'olx',
    url: 'https://www.olx.ua/d/uk/obyavlenie/x-ID1.html',
    sourceListingId: '1',
    priceOriginal: 20000,
    currencyOriginal: 'UAH',
    priceLocal: 20000,
    bedrooms: 1,
    sqm: 50,
    district: 'Центр',
    ...over,
  };
}

beforeEach(() => mockQuery.mockReset());

describe('RentalListingRepository.insertMany', () => {
  test('returns 0 and does not query for an empty list', async () => {
    const repo = new RentalListingRepository();
    const n = await repo.insertMany(1, 'Kyiv', []);
    expect(n).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('builds a multi-row insert with ON CONFLICT DO NOTHING and 11 params per row', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 });
    const repo = new RentalListingRepository();
    const n = await repo.insertMany(7, 'Kyiv', [listing({ sourceListingId: '1' }), listing({ sourceListingId: '2' })]);
    expect(n).toBe(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO rental_listings/);
    expect(sql).toMatch(/ON CONFLICT \(source, source_listing_id, scraped_on\) DO NOTHING/);
    expect(params).toHaveLength(22); // 11 columns * 2 rows
    expect(params.slice(0, 11)).toEqual([7, 'Kyiv', 'olx', '1', 1, 50, 20000, 'UAH', 20000, 'Центр', 'https://www.olx.ua/d/uk/obyavlenie/x-ID1.html']);
  });
});

describe('RentalListingRepository.getDedupedForWindow', () => {
  test('queries DISTINCT ON (source, source_listing_id) within the window and returns rows', async () => {
    mockQuery.mockResolvedValue({ rows: [{ bedrooms: 1, sqm: 50, price_local: 20000 }] });
    const repo = new RentalListingRepository();
    const rows = await repo.getDedupedForWindow(7, 30);
    expect(rows).toEqual([{ bedrooms: 1, sqm: 50, price_local: 20000 }]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/DISTINCT ON \(source, source_listing_id\)/);
    expect(sql).toMatch(/scraped_at DESC/);
    expect(params).toEqual([7, 30]);
  });
});
