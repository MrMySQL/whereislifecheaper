import { scrapeOlx } from './scrape-olx';
import { scrapeDomria } from './scrape-domria';
import { scrapeFlatfy } from './scrape-flatfy';
import { scrapeRealestateAu } from './scrape-realestate-au';
import { scrapeDomainAu } from './scrape-domain-au';
import { loadRatesToEur, buildLocalConverter, normalizeListing } from './normalize';
import { ListingRaw, RentListingNormalized, Source } from './types';
import { RENT_TARGETS, RentTarget } from './rentTargets';
import { RentalListingRepository } from '../../repositories/RentalListingRepository';
import { query } from '../../config/database';
import { logger } from '../../utils/logger';

interface CountryRow {
  id: number;
  currency_code: string;
}

interface SourceConfig {
  name: Source;
  scrape: () => Promise<ListingRaw[]>;
}

const SOURCES_BY_COUNTRY: Record<string, SourceConfig[]> = {
  UA: [
    { name: 'olx', scrape: scrapeOlx },
    { name: 'domria', scrape: scrapeDomria },
    { name: 'flatfy', scrape: () => scrapeFlatfy() },
  ],
  AU: [
    { name: 'realestateau', scrape: scrapeRealestateAu },
    { name: 'domainau', scrape: scrapeDomainAu },
  ],
};

/**
 * Scrape configured city/country rental sources, normalize to each country's
 * currency, and persist. Each source is wrapped in try/catch so a failure of one
 * protected portal does not abort the others.
 */
export async function scrapeRent(): Promise<void> {
  const repo = new RentalListingRepository();
  const rates = await loadRatesToEur();

  let usableSources = 0;
  let totalRaw = 0;
  let totalNormalized = 0;
  let totalInserted = 0;
  let failedSources = 0;

  for (const target of RENT_TARGETS) {
    const country = await loadCountry(target);
    if (!rates.has(country.currency_code)) {
      throw new Error(`Rate missing for ${country.currency_code} - run npm run rates:sync`);
    }
    const toLocal = buildLocalConverter(rates, country.currency_code);
    const sources = SOURCES_BY_COUNTRY[target.countryCode] ?? [];

    for (const { name, scrape } of sources) {
      try {
        logger.info(`[rent] scraping ${target.countryCode}/${target.city}/${name}...`);
        const raw = await scrape();
        totalRaw += raw.length;
        const normalized: RentListingNormalized[] = [];
        for (const r of raw) {
          const n = normalizeListing(r, toLocal, country.currency_code);
          if (n) normalized.push(n);
        }
        totalNormalized += normalized.length;
        if (normalized.length === 0) {
          logger.error(`[rent] ${name}: ${raw.length} raw, 0 normalized; skipping insert`);
          continue;
        }
        const inserted = await repo.insertMany(country.id, target.city, normalized);
        usableSources++;
        totalInserted += inserted;
        logger.info(
          `[rent] ${target.countryCode}/${name}: ${raw.length} raw, ` +
            `${normalized.length} normalized, ${inserted} inserted`,
        );
      } catch (err) {
        failedSources++;
        logger.error(`[rent] ${target.countryCode}/${name} failed (continuing with remaining sources):`, err);
      }
    }
  }

  if (usableSources === 0) {
    throw new Error(
      `[rent] No usable rent listings scraped from any source; refusing to refresh stats from stale data ` +
        `(raw=${totalRaw}, normalized=${totalNormalized}, inserted=${totalInserted}, failedSources=${failedSources})`,
    );
  }
}

async function loadCountry(target: RentTarget): Promise<CountryRow & { id: number }> {
  const country = (
    await query<CountryRow & { id: number }>(
      'SELECT id, currency_code FROM countries WHERE code = $1',
      [target.countryCode],
    )
  ).rows[0];
  if (!country) throw new Error(`Country ${target.countryCode} not found - run npm run seed`);
  return country;
}
