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

/**
 * What we currently believe about a source.
 *
 * 'healthy' - has been returning listings; if it stops, that is a regression
 *             and the run must go red.
 * 'blocked' - known to be walled off by the portal's bot protection and has
 *             never returned a listing. Its failure is expected, so it does not
 *             fail the run - but it is still reported every time, and if it
 *             ever starts working it is flagged for promotion to 'healthy'.
 */
export type SourceExpectation = 'healthy' | 'blocked';

/**
 * 'ok'       - scraped, normalized and stored a complete sample.
 * 'degraded' - stored real listings, but the source refused partway through
 *              pagination, so the sample is a truncated slice of the results
 *              rather than the whole search. Deliberately not 'ok': the list
 *              pages are ordered, so a truncated sample skews the median the
 *              aggregate computes, and a source that half-refuses must not be
 *              reported as having recovered.
 * 'dead'     - returned nothing usable.
 * 'error'    - threw.
 */
export type SourceStatus = 'ok' | 'degraded' | 'dead' | 'error';

/**
 * What a scraper hands back. The bare array is the common case; the object form
 * lets a scraper say "these listings are real, but the source cut me off", which
 * a bare array has no way to express.
 */
export interface ScrapeResult {
  listings: ListingRaw[];
  /** Why the sample is partial. Present only for a truncated scrape. */
  degraded?: string;
}

export interface SourceOutcome {
  name: Source;
  countryCode: string;
  city: string;
  expected: SourceExpectation;
  status: SourceStatus;
  raw: number;
  normalized: number;
  inserted: number;
  error?: string;
}

export interface RentScrapeSummary {
  sources: SourceOutcome[];
  /**
   * Outcomes expected healthy that produced nothing - these fail the run.
   *
   * Whole outcomes rather than source names: the list is keyed by
   * (target, source), so with two cities in one country a bare 'olx' cannot say
   * which one died, and looking it back up by name finds the wrong city.
   */
  regressions: SourceOutcome[];
  /** Outcomes marked blocked that unexpectedly worked - promote them. */
  recovered: SourceOutcome[];
  totalInserted: number;
}

interface SourceConfig {
  name: Source;
  scrape: () => Promise<ListingRaw[] | ScrapeResult>;
  expect: SourceExpectation;
}

const SOURCES_BY_COUNTRY: Record<string, SourceConfig[]> = {
  UA: [
    { name: 'olx', scrape: scrapeOlx, expect: 'healthy' },
    { name: 'domria', scrape: scrapeDomria, expect: 'healthy' },
    // DataDome wall - has returned 0 listings on every run since it was added.
    { name: 'flatfy', scrape: () => scrapeFlatfy(), expect: 'blocked' },
  ],
  AU: [
    // realestate.com.au sits behind Kasada (the 429 carries x-kpsdk-* headers),
    // which no header set alone gets past.
    { name: 'realestateau', scrape: scrapeRealestateAu, expect: 'blocked' },
    // domain.com.au works over plain HTTP with browser headers - ~227 Sydney
    // listings from a residential IP - and is refused from this runner. A probe
    // running both clients from one runner (Azure AS8075) settled which half is
    // to blame: curl over h2 got a 200 that was a 2.7KB stub with no
    // `__NEXT_DATA__`, curl over h1.1 got a 403, and Node's fetch got a 403.
    // No client gets the real page from there, so it is the egress, not the
    // request - a scraper change cannot fix it. It needs a non-datacenter
    // egress; the 'recovered' check will flag it the first run one gets through.
    { name: 'domainau', scrape: scrapeDomainAu, expect: 'blocked' },
  ],
};

/**
 * Scrape configured city/country rental sources, normalize to each country's
 * currency, and persist. Each source is wrapped in try/catch so a failure of one
 * protected portal does not abort the others.
 *
 * Returns a per-source summary so the caller can tell a genuinely healthy run
 * from one where most sources are silently dead. The run still only *throws*
 * when nothing at all was usable - a partial failure must not stop the caller
 * from aggregating the listings that did land.
 */
export async function scrapeRent(): Promise<RentScrapeSummary> {
  const repo = new RentalListingRepository();
  const rates = await loadRatesToEur();

  const outcomes: SourceOutcome[] = [];
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

    for (const { name, scrape, expect } of sources) {
      const outcome: SourceOutcome = {
        name,
        countryCode: target.countryCode,
        city: target.city,
        expected: expect,
        status: 'dead',
        raw: 0,
        normalized: 0,
        inserted: 0,
      };
      outcomes.push(outcome);

      try {
        logger.info(`[rent] scraping ${target.countryCode}/${target.city}/${name}...`);
        const result = await scrape();
        const raw = Array.isArray(result) ? result : result.listings;
        const degraded = Array.isArray(result) ? undefined : result.degraded;
        outcome.raw = raw.length;
        totalRaw += raw.length;
        const normalized: RentListingNormalized[] = [];
        for (const r of raw) {
          const n = normalizeListing(r, toLocal, country.currency_code);
          if (n) normalized.push(n);
        }
        outcome.normalized = normalized.length;
        totalNormalized += normalized.length;
        if (normalized.length === 0) {
          logger.error(`[rent] ${name}: ${raw.length} raw, 0 normalized; skipping insert`);
          continue;
        }
        const inserted = await repo.insertMany(country.id, target.city, normalized);
        outcome.inserted = inserted;
        outcome.status = degraded ? 'degraded' : 'ok';
        if (degraded) outcome.error = degraded;
        usableSources++;
        totalInserted += inserted;
        logger.info(
          `[rent] ${target.countryCode}/${name}: ${raw.length} raw, ` +
            `${normalized.length} normalized, ${inserted} inserted`,
        );
      } catch (err) {
        outcome.status = 'error';
        outcome.error = err instanceof Error ? err.message : String(err);
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

  const regressions = outcomes.filter((o) => o.expected === 'healthy' && o.status !== 'ok');
  const recovered = outcomes.filter((o) => o.expected === 'blocked' && o.status === 'ok');

  return { sources: outcomes, regressions, recovered, totalInserted };
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
