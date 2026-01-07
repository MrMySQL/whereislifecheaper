import { migrosConfig } from '../src/config/scrapers';
import { MigrosScraper } from '../src/scrapers/turkey/MigrosScraper';
import { ScraperConfig } from '../src/types/scraper.types';
import { logger } from '../src/utils/logger';

/**
 * Test script for running scrapers manually
 * Usage: npm run scraper:test
 */

async function testMigrosScraper() {
  logger.info('='.repeat(60));
  logger.info('Starting Migros Scraper Test');
  logger.info('='.repeat(60));

  // Create config
  const config: ScraperConfig = {
    supermarketId: 1,
    name: 'Migros',
    baseUrl: migrosConfig.baseUrl!,
    categoryUrls: [migrosConfig.categoryUrls![0]], // Test with just first category
    selectors: migrosConfig.selectors!,
    waitTimes: migrosConfig.waitTimes!,
    maxRetries: migrosConfig.maxRetries!,
    concurrentPages: migrosConfig.concurrentPages!,
    userAgents: migrosConfig.userAgents,
  };

  const scraper = new MigrosScraper(config);

  try {
    // Initialize scraper
    await scraper.initialize();

    logger.info('Scraper initialized. Starting product scraping...');

    // Scrape products
    const products = await scraper.scrapeProductList();

    logger.info('='.repeat(60));
    logger.info(`Scraping completed!`);
    logger.info(`Total products found: ${products.length}`);
    logger.info('='.repeat(60));

    // Display first 5 products as sample
    if (products.length > 0) {
      logger.info('\nSample Products (first 5):');
      products.slice(0, 5).forEach((product, index) => {
        logger.info(`\n${index + 1}. ${product.name}`);
        logger.info(`   Price: ${product.price} ${product.currency}`);
        if (product.originalPrice) {
          logger.info(`   Original Price: ${product.originalPrice} ${product.currency} (ON SALE!)`);
        }
        if (product.brand) {
          logger.info(`   Brand: ${product.brand}`);
        }
        if (product.unit && product.unitQuantity) {
          logger.info(`   Quantity: ${product.unitQuantity} ${product.unit}`);
        }
        logger.info(`   URL: ${product.productUrl}`);
      });
    }

    // Get statistics
    const stats = scraper.getStats();
    logger.info('\n' + '='.repeat(60));
    logger.info('Scraping Statistics:');
    logger.info(`- Products scraped: ${stats.productsScraped}`);
    logger.info(`- Products failed: ${stats.productsFailed}`);
    logger.info(`- Duration: ${(stats.duration / 1000).toFixed(2)}s`);
    logger.info('='.repeat(60));
  } catch (error) {
    logger.error('Error during scraping:', error);
    throw error;
  } finally {
    // Cleanup
    await scraper.cleanup();
    logger.info('\nScraper cleaned up. Test completed.');
  }
}

// Run the test
testMigrosScraper()
  .then(() => {
    logger.info('\nTest completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('\nTest failed:', error);
    process.exit(1);
  });
