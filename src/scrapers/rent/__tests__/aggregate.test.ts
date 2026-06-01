import { aggregateRent, percentile, AggInput } from '../aggregate';

function row(bedrooms: number, priceLocal: number, sqm: number | null = 50): AggInput {
  return { bedrooms, priceLocal, sqm };
}

describe('percentile', () => {
  test('p50 of [1..9] = 5', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.5)).toBe(5);
  });
  test('linear interpolation between samples', () => {
    expect(percentile([10, 20], 0.5)).toBe(15);
  });
  test('empty array returns NaN', () => {
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('aggregateRent', () => {
  test('pools all sources into one median per bedroom bucket', () => {
    // 5 listings in the 1BR bucket regardless of which site they came from.
    const listings = [row(1, 100), row(1, 200), row(1, 300), row(1, 400), row(1, 500)];
    const out = aggregateRent(listings);
    expect(out).toHaveLength(1);
    expect(out[0].bedrooms).toBe(1);
    expect(out[0].median).toBe(300);
    expect(out[0].nListings).toBe(5);
  });

  test('drops listings with sqm out of [15, 300]', () => {
    const listings = [row(0, 500, 14), row(0, 500, 301), row(0, 500, 50), row(0, 600, 50)];
    const out = aggregateRent(listings);
    const b = out.find((x) => x.bedrooms === 0)!;
    expect(b.nListings).toBe(2);
    expect(b.median).toBe(550);
  });

  test('keeps listings with null sqm', () => {
    const listings = Array.from({ length: 3 }, () => row(2, 1000, null));
    const out = aggregateRent(listings);
    expect(out.find((x) => x.bedrooms === 2)!.nListings).toBe(3);
  });

  test('caps bedrooms at 3 (4-room and up fold into the 3BR bucket)', () => {
    const listings = [row(3, 1000), row(5, 2000)];
    const out = aggregateRent(listings);
    expect(out).toHaveLength(1);
    expect(out[0].bedrooms).toBe(3);
    expect(out[0].nListings).toBe(2);
  });

  test('trims 5% off each tail once the bucket has >= 20 listings', () => {
    // 20 listings 1..20: trimCount = floor(20*0.05) = 1, so drop 1 + 20.
    const listings = Array.from({ length: 20 }, (_, i) => row(0, i + 1));
    const out = aggregateRent(listings);
    const b = out.find((x) => x.bedrooms === 0)!;
    expect(b.nListings).toBe(18);          // 20 - 2 trimmed
    expect(b.median).toBe(10.5);           // median of 2..19
  });

  test('returns buckets sorted by bedrooms', () => {
    const out = aggregateRent([row(2, 100), row(0, 100), row(1, 100)]);
    expect(out.map((b) => b.bedrooms)).toEqual([0, 1, 2]);
  });
});
