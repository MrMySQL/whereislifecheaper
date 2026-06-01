import { query } from '../config/database';
import { RentListingNormalized } from '../scrapers/rent/types';

export interface RentAggRow {
  bedrooms: number;
  sqm: number | null;
  price_local: number;
}

const INSERT_COLUMNS = [
  'country_id', 'city', 'source', 'source_listing_id', 'bedrooms', 'sqm',
  'price_original', 'currency_original', 'price_local', 'district', 'raw_url',
];

export class RentalListingRepository {
  /** Insert a batch of listings; same-day repeats are ignored via the unique index. */
  async insertMany(countryId: number, city: string, listings: RentListingNormalized[]): Promise<number> {
    if (listings.length === 0) return 0;

    const params: unknown[] = [];
    const tuples = listings.map((l, i) => {
      const b = i * INSERT_COLUMNS.length;
      params.push(
        countryId, city, l.source, l.sourceListingId, l.bedrooms, l.sqm,
        l.priceOriginal, l.currencyOriginal, l.priceLocal, l.district, l.url,
      );
      const ph = INSERT_COLUMNS.map((_, c) => `$${b + c + 1}`).join(',');
      return `(${ph})`;
    });

    const result = await query(
      `INSERT INTO rental_listings (${INSERT_COLUMNS.join(', ')})
       VALUES ${tuples.join(', ')}
       ON CONFLICT (source, source_listing_id, scraped_on) DO NOTHING`,
      params,
    );
    return result.rowCount ?? 0;
  }

  /**
   * Deduped listings for the trailing `days`: one row per (source, listing),
   * keeping the most recent scrape, so weekly repeats are not double-counted.
   */
  async getDedupedForWindow(countryId: number, days: number, city?: string): Promise<RentAggRow[]> {
    const params: unknown[] = [countryId, days];
    const cityClause = city ? 'AND city = $3' : '';
    if (city) params.push(city);

    const result = await query<RentAggRow>(
      `SELECT bedrooms, sqm, price_local
       FROM (
         SELECT DISTINCT ON (source, source_listing_id)
           bedrooms, sqm, price_local, scraped_at
         FROM rental_listings
         WHERE country_id = $1
           AND scraped_at >= NOW() - ($2 || ' days')::interval
           ${cityClause}
         ORDER BY source, source_listing_id, scraped_at DESC
       ) deduped`,
      params,
    );
    return result.rows;
  }
}
