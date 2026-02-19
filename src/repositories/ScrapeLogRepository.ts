import { query } from '../config/database';
import { ScrapeLogRow } from '../types/db.types';

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

  async update(
    logId: string,
    status: string,
    data: {
      productsScraped?: number;
      productsFailed?: number;
      error?: string;
      duration?: number;
    }
  ): Promise<void> {
    const durationSeconds = data.duration ? Math.round(data.duration / 1000) : null;
    await query(
      `UPDATE scrape_logs SET
        status = $2,
        products_scraped = $3,
        products_failed = $4,
        error_message = $5,
        duration_seconds = $6,
        completed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        logId,
        status,
        data.productsScraped || null,
        data.productsFailed || null,
        data.error || null,
        durationSeconds,
      ]
    );
  }

  async getHistoryForSupermarket(
    supermarketId: string,
    limit: number
  ): Promise<Record<string, unknown>[]> {
    const result = await query(
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

  async getLatestStats(): Promise<Record<string, unknown>[]> {
    const result = await query(`
      SELECT
        s.name as supermarket_name,
        c.name as country_name,
        sl.status, sl.products_scraped, sl.duration_seconds, sl.completed_at
      FROM scrape_logs sl
      INNER JOIN supermarkets s ON sl.supermarket_id = s.id
      INNER JOIN countries c ON s.country_id = c.id
      WHERE sl.id IN (
        SELECT MAX(id) FROM scrape_logs GROUP BY supermarket_id
      )
      ORDER BY sl.completed_at DESC
    `);
    return result.rows;
  }

  async getRecentWithDetails(limit: number): Promise<Record<string, unknown>[]> {
    const result = await query(
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

  async getRunning(): Promise<Record<string, unknown>[]> {
    const result = await query(`
      SELECT sl.*, s.name as supermarket_name
      FROM scrape_logs sl
      INNER JOIN supermarkets s ON sl.supermarket_id = s.id
      WHERE sl.status = 'running'
    `);
    return result.rows;
  }

  async get24hSummary(): Promise<Record<string, unknown>> {
    const result = await query(`
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
  ): Promise<Record<string, unknown>[]> {
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

    const result = await query(sql, params as any[]);
    return result.rows;
  }
}
