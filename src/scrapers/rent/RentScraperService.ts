import { scrapeOlx } from './scrape-olx';
import { scrapeDomria } from './scrape-domria';
import { scrapeFlatfy } from './scrape-flatfy';
import { loadRatesToEur, buildLocalConverter, normalizeListing } from './normalize';
import { ListingRaw, RentListingNormalized } from './types';
import { RentalListingRepository } from '../../repositories/RentalListingRepository';
import { query } from '../../config/database';
import { logger } from '../../utils/logger';

const CITY = 'Kyiv';
const COUNTRY_CODE = 'UA';

interface CountryRow {
  id: number;
  currency_code: string;
}

/**
 * Scrape all three Kyiv sources, normalize to the country's currency, and
 * persist. Each source is wrapped in try/catch so a failure of one (notably
 * flatfy behind DataDome) does not abort the others.
 */
export async function scrapeRent(): Promise<void> {
  const repo = new RentalListingRepository();

  const country = (
    await query<CountryRow>('SELECT id, currency_code FROM countries WHERE code = $1', [COUNTRY_CODE])
  ).rows[0];
  if (!country) throw new Error(`Country ${COUNTRY_CODE} not found - run npm run seed`);

  const rates = await loadRatesToEur();
  if (!rates.has(country.currency_code)) {
    throw new Error(`Rate missing for ${country.currency_code} - run npm run rates:sync`);
  }
  const toLocal = buildLocalConverter(rates, country.currency_code);

  const sources: Array<{ name: string; scrape: () => Promise<ListingRaw[]> }> = [
    { name: 'olx', scrape: scrapeOlx },
    { name: 'domria', scrape: scrapeDomria },
    { name: 'flatfy', scrape: () => scrapeFlatfy() },
  ];

  for (const { name, scrape } of sources) {
    try {
      logger.info(`[rent] scraping ${name}...`);
      const raw = await scrape();
      const normalized: RentListingNormalized[] = [];
      for (const r of raw) {
        const n = normalizeListing(r, toLocal, country.currency_code);
        if (n) normalized.push(n);
      }
      const inserted = await repo.insertMany(country.id, CITY, normalized);
      logger.info(`[rent] ${name}: ${raw.length} raw, ${normalized.length} normalized, ${inserted} inserted`);
    } catch (err) {
      logger.error(`[rent] ${name} failed (continuing with remaining sources):`, err);
    }
  }
}
