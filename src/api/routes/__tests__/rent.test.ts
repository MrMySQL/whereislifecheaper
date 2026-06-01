import { groupRentRowsByCountry } from '../rent';
import { RentStatCountryRow } from '../../../repositories/RentStatsRepository';

function r(over: Partial<RentStatCountryRow>): RentStatCountryRow {
  return {
    code: 'UA', name: 'Ukraine', city: 'Kyiv', currency: 'UAH',
    period_start: '2026-05-02', period_end: '2026-06-01',
    bedrooms: 0, median: '16468', n_listings: 1100, ...over,
  };
}

describe('groupRentRowsByCountry', () => {
  test('nests buckets under one entry per country with numeric median', () => {
    const out = groupRentRowsByCountry([
      r({ bedrooms: 0, median: '16468', n_listings: 1100 }),
      r({ bedrooms: 1, median: '22931', n_listings: 800 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].country).toEqual({ code: 'UA', name: 'Ukraine' });
    expect(out[0].city).toBe('Kyiv');
    expect(out[0].currency).toBe('UAH');
    expect(out[0].buckets).toEqual([
      { bedrooms: 0, median: 16468, n_listings: 1100 },
      { bedrooms: 1, median: 22931, n_listings: 800 },
    ]);
  });

  test('separates rows from different countries', () => {
    const out = groupRentRowsByCountry([
      r({ code: 'UA', name: 'Ukraine' }),
      r({ code: 'TR', name: 'Turkey', currency: 'TRY' }),
    ]);
    expect(out.map((c) => c.country.code).sort()).toEqual(['TR', 'UA']);
  });

  test('keeps separate entries for multiple cities in the same country', () => {
    const out = groupRentRowsByCountry([
      r({ code: 'UA', name: 'Ukraine', city: 'Kyiv', bedrooms: 0 }),
      r({ code: 'UA', name: 'Ukraine', city: 'Lviv', bedrooms: 1 }),
    ]);

    expect(out).toHaveLength(2);
    expect(out.map((c) => c.city).sort()).toEqual(['Kyiv', 'Lviv']);
    expect(out.find((c) => c.city === 'Kyiv')!.buckets).toEqual([
      { bedrooms: 0, median: 16468, n_listings: 1100 },
    ]);
    expect(out.find((c) => c.city === 'Lviv')!.buckets).toEqual([
      { bedrooms: 1, median: 16468, n_listings: 1100 },
    ]);
  });

  test('returns [] for no rows', () => {
    expect(groupRentRowsByCountry([])).toEqual([]);
  });
});
