import { scrapeRent, RentScrapeSummary } from '../src/scrapers/rent/RentScraperService';
import { SUMMARY_PATH, clearRentSummary, writeRentSummary } from '../src/scrapers/rent/summaryFile';
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

// Any summary still on disk is from an earlier run; the gate must not mistake
// it for this one if this scrape dies before it writes.
// Aborting rather than continuing: the gate accepts any summary younger than
// six hours, so a leftover file we could not delete would be read as this
// run's verdict if this scrape then died before writing its own. A scrape we
// cannot judge is worth less than the green check it would forge.
try {
  clearRentSummary();
} catch (e) {
  logger.error(`[rent] cannot clear the previous scrape summary at ${SUMMARY_PATH} - aborting:`, e);
  process.exit(1);
}

scrapeRent()
  .then(async (summary) => {
    // Reporting I/O must never fail a scrape whose listings are already
    // committed - an unwritable logs/ would otherwise send the run down the
    // catch below and skip the aggregate step.
    try {
      writeRentSummary(summary);
    } catch (e) {
      logger.error('[rent] failed to write the scrape summary (continuing):', e);
    }
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
