import { ScraperConfig, CategoryConfig } from '../src/types/scraper.types';
import { BaseScraper } from '../src/scrapers/base/BaseScraper';
import { logger } from '../src/utils/logger';
import {
  getScraperRegistration,
  getScraperCategories,
  getRegisteredScraperNames,
} from '../src/scrapers/scraperRegistry';

/**
 * Test script for running scrapers manually
 *
 * Usage:
 *   npx ts-node scripts/test-scraper.ts [ScraperName] [category1,category2,...]
 *
 * Examples:
 *   npx ts-node scripts/test-scraper.ts MigrosScraper beverages
 *   npx ts-node scripts/test-scraper.ts VoliScraper dairy,meat
 *   npx ts-node scripts/test-scraper.ts MigrosScraper --list-categories
 *   npx ts-node scripts/test-scraper.ts VoliScraper
 *   npx ts-node scripts/test-scraper.ts --list-scrapers
 */

const scraperArg = process.argv[2] || 'MigrosScraper';
const categoryArg = process.argv[3];

interface ScraperSetup {
  config: ScraperConfig;
  scraper: BaseScraper;
  allCategories: CategoryConfig[];
}

function listScrapers(): void {
  const scrapers = getRegisteredScraperNames();

  console.log('\n' + '='.repeat(60));
  console.log('Available Scrapers:');
  console.log('='.repeat(60));

  scrapers.forEach(name => {
    const categories = getScraperCategories(name);
    console.log(`  ${name.padEnd(20)} (${categories.length} categories)`);
  });

  console.log('\nUsage: npx ts-node scripts/test-scraper.ts <ScraperName> [category-ids]');
  console.log('='.repeat(60) + '\n');
}

function listCategories(scraperName: string): void {
  const categories = getScraperCategories(scraperName);

  if (categories.length === 0) {
    console.error(`Scraper not found: ${scraperName}`);
    console.error(`Available scrapers: ${getRegisteredScraperNames().join(', ')}`);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Available categories for ${scraperName}:`);
  console.log('='.repeat(60));

  categories.forEach(cat => {
    console.log(`  ${cat.id.padEnd(20)} - ${cat.name}`);
  });

  console.log('\nUsage: npx ts-node scripts/test-scraper.ts ' + scraperName + ' <category-id>');
  console.log('Example: npx ts-node scripts/test-scraper.ts ' + scraperName + ' ' + categories[0].id);
  console.log('Multiple: npx ts-node scripts/test-scraper.ts ' + scraperName + ' ' + categories.slice(0, 2).map(c => c.id).join(','));
  console.log('='.repeat(60) + '\n');
}

function getScraperSetup(scraperName: string, categoryIds?: string[]): ScraperSetup {
  const registration = getScraperRegistration(scraperName);

  if (!registration) {
    logger.error(`Scraper not found: ${scraperName}`);
    logger.error(`Available scrapers: ${getRegisteredScraperNames().join(', ')}`);
    process.exit(1);
  }

  const defaultConfig = registration.defaultConfig;
  let categories = registration.categories;

  // Filter categories if specified
  if (categoryIds && categoryIds.length > 0) {
    categories = categories.filter(c => categoryIds.includes(c.id));
    if (categories.length === 0) {
      logger.error(`No matching categories found. Available: ${registration.categories.map(c => c.id).join(', ')}`);
      process.exit(1);
    }
  } else {
    // Default to first category for testing if none specified
    categories = [categories[0]];
  }

  const config: ScraperConfig = {
    supermarketId: `test-${scraperName.toLowerCase()}-id`,
    name: defaultConfig.name || scraperName,
    baseUrl: defaultConfig.baseUrl!,
    categories,
    selectors: defaultConfig.selectors!,
    waitTimes: defaultConfig.waitTimes!,
    maxRetries: defaultConfig.maxRetries || 3,
    concurrentPages: defaultConfig.concurrentPages || 1,
    userAgents: defaultConfig.userAgents,
  };

  return {
    config,
    scraper: new registration.scraperClass(config),
    allCategories: registration.categories,
  };
}

async function testScraper() {
  // Handle --list-scrapers flag
  if (scraperArg === '--list-scrapers' || scraperArg === '-ls') {
    listScrapers();
    process.exit(0);
  }

  // Handle --list-categories flag
  if (categoryArg === '--list-categories' || categoryArg === '-l') {
    listCategories(scraperArg);
    process.exit(0);
  }

  // Parse category IDs from comma-separated string
  const categoryIds = categoryArg ? categoryArg.split(',').map(c => c.trim()) : undefined;

  const { config, scraper, allCategories } = getScraperSetup(scraperArg, categoryIds);

  logger.info('='.repeat(60));
  logger.info(`Starting ${config.name} Scraper Test`);
  logger.info('='.repeat(60));
  logger.info(`Categories to scrape: ${config.categories.map(c => c.name).join(', ')}`);
  logger.info(`Total available categories: ${allCategories.length}`);
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
