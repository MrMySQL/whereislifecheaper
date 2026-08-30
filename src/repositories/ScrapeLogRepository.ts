import { query } from '../config/database';
import {
  ScrapeLogRow,
  ScrapeLogWithSupermarket,
  ScrapeLogWithDetails,
  ScrapeLogWithCountryCode,
  ScrapeLogLatestStats,
  ScrapeLog24hSummary,
} from '../types/db.types';

export class ScrapeLogRepository {
  async create(supermarketId: string, status: string): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO scrape_logs (supermarket_id, status, started_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       RETURNING id`,
      [supermarketId, status]
    );
    return result.rows[0].id;
  }

  /**
   * @param data.onlyIfRunning Refuse to write if the row has already reached a
   *   terminal status. A scraper finishing at the same moment a signal handler
   *   closes its row would otherwise overwrite the 'failed' that shutdown
   *   recorded — the in-process flag cannot cover it, because the status check
   *   and this write are separated by an await. Returns the rows affected.
   */
  async update(
    logId: string,
    status: string,
    data: {
      productsScraped?: number;
      productsFailed?: number;
      error?: string;
      duration?: number;
      onlyIfRunning?: boolean;
    }
  ): Promise<number> {
    const durationSeconds = data.duration ? Math.round(data.duration / 1000) : null;
    const result = await query(
      `UPDATE scrape_logs SET
        status = $2,
        products_scraped = $3,
        products_failed = $4,
        error_message = $5,
        duration_seconds = $6,
        completed_at = CURRENT_TIMESTAMP
       WHERE id = $1${data.onlyIfRunning ? " AND status = 'running'" : ''}`,
      [
        logId,
        status,
        // `??`, not `||` — a real 0 must be stored as 0, not collapsed to NULL.
        data.productsScraped ?? null,
        data.productsFailed ?? null,
        data.error || null,
        durationSeconds,
      ]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Close one row, but only while it is still 'running'.
   *
   * Guarded so a shutdown racing a normal completion cannot overwrite a row
   * that already recorded 'success'. Counts and duration are preserved rather
   * than overwritten — products stored before the signal are real, and the
   * plain update() would blank products_scraped back to NULL.
   *
   * Returns 1 if the row was still running and got closed, 0 otherwise.
   */
  async failIfRunning(logId: string, errorMessage: string): Promise<number> {
    const result = await query(
      `UPDATE scrape_logs
       SET status = 'failed',
           error_message = COALESCE(error_message, $2),
           completed_at = CURRENT_TIMESTAMP,
           duration_seconds = COALESCE(duration_seconds, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::int)
       WHERE id = $1 AND status = 'running'`,
      [logId, errorMessage]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Close out 'running' rows left behind by a killed process.
   *
   * runScraper only moves a row off 'running' in its own success or catch
   * path, so a SIGKILL — which is how the CI timeout ends a run — strands it
   * forever. Returns the number of rows reaped.
   */
  async reapStaleRuns(olderThanHours: number = 8): Promise<number> {
    const result = await query(
      `UPDATE scrape_logs
       SET status = 'failed',
           error_message = COALESCE(error_message, 'Orphaned: process exited before the scraper finished'),
           completed_at = CURRENT_TIMESTAMP,
           duration_seconds = COALESCE(duration_seconds, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))::int)
       WHERE status = 'running'
         AND started_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 hour')`,
      [olderThanHours]
    );
    return result.rowCount ?? 0;
  }

  async getHistoryForSupermarket(
    supermarketId: string,
    limit: number
  ): Promise<ScrapeLogWithSupermarket[]> {
    const result = await query<ScrapeLogWithSupermarket>(
      `SELECT sl.*, s.name as supermarket_name
       FROM scrape_logs sl
       INNER JOIN supermarkets s ON sl.supermarket_id = s.id
       WHERE sl.supermarket_id = $1
       ORDER BY sl.started_at DESC
       LIMIT $2`,
      [supermarketId, limit]
    );
    return result.rows;
  }

  async getRecentForSupermarket(
    supermarketId: string,
    limit: number
  ): Promise<ScrapeLogRow[]> {
    const result = await query<ScrapeLogRow>(
      `SELECT id, status, products_scraped, products_failed, duration_seconds, error_message, started_at, completed_at
       FROM scrape_logs
       WHERE supermarket_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [supermarketId, limit]
    );
    return result.rows;
  }

  async getLatestStats(): Promise<ScrapeLogLatestStats[]> {
    const result = await query<ScrapeLogLatestStats>(`
      SELECT * FROM (
        SELECT DISTINCT ON (sl.supermarket_id)
          s.name as supermarket_name,
          c.name as country_name,
          sl.status, sl.products_scraped, sl.duration_seconds, sl.completed_at
        FROM scrape_logs sl
        INNER JOIN supermarkets s ON sl.supermarket_id = s.id
        INNER JOIN countries c ON s.country_id = c.id
        ORDER BY sl.supermarket_id, sl.id DESC
      ) latest
      ORDER BY completed_at DESC
    `);
    return result.rows;
  }

  async getRecentWithDetails(limit: number): Promise<ScrapeLogWithDetails[]> {
    const result = await query<ScrapeLogWithDetails>(
      `SELECT sl.*, s.name as supermarket_name, c.name as country_name
       FROM scrape_logs sl
       INNER JOIN supermarkets s ON sl.supermarket_id = s.id
       INNER JOIN countries c ON s.country_id = c.id
       ORDER BY sl.started_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async getRunning(): Promise<ScrapeLogWithSupermarket[]> {
    const result = await query<ScrapeLogWithSupermarket>(`
      SELECT sl.*, s.name as supermarket_name
      FROM scrape_logs sl
      INNER JOIN supermarkets s ON sl.supermarket_id = s.id
      WHERE sl.status = 'running'
    `);
    return result.rows;
  }

  async get24hSummary(): Promise<ScrapeLog24hSummary> {
    const result = await query<ScrapeLog24hSummary>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'success' AND started_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as success_24h,
        COUNT(*) FILTER (WHERE status = 'failed' AND started_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as failed_24h,
        SUM(products_scraped) FILTER (WHERE started_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as products_24h,
        COUNT(*) FILTER (WHERE status = 'running') as currently_running
      FROM scrape_logs
    `);
    return result.rows[0];
  }

  async getLogs(
    filters: { supermarketId?: string; status?: string },
    pagination: { limit: number; offset: number }
  ): Promise<ScrapeLogWithCountryCode[]> {
    let sql = `
      SELECT sl.*, s.name as supermarket_name, c.name as country_name, c.code as country_code
      FROM scrape_logs sl
      INNER JOIN supermarkets s ON sl.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let i = 1;

    if (filters.supermarketId) {
      sql += ` AND sl.supermarket_id = $${i++}`;
      params.push(filters.supermarketId);
    }
    if (filters.status) {
      sql += ` AND sl.status = $${i++}`;
      params.push(filters.status);
    }

    sql += ` ORDER BY sl.started_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(pagination.limit, pagination.offset);

    const result = await query<ScrapeLogWithCountryCode>(sql, params);
    return result.rows;
  }
}
