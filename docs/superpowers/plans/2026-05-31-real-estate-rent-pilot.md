# Real Estate Rent — Ukraine Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a throwaway validation pilot that scrapes Kyiv long-term rental listings from OLX.ua and DOM.RIA, normalizes them to bedroom buckets, computes trimmed medians, and produces a markdown report comparing both sources against Numbeo. The pilot's output decides whether production rent scraping is viable.

**Architecture:** Self-contained code under `scripts/rent-pilot/` — does **not** touch the production scraper registry, database schema, or API. Reuses only the existing `ExchangeRateRepository` for UAH→USD conversion. Pure parsing functions are TDD'd against saved HTML fixtures; the scrapers wrap parsers with Playwright pagination; aggregation and reporting are unit-tested.

**Tech Stack:** TypeScript, Playwright (already a project dependency, Chromium installed), Jest (already configured), `cheerio` for fixture-based HTML parsing in unit tests, existing `pg`-backed `ExchangeRateRepository`.

**Reference spec:** `docs/superpowers/specs/2026-05-31-real-estate-rent-design.md` (sections 1–2 in particular).

---

## File Structure

```
scripts/rent-pilot/
├── README.md                    # How to run, what it produces
├── run.ts                       # Orchestrator: scrape → normalize → aggregate → report
├── types.ts                     # Shared types (ListingRaw, ListingNormalized, BucketStats)
├── parse-olx.ts                 # Pure: HTML string → ListingRaw[]
├── parse-domria.ts              # Pure: HTML string → ListingRaw[]
├── scrape-olx.ts                # Playwright wrapper: paginates Kyiv long-term, returns ListingRaw[]
├── scrape-domria.ts             # Same for DOM.RIA
├── normalize.ts                 # ListingRaw → ListingNormalized (rooms→bedrooms, UAH→USD)
├── aggregate.ts                 # Outlier trim + median per (source, bedroom) bucket
├── numbeo-benchmarks.ts         # Hardcoded Numbeo Kyiv figures (captured manually)
├── report.ts                    # Render markdown comparison report
└── __tests__/
    ├── fixtures/
    │   ├── olx-list-page.html
    │   └── domria-list-page.html
    ├── parse-olx.test.ts
    ├── parse-domria.test.ts
    ├── normalize.test.ts
    ├── aggregate.test.ts
    └── report.test.ts

scripts/rent-pilot/data/         # gitignored — output artifacts
```

Each `parse-*.ts` is a pure function so it can be unit-tested without launching a browser. Each `scrape-*.ts` is the thin Playwright shell that fetches pages and feeds HTML to the parser.

---

## Task 1: Project setup

**Files:**
- Create: `scripts/rent-pilot/types.ts`
- Create: `scripts/rent-pilot/.gitignore`
- Modify: `package.json` (add one script entry)
- Modify: root `.gitignore` if needed (verify `scripts/rent-pilot/data/` is ignored via the local one)

- [ ] **Step 1: Install cheerio for fixture-based HTML parsing**

```bash
npm install --save-dev cheerio @types/cheerio
```

Expected: cheerio added to devDependencies. Playwright is already installed.

- [ ] **Step 2: Create shared types**

Write `scripts/rent-pilot/types.ts`:

```typescript
export type Source = 'olx' | 'domria';

// Pre-normalization: whatever we extracted from the HTML.
export interface ListingRaw {
  source: Source;
  url: string;
  priceText: string;       // e.g. "12 500 грн/міс" or "$450"
  roomsText: string;       // e.g. "2-кімнатна" or "2-комн."
  sqmText: string | null;  // e.g. "55 м²" — may be missing on some listings
  district: string | null; // free-text neighborhood, may be missing
  listedAtText: string | null; // free-text date, optional
}

export type Currency = 'UAH' | 'USD' | 'EUR';

export interface ListingNormalized {
  source: Source;
  url: string;
  priceLocal: number;      // numeric value in `currency`
  currency: Currency;
  priceUsd: number;        // converted at the rate fetched once per pilot run
  bedrooms: number;        // 0 = studio, 1 = 1BR, 2 = 2BR, 3 = 3BR, etc.
  sqm: number | null;
  district: string | null;
}

export interface BucketStats {
  source: Source;
  bedrooms: number;
  nListings: number;       // after outlier trim
  nDropped: number;        // dropped from this bucket by outlier trim only (not sqm filter)
  medianUsd: number;
  medianLocal: number;     // in UAH (always UAH for the pilot)
  p25Usd: number;          // for context in the report
  p75Usd: number;
}
```

- [ ] **Step 3: Add gitignore for output data**

Write `scripts/rent-pilot/.gitignore`:

```
data/
```

- [ ] **Step 4: Add npm script**

In `package.json`, add to the `"scripts"` block:

```json
"rent-pilot:run": "ts-node scripts/rent-pilot/run.ts"
```

(Place it alphabetically near `"rates:sync"`.)

- [ ] **Step 5: Commit**

```bash
git add scripts/rent-pilot/types.ts scripts/rent-pilot/.gitignore package.json package-lock.json
git commit -m "rent-pilot: scaffold directory, types, and npm script"
```

---

## Task 2: Numbeo benchmarks (manual capture)

**Files:**
- Create: `scripts/rent-pilot/numbeo-benchmarks.ts`

Numbeo doesn't publish a free API; we capture the numbers manually one time. The pilot is throwaway, so hardcoding is fine.

- [ ] **Step 1: Visit Numbeo's Kyiv page**

Open in a browser: `https://www.numbeo.com/cost-of-living/in/Kyiv`

In the **Rent Per Month** section, record the four figures (all in UAH/month). At the time of writing they appear under labels like:
- "Apartment (1 bedroom) in City Centre"
- "Apartment (1 bedroom) Outside of Centre"
- "Apartment (3 bedrooms) in City Centre"
- "Apartment (3 bedrooms) Outside of Centre"

Note the timestamp shown on the page ("Last update: …"). Write it into the file.

- [ ] **Step 2: Write the benchmarks module**

Write `scripts/rent-pilot/numbeo-benchmarks.ts`:

```typescript
// Captured manually from https://www.numbeo.com/cost-of-living/in/Kyiv on YYYY-MM-DD.
// Numbeo updates page values via crowdsourced submissions — replace these if re-running the pilot.

export interface NumbeoKyivBenchmarks {
  capturedOn: string;
  oneBedCenterUahPerMonth: number;
  oneBedOutsideUahPerMonth: number;
  threeBedCenterUahPerMonth: number;
  threeBedOutsideUahPerMonth: number;
}

export const NUMBEO_KYIV: NumbeoKyivBenchmarks = {
  capturedOn: 'YYYY-MM-DD',                 // <-- fill in
  oneBedCenterUahPerMonth: 0,               // <-- fill in
  oneBedOutsideUahPerMonth: 0,              // <-- fill in
  threeBedCenterUahPerMonth: 0,             // <-- fill in
  threeBedOutsideUahPerMonth: 0,            // <-- fill in
};

// For the comparison the pilot uses the simple average of "centre" and "outside centre"
// since our scraped sample is mixed across districts.
export function numbeoBlendedUah(centre: number, outside: number): number {
  return (centre + outside) / 2;
}
```

Fill in the four numbers and the date you captured them.

- [ ] **Step 3: Commit**

```bash
git add scripts/rent-pilot/numbeo-benchmarks.ts
git commit -m "rent-pilot: capture Numbeo Kyiv benchmarks"
```

---

## Task 3: Room-text → bedrooms normalization (TDD)

Ukrainian listings use phrases like "1-кімнатна", "2-комн.", "Студія". Mapping rule (per spec): `N-кімнатна → N-1 bedrooms`. "Студія" / "studio" → 0.

**Files:**
- Create: `scripts/rent-pilot/__tests__/normalize.test.ts`
- Create: `scripts/rent-pilot/normalize.ts`

- [ ] **Step 1: Write the failing test for room parsing**

Write `scripts/rent-pilot/__tests__/normalize.test.ts`:

```typescript
import { roomsTextToBedrooms } from '../normalize';

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
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest scripts/rent-pilot/__tests__/normalize.test.ts -t roomsTextToBedrooms
```

Expected: FAIL — `normalize` module not found.

- [ ] **Step 3: Implement room parsing**

Write `scripts/rent-pilot/normalize.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest scripts/rent-pilot/__tests__/normalize.test.ts -t roomsTextToBedrooms
```

Expected: PASS (7 passing).

- [ ] **Step 5: Write failing test for price parsing**

Append to `scripts/rent-pilot/__tests__/normalize.test.ts`:

```typescript
import { parsePriceText } from '../normalize';

describe('parsePriceText', () => {
  test('UAH with thin space', () => {
    expect(parsePriceText('12 500 грн/міс')).toEqual({ amount: 12500, currency: 'UAH' });
    expect(parsePriceText('12 500 грн')).toEqual({ amount: 12500, currency: 'UAH' });
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
```

- [ ] **Step 6: Implement price parsing**

Append to `scripts/rent-pilot/normalize.ts`:

```typescript
import { Currency } from './types';

export function parsePriceText(text: string): { amount: number; currency: Currency } | null {
  if (!text) return null;

  // Strip all whitespace variants (regular, thin, NBSP) and thousands separators inside numbers.
  const stripped = text.replace(/[\s  ]/g, '');

  // Detect currency.
  let currency: Currency | null = null;
  if (/грн|uah|₴/i.test(stripped)) currency = 'UAH';
  else if (/usd|\$/i.test(stripped)) currency = 'USD';
  else if (/eur|€/i.test(stripped)) currency = 'EUR';
  if (!currency) return null;

  // Extract the first run of digits (with optional comma thousand separators).
  const numMatch = stripped.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
  if (!numMatch) return null;

  const amount = parseInt(numMatch[1].replace(/,/g, ''), 10);
  if (Number.isNaN(amount) || amount <= 0) return null;

  return { amount, currency };
}
```

- [ ] **Step 7: Run all normalize tests**

```bash
npx jest scripts/rent-pilot/__tests__/normalize.test.ts
```

Expected: PASS (all describe blocks pass).

- [ ] **Step 8: Commit**

```bash
git add scripts/rent-pilot/normalize.ts scripts/rent-pilot/__tests__/normalize.test.ts
git commit -m "rent-pilot: room→bedroom and price text parsers"
```

---

## Task 4: Currency conversion via ExchangeRateRepository (TDD)

Convert any `(amount, currency)` to USD using `rate_to_eur` values from `ExchangeRateRepository.getLatest()`. Triangulate via EUR:
`usd = local * (rate_local_to_eur / rate_usd_to_eur)`.

**Files:**
- Modify: `scripts/rent-pilot/normalize.ts`
- Modify: `scripts/rent-pilot/__tests__/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `scripts/rent-pilot/__tests__/normalize.test.ts`:

```typescript
import { buildUsdConverter } from '../normalize';

describe('buildUsdConverter', () => {
  // rate_to_eur means "EUR per 1 unit of currency".
  // Suppose 1 UAH = 0.025 EUR and 1 USD = 0.90 EUR.
  // Then 1 USD = 0.90 / 0.025 = 36 UAH, i.e. 36 UAH = 1 USD.
  const rates = new Map<string, number>([
    ['UAH', 0.025],
    ['USD', 0.90],
    ['EUR', 1.0],
  ]);

  test('UAH → USD via EUR', () => {
    const toUsd = buildUsdConverter(rates);
    // 36 UAH → 1 USD
    expect(toUsd(36, 'UAH')).toBeCloseTo(1, 4);
    // 360 UAH → 10 USD
    expect(toUsd(360, 'UAH')).toBeCloseTo(10, 4);
  });

  test('USD is identity', () => {
    const toUsd = buildUsdConverter(rates);
    expect(toUsd(450, 'USD')).toBeCloseTo(450, 4);
  });

  test('EUR → USD', () => {
    const toUsd = buildUsdConverter(rates);
    // 1 EUR / 0.9 EUR-per-USD = 1.111... USD
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
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest scripts/rent-pilot/__tests__/normalize.test.ts -t buildUsdConverter
```

Expected: FAIL — `buildUsdConverter` not exported.

- [ ] **Step 3: Implement the converter**

Append to `scripts/rent-pilot/normalize.ts`:

```typescript
export function buildUsdConverter(
  ratesToEur: Map<string, number>
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
```

- [ ] **Step 4: Add the full-listing normalization function (failing test)**

Append to `scripts/rent-pilot/__tests__/normalize.test.ts`:

```typescript
import { normalizeListing } from '../normalize';
import { ListingRaw } from '../types';

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
```

- [ ] **Step 5: Implement normalizeListing**

Append to `scripts/rent-pilot/normalize.ts`:

```typescript
import { ListingRaw, ListingNormalized } from './types';

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
```

- [ ] **Step 6: Add a thin wrapper that loads rates from the DB**

Append to `scripts/rent-pilot/normalize.ts`:

```typescript
import { ExchangeRateRepository } from '../../src/repositories/ExchangeRateRepository';

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
```

(No unit test for `loadRatesToEur` — it just glues to the live DB. Exercised end-to-end by `run.ts`.)

- [ ] **Step 7: Run all normalize tests**

```bash
npx jest scripts/rent-pilot/__tests__/normalize.test.ts
```

Expected: PASS (everything green).

- [ ] **Step 8: Commit**

```bash
git add scripts/rent-pilot/normalize.ts scripts/rent-pilot/__tests__/normalize.test.ts
git commit -m "rent-pilot: USD converter and full listing normalization"
```

---

## Task 5: Aggregation — outlier trim + median (TDD)

Per spec: drop listings with no price/rooms, drop sqm < 15 or > 300, then per `(source, bedrooms)` bucket drop the top and bottom 5% by `priceUsd`, then take median (also report p25/p75 for context).

**Files:**
- Create: `scripts/rent-pilot/__tests__/aggregate.test.ts`
- Create: `scripts/rent-pilot/aggregate.ts`

- [ ] **Step 1: Write the failing test**

Write `scripts/rent-pilot/__tests__/aggregate.test.ts`:

```typescript
import { aggregate, percentile } from '../aggregate';
import { ListingNormalized } from '../types';

function l(source: 'olx' | 'domria', bedrooms: number, priceUsd: number, sqm: number | null = 50): ListingNormalized {
  return {
    source, url: `https://example/${priceUsd}`,
    priceLocal: priceUsd * 36, currency: 'UAH', priceUsd,
    bedrooms, sqm, district: null,
  };
}

describe('percentile', () => {
  test('p50 of [1..9] = 5', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.5)).toBe(5);
  });

  test('p25 and p75 of [1..9]', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.25)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.75)).toBe(7);
  });

  test('linear interpolation between samples', () => {
    expect(percentile([10, 20], 0.5)).toBe(15);
  });

  test('empty array returns NaN', () => {
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('aggregate', () => {
  test('drops listings with sqm out of range (does not appear in any bucket)', () => {
    const listings: ListingNormalized[] = [
      l('olx', 1, 500, 14),    // too small
      l('olx', 1, 500, 301),   // too big
      l('olx', 1, 500, 50),
      l('olx', 1, 500, 50),
    ];
    const out = aggregate(listings);
    const bucket = out.find(b => b.source === 'olx' && b.bedrooms === 1)!;
    expect(bucket.nListings).toBe(2);
    // nDropped only counts outlier-trim drops, not sqm filter drops.
    expect(bucket.nDropped).toBe(0);
  });

  test('keeps listings with null sqm (size unknown but price+rooms known)', () => {
    const listings: ListingNormalized[] = Array.from({ length: 4 }, () => l('olx', 1, 500, null));
    const out = aggregate(listings);
    const bucket = out.find(b => b.source === 'olx' && b.bedrooms === 1)!;
    expect(bucket.nListings).toBe(4);
  });

  test('trims top 5% and bottom 5% of priceUsd per bucket', () => {
    // 100 listings priced 1..100. Top 5 (96-100) and bottom 5 (1-5) get dropped.
    const listings: ListingNormalized[] = [];
    for (let i = 1; i <= 100; i++) listings.push(l('olx', 1, i));
    const out = aggregate(listings);
    const bucket = out.find(b => b.source === 'olx' && b.bedrooms === 1)!;
    expect(bucket.nListings).toBe(90);
    expect(bucket.nDropped).toBe(10);
    // Median of [6..95] is (50+51)/2 = 50.5
    expect(bucket.medianUsd).toBeCloseTo(50.5, 2);
  });

  test('does not trim when bucket has fewer than 20 listings (too small to trim meaningfully)', () => {
    const listings: ListingNormalized[] = Array.from({ length: 10 }, (_, i) => l('olx', 1, 100 + i));
    const out = aggregate(listings);
    const bucket = out.find(b => b.source === 'olx' && b.bedrooms === 1)!;
    expect(bucket.nListings).toBe(10);
    expect(bucket.nDropped).toBe(0);
  });

  test('produces separate buckets per (source, bedrooms)', () => {
    const listings: ListingNormalized[] = [
      l('olx', 0, 300), l('olx', 0, 350),
      l('olx', 1, 500), l('olx', 1, 550),
      l('domria', 1, 480), l('domria', 1, 520),
    ];
    const out = aggregate(listings);
    expect(out).toHaveLength(3);
    expect(out.map(b => `${b.source}-${b.bedrooms}`).sort())
      .toEqual(['domria-1', 'olx-0', 'olx-1']);
  });

  test('caps bedrooms at 3 (4+ collapses into the 3-bedroom bucket)', () => {
    const listings: ListingNormalized[] = [
      l('olx', 3, 800), l('olx', 4, 900), l('olx', 5, 1000),
    ];
    const out = aggregate(listings);
    const bucket = out.find(b => b.source === 'olx' && b.bedrooms === 3)!;
    expect(bucket.nListings).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest scripts/rent-pilot/__tests__/aggregate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement aggregation**

Write `scripts/rent-pilot/aggregate.ts`:

```typescript
import { ListingNormalized, BucketStats, Source } from './types';

const MIN_SQM = 15;
const MAX_SQM = 300;
const TRIM_FRACTION = 0.05;
const TRIM_MIN_BUCKET_SIZE = 20; // below this, trimming throws away too much signal
const MAX_BEDROOMS = 3;          // 4BR+ collapses into the 3BR bucket

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function passSqmFilter(l: ListingNormalized): boolean {
  if (l.sqm === null) return true; // sqm unknown is allowed
  return l.sqm >= MIN_SQM && l.sqm <= MAX_SQM;
}

export function aggregate(listings: ListingNormalized[]): BucketStats[] {
  // Filter drops are tracked at the aggregate level, not per-bucket.
  const filtered = listings.filter(passSqmFilter);

  // Bucket by (source, capped-bedrooms).
  const buckets = new Map<string, ListingNormalized[]>();
  for (const l of filtered) {
    const cappedBed = Math.min(l.bedrooms, MAX_BEDROOMS);
    const key = `${l.source}|${cappedBed}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(l);
  }

  const stats: BucketStats[] = [];
  for (const [key, bucketListings] of buckets) {
    const [sourceStr, bedStr] = key.split('|');
    const source = sourceStr as Source;
    const bedrooms = parseInt(bedStr, 10);

    const prices = bucketListings.map(l => l.priceUsd).sort((a, b) => a - b);
    const localPrices = bucketListings.map(l => l.priceLocal).sort((a, b) => a - b);

    let trimmedUsd = prices;
    let trimmedLocal = localPrices;
    let nDropped = 0;
    if (prices.length >= TRIM_MIN_BUCKET_SIZE) {
      const trimCount = Math.floor(prices.length * TRIM_FRACTION);
      trimmedUsd = prices.slice(trimCount, prices.length - trimCount);
      trimmedLocal = localPrices.slice(trimCount, localPrices.length - trimCount);
      nDropped = prices.length - trimmedUsd.length;
    }

    stats.push({
      source,
      bedrooms,
      nListings: trimmedUsd.length,
      nDropped,
      medianUsd: percentile(trimmedUsd, 0.5),
      medianLocal: percentile(trimmedLocal, 0.5),
      p25Usd: percentile(trimmedUsd, 0.25),
      p75Usd: percentile(trimmedUsd, 0.75),
    });
  }

  return stats.sort((a, b) =>
    a.source === b.source ? a.bedrooms - b.bedrooms : a.source.localeCompare(b.source)
  );
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest scripts/rent-pilot/__tests__/aggregate.test.ts
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/rent-pilot/aggregate.ts scripts/rent-pilot/__tests__/aggregate.test.ts
git commit -m "rent-pilot: trim+median aggregation per (source, bedrooms) bucket"
```

---

## Task 6: OLX HTML parser (TDD with fixture)

OLX's DOM changes occasionally. The parser is TDD'd against a saved HTML fixture so the unit test is stable.

**Files:**
- Create: `scripts/rent-pilot/__tests__/fixtures/olx-list-page.html`
- Create: `scripts/rent-pilot/__tests__/parse-olx.test.ts`
- Create: `scripts/rent-pilot/parse-olx.ts`

- [ ] **Step 1: Capture a fixture HTML page**

Manually visit OLX.ua's Kyiv long-term rental list page in a browser. The URL pattern is:

```
https://www.olx.ua/uk/nedvizhimost/arenda-kvartir/kiev/?currency=UAH
```

In DevTools → Elements panel, right-click the `<html>` node → Copy → Copy outerHTML. Save as:

```
scripts/rent-pilot/__tests__/fixtures/olx-list-page.html
```

If the file is over ~2 MB, trim to a smaller subtree containing the listing cards (and a parent that includes a clearly-counted number of listings).

Inspect the fixture and identify:
- The CSS selector for each listing card (currently a `[data-cy="l-card"]` div, but verify)
- The selector inside each card for: price, title (contains "N-кімнатна"), location, area in m²
- The `<a>` whose `href` is the listing URL

**Count how many listing cards are present in your fixture — you'll assert this number in the test.**

- [ ] **Step 2: Write the failing test**

Write `scripts/rent-pilot/__tests__/parse-olx.test.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseOlxListPage } from '../parse-olx';

const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'olx-list-page.html'),
  'utf-8'
);

describe('parseOlxListPage', () => {
  test('extracts the expected number of cards', () => {
    const listings = parseOlxListPage(FIXTURE);
    // <-- replace N with the count you observed in the fixture (e.g. 40)
    expect(listings.length).toBeGreaterThanOrEqual(20);
  });

  test('each listing has a usable URL', () => {
    const listings = parseOlxListPage(FIXTURE);
    for (const l of listings) {
      expect(l.url).toMatch(/^https?:\/\//);
      expect(l.source).toBe('olx');
    }
  });

  test('most listings have a parseable price string', () => {
    const listings = parseOlxListPage(FIXTURE);
    const withPrice = listings.filter(l => /\d/.test(l.priceText));
    // Allow a small minority of "Договірна" / negotiated listings.
    expect(withPrice.length).toBeGreaterThan(listings.length * 0.8);
  });

  test('most listings have a parseable rooms string', () => {
    const listings = parseOlxListPage(FIXTURE);
    const withRooms = listings.filter(l => /кімн|комн|студ|studio/i.test(l.roomsText));
    expect(withRooms.length).toBeGreaterThan(listings.length * 0.8);
  });
});
```

- [ ] **Step 3: Run test to confirm failure**

```bash
npx jest scripts/rent-pilot/__tests__/parse-olx.test.ts
```

Expected: FAIL — `parse-olx` not found.

- [ ] **Step 4: Implement the parser using cheerio**

Write `scripts/rent-pilot/parse-olx.ts`:

```typescript
import * as cheerio from 'cheerio';
import { ListingRaw } from './types';

// Selectors current as of 2026-05; verify against the fixture if a test fails.
const CARD_SELECTOR = '[data-cy="l-card"]';
const PRICE_SELECTOR = '[data-testid="ad-price"]';
const TITLE_SELECTOR = 'h4, h6, [data-cy="ad-card-title"]';
const LOCATION_SELECTOR = '[data-testid="location-date"]';
const LINK_SELECTOR = 'a[href]';

export function parseOlxListPage(html: string): ListingRaw[] {
  const $ = cheerio.load(html);
  const cards = $(CARD_SELECTOR);

  const listings: ListingRaw[] = [];

  cards.each((_, el) => {
    const card = $(el);

    const href = card.find(LINK_SELECTOR).first().attr('href') ?? '';
    const url = href.startsWith('http')
      ? href
      : `https://www.olx.ua${href}`;

    const priceText = card.find(PRICE_SELECTOR).first().text().trim();
    const title = card.find(TITLE_SELECTOR).first().text().trim();

    // OLX titles look like: "Здам 2-кімнатна квартира, 55 м², Печерський"
    // Extract rooms / sqm from the title.
    const roomsText = title; // pass full title; normalize.ts will pluck "N-кімнатна"
    const sqmMatch = title.match(/(\d+(?:[.,]\d+)?)\s*м²/i);
    const sqmText = sqmMatch ? sqmMatch[0] : null;

    const locationDate = card.find(LOCATION_SELECTOR).first().text().trim();
    // Location is typically "Київ, Печерський - Сьогодні о 10:32".
    const districtMatch = locationDate.match(/Київ,\s*([^-—]+?)\s*[-—]/);
    const district = districtMatch ? districtMatch[1].trim() : null;

    if (!url || !priceText || !roomsText) return;

    listings.push({
      source: 'olx',
      url,
      priceText,
      roomsText,
      sqmText,
      district,
      listedAtText: locationDate || null,
    });
  });

  return listings;
}
```

- [ ] **Step 5: Run tests; iterate selectors if needed**

```bash
npx jest scripts/rent-pilot/__tests__/parse-olx.test.ts
```

Expected: PASS. If a test fails, inspect the fixture in a browser/editor and adjust the selectors at the top of `parse-olx.ts`. Re-run.

- [ ] **Step 6: Commit**

```bash
git add scripts/rent-pilot/parse-olx.ts scripts/rent-pilot/__tests__/parse-olx.test.ts scripts/rent-pilot/__tests__/fixtures/olx-list-page.html
git commit -m "rent-pilot: OLX list-page parser with fixture"
```

---

## Task 7: OLX scraper (Playwright wrapper)

Wrap `parseOlxListPage` with a Playwright session that paginates Kyiv long-term rental listings. Polite delay between pages. No unit test — exercised end-to-end via `run.ts`.

**Files:**
- Create: `scripts/rent-pilot/scrape-olx.ts`

- [ ] **Step 1: Implement the scraper**

Write `scripts/rent-pilot/scrape-olx.ts`:

```typescript
import { chromium, Browser, Page } from 'playwright';
import { parseOlxListPage } from './parse-olx';
import { ListingRaw } from './types';

const BASE_URL = 'https://www.olx.ua/uk/nedvizhimost/arenda-kvartir/kiev/?currency=UAH&page=';
const MAX_PAGES = 25;          // OLX shows ~40 listings/page → ~1000 max
const TARGET_LISTINGS = 500;
const POLITE_DELAY_MS = 2500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function scrapeOlx(): Promise<ListingRaw[]> {
  const browser: Browser = await chromium.launch({ headless: true });
  const collected: ListingRaw[] = [];

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      locale: 'uk-UA',
    });
    const page: Page = await context.newPage();

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = `${BASE_URL}${pageNum}`;
      console.log(`[olx] fetching page ${pageNum}: ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[data-cy="l-card"]', { timeout: 15000 }).catch(() => {});

      const html = await page.content();
      const pageListings = parseOlxListPage(html);
      console.log(`[olx] page ${pageNum}: ${pageListings.length} listings`);

      if (pageListings.length === 0) {
        console.log('[olx] empty page, stopping pagination');
        break;
      }
      collected.push(...pageListings);

      if (collected.length >= TARGET_LISTINGS) {
        console.log(`[olx] reached target of ${TARGET_LISTINGS}, stopping`);
        break;
      }

      await sleep(POLITE_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  return collected;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/rent-pilot/scrape-olx.ts
git commit -m "rent-pilot: OLX paginated scraper"
```

---

## Task 8: DOM.RIA HTML parser (TDD with fixture)

Same pattern as OLX. DOM.RIA's URL for Kyiv long-term rentals:

```
https://dom.ria.com/uk/arenda-kvartir/kiev/
```

**Files:**
- Create: `scripts/rent-pilot/__tests__/fixtures/domria-list-page.html`
- Create: `scripts/rent-pilot/__tests__/parse-domria.test.ts`
- Create: `scripts/rent-pilot/parse-domria.ts`

- [ ] **Step 1: Capture a DOM.RIA fixture**

Visit the DOM.RIA URL above. Save outerHTML to:

```
scripts/rent-pilot/__tests__/fixtures/domria-list-page.html
```

Inspect to find:
- Listing card container (typically `section.realty-item` or similar)
- Price selector
- Title / rooms text
- Area `<…> м²`
- Location / district

- [ ] **Step 2: Write the failing test**

Write `scripts/rent-pilot/__tests__/parse-domria.test.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDomriaListPage } from '../parse-domria';

const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'domria-list-page.html'),
  'utf-8'
);

describe('parseDomriaListPage', () => {
  test('extracts a reasonable number of cards', () => {
    const listings = parseDomriaListPage(FIXTURE);
    expect(listings.length).toBeGreaterThanOrEqual(15);
  });

  test('each listing has a usable URL and source', () => {
    const listings = parseDomriaListPage(FIXTURE);
    for (const l of listings) {
      expect(l.url).toMatch(/^https?:\/\//);
      expect(l.source).toBe('domria');
    }
  });

  test('most listings have a parseable price', () => {
    const listings = parseDomriaListPage(FIXTURE);
    const withPrice = listings.filter(l => /\d/.test(l.priceText));
    expect(withPrice.length).toBeGreaterThan(listings.length * 0.8);
  });

  test('most listings have a parseable rooms string', () => {
    const listings = parseDomriaListPage(FIXTURE);
    const withRooms = listings.filter(l => /кімн|комн|студ|studio/i.test(l.roomsText));
    expect(withRooms.length).toBeGreaterThan(listings.length * 0.8);
  });
});
```

- [ ] **Step 3: Run test to confirm failure**

```bash
npx jest scripts/rent-pilot/__tests__/parse-domria.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the parser**

Write `scripts/rent-pilot/parse-domria.ts`. Mirror `parse-olx.ts` structure — use cheerio, define selectors at the top, return `ListingRaw[]`. Selectors below are best-guess; verify against the fixture and adjust:

```typescript
import * as cheerio from 'cheerio';
import { ListingRaw } from './types';

// Selectors current as of 2026-05; verify against the fixture if tests fail.
const CARD_SELECTOR = 'section.realty-item, article.realty-item, [data-analytics-block="search_results"] > div';
const PRICE_SELECTOR = '.green, .price, [data-analytics-element="price"]';
const TITLE_SELECTOR = '.realty-item-title, .realty-link, a.realty-link';
const AREA_SELECTOR = '.characteristics .area, .area, .characteristic-value';
const LOCATION_SELECTOR = '.realty-link-text, .location, .address';
const LINK_SELECTOR = 'a.realty-link, a[href*="/uk/realty/"]';

export function parseDomriaListPage(html: string): ListingRaw[] {
  const $ = cheerio.load(html);
  const cards = $(CARD_SELECTOR);

  const listings: ListingRaw[] = [];

  cards.each((_, el) => {
    const card = $(el);

    const href = card.find(LINK_SELECTOR).first().attr('href') ?? '';
    const url = href.startsWith('http')
      ? href
      : `https://dom.ria.com${href}`;

    const priceText = card.find(PRICE_SELECTOR).first().text().trim();
    const title = card.find(TITLE_SELECTOR).first().text().trim();

    // DOM.RIA titles look like: "2-кімнатна квартира 55 м², Печерський район"
    const roomsText = title;
    const sqmMatch = title.match(/(\d+(?:[.,]\d+)?)\s*м²/i);
    const sqmText = sqmMatch
      ? sqmMatch[0]
      : (card.find(AREA_SELECTOR).first().text().trim() || null);

    const locationText = card.find(LOCATION_SELECTOR).first().text().trim();
    const districtMatch = locationText.match(/([А-Яа-яІіЇїЄєҐґ]+ський|[А-Яа-яІіЇїЄєҐґ]+ська)/);
    const district = districtMatch ? districtMatch[1] : null;

    if (!url || !priceText || !roomsText) return;

    listings.push({
      source: 'domria',
      url,
      priceText,
      roomsText,
      sqmText,
      district,
      listedAtText: null,
    });
  });

  return listings;
}
```

- [ ] **Step 5: Run tests; iterate selectors as needed**

```bash
npx jest scripts/rent-pilot/__tests__/parse-domria.test.ts
```

Expected: PASS. If failing, adjust selectors against the actual fixture.

- [ ] **Step 6: Commit**

```bash
git add scripts/rent-pilot/parse-domria.ts scripts/rent-pilot/__tests__/parse-domria.test.ts scripts/rent-pilot/__tests__/fixtures/domria-list-page.html
git commit -m "rent-pilot: DOM.RIA list-page parser with fixture"
```

---

## Task 9: DOM.RIA scraper (Playwright wrapper)

**Files:**
- Create: `scripts/rent-pilot/scrape-domria.ts`

- [ ] **Step 1: Implement**

Write `scripts/rent-pilot/scrape-domria.ts`:

```typescript
import { chromium, Browser, Page } from 'playwright';
import { parseDomriaListPage } from './parse-domria';
import { ListingRaw } from './types';

const BASE_URL = 'https://dom.ria.com/uk/arenda-kvartir/kiev/?page=';
const MAX_PAGES = 25;
const TARGET_LISTINGS = 500;
const POLITE_DELAY_MS = 2500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function scrapeDomria(): Promise<ListingRaw[]> {
  const browser: Browser = await chromium.launch({ headless: true });
  const collected: ListingRaw[] = [];

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      locale: 'uk-UA',
    });
    const page: Page = await context.newPage();

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = `${BASE_URL}${pageNum}`;
      console.log(`[domria] fetching page ${pageNum}: ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      const html = await page.content();
      const pageListings = parseDomriaListPage(html);
      console.log(`[domria] page ${pageNum}: ${pageListings.length} listings`);

      if (pageListings.length === 0) {
        console.log('[domria] empty page, stopping pagination');
        break;
      }
      collected.push(...pageListings);

      if (collected.length >= TARGET_LISTINGS) {
        console.log(`[domria] reached target of ${TARGET_LISTINGS}, stopping`);
        break;
      }

      await sleep(POLITE_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  return collected;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/rent-pilot/scrape-domria.ts
git commit -m "rent-pilot: DOM.RIA paginated scraper"
```

---

## Task 10: Report generator (TDD)

Render a markdown report with: per-source per-bucket counts and medians, side-by-side comparison, Numbeo comparison, and pass/fail verdict per the spec's criteria.

**Files:**
- Create: `scripts/rent-pilot/__tests__/report.test.ts`
- Create: `scripts/rent-pilot/report.ts`

- [ ] **Step 1: Write the failing test**

Write `scripts/rent-pilot/__tests__/report.test.ts`:

```typescript
import { evaluatePilot, renderReport } from '../report';
import { BucketStats } from '../types';
import { NumbeoKyivBenchmarks } from '../numbeo-benchmarks';

const numbeoFixture: NumbeoKyivBenchmarks = {
  capturedOn: '2026-05-31',
  oneBedCenterUahPerMonth: 20000,
  oneBedOutsideUahPerMonth: 14000,
  threeBedCenterUahPerMonth: 40000,
  threeBedOutsideUahPerMonth: 28000,
};

function bucket(source: 'olx' | 'domria', bedrooms: number, medianLocal: number, n = 100): BucketStats {
  return {
    source, bedrooms, nListings: n, nDropped: 5,
    medianLocal, medianUsd: medianLocal / 36,
    p25Usd: (medianLocal / 36) * 0.8,
    p75Usd: (medianLocal / 36) * 1.2,
  };
}

describe('evaluatePilot', () => {
  test('passes when sources agree within 15% and both are within 20% of Numbeo blend', () => {
    // Numbeo 1BR blend = (20000+14000)/2 = 17000. ±20% = 13600..20400.
    // Numbeo 3BR blend = (40000+28000)/2 = 34000. ±20% = 27200..40800.
    const buckets: BucketStats[] = [
      bucket('olx', 1, 17500),
      bucket('domria', 1, 17800),
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    expect(result.overallPass).toBe(true);
  });

  test('fails when OLX and DOM.RIA disagree by more than 15% for the same bucket', () => {
    const buckets: BucketStats[] = [
      bucket('olx', 1, 16000),
      bucket('domria', 1, 25000),  // 56% apart
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    expect(result.overallPass).toBe(false);
    expect(result.crossSourcePass).toBe(false);
  });

  test('fails when both sources agree but are more than 20% off Numbeo', () => {
    const buckets: BucketStats[] = [
      bucket('olx', 1, 30000),     // way above Numbeo blend
      bucket('domria', 1, 31000),
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    expect(result.overallPass).toBe(false);
    expect(result.numbeoPass).toBe(false);
  });

  test('does not require Numbeo agreement for studio or 2BR (Numbeo does not publish those)', () => {
    const buckets: BucketStats[] = [
      bucket('olx', 0, 8000),
      bucket('domria', 0, 8500),
      bucket('olx', 1, 17500),
      bucket('domria', 1, 17800),
      bucket('olx', 2, 25000),
      bucket('domria', 2, 25500),
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    expect(result.overallPass).toBe(true);
  });

  test('skips buckets with fewer than 30 listings from cross-source check', () => {
    const buckets: BucketStats[] = [
      { ...bucket('olx', 1, 16000), nListings: 10 },
      { ...bucket('domria', 1, 25000), nListings: 10 },
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    // 1BR cross-check is skipped (too few listings), so cross-source passes on 3BR alone.
    expect(result.crossSourcePass).toBe(true);
  });
});

describe('renderReport', () => {
  test('renders a markdown string with verdict and counts', () => {
    const buckets: BucketStats[] = [
      bucket('olx', 1, 17500),
      bucket('domria', 1, 17800),
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const md = renderReport(buckets, numbeoFixture);
    expect(md).toMatch(/Verdict/);
    expect(md).toMatch(/PASS|FAIL/);
    expect(md).toMatch(/olx/);
    expect(md).toMatch(/domria/);
    expect(md).toMatch(/Numbeo/);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx jest scripts/rent-pilot/__tests__/report.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement evaluator + renderer**

Write `scripts/rent-pilot/report.ts`:

```typescript
import { BucketStats } from './types';
import { NumbeoKyivBenchmarks, numbeoBlendedUah } from './numbeo-benchmarks';

const CROSS_SOURCE_TOLERANCE = 0.15;  // 15%
const NUMBEO_TOLERANCE = 0.20;        // 20%
const MIN_BUCKET_SIZE_FOR_CHECK = 30;

export interface PilotEvaluation {
  crossSourcePass: boolean;
  crossSourceDetails: Array<{ bedrooms: number; olx: number; domria: number; relDiff: number; pass: boolean; skipped?: string }>;
  numbeoPass: boolean;
  numbeoDetails: Array<{ bedrooms: number; source: string; median: number; numbeoBlend: number; relDiff: number; pass: boolean }>;
  overallPass: boolean;
}

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / ((a + b) / 2);
}

export function evaluatePilot(
  buckets: BucketStats[],
  numbeo: NumbeoKyivBenchmarks,
): PilotEvaluation {
  const byBucket = new Map<number, Map<string, BucketStats>>();
  for (const b of buckets) {
    if (!byBucket.has(b.bedrooms)) byBucket.set(b.bedrooms, new Map());
    byBucket.get(b.bedrooms)!.set(b.source, b);
  }

  // Cross-source check (per bedroom bucket where both sources have ≥30 listings).
  const crossSourceDetails: PilotEvaluation['crossSourceDetails'] = [];
  for (const [bedrooms, sources] of byBucket) {
    const olx = sources.get('olx');
    const domria = sources.get('domria');
    if (!olx || !domria) continue;

    if (olx.nListings < MIN_BUCKET_SIZE_FOR_CHECK || domria.nListings < MIN_BUCKET_SIZE_FOR_CHECK) {
      crossSourceDetails.push({
        bedrooms, olx: olx.medianLocal, domria: domria.medianLocal,
        relDiff: relDiff(olx.medianLocal, domria.medianLocal),
        pass: true,
        skipped: `bucket too small (olx=${olx.nListings}, domria=${domria.nListings})`,
      });
      continue;
    }

    const rd = relDiff(olx.medianLocal, domria.medianLocal);
    crossSourceDetails.push({
      bedrooms, olx: olx.medianLocal, domria: domria.medianLocal,
      relDiff: rd,
      pass: rd <= CROSS_SOURCE_TOLERANCE,
    });
  }
  const crossSourcePass = crossSourceDetails.every(d => d.pass);

  // Numbeo check — only 1BR and 3BR.
  const numbeoTargets: Array<{ bedrooms: number; blend: number }> = [
    { bedrooms: 1, blend: numbeoBlendedUah(numbeo.oneBedCenterUahPerMonth, numbeo.oneBedOutsideUahPerMonth) },
    { bedrooms: 3, blend: numbeoBlendedUah(numbeo.threeBedCenterUahPerMonth, numbeo.threeBedOutsideUahPerMonth) },
  ];
  const numbeoDetails: PilotEvaluation['numbeoDetails'] = [];
  for (const { bedrooms, blend } of numbeoTargets) {
    const sources = byBucket.get(bedrooms);
    if (!sources) continue;
    for (const [sourceName, b] of sources) {
      if (b.nListings < MIN_BUCKET_SIZE_FOR_CHECK) continue;
      const rd = relDiff(b.medianLocal, blend);
      numbeoDetails.push({
        bedrooms, source: sourceName,
        median: b.medianLocal, numbeoBlend: blend,
        relDiff: rd,
        pass: rd <= NUMBEO_TOLERANCE,
      });
    }
  }
  const numbeoPass = numbeoDetails.length > 0 && numbeoDetails.every(d => d.pass);

  return {
    crossSourcePass,
    crossSourceDetails,
    numbeoPass,
    numbeoDetails,
    overallPass: crossSourcePass && numbeoPass,
  };
}

function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function renderReport(buckets: BucketStats[], numbeo: NumbeoKyivBenchmarks): string {
  const evalResult = evaluatePilot(buckets, numbeo);

  const lines: string[] = [];
  lines.push('# Kyiv Rent Pilot — Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Numbeo captured: ${numbeo.capturedOn}`);
  lines.push('');
  lines.push(`## Verdict: ${evalResult.overallPass ? '**PASS**' : '**FAIL**'}`);
  lines.push('');
  lines.push(`- Cross-source agreement (≤15% diff): **${evalResult.crossSourcePass ? 'PASS' : 'FAIL'}**`);
  lines.push(`- Numbeo benchmark (≤20% diff for 1BR/3BR): **${evalResult.numbeoPass ? 'PASS' : 'FAIL'}**`);
  lines.push('');

  lines.push('## Per-bucket medians');
  lines.push('');
  lines.push('| Source | Bedrooms | N | Dropped | Median UAH/mo | Median USD/mo | p25 USD | p75 USD |');
  lines.push('|--------|----------|---|---------|---------------|---------------|---------|---------|');
  for (const b of buckets) {
    lines.push(
      `| ${b.source} | ${b.bedrooms} | ${b.nListings} | ${b.nDropped} | ` +
      `${fmtMoney(b.medianLocal)} | ${fmtMoney(b.medianUsd)} | ` +
      `${fmtMoney(b.p25Usd)} | ${fmtMoney(b.p75Usd)} |`
    );
  }
  lines.push('');

  lines.push('## Cross-source comparison (OLX vs DOM.RIA)');
  lines.push('');
  lines.push('| Bedrooms | OLX UAH | DOM.RIA UAH | Rel diff | Pass | Note |');
  lines.push('|----------|---------|-------------|----------|------|------|');
  for (const d of evalResult.crossSourceDetails) {
    lines.push(
      `| ${d.bedrooms} | ${fmtMoney(d.olx)} | ${fmtMoney(d.domria)} | ${fmtPct(d.relDiff)} | ` +
      `${d.pass ? 'yes' : 'no'} | ${d.skipped ?? ''} |`
    );
  }
  lines.push('');

  lines.push('## Numbeo comparison (blended center+outside)');
  lines.push('');
  lines.push('| Bedrooms | Source | Median UAH | Numbeo blend UAH | Rel diff | Pass |');
  lines.push('|----------|--------|------------|------------------|----------|------|');
  for (const d of evalResult.numbeoDetails) {
    lines.push(
      `| ${d.bedrooms} | ${d.source} | ${fmtMoney(d.median)} | ${fmtMoney(d.numbeoBlend)} | ` +
      `${fmtPct(d.relDiff)} | ${d.pass ? 'yes' : 'no'} |`
    );
  }
  lines.push('');

  lines.push('## Interpretation guide');
  lines.push('');
  lines.push('- If **cross-source FAIL but Numbeo PASS for one source**: one classifieds site is biased (likely toward higher-end listings). Investigate listing distribution by district before trusting either source.');
  lines.push('- If **cross-source PASS but Numbeo FAIL**: classifieds asking prices systematically differ from Numbeo crowd-sourced averages. Likely cause: asking-vs-closing rent gap, or stale Numbeo data. Acceptable to proceed if magnitude is consistent (e.g. ~25% high in both sources).');
  lines.push('- If **both FAIL**: methodology issue — recheck room→bedroom normalization and outlier trim.');
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx jest scripts/rent-pilot/__tests__/report.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/rent-pilot/report.ts scripts/rent-pilot/__tests__/report.test.ts
git commit -m "rent-pilot: pass/fail evaluation and markdown report"
```

---

## Task 11: Orchestrator (`run.ts`)

Wires it all together: load FX rates → scrape OLX → scrape DOM.RIA → normalize → aggregate → render report. Writes intermediate JSON to `data/` for debugging.

**Files:**
- Create: `scripts/rent-pilot/run.ts`

- [ ] **Step 1: Implement**

Write `scripts/rent-pilot/run.ts`:

```typescript
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scrapeOlx } from './scrape-olx';
import { scrapeDomria } from './scrape-domria';
import { loadRatesToEur, buildUsdConverter, normalizeListing } from './normalize';
import { aggregate } from './aggregate';
import { renderReport } from './report';
import { NUMBEO_KYIV } from './numbeo-benchmarks';
import { ListingRaw, ListingNormalized } from './types';
import { closePool } from '../../src/config/database';

const DATA_DIR = join(__dirname, 'data');

function writeJson(filename: string, value: unknown) {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(value, null, 2), 'utf-8');
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  console.log('Loading exchange rates from DB...');
  const rates = await loadRatesToEur();
  if (!rates.has('UAH')) throw new Error('UAH rate missing — run `npm run rates:sync` first');
  const toUsd = buildUsdConverter(rates);
  console.log(`Rates loaded: UAH=${rates.get('UAH')}, USD=${rates.get('USD')}`);

  console.log('\n=== Scraping OLX ===');
  const olxRaw: ListingRaw[] = await scrapeOlx();
  writeJson('olx-listings-raw.json', olxRaw);
  console.log(`OLX: collected ${olxRaw.length} raw listings`);

  console.log('\n=== Scraping DOM.RIA ===');
  const domriaRaw: ListingRaw[] = await scrapeDomria();
  writeJson('domria-listings-raw.json', domriaRaw);
  console.log(`DOM.RIA: collected ${domriaRaw.length} raw listings`);

  console.log('\n=== Normalizing ===');
  const all: ListingNormalized[] = [];
  for (const raw of [...olxRaw, ...domriaRaw]) {
    const norm = normalizeListing(raw, toUsd);
    if (norm) all.push(norm);
  }
  writeJson('listings-normalized.json', all);
  console.log(`Normalized: ${all.length} / ${olxRaw.length + domriaRaw.length} listings`);

  console.log('\n=== Aggregating ===');
  const buckets = aggregate(all);
  writeJson('buckets.json', buckets);
  for (const b of buckets) {
    console.log(`  ${b.source} ${b.bedrooms}BR: n=${b.nListings}, median=$${b.medianUsd.toFixed(0)}`);
  }

  console.log('\n=== Generating report ===');
  const md = renderReport(buckets, NUMBEO_KYIV);
  const reportPath = join(DATA_DIR, 'report.md');
  writeFileSync(reportPath, md, 'utf-8');
  console.log(`Report written to: ${reportPath}`);

  await closePool();
}

main().catch(err => {
  console.error('Pilot failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/rent-pilot/run.ts
git commit -m "rent-pilot: orchestrator wiring scrape→normalize→aggregate→report"
```

---

## Task 12: README and dry-run

**Files:**
- Create: `scripts/rent-pilot/README.md`

- [ ] **Step 1: Write the README**

Write `scripts/rent-pilot/README.md`:

```markdown
# Rent Pilot — Kyiv (Throwaway Validation)

Validates whether scraping classifieds (OLX.ua + DOM.RIA) produces a representative median rent figure for Kyiv apartments. Output decides whether to build the production rent feature described in `docs/superpowers/specs/2026-05-31-real-estate-rent-design.md`.

This pilot is intentionally **outside** the production scraper registry, DB schema, and API.

## Requirements

- Postgres running (`docker-compose up -d`) with migrations applied (`npm run migrate`).
- Exchange rates synced at least once (`npm run rates:sync`).
- Playwright Chromium installed (`npx playwright install chromium`).

## Run

```bash
npm run rent-pilot:run
```

Takes ~5–10 minutes (paginates ~25 pages per source, 2.5s delay each). Output:

- `scripts/rent-pilot/data/olx-listings-raw.json`
- `scripts/rent-pilot/data/domria-listings-raw.json`
- `scripts/rent-pilot/data/listings-normalized.json`
- `scripts/rent-pilot/data/buckets.json`
- `scripts/rent-pilot/data/report.md` ← read this

## Tests

```bash
npx jest scripts/rent-pilot/__tests__/
```

## When selectors break

Both sites change DOM occasionally. If a parser test fails or the scraper returns empty pages:

1. Re-capture the fixture (see Task 6/8 of the implementation plan).
2. Adjust selectors at the top of `parse-olx.ts` or `parse-domria.ts`.
3. Re-run the parser tests, then re-run the pilot.

## Pass criteria

See spec section 2 — pass requires both:
- OLX vs DOM.RIA medians within ~15% for each bucket with ≥30 listings.
- Both sources within ~20% of Numbeo's blended (centre+outside) figure for 1BR and 3BR.
```

- [ ] **Step 2: Dry-run the full pipeline**

```bash
docker-compose up -d
npm run migrate
npm run rates:sync
npm run rent-pilot:run
```

Expected:
- Console logs show OLX and DOM.RIA progress.
- A `data/report.md` file appears.
- Open `data/report.md` and verify the tables are populated and the verdict line reads PASS or FAIL.

If the scraper returns zero listings for either source, the selectors are stale — adjust as described in the README, then re-run.

- [ ] **Step 3: Commit**

```bash
git add scripts/rent-pilot/README.md
git commit -m "rent-pilot: README and run instructions"
```

- [ ] **Step 4: Final summary**

Report back the contents of `scripts/rent-pilot/data/report.md`. The decision on whether to build production (per spec Section 3) is informed entirely by this report.

---

## Self-review notes

- **Spec coverage:** Two sources ✅ (Task 7+9), ~300–500 listings ✅ (TARGET_LISTINGS=500), room→bedroom normalization ✅ (Task 3), UAH→USD via existing infra ✅ (Task 4), outlier trim ✅ (Task 5), median per bucket ✅ (Task 5), three-way comparison ✅ (Task 10), pass criteria ~15%/~20% ✅ (Task 10), throwaway directory ✅ (all under `scripts/rent-pilot/`).
- **Out of scope items** (per spec section 6) are not touched: no districts beyond raw capture, no furnished split, no time-series UI.
- **One known soft spot:** OLX/DOM.RIA selectors are best-guess. The TDD-with-fixture pattern is exactly what makes this safe — the engineer captures real HTML before writing parser tests, so the selectors get verified against actual current DOM rather than my guesses.
