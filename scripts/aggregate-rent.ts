import { RentalListingRepository } from '../src/repositories/RentalListingRepository';
import { RentStatsRepository } from '../src/repositories/RentStatsRepository';
import { aggregateRent } from '../src/scrapers/rent/aggregate';
import { query, closePool } from '../src/config/database';
import { logger } from '../src/utils/logger';

const CITY = 'Kyiv';
const COUNTRY_CODE = 'UA';
const WINDOW_DAYS = 30;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const country = (
    await query<{ id: number; currency_code: string }>(
      'SELECT id, currency_code FROM countries WHERE code = $1',
      [COUNTRY_CODE],
    )
  ).rows[0];
  if (!country) throw new Error(`Country ${COUNTRY_CODE} not found - run npm run seed`);

  const listingRepo = new RentalListingRepository();
  const statsRepo = new RentStatsRepository();

  const rows = await listingRepo.getDedupedForWindow(country.id, WINDOW_DAYS);
  logger.info(`[rent:aggregate] ${rows.length} deduped listings in the last ${WINDOW_DAYS} days`);

  const buckets = aggregateRent(
    rows.map((r) => ({
      bedrooms: r.bedrooms,
      sqm: r.sqm === null ? null : Number(r.sqm),
      priceLocal: Number(r.price_local),
    })),
  );

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const b of buckets) {
    await statsRepo.upsert({
      countryId: country.id,
      city: CITY,
      bedrooms: b.bedrooms,
      periodStart: ymd(periodStart),
      periodEnd: ymd(periodEnd),
      median: b.median,
      currency: country.currency_code,
      nListings: b.nListings,
    });
    logger.info(`[rent:aggregate]   ${b.bedrooms}BR: median=${b.median} ${country.currency_code}, n=${b.nListings}`);
  }
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error('[rent:aggregate] failed:', err);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
