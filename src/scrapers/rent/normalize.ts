import { Currency, ListingRaw, RentListingNormalized, Source } from './types';
import { ExchangeRateRepository } from '../../repositories/ExchangeRateRepository';

const UA_WORD_TO_ROOMS: Array<[RegExp, number]> = [
  [/одно\s*кімн|однокімн/i, 1],
  [/дво[хуї]?\s*кімн|двокімн/i, 2],
  [/тр[иьох]+\s*кімн|трикімн/i, 3],
  [/чотир[иьох]+\s*кімн|чотирикімн/i, 4],
];

const WEEKS_PER_MONTH = 52 / 12;
const AUSTRALIAN_SOURCES: Source[] = ['realestateau', 'domainau'];

export function roomsTextToBedrooms(text: string): number | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  if (/студ|studio/i.test(lower)) return 0;

  const bedroomMatch = lower.match(/(\d+)\s*beds?\b/);
  if (bedroomMatch) {
    const bedrooms = parseInt(bedroomMatch[1], 10);
    if (!Number.isNaN(bedrooms) && bedrooms >= 0) return bedrooms;
  }

  const digitMatch = lower.match(/(\d+)\s*[-\sх]*к(?:імн|омн|imn|омнат)?(?![в])/);
  if (digitMatch) {
    const rooms = parseInt(digitMatch[1], 10);
    if (!Number.isNaN(rooms) && rooms >= 1) return rooms - 1;
  }

  for (const [pattern, rooms] of UA_WORD_TO_ROOMS) {
    if (pattern.test(lower)) return rooms - 1;
  }

  return null;
}

export function parsePriceText(
  text: string,
  defaultDollarCurrency: Currency = 'USD',
): { amount: number; currency: Currency } | null {
  if (!text) return null;

  const stripped = text.replace(/[\s  ]/g, '');

  let currency: Currency | null = null;
  if (/грн|uah|₴/i.test(stripped)) currency = 'UAH';
  else if (/aud|a\$/i.test(stripped)) currency = 'AUD';
  else if (/usd|us\$/i.test(stripped)) currency = 'USD';
  else if (/\$/i.test(stripped)) currency = defaultDollarCurrency;
  else if (/eur|€/i.test(stripped)) currency = 'EUR';
  if (!currency) return null;

  const numMatch = stripped.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
  if (!numMatch) return null;

  const amount = parseInt(numMatch[1].replace(/,/g, ''), 10);
  if (Number.isNaN(amount) || amount <= 0) return null;

  return { amount, currency };
}

function parseSqm(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

function monthlyRentAmount(amount: number, source: Source): number {
  return AUSTRALIAN_SOURCES.includes(source) ? Math.round(amount * WEEKS_PER_MONTH) : amount;
}

/**
 * Build a converter from any listed currency to the target (country) currency.
 * `ratesToEur` maps a currency code to EUR-per-unit. To convert amount in C to T:
 *   amount * (rate(C) / rate(T)).
 */
export function buildLocalConverter(
  ratesToEur: Map<string, number>,
  targetCurrency: string,
): (amount: number, currency: Currency) => number {
  const targetRate = ratesToEur.get(targetCurrency);
  if (targetRate === undefined) {
    throw new Error(`Rate missing for target currency: ${targetCurrency}`);
  }
  return (amount: number, currency: Currency): number => {
    const rate = ratesToEur.get(currency);
    if (rate === undefined) {
      throw new Error(`Rate missing for currency: ${currency}`);
    }
    return amount * (rate / targetRate);
  };
}

/** Best-effort stable id per source; falls back to the URL so uniqueness holds. */
export function extractSourceListingId(source: Source, url: string): string {
  if (source === 'olx') {
    const m = url.match(/-ID([A-Za-z0-9]+)\.html/i);
    if (m) return m[1];
  } else if (source === 'domria') {
    const m = url.match(/(\d+)\.html/) ?? url.match(/_(\d+)(?:\b|$)/);
    if (m) return m[1];
  } else if (source === 'flatfy') {
    const m = url.match(/\/redirect\/([A-Za-z0-9-]+)/);
    if (m) return m[1];
  } else if (source === 'realestateau') {
    const m = url.match(/-(\d+)(?:[/?#]|$)/);
    if (m) return m[1];
  } else if (source === 'domainau') {
    const m = url.match(/-(\d+)(?:[/?#]|$)/);
    if (m) return m[1];
  }
  return url;
}

export function normalizeListing(
  raw: ListingRaw,
  toLocal: (amount: number, currency: Currency) => number,
  targetCurrency: string,
): RentListingNormalized | null {
  void targetCurrency;

  const defaultDollarCurrency = raw.source === 'realestateau' || raw.source === 'domainau' ? 'AUD' : 'USD';
  const price = parsePriceText(raw.priceText, defaultDollarCurrency);
  if (!price) return null;

  const bedrooms = roomsTextToBedrooms(raw.roomsText);
  if (bedrooms === null) return null;

  const monthlyAmount = monthlyRentAmount(price.amount, raw.source);

  return {
    source: raw.source,
    url: raw.url,
    sourceListingId: extractSourceListingId(raw.source, raw.url),
    priceOriginal: monthlyAmount,
    currencyOriginal: price.currency,
    priceLocal: Math.round(toLocal(monthlyAmount, price.currency)),
    bedrooms,
    sqm: parseSqm(raw.sqmText),
    district: raw.district,
  };
}

/** Load currency -> EUR rates from the existing exchange-rate infrastructure. */
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
