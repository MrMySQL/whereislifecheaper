import { closePool } from '../src/database';
import { logger } from '../src/utils/logger';
import { seedCountries } from '../src/database/seeds/countries';
import { seedSupermarkets } from '../src/database/seeds/supermarkets';
import { seedCategories } from '../src/database/seeds/categories';

async function runSeeds() {
  try {
    logger.info('Starting database seeding...');

    // Run seeds in order due to foreign key dependencies
    await seedCountries();
    await seedSupermarkets();
    await seedCategories();

    logger.info('All seeds completed successfully');
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

runSeeds();
