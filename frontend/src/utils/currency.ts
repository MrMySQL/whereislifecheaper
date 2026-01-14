// Exchange rates to EUR (approximate, should be fetched from API in production)
const exchangeRates: Record<string, number> = {
  EUR: 1,
  USD: 0.86,
  TRY: 0.020,
  UZS: 0.000071,
  UAH: 0.020,
};

const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  TRY: '₺',
  UZS: "so'm",
  UAH: '₴'
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

export function findCheapestCountry(
  pricesByCountry: Record<string, { price: number; currency: string }>
): { code: string; savings: number } | null {
  const entries = Object.entries(pricesByCountry);
  if (entries.length < 2) return null;

  // Convert all prices to EUR for comparison
  const pricesInEUR = entries.map(([code, data]) => ({
    code,
    eurPrice: convertToEUR(data.price, data.currency),
  }));

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
