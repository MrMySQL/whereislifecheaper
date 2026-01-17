import { query, closePool } from '../src/config/database';
import { logger } from '../src/utils/logger';
import { TRACKED_CURRENCIES, FALLBACK_EXCHANGE_RATES } from '../src/constants/exchangeRates';

// fawazahmed0/currency-api response format
interface CurrencyApiResponse {
  date: string;
  eur: Record<string, number>;
}

async function fetchRatesFromApi(): Promise<Record<string, number> | null> {
  // Using fawazahmed0/currency-api - free, no API key, 200+ currencies
  // https://github.com/fawazahmed0/exchange-api
  const url = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json';

  try {
    logger.info(`Fetching exchange rates from: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const data: CurrencyApiResponse = await response.json();
    logger.info(`Currency API response for date ${data.date}`);

    // The API returns how many units of target currency per 1 EUR
    // We need to invert this to get how many EUR per 1 unit of currency
    const ratesInEUR: Record<string, number> = { EUR: 1 };

    for (const currency of TRACKED_CURRENCIES) {
      const lowerCurrency = currency.toLowerCase();
      if (data.eur[lowerCurrency]) {
        ratesInEUR[currency] = 1 / data.eur[lowerCurrency];
        logger.info(`Fetched rate: ${currency} = ${ratesInEUR[currency]} EUR (1 EUR = ${data.eur[lowerCurrency]} ${currency})`);
      } else {
        logger.warn(`Currency ${currency} not found in API response`);
      }
    }

    return ratesInEUR;
  } catch (error) {
    logger.error('Failed to fetch rates from Currency API:', error);
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

  // Start with fallback rates as base (for currencies not supported by API)
  const rates: Record<string, number> = { ...FALLBACK_EXCHANGE_RATES };
  let source = 'fallback';

  // Try to fetch from currency API and merge with fallback rates
  const apiRates = await fetchRatesFromApi();
  if (apiRates) {
    // Merge API rates (overwrites fallback for supported currencies)
    Object.assign(rates, apiRates);
    source = 'currency-api';

    // Log which currencies are using fallback rates
    const fallbackCurrencies = Object.keys(FALLBACK_EXCHANGE_RATES).filter(
      c => !apiRates[c]
    );
    if (fallbackCurrencies.length > 0) {
      logger.info(`Using fallback rates for unsupported currencies: ${fallbackCurrencies.join(', ')}`);
    }
  } else {
    logger.warn('API fetch failed, using all fallback exchange rates');
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
