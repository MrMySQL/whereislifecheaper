const MIN_SQM = 15;
const MAX_SQM = 300;
const TRIM_FRACTION = 0.05;
const TRIM_MIN_BUCKET_SIZE = 20;
const MAX_BEDROOMS = 3;

export interface AggInput {
  bedrooms: number;
  sqm: number | null;
  priceLocal: number;
}

export interface RentBucket {
  bedrooms: number;
  median: number;
  nListings: number;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function passSqmFilter(l: AggInput): boolean {
  if (l.sqm === null) return true;
  return l.sqm >= MIN_SQM && l.sqm <= MAX_SQM;
}

/**
 * Pool every listing (all sources) into one bucket per bedroom count, trim the
 * extreme 5% of each large bucket, and return the median price_local per bucket.
 */
export function aggregateRent(listings: AggInput[]): RentBucket[] {
  const buckets = new Map<number, number[]>();
  for (const l of listings) {
    if (!passSqmFilter(l)) continue;
    const bed = Math.min(l.bedrooms, MAX_BEDROOMS);
    if (!buckets.has(bed)) buckets.set(bed, []);
    buckets.get(bed)!.push(l.priceLocal);
  }

  const out: RentBucket[] = [];
  for (const [bedrooms, unsorted] of buckets) {
    const prices = [...unsorted].sort((a, b) => a - b);
    let trimmed = prices;
    if (prices.length >= TRIM_MIN_BUCKET_SIZE) {
      const trimCount = Math.floor(prices.length * TRIM_FRACTION);
      trimmed = prices.slice(trimCount, prices.length - trimCount);
    }
    out.push({
      bedrooms,
      median: percentile(trimmed, 0.5),
      nListings: trimmed.length,
    });
  }

  return out.sort((a, b) => a.bedrooms - b.bedrooms);
}
