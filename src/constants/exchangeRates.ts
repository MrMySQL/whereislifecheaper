// Fallback exchange rates to EUR (rate_to_eur: how many EUR for 1 unit of currency)
// Used when API fetch fails or database is empty
export const FALLBACK_EXCHANGE_RATES: Record<string, number> = {
  EUR: 1,
  TRY: 0.01992512,
  UZS: 0.00007202,
  UAH: 0.01983600,
  KZT: 0.00168442,
  USD: 0.86169064,
};

// Currencies tracked by the application (derived from fallback rates, excluding EUR)
export const TRACKED_CURRENCIES = Object.keys(FALLBACK_EXCHANGE_RATES).filter(c => c !== 'EUR');