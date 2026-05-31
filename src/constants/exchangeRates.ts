// Single source of truth: src/constants/exchangeRates.data.json
// Add a new currency by editing the JSON file only — backend and frontend both consume it.
// Note: filename is `.data.json` (not `.json`) to avoid Node basename collision with this `.ts` file,
// which would cause `import { ... } from './exchangeRates'` to resolve to the JSON instead.
import rates from './exchangeRates.data.json';

export const FALLBACK_EXCHANGE_RATES: Record<string, number> = rates;

// Currencies tracked by the application (derived from fallback rates, excluding EUR)
export const TRACKED_CURRENCIES = Object.keys(FALLBACK_EXCHANGE_RATES).filter(c => c !== 'EUR');
