import fs from 'fs';
import path from 'path';
import { query, closePool } from '../src/database';
import { logger } from '../src/utils/logger';

const migrationsDir = path.join(__dirname, '../src/database/migrations');

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Get all migration files sorted by name
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      logger.info(`Running migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        await query(sql);
        logger.info(`✓ Migration ${file} completed successfully`);
      } catch (error) {
        logger.error(`✗ Migration ${file} failed:`, error);
        throw error;
      }
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

runMigrations();
