/**
 * Prune price history so the database stays inside its storage budget.
 *
 * Every scrape appends one row per product, so without pruning the prices
 * table grows forever (it filled the 5 GB Railway volume in 2026-09).
 * Keeps PRICE_RETENTION_DAYS of history (default 30) plus each product's
 * newest price regardless of age.
 */
import { closePool } from '../src/config/database';
import { PriceRepository } from '../src/repositories/PriceRepository';
import { logger } from '../src/utils/logger';

const DEFAULT_RETENTION_DAYS = 30;

async function main() {
  const raw = process.env.PRICE_RETENTION_DAYS;
  const days = raw ? Number(raw) : DEFAULT_RETENTION_DAYS;
  try {
    const deleted = await new PriceRepository().cleanupOld(days);
    logger.info(`Pruned ${deleted} price rows older than ${days} days`);
  } catch (error) {
    logger.error('Price cleanup failed:', error);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

main();
