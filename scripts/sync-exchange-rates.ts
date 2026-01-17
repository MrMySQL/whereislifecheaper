import { query, closePool } from '../src/config/database';
import { logger } from '../src/utils/logger';

// Currencies we need to track (used in the application)
const CURRENCIES = ['USD', 'TRY', 'UZS', 'UAH'];

// Fallback rates in case API fails (rate_to_eur: how many EUR for 1 unit)
const FALLBACK_RATES: Record<string, number> = {
  EUR: 1,
  USD: 0.86,
  TRY: 0.020,
  UZS: 0.000071,
  UAH: 0.020,
};

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

async function fetchRatesFromFrankfurter(): Promise<Record<string, number> | null> {
  try {
    // Frankfurter API: get EUR rates for our currencies
    // The API returns how many units of target currency per 1 EUR
    // We need to invert this to get how many EUR per 1 unit of currency
    const url = `https://api.frankfurter.app/latest?from=EUR&to=${CURRENCIES.join(',')}`;

    logger.info(`Fetching exchange rates from: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const data: FrankfurterResponse = await response.json();
    logger.info(`Frankfurter API response for date ${data.date}:`, data.rates);

    // Convert from "units per EUR" to "EUR per unit"
    const ratesInEUR: Record<string, number> = { EUR: 1 };
    for (const [currency, ratePerEUR] of Object.entries(data.rates)) {
      ratesInEUR[currency] = 1 / ratePerEUR;
    }

    return ratesInEUR;
  } catch (error) {
    logger.error('Failed to fetch rates from Frankfurter API:', error);
    return null;
  }
}

async function getLatestRatesFromDB(): Promise<Record<string, number>> {
  try {
    const result = await query(`
      SELECT currency_code, rate_to_eur
      FROM latest_exchange_rates
    `);

    const rates: Record<string, number> = {};
    for (const row of result.rows) {
      rates[row.currency_code] = parseFloat(row.rate_to_eur);
    }
    return rates;
  } catch (error) {
    logger.warn('Could not fetch latest rates from DB:', error);
    return {};
  }
}

async function saveRates(rates: Record<string, number>, source: string): Promise<void> {
  const now = new Date();

  for (const [currency, rate] of Object.entries(rates)) {
    await query(
      `INSERT INTO exchange_rates (currency_code, rate_to_eur, source, fetched_at)
       VALUES ($1, $2, $3, $4)`,
      [currency, rate, source, now]
    );
    logger.info(`Saved rate: ${currency} = ${rate} EUR (source: ${source})`);
  }
}

function checkForLargeChanges(
  newRates: Record<string, number>,
  oldRates: Record<string, number>
): void {
  const THRESHOLD = 0.10; // 10% change threshold

  for (const [currency, newRate] of Object.entries(newRates)) {
    const oldRate = oldRates[currency];
    if (oldRate && oldRate > 0) {
      const changePercent = Math.abs((newRate - oldRate) / oldRate);
      if (changePercent > THRESHOLD) {
        logger.warn(
          `Large rate change detected for ${currency}: ` +
          `${oldRate.toFixed(10)} -> ${newRate.toFixed(10)} ` +
          `(${(changePercent * 100).toFixed(2)}% change)`
        );
      }
    }
  }
}

async function syncExchangeRates(): Promise<void> {
  logger.info('Starting exchange rate synchronization...');

  // Get current rates from DB for comparison
  const oldRates = await getLatestRatesFromDB();

  // Try to fetch from Frankfurter API
  let rates = await fetchRatesFromFrankfurter();
  let source = 'frankfurter';

  // Fall back to hardcoded rates if API fails
  if (!rates) {
    logger.warn('Using fallback exchange rates');
    rates = FALLBACK_RATES;
    source = 'fallback';
  }

  // Check for large changes (potential data issues)
  if (Object.keys(oldRates).length > 0) {
    checkForLargeChanges(rates, oldRates);
  }

  // Save rates to database
  await saveRates(rates, source);

  logger.info(`Exchange rate sync completed. Source: ${source}`);
}

async function main(): Promise<void> {
  try {
    await syncExchangeRates();
  } catch (error) {
    logger.error('Exchange rate sync failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
