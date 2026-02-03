// Fallback exchange rates to EUR (used if API fetch fails)
// NOTE: Keep in sync with src/constants/exchangeRates.ts
const FALLBACK_RATES: Record<string, number> = {
  EUR: 1,
  TRY: 0.01992512,
  UZS: 0.00007202,
  UAH: 0.01983600,
  KZT: 0.00168442,
  USD: 0.86169064,
  MYR: 0.19865000,
  ALL: 0.01034616,
  RUB: 0.00952381, // ~105 RUB per EUR
};

// Current exchange rates (mutable, updated via loadExchangeRates)
let exchangeRates: Record<string, number> = { ...FALLBACK_RATES };

// Track if rates have been loaded from API
let ratesLoaded = false;

interface RatesResponse {
  data: Record<string, number>;
  source: string;
  last_updated: string | null;
}

/**
 * Load exchange rates from the API
 * Should be called once when the app initializes
 */
export async function loadExchangeRates(): Promise<void> {
  if (ratesLoaded) return;

  try {
    const response = await fetch('/api/rates');
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const result: RatesResponse = await response.json();
    exchangeRates = { ...FALLBACK_RATES, ...result.data };
    ratesLoaded = true;

    console.log(
      `Exchange rates loaded from ${result.source}`,
      result.last_updated ? `(updated: ${result.last_updated})` : ''
    );
  } catch (error) {
    console.warn('Failed to load exchange rates from API, using fallback rates:', error);
    exchangeRates = { ...FALLBACK_RATES };
  }
}

/**
 * Get the current exchange rates (for debugging/display)
 */
export function getExchangeRates(): Record<string, number> {
  return { ...exchangeRates };
}

const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  TRY: '₺',
  UZS: "so'm",
  UAH: '₴',
  KZT: '₸',
  MYR: 'RM',
  ALL: 'L',
  RUB: '₽',
};

export function formatPrice(price: number | string, currency: string): string {
  const symbol = currencySymbols[currency] || currency;
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return `${symbol}${numPrice.toFixed(2)}`;
}

export function convertToEUR(price: number, currency: string): number {
  const rate = exchangeRates[currency] || 1;
  return price * rate;
}

export function formatPriceWithEUR(price: number, currency: string): {
  local: string;
  eur: string;
} {
  const eurValue = convertToEUR(price, currency);
  return {
    local: formatPrice(price, currency),
    eur: `€${eurValue.toFixed(2)}`,
  };
}

/**
 * Check if a unit is normalizable (weight or volume)
 */
export function isNormalizableUnit(unit: string | null): boolean {
  if (!unit) return false;
  const normalized = unit.toLowerCase();
  return [
    'kg', 'g',
    'l', 'ml'
  ].includes(normalized);
}

/**
 * Get the standard unit label for display (e.g., "kg" or "L")
 */
export function getUnitLabel(unit: string | null): string | null {
  if (!unit) return null;
  const normalized = unit.toLowerCase();
  if (normalized === 'kg' || normalized === 'g') return 'kg';
  if (normalized === 'l' || normalized === 'ml') return 'L';
  return null;
}

/**
 * Format price per unit (e.g., "€5.20/kg" or "$3.50/L")
 */
export function formatPricePerUnit(
  pricePerUnit: number,
  currency: string,
  unit: string | null
): string {
  const unitLabel = getUnitLabel(unit);
  if (!unitLabel) return formatPrice(pricePerUnit, currency);
  return `${formatPrice(pricePerUnit, currency)}/${unitLabel}`;
}

/**
 * Format the package description (e.g., "500g" or "1.5L")
 */
export function formatPackageSize(
  unitQuantity: number | null,
  unit: string | null
): string | null {
  if (unitQuantity == null || !unit) return null;
  return `${unitQuantity}${unit}`;
}

export function findCheapestCountry(
  pricesByCountry: Record<string, {
    price: number;
    currency: string;
    price_per_unit?: number | null;
    unit?: string | null;
  }>,
  usePerUnitPricing: boolean = true
): { code: string; savings: number } | null {
  const entries = Object.entries(pricesByCountry);
  if (entries.length < 2) return null;

  // Convert all prices to EUR for comparison
  // Use price_per_unit for normalizable units when enabled, otherwise use price
  const pricesInEUR = entries.map(([code, data]) => {
    const useNormalized = usePerUnitPricing && isNormalizableUnit(data.unit ?? null) && data.price_per_unit != null;
    const priceToCompare = useNormalized ? data.price_per_unit! : data.price;
    return {
      code,
      eurPrice: convertToEUR(priceToCompare, data.currency),
    };
  });

  // Sort by EUR price
  pricesInEUR.sort((a, b) => a.eurPrice - b.eurPrice);

  const cheapest = pricesInEUR[0];
  const avgOfOthers = pricesInEUR.slice(1).reduce((sum, p) => sum + p.eurPrice, 0) / (pricesInEUR.length - 1);

  const savings = ((avgOfOthers - cheapest.eurPrice) / avgOfOthers) * 100;

  return {
    code: cheapest.code,
    savings: Math.round(savings),
  };
}
