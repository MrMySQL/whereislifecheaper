import { ScraperService } from '../src/services/ScraperService';
import { assessScrapeResult } from '../src/services/scrapeRunHealth';
import { scraperLogger } from '../src/utils/logger';
import { query } from '../src/config/database';
import { closePool } from '../src/config/database';

/**
 * Script to run scrapers and store results in database
 * Usage (use -- to pass flags to script):
 *   npm run scraper:run                                   # Run all active scrapers (3 parallel)
 *   npm run scraper:run -- --concurrency=5               # Run all with custom concurrency
 *   npm run scraper:run -- <name|id|class>               # Run specific scraper by name, ID, or class
 *   npm run scraper:run -- voli                          # Run Voli scraper (by name)
 *   npm run scraper:run -- MakroScraper                  # Run Makro scraper (by class name)
 *   npm run scraper:run -- voli --categories=75,76,77    # Run Voli with specific categories
 *   npm run scraper:run -- voli --list-categories        # List available categories for Voli
 *   npm run scraper:run -- voli -l                       # Short form for --list-categories
 */

async function main() {
  const scraperService = new ScraperService();
  const args = process.argv.slice(2);

  // Set to true by any scraper that errors or stores nothing, so a run where
  // everything silently returned 0 products fails the CI job instead of
  // printing "completed successfully" and exiting 0.
  let degraded = false;

  // Parse flags
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 3;
  // --concurrency=0 used to start no workers at all: the run finished
  // instantly, scraped nothing, and printed "completed successfully".
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    console.error(`❌ --concurrency must be a positive integer, got "${concurrencyArg?.split('=')[1]}".`);
    process.exitCode = 1;
    await closePool();
    return;
  }

  const categoriesArg = args.find(a => a.startsWith('--categories='));
  const categoryIds = categoriesArg ? categoriesArg.split('=')[1].split(',').map(c => c.trim()) : undefined;

  const listCategories = args.includes('--list-categories') || args.includes('-l');

  const filteredArgs = args.filter(a => !a.startsWith('--'));

  try {
    if (filteredArgs.length === 0) {
      // Run all scrapers in parallel
      scraperLogger.info(`Running all active scrapers (${concurrency} parallel)...`);
      const results = await scraperService.runAllScrapers(concurrency);

      console.log('\n=== Scraping Results ===\n');
      for (const result of results) {
        console.log(`Supermarket: ${result.supermarketId}`);
        console.log(`  Products scraped: ${result.productsScraped}`);
        console.log(`  Products failed: ${result.productsFailed}`);
        console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
        console.log(`  Errors: ${result.errors.length}`);
        console.log(`  Categories failed: ${result.categoriesFailed ?? 0}/${result.categoriesAttempted ?? 0}`);
        console.log('');
      }

      // runAllScrapers now returns a result for every active supermarket,
      // including ones that threw before producing one, so an empty run and a
      // silently-swallowed rejection both reach this check rather than
      // vanishing between the pool and here.
      const assessed = results.map(r => ({ result: r, health: assessScrapeResult(r) }));
      const unhealthy = assessed.filter(a => a.health.degraded);

      // Category failures below the threshold are reported but not fatal —
      // one seasonal category returning 410 must not paint every run red.
      for (const { result: r } of assessed.filter(a => !a.health.degraded)) {
        const failed = r.categoriesFailed ?? 0;
        if (failed > 0) {
          console.warn(
            `ℹ️  ${r.supermarketId}: ${failed} of ${r.categoriesAttempted} categories failed (tolerated)`
          );
          for (const e of r.categoryErrors ?? []) console.warn(`   · ${e.message}`);
        }
      }

      if (unhealthy.length > 0) {
        degraded = true;
        console.error(`⚠️  ${unhealthy.length} of ${results.length} scraper(s) degraded.`);
        for (const { result: r, health } of unhealthy) {
          console.error(`   · ${r.supermarketId}: ${health.reasons.join('; ')}`);
          for (const e of r.categoryErrors ?? []) console.error(`       ${e.message}`);
        }
      }
    } else {
      // Run specific scraper
      const identifier = filteredArgs[0];

      // Try to find supermarket by ID or name
      let supermarketId = identifier;

      // supermarkets.id is SERIAL, not a UUID — the old 36-char hex test here
      // never matched, so `scraper:run -- 63` fell through and always failed.
      if (!/^\d+$/.test(identifier)) {
        // Not an ID, try to find by name or scraper_class
        const result = await query<{ id: string; name: string }>(
          `SELECT id, name FROM supermarkets
           WHERE LOWER(name) = LOWER($1)
              OR LOWER(scraper_class) = LOWER($1)
           LIMIT 1`,
          [identifier]
        );

        if (result.rows.length === 0) {
          console.error(`Supermarket not found: ${identifier}`);
          console.error(`\nAvailable supermarkets:`);
          const all = await query<{ name: string; scraper_class: string; is_active: boolean }>(
            `SELECT name, scraper_class, is_active FROM supermarkets ORDER BY name`
          );
          all.rows.forEach(s => {
            const status = s.is_active ? '✓' : '✗';
            console.error(`  ${status} ${s.name.padEnd(20)} (${s.scraper_class})`);
          });
          process.exit(1);
        }

        supermarketId = result.rows[0].id;
        scraperLogger.info(`Found supermarket: ${result.rows[0].name}`);
      }

      // Handle --list-categories flag
      if (listCategories) {
        const categories = await scraperService.getAvailableCategories(supermarketId);
        console.log('\n=== Available Categories ===\n');
        categories.forEach(cat => {
          console.log(`  ${cat.id.padEnd(10)} ${cat.name}`);
        });
        console.log(`\nTotal: ${categories.length} categories`);
        console.log('\nUsage: npm run scraper:run ' + identifier + ' --categories=<id1,id2,...>');
        return;
      }

      const categoryInfo = categoryIds ? ` (categories: ${categoryIds.join(', ')})` : '';
      scraperLogger.info(`Running scraper for supermarket: ${supermarketId}${categoryInfo}`);
      const result = await scraperService.runScraper(supermarketId, { categoryIds });

      console.log('\n=== Scraping Result ===\n');
      console.log(`Supermarket: ${result.supermarketId}`);
      console.log(`Products scraped: ${result.productsScraped}`);
      console.log(`Products failed: ${result.productsFailed}`);
      console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);
      console.log(`Errors: ${result.errors.length}`);

      const health = assessScrapeResult(result);
      if (health.degraded) {
        degraded = true;
        console.error(`⚠️  Degraded: ${health.reasons.join('; ')}`);
      }

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach((error, i) => {
          console.log(`  ${i + 1}. ${error.message}`);
        });
      }

      if ((result.categoriesFailed ?? 0) > 0) {
        console.log(`\nCategory failures (${result.categoriesFailed}/${result.categoriesAttempted}):`);
        (result.categoryErrors ?? []).forEach((error, i) => {
          console.log(`  ${i + 1}. ${error.message}`);
        });
      }

      // Show some sample products
      if (result.products.length > 0) {
        console.log('\nSample products:');
        result.products.slice(0, 5).forEach((product, i) => {
          console.log(`  ${i + 1}. ${product.name}`);
          console.log(`     Price: ${product.price} ${product.currency}`);
          if (product.pricePerUnit) {
            console.log(`     Price per unit: ${product.pricePerUnit.toFixed(2)} ${product.currency}/${product.unit}`);
          }
        });
      }
    }

    // Show latest stats
    console.log('\n=== Latest Scrape Statistics ===\n');
    const stats = await scraperService.getLatestStats();
    stats.forEach((stat: any) => {
      console.log(`${stat.supermarket_name} (${stat.country_name})`);
      console.log(`  Status: ${stat.status}`);
      console.log(`  Products: ${stat.products_scraped || 0}`);
      console.log(`  Duration: ${stat.duration_seconds ? stat.duration_seconds + 's' : 'N/A'}`);
      console.log(`  Last run: ${stat.completed_at || 'Never'}`);
      console.log('');
    });

    if (degraded) {
      console.error('❌ Scraping finished with failures — see the warnings above.');
      process.exitCode = 1;
    } else {
      console.log('✅ Scraping completed successfully!');
    }
  } catch (error) {
    scraperLogger.error('Scraping failed:', error);
    console.error('❌ Scraping failed:', error);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

/** How long to wait for the pool to drain before exiting regardless. */
const SHUTDOWN_GRACE_MS = 5000;

// A run killed here leaves its scrape_logs row on 'running'; reapStaleRuns
// closes it at the start of the next run. In-process cleanup was tried and
// removed — see the note on reapStaleRuns.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    scraperLogger.warn(`Received ${signal} — shutting down; in-flight scrapes will be reaped on the next run.`);
    process.exitCode = 1;

    // pool.end() waits for checked-out clients to come back, and a page
    // callback mid-write holds one. Referenced on purpose: this timer is what
    // guarantees the process both waits briefly and cannot wait forever.
    const forced = setTimeout(() => {
      scraperLogger.error(`Pool did not close within ${SHUTDOWN_GRACE_MS}ms — exiting anyway.`);
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);

    closePool().catch(() => undefined).finally(() => {
      clearTimeout(forced);
      process.exit(1);
    });
  });
}

main();
