import { scrapeRent, RentScrapeSummary } from '../src/scrapers/rent/RentScraperService';
import { writeRentSummary } from '../src/scrapers/rent/summaryFile';
import { closePool } from '../src/config/database';
import { logger } from '../src/utils/logger';

function report(summary: RentScrapeSummary): void {
  logger.info('[rent] per-source results:');
  for (const s of summary.sources) {
    const detail =
      s.status === 'error'
        ? `error: ${s.error}`
        : `${s.raw} raw, ${s.normalized} normalized, ${s.inserted} inserted`;
    logger.info(
      `[rent]   ${s.countryCode}/${s.city}/${s.name} [${s.expected}] -> ${s.status.toUpperCase()} (${detail})`,
    );
  }
}

scrapeRent()
  .then(async (summary) => {
    writeRentSummary(summary);
    report(summary);
    await closePool();
    logger.info(
      `[rent] scrape complete: ${summary.totalInserted} inserted, ` +
        `${summary.regressions.length} regression(s), ${summary.recovered.length} recovered`,
    );
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('[rent] scrape failed:', err);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
