import { query } from '../config/database';

export interface RentStatUpsert {
  countryId: number;
  city: string;
  bedrooms: number;
  periodStart: string;
  periodEnd: string;
  median: number;
  currency: string;
  nListings: number;
}

export interface RentStatCountryRow {
  code: string;
  name: string;
  city: string;
  currency: string;
  period_start: string;
  period_end: string;
  bedrooms: number;
  median: string;     // numeric arrives as string from pg
  n_listings: number;
}

export class RentStatsRepository {
  async upsert(stat: RentStatUpsert): Promise<void> {
    await query(
      `INSERT INTO rental_stats
         (country_id, city, bedrooms, period_start, period_end, median, currency, n_listings, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (country_id, city, bedrooms, period_end)
       DO UPDATE SET
         median = EXCLUDED.median,
         currency = EXCLUDED.currency,
         n_listings = EXCLUDED.n_listings,
         period_start = EXCLUDED.period_start,
         computed_at = NOW()`,
      [
        stat.countryId, stat.city, stat.bedrooms, stat.periodStart, stat.periodEnd,
        stat.median, stat.currency, stat.nListings,
      ],
    );
  }

  /** Latest period per (country, city), joined to country code/name, for the API. */
  async getLatestGroupedByCountry(): Promise<RentStatCountryRow[]> {
    const result = await query<RentStatCountryRow>(
      `SELECT c.code, c.name, s.city, s.currency, s.period_start, s.period_end,
              s.bedrooms, s.median, s.n_listings
       FROM rental_stats s
       JOIN countries c ON c.id = s.country_id
       JOIN (
         SELECT country_id, city, MAX(period_end) AS period_end
         FROM rental_stats
         GROUP BY country_id, city
       ) latest
         ON latest.country_id = s.country_id
        AND latest.city = s.city
        AND latest.period_end = s.period_end
       ORDER BY c.name, s.bedrooms`,
    );
    return result.rows;
  }
}
