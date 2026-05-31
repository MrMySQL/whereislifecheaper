import {
  roomsTextToBedrooms,
  parsePriceText,
  buildUsdConverter,
  normalizeListing,
} from '../normalize';
import { ListingRaw } from '../types';

describe('roomsTextToBedrooms', () => {
  test('1-room Ukrainian → studio (0 bedrooms)', () => {
    expect(roomsTextToBedrooms('1-кімнатна')).toBe(0);
    expect(roomsTextToBedrooms('1-комн.')).toBe(0);
    expect(roomsTextToBedrooms('1 комн')).toBe(0);
  });

  test('2-room Ukrainian → 1 bedroom', () => {
    expect(roomsTextToBedrooms('2-кімнатна')).toBe(1);
    expect(roomsTextToBedrooms('2-комн.')).toBe(1);
  });

  test('3-room Ukrainian → 2 bedrooms', () => {
    expect(roomsTextToBedrooms('3-кімнатна')).toBe(2);
  });

  test('4-room Ukrainian → 3 bedrooms', () => {
    expect(roomsTextToBedrooms('4-кімнатна')).toBe(3);
  });

  test('5+ rooms collapses to 3+ bedrooms bucket via caller; raw value is N-1', () => {
    expect(roomsTextToBedrooms('5-кімнатна')).toBe(4);
  });

  test('studio variants → 0', () => {
    expect(roomsTextToBedrooms('Студія')).toBe(0);
    expect(roomsTextToBedrooms('студия')).toBe(0);
    expect(roomsTextToBedrooms('Studio')).toBe(0);
  });

  test('unparseable text returns null', () => {
    expect(roomsTextToBedrooms('хата')).toBeNull();
    expect(roomsTextToBedrooms('')).toBeNull();
  });
});

describe('parsePriceText', () => {
  test('UAH with thin space', () => {
    expect(parsePriceText('12 500 грн/міс')).toEqual({ amount: 12500, currency: 'UAH' });
    expect(parsePriceText('12 500 грн')).toEqual({ amount: 12500, currency: 'UAH' });
  });

  test('UAH with comma thousands separator', () => {
    expect(parsePriceText('12,500 грн')).toEqual({ amount: 12500, currency: 'UAH' });
  });

  test('USD prefix and suffix', () => {
    expect(parsePriceText('$450')).toEqual({ amount: 450, currency: 'USD' });
    expect(parsePriceText('450 $')).toEqual({ amount: 450, currency: 'USD' });
    expect(parsePriceText('450 USD')).toEqual({ amount: 450, currency: 'USD' });
  });

  test('EUR', () => {
    expect(parsePriceText('€400')).toEqual({ amount: 400, currency: 'EUR' });
    expect(parsePriceText('400 €')).toEqual({ amount: 400, currency: 'EUR' });
  });

  test('returns null when amount unparseable', () => {
    expect(parsePriceText('Договірна')).toBeNull();
    expect(parsePriceText('')).toBeNull();
  });
});

describe('buildUsdConverter', () => {
  const rates = new Map<string, number>([
    ['UAH', 0.025],
    ['USD', 0.90],
    ['EUR', 1.0],
  ]);

  test('UAH → USD via EUR', () => {
    const toUsd = buildUsdConverter(rates);
    expect(toUsd(36, 'UAH')).toBeCloseTo(1, 4);
    expect(toUsd(360, 'UAH')).toBeCloseTo(10, 4);
  });

  test('USD is identity', () => {
    const toUsd = buildUsdConverter(rates);
    expect(toUsd(450, 'USD')).toBeCloseTo(450, 4);
  });

  test('EUR → USD', () => {
    const toUsd = buildUsdConverter(rates);
    expect(toUsd(1, 'EUR')).toBeCloseTo(1 / 0.9, 4);
  });

  test('throws if currency missing from rate table', () => {
    const toUsd = buildUsdConverter(rates);
    expect(() => toUsd(100, 'JPY' as any)).toThrow(/JPY/);
  });

  test('throws if USD rate is missing', () => {
    const partial = new Map<string, number>([['UAH', 0.025]]);
    expect(() => buildUsdConverter(partial)).toThrow(/USD/);
  });
});

describe('normalizeListing', () => {
  const rates = new Map<string, number>([
    ['UAH', 0.025],
    ['USD', 0.90],
    ['EUR', 1.0],
  ]);
  const toUsd = buildUsdConverter(rates);

  test('UAH listing with 2 rooms → 1BR, priceUsd computed', () => {
    const raw: ListingRaw = {
      source: 'olx',
      url: 'https://www.olx.ua/d/uk/obyavlenie/example',
      priceText: '18 000 грн',
      roomsText: '2-кімнатна',
      sqmText: '55 м²',
      district: 'Печерський',
      listedAtText: null,
    };

    const norm = normalizeListing(raw, toUsd);

    expect(norm).not.toBeNull();
    expect(norm!.bedrooms).toBe(1);
    expect(norm!.priceLocal).toBe(18000);
    expect(norm!.currency).toBe('UAH');
    expect(norm!.priceUsd).toBeCloseTo(18000 * (0.025 / 0.90), 2);
    expect(norm!.sqm).toBe(55);
    expect(norm!.district).toBe('Печерський');
  });

  test('returns null when price unparseable', () => {
    const raw: ListingRaw = {
      source: 'olx', url: 'x', priceText: 'Договірна',
      roomsText: '2-кімнатна', sqmText: null, district: null, listedAtText: null,
    };
    expect(normalizeListing(raw, toUsd)).toBeNull();
  });

  test('returns null when rooms unparseable', () => {
    const raw: ListingRaw = {
      source: 'olx', url: 'x', priceText: '15 000 грн',
      roomsText: '???', sqmText: null, district: null, listedAtText: null,
    };
    expect(normalizeListing(raw, toUsd)).toBeNull();
  });

  test('parses sqm text', () => {
    const raw: ListingRaw = {
      source: 'domria', url: 'x', priceText: '15 000 грн',
      roomsText: '2-кімнатна', sqmText: '47.5 м²', district: null, listedAtText: null,
    };
    const norm = normalizeListing(raw, toUsd);
    expect(norm!.sqm).toBeCloseTo(47.5, 2);
  });

  test('sqm null when text absent', () => {
    const raw: ListingRaw = {
      source: 'domria', url: 'x', priceText: '15 000 грн',
      roomsText: '2-кімнатна', sqmText: null, district: null, listedAtText: null,
    };
    expect(normalizeListing(raw, toUsd)!.sqm).toBeNull();
  });
});
