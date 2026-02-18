import { query } from '../config/database';
import { ExchangeRateRow } from '../types/db.types';

export class ExchangeRateRepository {
  async getLatest(): Promise<ExchangeRateRow[]> {
    const result = await query<ExchangeRateRow>(
      `SELECT currency_code, rate_to_eur, source, fetched_at
       FROM latest_exchange_rates
       ORDER BY currency_code`
    );
    return result.rows;
  }
}
