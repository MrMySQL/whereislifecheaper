import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import { logger } from '../src/utils/logger';

const migrationsDir = path.join(__dirname, '../src/database/migrations');
const LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('whereislifecheaper.migrate'))";

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
 *
 * The whole run goes to the server as one multi-statement query: every file is
 * re-applied on every run (including every Vercel build), and one round trip
 * per file added up to seconds against a remote database. A failure there says
 * nothing about which file broke, so after rolling back the run is repeated
 * file by file - still one transaction, still all-or-nothing - purely to
 * report the failing file. The files share one transaction either way, so the
 * two paths have the same effect.
 */
export async function applyMigrations(client: MigrationClient, dir: string = migrationsDir): Promise<string[]> {
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
  const sources = files.map((file) => fs.readFileSync(path.join(dir, file), 'utf-8'));

  logger.info(`Running ${files.length} migrations in one batch (${files[0]} .. ${files[files.length - 1]})`);
  try {
    // `;` on its own line between files: a file whose last line is a `--`
    // comment or lacks its final semicolon must not swallow the next one.
    await client.query(['BEGIN;', `${LOCK_SQL};`, ...sources, 'COMMIT;'].join('\n;\n'));
    logger.info(`✓ All ${files.length} migrations completed successfully`);
    return files;
  } catch (batchError) {
    await client.query('ROLLBACK');
    logger.warn('Batched migration run failed and was rolled back; re-running file by file to locate the failure', batchError);
  }

  await client.query('BEGIN');
  try {
    await client.query(LOCK_SQL);
    for (const [i, file] of files.entries()) {
      logger.info(`Running migration: ${file}`);
      try {
        await client.query(sources[i]);
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
