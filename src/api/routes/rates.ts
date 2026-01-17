import { Router } from 'express';
import { query } from '../../config/database';

const router = Router();

// Fallback rates if database is empty
const FALLBACK_RATES: Record<string, number> = {
  EUR: 1,
  USD: 0.86,
  TRY: 0.020,
  UZS: 0.000071,
  UAH: 0.020,
};

/**
 * GET /api/rates
 * Get latest exchange rates (rate_to_eur: how many EUR for 1 unit of currency)
 */
router.get('/', async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT currency_code, rate_to_eur, source, fetched_at
      FROM latest_exchange_rates
      ORDER BY currency_code
    `);

    // If database has rates, use them
    if (result.rows.length > 0) {
      const data: Record<string, number> = {};
      let latestFetchedAt: Date | null = null;
      let source = 'database';

      for (const row of result.rows) {
        data[row.currency_code] = parseFloat(row.rate_to_eur);
        const fetchedAt = new Date(row.fetched_at);
        if (!latestFetchedAt || fetchedAt > latestFetchedAt) {
          latestFetchedAt = fetchedAt;
          source = row.source;
        }
      }

      // Ensure EUR is always included
      if (!data.EUR) {
        data.EUR = 1;
      }

      res.json({
        data,
        source,
        last_updated: latestFetchedAt?.toISOString() || null,
      });
      return;
    }

    // Fallback to hardcoded rates if database is empty
    res.json({
      data: FALLBACK_RATES,
      source: 'fallback',
      last_updated: null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
