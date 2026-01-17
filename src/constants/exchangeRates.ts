// Currencies tracked by the application
export const TRACKED_CURRENCIES = ['USD', 'TRY', 'UZS', 'UAH'] as const;

// Fallback exchange rates to EUR (rate_to_eur: how many EUR for 1 unit of currency)
// Used when API fetch fails or database is empty
export const FALLBACK_EXCHANGE_RATES: Record<string, number> = {
  EUR: 1,
  USD: 0.86,
  TRY: 0.020,
  UZS: 0.000071,
  UAH: 0.020,
};
