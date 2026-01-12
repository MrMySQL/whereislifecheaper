import { ScraperService } from '../src/services/ScraperService';
import { scraperLogger } from '../src/utils/logger';
import { query } from '../src/config/database';
import { closePool } from '../src/config/database';

/**
 * Script to run scrapers and store results in database
 * Usage (use -- to pass flags to script):
 *   npm run scraper:run                                   # Run all active scrapers (3 parallel)
 *   npm run scraper:run -- --concurrency=5               # Run all with custom concurrency
 *   npm run scraper:run -- <name|id>                     # Run specific scraper by name or ID
 *   npm run scraper:run -- voli                          # Run Voli scraper (all categories)
 *   npm run scraper:run -- voli --categories=75,76,77    # Run Voli with specific categories
 *   npm run scraper:run -- voli --list-categories        # List available categories for Voli
 *   npm run scraper:run -- voli -l                       # Short form for --list-categories
 */

async function main() {
  const scraperService = new ScraperService();
  const args = process.argv.slice(2);

  // Parse flags
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 3;

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
        console.log('');
      }
    } else {
      // Run specific scraper
      const identifier = filteredArgs[0];

      // Try to find supermarket by ID or name
      let supermarketId = identifier;

      if (!identifier.match(/^[0-9a-f-]{36}$/i)) {
        // Not a UUID, try to find by name
        const result = await query<{ id: string }>(
          `SELECT id FROM supermarkets
           WHERE LOWER(name) = LOWER($1)
           LIMIT 1`,
          [identifier]
        );

        if (result.rows.length === 0) {
          console.error(`Supermarket not found: ${identifier}`);
          process.exit(1);
        }

        supermarketId = result.rows[0].id;
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

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach((error, i) => {
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

    console.log('✅ Scraping completed successfully!');
  } catch (error) {
    scraperLogger.error('Scraping failed:', error);
    console.error('❌ Scraping failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
