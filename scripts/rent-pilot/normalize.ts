import { Currency, ListingRaw, ListingNormalized } from './types';
import { ExchangeRateRepository } from '../../src/repositories/ExchangeRateRepository';

export function roomsTextToBedrooms(text: string): number | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  if (/студ|studio/i.test(lower)) return 0;

  const match = lower.match(/(\d+)\s*[-\s]*(?:кімн|комн|room)/);
  if (!match) return null;

  const rooms = parseInt(match[1], 10);
  if (Number.isNaN(rooms) || rooms < 1) return null;

  return rooms - 1;
}

export function parsePriceText(text: string): { amount: number; currency: Currency } | null {
  if (!text) return null;

  const stripped = text.replace(/[\s   ]/g, '');

  let currency: Currency | null = null;
  if (/грн|uah|₴/i.test(stripped)) currency = 'UAH';
  else if (/usd|\$/i.test(stripped)) currency = 'USD';
  else if (/eur|€/i.test(stripped)) currency = 'EUR';
  if (!currency) return null;

  const numMatch = stripped.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
  if (!numMatch) return null;

  const amount = parseInt(numMatch[1].replace(/,/g, ''), 10);
  if (Number.isNaN(amount) || amount <= 0) return null;

  return { amount, currency };
}

export function buildUsdConverter(
  ratesToEur: Map<string, number>,
): (amount: number, currency: Currency) => number {
  const usdToEur = ratesToEur.get('USD');
  if (usdToEur === undefined) {
    throw new Error('USD rate missing from exchange rate table');
  }

  return (amount: number, currency: Currency): number => {
    const localToEur = ratesToEur.get(currency);
    if (localToEur === undefined) {
      throw new Error(`Rate missing for currency: ${currency}`);
    }
    return amount * (localToEur / usdToEur);
  };
}

function parseSqm(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

export function normalizeListing(
  raw: ListingRaw,
  toUsd: (amount: number, currency: Currency) => number,
): ListingNormalized | null {
  const price = parsePriceText(raw.priceText);
  if (!price) return null;

  const bedrooms = roomsTextToBedrooms(raw.roomsText);
  if (bedrooms === null) return null;

  return {
    source: raw.source,
    url: raw.url,
    priceLocal: price.amount,
    currency: price.currency,
    priceUsd: toUsd(price.amount, price.currency),
    bedrooms,
    sqm: parseSqm(raw.sqmText),
    district: raw.district,
  };
}

export async function loadRatesToEur(): Promise<Map<string, number>> {
  const repo = new ExchangeRateRepository();
  const rows = await repo.getLatest();
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.currency_code, Number(row.rate_to_eur));
  }
  if (!map.has('EUR')) map.set('EUR', 1.0);
  return map;
}
