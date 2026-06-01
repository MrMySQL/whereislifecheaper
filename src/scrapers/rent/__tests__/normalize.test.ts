import {
  roomsTextToBedrooms,
  parsePriceText,
  buildLocalConverter,
  extractSourceListingId,
  normalizeListing,
} from '../normalize';
import { ListingRaw } from '../types';

describe('roomsTextToBedrooms', () => {
  test('studio = 0 bedrooms', () => {
    expect(roomsTextToBedrooms('Студія, 25 м²')).toBe(0);
  });
  test('"2-кімнатна" = 1 bedroom (room - 1)', () => {
    expect(roomsTextToBedrooms('2-кімнатна квартира')).toBe(1);
  });
  test('unparseable returns null', () => {
    expect(roomsTextToBedrooms('продається')).toBeNull();
  });
});

describe('parsePriceText', () => {
  test('UAH amount', () => {
    expect(parsePriceText('25 000 грн/міс')).toEqual({ amount: 25000, currency: 'UAH' });
  });
  test('USD amount', () => {
    expect(parsePriceText('$ 541')).toEqual({ amount: 541, currency: 'USD' });
  });
  test('no currency token returns null', () => {
    expect(parsePriceText('25000')).toBeNull();
  });
});

describe('buildLocalConverter', () => {
  // rate_to_eur = EUR per 1 unit of currency.
  // UAH: 1 UAH = 0.022 EUR; USD: 1 USD = 0.92 EUR. Target = UAH.
  const rates = new Map<string, number>([['UAH', 0.022], ['USD', 0.92], ['EUR', 1]]);
  const toUah = buildLocalConverter(rates, 'UAH');

  test('UAH -> UAH is identity', () => {
    expect(toUah(25000, 'UAH')).toBeCloseTo(25000, 0);
  });
  test('USD -> UAH multiplies by rate(USD)/rate(UAH)', () => {
    // 500 * (0.92 / 0.022) ~= 20909
    expect(toUah(500, 'USD')).toBeCloseTo(500 * (0.92 / 0.022), 0);
  });
  test('throws when target currency rate missing', () => {
    expect(() => buildLocalConverter(rates, 'XYZ')).toThrow();
  });
});

describe('extractSourceListingId', () => {
  test('olx pulls the ID token from the URL', () => {
    expect(
      extractSourceListingId('olx', 'https://www.olx.ua/d/uk/obyavlenie/kvartira-IDabc123.html'),
    ).toBe('abc123');
  });
  test('flatfy pulls the redirect id', () => {
    expect(extractSourceListingId('flatfy', 'https://flatfy.ua/redirect/98765')).toBe('98765');
  });
  test('falls back to the full url when no pattern matches', () => {
    expect(extractSourceListingId('domria', 'https://dom.ria.com/uk/weird-url')).toBe(
      'https://dom.ria.com/uk/weird-url',
    );
  });
});

describe('normalizeListing', () => {
  const rates = new Map<string, number>([['UAH', 0.022], ['USD', 0.92], ['EUR', 1]]);
  const toUah = buildLocalConverter(rates, 'UAH');
  const raw: ListingRaw = {
    source: 'flatfy',
    url: 'https://flatfy.ua/redirect/42',
    priceText: '$ 500',
    roomsText: '2 кімнати, 60 м²',
    sqmText: '60 м²',
    district: 'Печерський',
    listedAtText: null,
  };

  test('produces price in the country currency and rooms->bedrooms', () => {
    const n = normalizeListing(raw, toUah, 'UAH')!;
    expect(n.bedrooms).toBe(1);            // 2 rooms - 1
    expect(n.currencyOriginal).toBe('USD');
    expect(n.priceOriginal).toBe(500);
    expect(n.priceLocal).toBeCloseTo(500 * (0.92 / 0.022), 0);
    expect(n.sourceListingId).toBe('42');
    expect(n.sqm).toBe(60);
  });

  test('returns null when price has no currency', () => {
    expect(normalizeListing({ ...raw, priceText: '500' }, toUah, 'UAH')).toBeNull();
  });

  test('returns null when rooms unparseable', () => {
    expect(normalizeListing({ ...raw, roomsText: 'оренда' }, toUah, 'UAH')).toBeNull();
  });
});
