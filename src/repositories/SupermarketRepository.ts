import { query } from '../config/database';
import { CountryRow, SupermarketRow, SupermarketWithCountry } from '../types/db.types';

export class SupermarketRepository {
  async findById(supermarketId: string): Promise<SupermarketWithCountry | null> {
    const result = await query<SupermarketWithCountry>(
      `SELECT s.*, c.code as country_code, c.currency_code, c.name as country_name
       FROM supermarkets s
       INNER JOIN countries c ON s.country_id = c.id
       WHERE s.id = $1`,
      [supermarketId]
    );
    return result.rows[0] ?? null;
  }

  async findByIdWithProductCount(supermarketId: string): Promise<Record<string, unknown> | null> {
    const result = await query(
      `SELECT
        s.*,
        c.name as country_name, c.code as country_code, c.currency_code,
        (
          SELECT COUNT(DISTINCT pm.product_id)
          FROM product_mappings pm
          WHERE pm.supermarket_id = s.id
        ) as product_count
       FROM supermarkets s
       INNER JOIN countries c ON s.country_id = c.id
       WHERE s.id = $1`,
      [supermarketId]
    );
    return result.rows[0] ?? null;
  }

  async getActive(): Promise<SupermarketRow[]> {
    const result = await query<SupermarketRow>(
      `SELECT * FROM supermarkets WHERE is_active = true ORDER BY name`
    );
    return result.rows;
  }

  async findAll(filters: {
    countryId?: string;
    activeOnly?: boolean;
  }): Promise<Record<string, unknown>[]> {
    let sql = `
      SELECT
        s.*,
        c.name as country_name, c.code as country_code, c.currency_code,
        (
          SELECT COUNT(DISTINCT pm.product_id)
          FROM product_mappings pm
          WHERE pm.supermarket_id = s.id
        ) as product_count,
        (
          SELECT MAX(sl.completed_at)
          FROM scrape_logs sl
          WHERE sl.supermarket_id = s.id AND sl.status = 'success'
        ) as last_scrape
      FROM supermarkets s
      INNER JOIN countries c ON s.country_id = c.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let i = 1;

    if (filters.countryId) {
      sql += ` AND s.country_id = $${i++}`;
      params.push(filters.countryId);
    }
    if (filters.activeOnly) {
      sql += ` AND s.is_active = true`;
    }

    sql += ` ORDER BY c.name, s.name`;
    const result = await query(sql, params as any[]);
    return result.rows;
  }

  async getAllCountries(): Promise<CountryRow[]> {
    const result = await query<CountryRow>(
      `SELECT * FROM countries ORDER BY name`
    );
    return result.rows;
  }

  async findCountryById(id: string): Promise<CountryRow | null> {
    const result = await query<CountryRow>(
      `SELECT * FROM countries WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async getSupermarketsForCountry(countryId: string): Promise<Record<string, unknown>[]> {
    const result = await query(
      `SELECT id, name, website_url, logo_url, is_active
       FROM supermarkets
       WHERE country_id = $1
       ORDER BY name`,
      [countryId]
    );
    return result.rows;
  }

  async getAllSupermarketsBasic(): Promise<Record<string, unknown>[]> {
    const result = await query(
      `SELECT id, name, country_id, is_active FROM supermarkets ORDER BY name`
    );
    return result.rows;
  }

  async findBasicById(supermarketId: string): Promise<{ id: string; name: string; scraper_class: string } | null> {
    const result = await query<{ id: string; name: string; scraper_class: string }>(
      `SELECT id, name, scraper_class FROM supermarkets WHERE id = $1`,
      [supermarketId]
    );
    return result.rows[0] ?? null;
  }

  async findActiveById(supermarketId: string): Promise<{ id: string; name: string } | null> {
    const result = await query<{ id: string; name: string }>(
      `SELECT id, name FROM supermarkets WHERE id = $1 AND is_active = true`,
      [supermarketId]
    );
    return result.rows[0] ?? null;
  }
}
