import { query, closePool } from '../src/config/database';

/**
 * Enable or disable scrapers in the database
 *
 * Usage:
 *   npm run scraper:toggle                          # List all scrapers with status
 *   npm run scraper:toggle -- enable <name>         # Enable a scraper
 *   npm run scraper:toggle -- disable <name>        # Disable a scraper
 *   npm run scraper:toggle -- enable --all          # Enable all scrapers
 *   npm run scraper:toggle -- disable --all         # Disable all scrapers
 *
 * <name> matches against supermarket name or scraper_class (case-insensitive, partial match)
 *
 * Examples:
 *   npm run scraper:toggle -- enable winmart
 *   npm run scraper:toggle -- disable MigrosScraper
 *   npm run scraper:toggle -- enable voli
 */

async function main() {
  const args = process.argv.slice(2);
  const action = args[0]?.toLowerCase();
  const target = args[1];

  if (!action || !['enable', 'disable'].includes(action)) {
    await listScrapers();
    return;
  }

  if (!target) {
    console.error('Error: specify a scraper name or --all');
    console.error('Usage: npm run scraper:toggle -- enable <name>');
    process.exit(1);
  }

  const active = action === 'enable';

  if (target === '--all') {
    const result = await query(
      'UPDATE supermarkets SET is_active = $1, updated_at = NOW() RETURNING name, scraper_class, is_active',
      [active],
    );
    console.log(`\n${active ? 'Enabled' : 'Disabled'} ${result.rowCount} scrapers:\n`);
    for (const row of result.rows) {
      console.log(`  ${statusIcon(row.is_active)} ${row.name} (${row.scraper_class})`);
    }
  } else {
    const result = await query(
      `UPDATE supermarkets SET is_active = $1, updated_at = NOW()
       WHERE LOWER(name) LIKE $2 OR LOWER(scraper_class) LIKE $2
       RETURNING name, scraper_class, is_active`,
      [active, `%${target.toLowerCase()}%`],
    );

    if (result.rowCount === 0) {
      console.error(`No scraper found matching "${target}"`);
      console.error('Run without arguments to list all scrapers.');
      process.exit(1);
    }

    console.log('');
    for (const row of result.rows) {
      console.log(`  ${statusIcon(row.is_active)} ${row.name} (${row.scraper_class}) — ${active ? 'enabled' : 'disabled'}`);
    }
  }

  console.log('');
  console.warn(
    'Note: this change is temporary. The scrape workflow runs `npm run seed` ' +
    'before every run, which resets is_active from src/database/seeds/supermarkets.ts. ' +
    'To make this stick, edit that file.'
  );
  console.log('');
}

async function listScrapers() {
  const result = await query(
    `SELECT s.name, s.scraper_class, s.is_active, c.name AS country, c.code AS country_code
     FROM supermarkets s
     JOIN countries c ON c.id = s.country_id
     ORDER BY c.name, s.name`,
  );

  console.log('\nScrapers:\n');

  let currentCountry = '';
  for (const row of result.rows) {
    if (row.country !== currentCountry) {
      currentCountry = row.country;
      console.log(`  ${row.country} (${row.country_code})`);
    }
    console.log(`    ${statusIcon(row.is_active)} ${row.name.padEnd(24)} ${row.scraper_class}`);
  }

  const active = result.rows.filter((r: any) => r.is_active).length;
  console.log(`\n  ${active}/${result.rowCount} active\n`);
  console.log('Usage: npm run scraper:toggle -- enable|disable <name>');
  console.log('');
}

function statusIcon(active: boolean): string {
  return active ? '[ON] ' : '[OFF]';
}

main()
  .then(() => closePool())
  .catch((err) => {
    console.error('Error:', err.message);
    closePool().then(() => process.exit(1));
  });
