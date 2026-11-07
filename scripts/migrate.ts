import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import { logger } from '../src/utils/logger';

const migrationsDir = path.join(__dirname, '../src/database/migrations');

/** Minimal client surface, so a plain pg.Client works too (tests). */
type MigrationClient = Pick<PoolClient, 'query'>;

/**
 * Apply every migration file in order, in one transaction that holds an
 * advisory lock for its whole duration.
 *
 * Several runners can hit the same database at once (scrape.yml and
 * scrape-rent.yml both migrate, and cron start times drift by hours), and the
 * migrations' check-then-act DDL (IF NOT EXISTS, DO blocks) is not safe when
 * run concurrently. A transaction-scoped lock is used because production goes
 * through PgBouncer in transaction pool mode, where a session lock would not
 * stay on one server connection. A second runner waits, then re-applies the
 * already-applied, idempotent files.
 */
export async function applyMigrations(client: MigrationClient, dir: string = migrationsDir): Promise<string[]> {
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('whereislifecheaper.migrate'))");
    for (const file of files) {
      logger.info(`Running migration: ${file}`);
      try {
        await client.query(fs.readFileSync(path.join(dir, file), 'utf-8'));
      } catch (error) {
        logger.error(`✗ Migration ${file} failed:`, error);
        throw error;
      }
      logger.info(`✓ Migration ${file} completed successfully`);
    }
    await client.query('COMMIT');
    return files;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function runMigrations() {
  // Imported here, not at the top: importing the database module opens a pool
  // for DATABASE_URL, and applyMigrations must be importable without that
  // (tests point DATABASE_URL at their own database before connecting).
  const { getClient, closePool } = await import('../src/database');
  logger.info('Starting database migrations...');
  let failed = false;
  const client = await getClient();
  try {
    await applyMigrations(client);
    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed; no migration was applied:', error);
    failed = true;
  } finally {
    client.release();
    await closePool();
  }
  if (failed) process.exit(1);
}

if (require.main === module) {
  runMigrations();
}
