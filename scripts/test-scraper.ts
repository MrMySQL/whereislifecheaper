import { migrosConfig, voliConfig } from '../src/config/scrapers';
import { MigrosScraper } from '../src/scrapers/turkey/MigrosScraper';
import { VoliScraper } from '../src/scrapers/montenegro/VoliScraper';
import { ScraperConfig } from '../src/types/scraper.types';
import { BaseScraper } from '../src/scrapers/base/BaseScraper';
import { logger } from '../src/utils/logger';

/**
 * Test script for running scrapers manually
 * Usage: npx ts-node scripts/test-scraper.ts [MigrosScraper|VoliScraper]
 */

const scraperArg = process.argv[2] || 'MigrosScraper';

interface ScraperSetup {
  config: ScraperConfig;
  scraper: BaseScraper;
}

function getScraperSetup(scraperName: string): ScraperSetup {
  switch (scraperName) {
    case 'VoliScraper':
      const voliCfg: ScraperConfig = {
        supermarketId: 'test-voli-id',
        name: 'Voli',
        baseUrl: voliConfig.baseUrl!,
        categoryUrls: voliConfig.categoryUrls || [],
        selectors: voliConfig.selectors!,
        waitTimes: voliConfig.waitTimes!,
        maxRetries: voliConfig.maxRetries!,
        concurrentPages: voliConfig.concurrentPages!,
        userAgents: voliConfig.userAgents,
      };
      return { config: voliCfg, scraper: new VoliScraper(voliCfg) };

    case 'MigrosScraper':
    default:
      const migrosCfg: ScraperConfig = {
        supermarketId: 'test-migros-id',
        name: 'Migros',
        baseUrl: migrosConfig.baseUrl!,
        categoryUrls: [migrosConfig.categoryUrls![0]], // Test with just first category
        selectors: migrosConfig.selectors!,
        waitTimes: migrosConfig.waitTimes!,
        maxRetries: migrosConfig.maxRetries!,
        concurrentPages: migrosConfig.concurrentPages!,
        userAgents: migrosConfig.userAgents,
      };
      return { config: migrosCfg, scraper: new MigrosScraper(migrosCfg) };
  }
}

async function testScraper() {
  const { config, scraper } = getScraperSetup(scraperArg);

  logger.info('='.repeat(60));
  logger.info(`Starting ${config.name} Scraper Test`);
  logger.info('='.repeat(60));

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

    // Display first 10 products as sample
    if (products.length > 0) {
      logger.info('\nSample Products (first 10):');
      products.slice(0, 10).forEach((product, index) => {
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
testScraper()
  .then(() => {
    logger.info('\nTest completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('\nTest failed:', error);
    process.exit(1);
  });
