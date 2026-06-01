import { scrapeRent } from '../src/scrapers/rent/RentScraperService';
import { closePool } from '../src/config/database';
import { logger } from '../src/utils/logger';

scrapeRent()
  .then(() => closePool())
  .then(() => {
    logger.info('[rent] scrape complete');
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('[rent] scrape failed:', err);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
