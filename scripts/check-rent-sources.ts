/**
 * Gate the rent scrape on source health.
 *
 * `scrapeRent` deliberately does not throw on a partial failure - the listings
 * that did land still need to be aggregated. So the run stays green through the
 * scrape and aggregate steps, and this runs last to decide the verdict.
 *
 * Before this existed, the job only failed when *every* source died. With OLX
 * and DOM.RIA alive, three permanently-blocked sources sat behind a green check
 * from June to August without anyone noticing.
 */
// Type-only: the gate must not pull the scrapers (and Playwright) into a
// process whose whole job is reading a JSON file.
import type { SourceOutcome } from '../src/scrapers/rent/RentScraperService';
import { SUMMARY_PATH, readRentSummary } from '../src/scrapers/rent/summaryFile';

/**
 * A summary older than this is not from the run being judged. The job's own
 * timeout is 180 minutes, so anything past this must be a leftover file - a
 * scrape that died before writing, or a local `rent:check-sources` run on its
 * own.
 */
const MAX_SUMMARY_AGE_MS = 6 * 60 * 60 * 1000;

/** GitHub Actions annotations - these surface on the run summary page. */
function annotate(level: 'notice' | 'warning' | 'error', message: string): void {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::${level}::${message}`);
  } else {
    console.log(`[${level}] ${message}`);
  }
}

/** (target, source) is the real key - two cities can share a source name. */
function label(s: SourceOutcome): string {
  return `${s.countryCode}/${s.city}/${s.name}`;
}

function main(): void {
  const summary = readRentSummary();
  if (!summary) {
    annotate(
      'error',
      `No usable rent scrape summary at ${SUMMARY_PATH} - did the scrape step run?`,
    );
    process.exit(1);
    return;
  }

  // `ageMs < 0` too: a future-dated stamp is either a clock-skewed runner or a
  // hand-edited file, and either way it is not evidence that this run wrote the
  // summary - without it, `finishedAt: 3025-01-01` would sail through the gate.
  const ageMs = Date.now() - Date.parse(summary.finishedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_SUMMARY_AGE_MS) {
    annotate(
      'error',
      `The rent scrape summary at ${SUMMARY_PATH} is from ${summary.finishedAt}, ` +
        `not from this run - the scrape step did not write one`,
    );
    process.exit(1);
    return;
  }

  for (const s of summary.sources) {
    if (s.status === 'ok' && s.inserted > 0) {
      annotate('notice', `${label(s)}: ${s.inserted} listings inserted`);
    } else if (s.status === 'ok') {
      // insertMany is ON CONFLICT DO NOTHING, so a same-day re-run inserts
      // nothing while every source still reports ok. Legitimate on a re-run,
      // never something to fold into the success line.
      annotate(
        'warning',
        `${label(s)} scraped ${s.normalized} listings but inserted 0 - ` +
          `already stored for today (a re-run), or nothing new was published`,
      );
    } else if (s.expected === 'blocked') {
      annotate(
        'warning',
        `${label(s)} is still blocked (${s.status}${s.error ? `: ${s.error}` : ''}) - ` +
          `no listings from this source, so its country may be missing from the rent table`,
      );
    }
  }

  for (const s of summary.recovered) {
    annotate(
      'notice',
      `${label(s)} returned listings despite being marked 'blocked' - promote it to 'healthy' ` +
        `in SOURCES_BY_COUNTRY so a future outage fails the run`,
    );
  }

  if (summary.totalInserted === 0) {
    annotate(
      'warning',
      `No listings were inserted by any source this run - the rent stats are unchanged ` +
        `from the last run that did insert`,
    );
  }

  if (summary.regressions.length > 0) {
    for (const s of summary.regressions) {
      annotate(
        'error',
        `${label(s)} is expected to be healthy but produced nothing` +
          `${s.error ? ` (${s.error})` : ''} - the portal likely changed its markup or started blocking`,
      );
    }
    console.error(
      `\n[rent] ${summary.regressions.length} source regression(s): ` +
        `${summary.regressions.map(label).join(', ')}`,
    );
    process.exit(1);
  }

  console.log(
    `\n[rent] all sources expected healthy are healthy (${summary.totalInserted} listings inserted)`,
  );
}

main();
