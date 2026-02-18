import { Router } from 'express';
import { exchangeRateRepository } from '../../repositories';
import { FALLBACK_EXCHANGE_RATES } from '../../constants/exchangeRates';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await exchangeRateRepository.getLatest();

    if (rows.length > 0) {
      const data: Record<string, number> = {};
      let latestFetchedAt: Date | null = null;
      let source = 'database';

      for (const row of rows) {
        data[row.currency_code] = parseFloat(row.rate_to_eur);
        const fetchedAt = new Date(row.fetched_at);
        if (!latestFetchedAt || fetchedAt > latestFetchedAt) {
          latestFetchedAt = fetchedAt;
          source = row.source;
        }
      }

      if (!data.EUR) data.EUR = 1;

      res.json({ data, source, last_updated: latestFetchedAt?.toISOString() || null });
      return;
    }

    res.json({ data: FALLBACK_EXCHANGE_RATES, source: 'fallback', last_updated: null });
  } catch (error) {
    next(error);
  }
});

export default router;
