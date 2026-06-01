import { Router } from 'express';
import { rentStatsRepository } from '../../repositories';
import { RentStatCountryRow } from '../../repositories/RentStatsRepository';

export interface RentBucketDto {
  bedrooms: number;
  median: number;
  n_listings: number;
}

export interface CountryRentDto {
  country: { code: string; name: string };
  city: string;
  currency: string;
  period_start: string;
  period_end: string;
  buckets: RentBucketDto[];
}

/** Pure: flatten the joined stat rows into one nested entry per country. */
export function groupRentRowsByCountry(rows: RentStatCountryRow[]): CountryRentDto[] {
  const byCountry = new Map<string, CountryRentDto>();
  for (const row of rows) {
    let entry = byCountry.get(row.code);
    if (!entry) {
      entry = {
        country: { code: row.code, name: row.name },
        city: row.city,
        currency: row.currency,
        period_start: row.period_start,
        period_end: row.period_end,
        buckets: [],
      };
      byCountry.set(row.code, entry);
    }
    entry.buckets.push({
      bedrooms: row.bedrooms,
      median: Number(row.median),
      n_listings: row.n_listings,
    });
  }
  return Array.from(byCountry.values());
}

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await rentStatsRepository.getLatestGroupedByCountry();
    res.json({ data: groupRentRowsByCountry(rows) });
  } catch (error) {
    next(error);
  }
});

export default router;
