import { ListingNormalized, BucketStats, Source } from './types';

const MIN_SQM = 15;
const MAX_SQM = 300;
const TRIM_FRACTION = 0.05;
const TRIM_MIN_BUCKET_SIZE = 20;
const MAX_BEDROOMS = 3;

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

function passSqmFilter(l: ListingNormalized): boolean {
  if (l.sqm === null) return true;
  return l.sqm >= MIN_SQM && l.sqm <= MAX_SQM;
}

export function aggregate(listings: ListingNormalized[]): BucketStats[] {
  const filtered = listings.filter(passSqmFilter);

  const buckets = new Map<string, ListingNormalized[]>();
  for (const l of filtered) {
    const cappedBed = Math.min(l.bedrooms, MAX_BEDROOMS);
    const key = `${l.source}|${cappedBed}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(l);
  }

  const stats: BucketStats[] = [];
  for (const [key, bucketListings] of buckets) {
    const [sourceStr, bedStr] = key.split('|');
    const source = sourceStr as Source;
    const bedrooms = parseInt(bedStr, 10);

    const prices = bucketListings.map((l) => l.priceUsd).sort((a, b) => a - b);
    const localPrices = bucketListings.map((l) => l.priceLocal).sort((a, b) => a - b);

    let trimmedUsd = prices;
    let trimmedLocal = localPrices;
    let nDropped = 0;
    if (prices.length >= TRIM_MIN_BUCKET_SIZE) {
      const trimCount = Math.floor(prices.length * TRIM_FRACTION);
      trimmedUsd = prices.slice(trimCount, prices.length - trimCount);
      trimmedLocal = localPrices.slice(trimCount, localPrices.length - trimCount);
      nDropped = prices.length - trimmedUsd.length;
    }

    stats.push({
      source,
      bedrooms,
      nListings: trimmedUsd.length,
      nDropped,
      medianUsd: percentile(trimmedUsd, 0.5),
      medianLocal: percentile(trimmedLocal, 0.5),
      p25Usd: percentile(trimmedUsd, 0.25),
      p75Usd: percentile(trimmedUsd, 0.75),
    });
  }

  return stats.sort((a, b) =>
    a.source === b.source ? a.bedrooms - b.bedrooms : a.source.localeCompare(b.source),
  );
}
