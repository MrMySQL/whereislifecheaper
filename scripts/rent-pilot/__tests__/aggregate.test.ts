import { aggregate, percentile } from '../aggregate';
import { ListingNormalized } from '../types';

function l(
  source: 'olx' | 'domria',
  bedrooms: number,
  priceUsd: number,
  sqm: number | null = 50,
): ListingNormalized {
  return {
    source,
    url: `https://example/${priceUsd}`,
    priceLocal: priceUsd * 36,
    currency: 'UAH',
    priceUsd,
    bedrooms,
    sqm,
    district: null,
  };
}

describe('percentile', () => {
  test('p50 of [1..9] = 5', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.5)).toBe(5);
  });

  test('p25 and p75 of [1..9]', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.25)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.75)).toBe(7);
  });

  test('linear interpolation between samples', () => {
    expect(percentile([10, 20], 0.5)).toBe(15);
  });

  test('empty array returns NaN', () => {
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('aggregate', () => {
  test('drops listings with sqm out of range (does not appear in any bucket)', () => {
    const listings: ListingNormalized[] = [
      l('olx', 1, 500, 14),
      l('olx', 1, 500, 301),
      l('olx', 1, 500, 50),
      l('olx', 1, 500, 50),
    ];
    const out = aggregate(listings);
    const bucket = out.find((b) => b.source === 'olx' && b.bedrooms === 1)!;
    expect(bucket.nListings).toBe(2);
    expect(bucket.nDropped).toBe(0);
  });

  test('keeps listings with null sqm (size unknown but price+rooms known)', () => {
    const listings: ListingNormalized[] = Array.from({ length: 4 }, () => l('olx', 1, 500, null));
    const out = aggregate(listings);
    const bucket = out.find((b) => b.source === 'olx' && b.bedrooms === 1)!;
    expect(bucket.nListings).toBe(4);
  });

  test('trims top 5% and bottom 5% of priceUsd per bucket', () => {
    const listings: ListingNormalized[] = [];
    for (let i = 1; i <= 100; i++) listings.push(l('olx', 1, i));
    const out = aggregate(listings);
    const bucket = out.find((b) => b.source === 'olx' && b.bedrooms === 1)!;
    expect(bucket.nListings).toBe(90);
    expect(bucket.nDropped).toBe(10);
    expect(bucket.medianUsd).toBeCloseTo(50.5, 2);
  });

  test('does not trim when bucket has fewer than 20 listings', () => {
    const listings: ListingNormalized[] = Array.from({ length: 10 }, (_, i) => l('olx', 1, 100 + i));
    const out = aggregate(listings);
    const bucket = out.find((b) => b.source === 'olx' && b.bedrooms === 1)!;
    expect(bucket.nListings).toBe(10);
    expect(bucket.nDropped).toBe(0);
  });

  test('produces separate buckets per (source, bedrooms)', () => {
    const listings: ListingNormalized[] = [
      l('olx', 0, 300), l('olx', 0, 350),
      l('olx', 1, 500), l('olx', 1, 550),
      l('domria', 1, 480), l('domria', 1, 520),
    ];
    const out = aggregate(listings);
    expect(out).toHaveLength(3);
    expect(out.map((b) => `${b.source}-${b.bedrooms}`).sort()).toEqual([
      'domria-1',
      'olx-0',
      'olx-1',
    ]);
  });

  test('caps bedrooms at 3 (4+ collapses into the 3-bedroom bucket)', () => {
    const listings: ListingNormalized[] = [
      l('olx', 3, 800), l('olx', 4, 900), l('olx', 5, 1000),
    ];
    const out = aggregate(listings);
    const bucket = out.find((b) => b.source === 'olx' && b.bedrooms === 3)!;
    expect(bucket.nListings).toBe(3);
  });
});
