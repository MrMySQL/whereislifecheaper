// Exchange rates to USD (approximate, should be fetched from API in production)
const exchangeRates: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  TRY: 0.031,
  RSD: 0.0091,
  UZS: 0.000078,
  UAH: 0.031,
};

export function formatPrice(price: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    TRY: '₺',
    RSD: 'RSD',
    UZS: "so'm",
    UAH: '₴'
  };

  const symbol = symbols[currency] || currency;
  return `${symbol}${price.toFixed(2)}`;
}

export function convertToUSD(price: number, currency: string): number {
  const rate = exchangeRates[currency] || 1;
  return price * rate;
}

export function formatPriceWithUSD(price: number, currency: string): {
  local: string;
  usd: string;
} {
  const usdValue = convertToUSD(price, currency);
  return {
    local: formatPrice(price, currency),
    usd: `$${usdValue.toFixed(2)}`,
  };
}

export function findCheapestCountry(
  pricesByCountry: Record<string, { price: number; currency: string }>
): { code: string; savings: number } | null {
  const entries = Object.entries(pricesByCountry);
  if (entries.length < 2) return null;

  // Convert all prices to USD for comparison
  const pricesInUSD = entries.map(([code, data]) => ({
    code,
    usdPrice: convertToUSD(data.price, data.currency),
  }));

  // Sort by USD price
  pricesInUSD.sort((a, b) => a.usdPrice - b.usdPrice);

  const cheapest = pricesInUSD[0];
  const avgOfOthers = pricesInUSD.slice(1).reduce((sum, p) => sum + p.usdPrice, 0) / (pricesInUSD.length - 1);

  const savings = ((avgOfOthers - cheapest.usdPrice) / avgOfOthers) * 100;

  return {
    code: cheapest.code,
    savings: Math.round(savings),
  };
}
