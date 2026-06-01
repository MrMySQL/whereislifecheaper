jest.mock('../../config/database', () => ({ query: jest.fn() }));
import { query } from '../../config/database';
import { RentStatsRepository } from '../RentStatsRepository';

const mockQuery = query as jest.Mock;
beforeEach(() => mockQuery.mockReset());

describe('RentStatsRepository.upsert', () => {
  test('inserts with ON CONFLICT upsert on (country_id, city, bedrooms, period_end)', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const repo = new RentStatsRepository();
    await repo.upsert({
      countryId: 7, city: 'Kyiv', bedrooms: 1,
      periodStart: '2026-05-02', periodEnd: '2026-06-01',
      median: 22931, currency: 'UAH', nListings: 800,
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO rental_stats/);
    expect(sql).toMatch(/ON CONFLICT \(country_id, city, bedrooms, period_end\)\s*DO UPDATE/);
    expect(params).toEqual([7, 'Kyiv', 1, '2026-05-02', '2026-06-01', 22931, 'UAH', 800]);
  });
});

describe('RentStatsRepository.getLatestGroupedByCountry', () => {
  test('joins countries and returns rows for the latest period per country/city', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const repo = new RentStatsRepository();
    await repo.getLatestGroupedByCountry();
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN countries/);
    expect(sql).toMatch(/MAX\(period_end\)/);
  });
});
