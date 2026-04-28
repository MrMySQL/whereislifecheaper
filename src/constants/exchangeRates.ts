// Single source of truth: src/constants/exchangeRates.json
// Add a new currency by editing the JSON file only — backend and frontend both consume it.
import rates from './exchangeRates.json';

export const FALLBACK_EXCHANGE_RATES: Record<string, number> = rates;

// Currencies tracked by the application (derived from fallback rates, excluding EUR)
export const TRACKED_CURRENCIES = Object.keys(FALLBACK_EXCHANGE_RATES).filter(c => c !== 'EUR');
