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
import { SUMMARY_PATH, readRentSummary } from '../src/scrapers/rent/summaryFile';

/** GitHub Actions annotations - these surface on the run summary page. */
function annotate(level: 'notice' | 'warning' | 'error', message: string): void {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::${level}::${message}`);
  }
  console.log(`[${level}] ${message}`);
}

function main(): void {
  const summary = readRentSummary();
  if (!summary) {
    annotate('error', `No rent scrape summary at ${SUMMARY_PATH} - did the scrape step run?`);
    process.exit(1);
    return;
  }

  for (const s of summary.sources) {
    const label = `${s.countryCode}/${s.city}/${s.name}`;
    if (s.status === 'ok') {
      annotate('notice', `${label}: ${s.inserted} listings inserted`);
    } else if (s.expected === 'blocked') {
      annotate(
        'warning',
        `${label} is still blocked (${s.status}${s.error ? `: ${s.error}` : ''}) - ` +
          `no listings from this source, so its country may be missing from the rent table`,
      );
    }
  }

  for (const name of summary.recovered) {
    annotate(
      'notice',
      `${name} returned listings despite being marked 'blocked' - promote it to 'healthy' ` +
        `in SOURCES_BY_COUNTRY so a future outage fails the run`,
    );
  }

  if (summary.regressions.length > 0) {
    for (const name of summary.regressions) {
      const s = summary.sources.find((x) => x.name === name);
      annotate(
        'error',
        `${name} is expected to be healthy but produced nothing` +
          `${s?.error ? ` (${s.error})` : ''} - the portal likely changed its markup or started blocking`,
      );
    }
    console.error(
      `\n[rent] ${summary.regressions.length} source regression(s): ${summary.regressions.join(', ')}`,
    );
    process.exit(1);
  }

  console.log(`\n[rent] all sources expected healthy are healthy (${summary.totalInserted} listings inserted)`);
}

main();
