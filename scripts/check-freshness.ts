import { query, closePool } from '../src/config/database';

/**
 * Fail if the grocery price data has gone stale.
 *
 * This is the check that was missing. Between 2026-04-28 and 2026-08-31 the
 * daily scrape failed 33 consecutive times and then stopped running entirely,
 * and nothing anywhere in the system noticed — the job ended as 'cancelled'
 * rather than 'failure', so GitHub sent no mail, and the site kept serving the
 * last prices it had as if they were current.
 *
 * Run on a schedule. A non-zero exit fails the workflow, which is what
 * actually reaches a human.
 *
 * Usage:
 *   npm run check:freshness                 # default thresholds
 *   npm run check:freshness -- --max-age=72 # allow 72h
 */

interface StalenessRow {
  country_code: string;
  supermarket: string;
  last_scraped: Date | null;
  hours_stale: number | null;
}

const DEFAULT_MAX_AGE_HOURS = 96; // the schedule is ~every 3 days, so 4 days is one missed run

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const maxAgeArg = args.find(a => a.startsWith('--max-age='));
  const maxAgeHours = maxAgeArg ? Number(maxAgeArg.split('=')[1]) : DEFAULT_MAX_AGE_HOURS;

  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    console.error(`Invalid --max-age: ${maxAgeArg}`);
    process.exitCode = 1;
    return;
  }

  // One index lookup per mapping rather than an aggregate over every price
  // row ever recorded. The naive `LEFT JOIN prices ... GROUP BY` version grew
  // with price history, so the check would get slower every day it ran and
  // eventually blow the workflow's timeout — a monitor that dies of its own
  // success is worse than no monitor. idx_prices_mapping_scraped
  // (product_mapping_id, scraped_at DESC) serves the inner LIMIT 1 directly.
  const result = await query<StalenessRow>(
    `SELECT c.code AS country_code,
            s.name AS supermarket,
            latest.last_scraped,
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - latest.last_scraped)) / 3600 AS hours_stale
     FROM supermarkets s
     JOIN countries c ON c.id = s.country_id
     LEFT JOIN LATERAL (
       SELECT MAX(newest.scraped_at) AS last_scraped
       FROM product_mappings pm
       CROSS JOIN LATERAL (
         SELECT pr.scraped_at
         FROM prices pr
         -- Postgres sorts NULLs first under DESC, so without this a single
         -- NULL-dated row would be picked as a mapping's "latest" price.
         WHERE pr.product_mapping_id = pm.id AND pr.scraped_at IS NOT NULL
         ORDER BY pr.scraped_at DESC
         LIMIT 1
       ) newest
       WHERE pm.supermarket_id = s.id
     ) latest ON true
     WHERE s.is_active
     ORDER BY hours_stale DESC NULLS FIRST`
  );

  const rows = result.rows;
  if (rows.length === 0) {
    console.error('No active supermarkets found — is the database seeded?');
    process.exitCode = 1;
    return;
  }

  const stale = rows.filter(r => r.hours_stale === null || Number(r.hours_stale) > maxAgeHours);

  console.log(`Freshness check — ${rows.length} active supermarkets, threshold ${maxAgeHours}h\n`);
  for (const r of rows) {
    const age = r.hours_stale === null ? 'never' : `${Math.round(Number(r.hours_stale))}h`;
    const mark = stale.includes(r) ? '✗' : '✓';
    console.log(`  ${mark} ${r.country_code}  ${r.supermarket.padEnd(22)} ${age}`);
  }

  if (stale.length > 0) {
    console.error(
      `\n❌ ${stale.length} of ${rows.length} supermarkets have no price newer than ${maxAgeHours}h.`
    );
    console.error('   The scrape pipeline is not delivering. Check the Daily Scrape workflow.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ All ${rows.length} supermarkets scraped within ${maxAgeHours}h.`);
}

main()
  .catch(error => {
    console.error('Freshness check failed to run:', error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
