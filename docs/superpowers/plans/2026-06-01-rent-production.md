# Production Kyiv Rent Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape Kyiv rentals weekly from OLX + DOM.RIA + flatfy, persist them, aggregate to one pooled median per apartment size, expose `GET /api/rent`, and show a rent section on the Home page (medians converted to EUR client-side).

**Architecture:** Port the PR #32 pilot's TDD'd pure functions (parsers + normalize helpers) into `src/scrapers/rent/`, drive them with a thin `RentScraperService` that writes `rental_listings`. A `npm run rent:aggregate` job dedups the trailing 30 days by `source_listing_id`, pools all sources, and writes one median per bedroom bucket into `rental_stats`. The API serves currency-agnostic medians (country's own currency + code); the React frontend converts to EUR with the existing `convertToEUR` util.

**Tech Stack:** Node 18 + TypeScript, Express, Playwright (Chromium), PostgreSQL, Jest + ts-jest, React + Vite + React Query, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-01-rent-production-design.md`

**Source of ported code:** the `pr-32` git branch (the throwaway pilot under `scripts/rent-pilot/`). Verbatim ports use `git show pr-32:<path> > <dest>` — concrete, executable, no retyping.

---

## File structure

**Backend (new):**
- `src/database/migrations/015_create_rental_tables.sql` — `rental_listings` + `rental_stats`
- `src/scrapers/rent/types.ts` — `Source`, `Currency`, `ListingRaw`, `RentListingNormalized`
- `src/scrapers/rent/parse-olx.ts`, `parse-domria.ts`, `parse-flatfy.ts` — ported parsers (verbatim)
- `src/scrapers/rent/scrape-olx.ts`, `scrape-domria.ts`, `scrape-flatfy.ts` — ported Playwright wrappers (verbatim)
- `src/scrapers/rent/normalize.ts` — ported pure helpers + new `buildLocalConverter`, `extractSourceListingId`, country-currency `normalizeListing`
- `src/scrapers/rent/aggregate.ts` — new pooled aggregation (`percentile`, `aggregateRent`)
- `src/scrapers/rent/RentScraperService.ts` — orchestrates scrape → normalize → insert
- `src/repositories/RentalListingRepository.ts` — `insertMany`, `getDedupedForWindow`
- `src/repositories/RentStatsRepository.ts` — `upsert`, `getLatestGroupedByCountry`
- `src/api/routes/rent.ts` — `GET /api/rent` + exported `groupRentRowsByCountry`
- `scripts/scrape-rent.ts`, `scripts/aggregate-rent.ts` — CLI entry points

**Backend (modified):**
- `src/repositories/index.ts` — export the two new repositories + singletons
- `src/api/server.ts` — wire `/api/rent`
- `package.json` — `test`, `rent:scrape`, `rent:aggregate` scripts + ts-jest/@types/jest devDeps
- `jest.config.js` — new (ts-jest preset)

**Frontend (modified/new):**
- `frontend/src/types/index.ts` — `RentBucket`, `CountryRent`
- `frontend/src/services/api.ts` — `rentApi`
- `frontend/src/components/comparison/RentComparison.tsx` — new section component
- `frontend/src/pages/Home.tsx` — render `<RentComparison />`
- `frontend/src/i18n/locales/{en,uk,ru}.json` — `rent.*` keys

**CI:**
- `.github/workflows/scrape-rent.yml` — weekly rent scrape + aggregate

**Tests:**
- `src/scrapers/rent/__tests__/fixtures/{olx,domria,flatfy-list,flatfy-blocked}-*.html` — ported fixtures
- `src/scrapers/rent/__tests__/parse-{olx,domria,flatfy}.test.ts` — ported verbatim
- `src/scrapers/rent/__tests__/normalize.test.ts` — rewritten for country-currency normalize
- `src/scrapers/rent/__tests__/aggregate.test.ts` — rewritten for pooled aggregation
- `src/repositories/__tests__/RentalListingRepository.test.ts`, `RentStatsRepository.test.ts` — mock `query`
- `src/api/routes/__tests__/rent.test.ts` — `groupRentRowsByCountry`

---

## Task 1: Jest infrastructure (ts-jest + config)

Main lacks ts-jest, a jest config, and a `test` script (PR #32 added them; we branched from main). Set them up first so every later test task can run.

**Files:**
- Create: `jest.config.js`
- Modify: `package.json`

- [ ] **Step 1: Install ts-jest and jest types**

Run:
```bash
npm install --save-dev ts-jest@^29.4.11 @types/jest@^29.5.11
```
Expected: both added to `devDependencies` (jest@^29.7.0 is already present).

- [ ] **Step 2: Create the Jest config**

Create `jest.config.js`:
```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/frontend/'],
};
```

- [ ] **Step 3: Add the test script**

In `package.json` `scripts`, add (next to the other scripts):
```json
"test": "jest",
```

- [ ] **Step 4: Verify Jest runs (no tests yet)**

Run: `npx jest --passWithNoTests`
Expected: exits 0, "No tests found, exiting with code 0" (or runs zero suites cleanly).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json jest.config.js
git commit -m "chore: add ts-jest config and test script for rent feature"
```

---

## Task 2: Database migration — rental tables

**Files:**
- Create: `src/database/migrations/015_create_rental_tables.sql`

- [ ] **Step 1: Write the migration**

Create `src/database/migrations/015_create_rental_tables.sql`:
```sql
-- Rent feature: raw listings (one row per listing per scrape) and the
-- pre-aggregated pooled medians the API serves. Listings are NOT products;
-- they do not reuse the grocery products/prices schema.

CREATE TABLE IF NOT EXISTS rental_listings (
    id SERIAL PRIMARY KEY,
    country_id INTEGER NOT NULL REFERENCES countries(id),
    city VARCHAR(100) NOT NULL,
    source VARCHAR(20) NOT NULL,                 -- 'olx' | 'domria' | 'flatfy'
    source_listing_id TEXT NOT NULL,             -- site's own id (parsed from URL)
    bedrooms INTEGER NOT NULL,                   -- rooms - 1 (studio = 0)
    sqm NUMERIC(10, 2),
    price_original NUMERIC(14, 2) NOT NULL,      -- as listed
    currency_original VARCHAR(3) NOT NULL,       -- listed currency (UAH/USD/EUR)
    price_local NUMERIC(14, 2) NOT NULL,         -- normalized to the country's currency
    district TEXT,
    listed_at TIMESTAMP WITH TIME ZONE,
    scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    scraped_on DATE NOT NULL DEFAULT CURRENT_DATE,  -- plain date column for an
                                                    -- immutable dedup index
    raw_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Re-running a scrape on the same day is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_listings_dedup
    ON rental_listings (source, source_listing_id, scraped_on);

CREATE INDEX IF NOT EXISTS idx_rental_listings_country_scraped
    ON rental_listings (country_id, scraped_at DESC);

CREATE TABLE IF NOT EXISTS rental_stats (
    id SERIAL PRIMARY KEY,
    country_id INTEGER NOT NULL REFERENCES countries(id),
    city VARCHAR(100) NOT NULL,
    bedrooms INTEGER NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    median NUMERIC(14, 2) NOT NULL,              -- pooled median in the country's currency
    currency VARCHAR(3) NOT NULL,
    n_listings INTEGER NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_stats_period
    ON rental_stats (country_id, city, bedrooms, period_end);
```

> Note: we use a plain `scraped_on DATE` column (not `scraped_at::date`) because casting `timestamptz` to `date` is not immutable and cannot back a unique index.

- [ ] **Step 2: Start the database and run migrations**

Run:
```bash
docker-compose up -d
npm run migrate
```
Expected: log line `✓ Migration 015_create_rental_tables.sql completed successfully`.

- [ ] **Step 3: Verify the tables exist**

Run:
```bash
docker-compose exec -T postgres psql -U postgres -d whereislifecheaper -c "\d rental_listings" -c "\d rental_stats"
```
Expected: both tables print with the columns above. (If your DB user/name differ, use the values from `docker-compose.yml` / `.env`.)

- [ ] **Step 4: Commit**

```bash
git add src/database/migrations/015_create_rental_tables.sql
git commit -m "feat(rent): add rental_listings and rental_stats tables"
```

---

## Task 3: Port the pure parsers + their fixtures and tests

These three parsers and their fixture tests are already TDD'd in the pilot and are pure (cheerio in, `ListingRaw[]` out). Port them verbatim; they import only `cheerio` and `./types`.

**Files:**
- Create (verbatim): `src/scrapers/rent/parse-olx.ts`, `parse-domria.ts`, `parse-flatfy.ts`
- Create (verbatim): `src/scrapers/rent/__tests__/parse-olx.test.ts`, `parse-domria.test.ts`, `parse-flatfy.test.ts`
- Create (verbatim): `src/scrapers/rent/__tests__/fixtures/{olx-list-page,domria-list-page,flatfy-list-page,flatfy-blocked-page}.html`
- Create: `src/scrapers/rent/types.ts`

- [ ] **Step 1: Create the types file**

The parsers import `{ ListingRaw }` and the `Source` type from `./types`. Keep these names identical to the pilot so the ports compile unchanged; add the production normalized type.

Create `src/scrapers/rent/types.ts`:
```ts
export type Source = 'olx' | 'domria' | 'flatfy';

export type Currency = 'UAH' | 'USD' | 'EUR';

/** Raw listing as scraped from a list page (pre-normalization). */
export interface ListingRaw {
  source: Source;
  url: string;
  priceText: string;
  roomsText: string;
  sqmText: string | null;
  district: string | null;
  listedAtText: string | null;
}

/** A listing normalized for persistence, priced in the country's own currency. */
export interface RentListingNormalized {
  source: Source;
  url: string;
  sourceListingId: string;
  priceOriginal: number;
  currencyOriginal: Currency;
  priceLocal: number;     // converted to the country's currency
  bedrooms: number;       // rooms - 1 (studio = 0)
  sqm: number | null;
  district: string | null;
}
```

- [ ] **Step 2: Port the parsers and fixtures verbatim**

Run:
```bash
mkdir -p src/scrapers/rent/__tests__/fixtures
git show pr-32:scripts/rent-pilot/parse-olx.ts    > src/scrapers/rent/parse-olx.ts
git show pr-32:scripts/rent-pilot/parse-domria.ts > src/scrapers/rent/parse-domria.ts
git show pr-32:scripts/rent-pilot/parse-flatfy.ts > src/scrapers/rent/parse-flatfy.ts
git show pr-32:scripts/rent-pilot/__tests__/parse-olx.test.ts    > src/scrapers/rent/__tests__/parse-olx.test.ts
git show pr-32:scripts/rent-pilot/__tests__/parse-domria.test.ts > src/scrapers/rent/__tests__/parse-domria.test.ts
git show pr-32:scripts/rent-pilot/__tests__/parse-flatfy.test.ts > src/scrapers/rent/__tests__/parse-flatfy.test.ts
git show pr-32:scripts/rent-pilot/__tests__/fixtures/olx-list-page.html     > src/scrapers/rent/__tests__/fixtures/olx-list-page.html
git show pr-32:scripts/rent-pilot/__tests__/fixtures/domria-list-page.html  > src/scrapers/rent/__tests__/fixtures/domria-list-page.html
git show pr-32:scripts/rent-pilot/__tests__/fixtures/flatfy-list-page.html  > src/scrapers/rent/__tests__/fixtures/flatfy-list-page.html
git show pr-32:scripts/rent-pilot/__tests__/fixtures/flatfy-blocked-page.html > src/scrapers/rent/__tests__/fixtures/flatfy-blocked-page.html
```
Expected: 10 files created. The parser tests import `roomsTextToBedrooms` from `../normalize` — that import resolves once Task 4 lands; run this task's tests after Task 4. (If running standalone now, the parse tests that don't touch normalize still pass; the normalize import only resolves in Task 4.)

- [ ] **Step 3: Verify the parser tests pass (after Task 4's normalize exists)**

Run: `npx jest src/scrapers/rent/__tests__/parse-olx.test.ts src/scrapers/rent/__tests__/parse-domria.test.ts src/scrapers/rent/__tests__/parse-flatfy.test.ts`
Expected: 3 suites PASS (each asserts ≥20 cards parsed from the fixture, valid URLs, prices contain digits, DataDome wall returns []).

- [ ] **Step 4: Commit**

```bash
git add src/scrapers/rent/types.ts src/scrapers/rent/parse-*.ts src/scrapers/rent/__tests__/
git commit -m "feat(rent): port pilot HTML parsers, fixtures, and parser tests"
```

---

## Task 4: Normalize helpers (country-currency conversion)

The pilot's `normalize.ts` converts to USD. We need conversion to the **country's** currency, plus a `source_listing_id` extractor. The pure text helpers (`roomsTextToBedrooms`, `parsePriceText`, `parseSqm`) are reused unchanged.

**Files:**
- Create: `src/scrapers/rent/normalize.ts`
- Create: `src/scrapers/rent/__tests__/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scrapers/rent/__tests__/normalize.test.ts`:
```ts
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

  test('UAH → UAH is identity', () => {
    expect(toUah(25000, 'UAH')).toBeCloseTo(25000, 0);
  });
  test('USD → UAH multiplies by rate(USD)/rate(UAH)', () => {
    // 500 * (0.92 / 0.022) ≈ 20909
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

  test('produces price in the country currency and rooms→bedrooms', () => {
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/scrapers/rent/__tests__/normalize.test.ts`
Expected: FAIL — `Cannot find module '../normalize'`.

- [ ] **Step 3: Write the implementation**

Create `src/scrapers/rent/normalize.ts`:
```ts
import { Currency, ListingRaw, RentListingNormalized, Source } from './types';
import { ExchangeRateRepository } from '../../repositories/ExchangeRateRepository';

const UA_WORD_TO_ROOMS: Array<[RegExp, number]> = [
  [/одно\s*кімн|однокімн/i, 1],
  [/дво[хуї]?\s*кімн|двокімн/i, 2],
  [/тр[иьох]+\s*кімн|трикімн/i, 3],
  [/чотир[иьох]+\s*кімн|чотирикімн/i, 4],
];

export function roomsTextToBedrooms(text: string): number | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  if (/студ|studio/i.test(lower)) return 0;

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

export function parsePriceText(text: string): { amount: number; currency: Currency } | null {
  if (!text) return null;

  const stripped = text.replace(/[\s  ]/g, '');

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

function parseSqm(text: string | null): number | null {
  if (!text) return null;
  const m = text.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
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
  }
  return url;
}

export function normalizeListing(
  raw: ListingRaw,
  toLocal: (amount: number, currency: Currency) => number,
  targetCurrency: string,
): RentListingNormalized | null {
  const price = parsePriceText(raw.priceText);
  if (!price) return null;

  const bedrooms = roomsTextToBedrooms(raw.roomsText);
  if (bedrooms === null) return null;

  return {
    source: raw.source,
    url: raw.url,
    sourceListingId: extractSourceListingId(raw.source, raw.url),
    priceOriginal: price.amount,
    currencyOriginal: price.currency,
    priceLocal: Math.round(toLocal(price.amount, price.currency)),
    bedrooms,
    sqm: parseSqm(raw.sqmText),
    district: raw.district,
  };
  // targetCurrency is consumed by the caller-built `toLocal`; kept in the
  // signature so callers pass the country currency explicitly and read clearly.
}

/** Load currency → EUR rates from the existing exchange-rate infrastructure. */
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/scrapers/rent/__tests__/normalize.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Run the parser tests too (now that `../normalize` resolves)**

Run: `npx jest src/scrapers/rent/__tests__/`
Expected: parse + normalize suites all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scrapers/rent/normalize.ts src/scrapers/rent/__tests__/normalize.test.ts
git commit -m "feat(rent): normalize listings to the country currency + id extraction"
```

---

## Task 5: Pooled aggregation

The pilot aggregated per `(source, bedrooms)`. Production pools **all** sources into one median per bedroom bucket, computed over `price_local`.

**Files:**
- Create: `src/scrapers/rent/aggregate.ts`
- Create: `src/scrapers/rent/__tests__/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scrapers/rent/__tests__/aggregate.test.ts`:
```ts
import { aggregateRent, percentile, AggInput } from '../aggregate';

function row(bedrooms: number, priceLocal: number, sqm: number | null = 50): AggInput {
  return { bedrooms, priceLocal, sqm };
}

describe('percentile', () => {
  test('p50 of [1..9] = 5', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.5)).toBe(5);
  });
  test('linear interpolation between samples', () => {
    expect(percentile([10, 20], 0.5)).toBe(15);
  });
  test('empty array returns NaN', () => {
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('aggregateRent', () => {
  test('pools all sources into one median per bedroom bucket', () => {
    // 5 listings in the 1BR bucket regardless of which site they came from.
    const listings = [row(1, 100), row(1, 200), row(1, 300), row(1, 400), row(1, 500)];
    const out = aggregateRent(listings);
    expect(out).toHaveLength(1);
    expect(out[0].bedrooms).toBe(1);
    expect(out[0].median).toBe(300);
    expect(out[0].nListings).toBe(5);
  });

  test('drops listings with sqm out of [15, 300]', () => {
    const listings = [row(0, 500, 14), row(0, 500, 301), row(0, 500, 50), row(0, 600, 50)];
    const out = aggregateRent(listings);
    const b = out.find((x) => x.bedrooms === 0)!;
    expect(b.nListings).toBe(2);
    expect(b.median).toBe(550);
  });

  test('keeps listings with null sqm', () => {
    const listings = Array.from({ length: 3 }, () => row(2, 1000, null));
    const out = aggregateRent(listings);
    expect(out.find((x) => x.bedrooms === 2)!.nListings).toBe(3);
  });

  test('caps bedrooms at 3 (4-room and up fold into the 3BR bucket)', () => {
    const listings = [row(3, 1000), row(5, 2000)];
    const out = aggregateRent(listings);
    expect(out).toHaveLength(1);
    expect(out[0].bedrooms).toBe(3);
    expect(out[0].nListings).toBe(2);
  });

  test('trims 5% off each tail once the bucket has >= 20 listings', () => {
    // 20 listings 1..20: trimCount = floor(20*0.05) = 1, so drop 1 + 20.
    const listings = Array.from({ length: 20 }, (_, i) => row(0, i + 1));
    const out = aggregateRent(listings);
    const b = out.find((x) => x.bedrooms === 0)!;
    expect(b.nListings).toBe(18);          // 20 - 2 trimmed
    expect(b.median).toBe(10.5);           // median of 2..19
  });

  test('returns buckets sorted by bedrooms', () => {
    const out = aggregateRent([row(2, 100), row(0, 100), row(1, 100)]);
    expect(out.map((b) => b.bedrooms)).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/scrapers/rent/__tests__/aggregate.test.ts`
Expected: FAIL — `Cannot find module '../aggregate'`.

- [ ] **Step 3: Write the implementation**

Create `src/scrapers/rent/aggregate.ts`:
```ts
const MIN_SQM = 15;
const MAX_SQM = 300;
const TRIM_FRACTION = 0.05;
const TRIM_MIN_BUCKET_SIZE = 20;
const MAX_BEDROOMS = 3;

export interface AggInput {
  bedrooms: number;
  sqm: number | null;
  priceLocal: number;
}

export interface RentBucket {
  bedrooms: number;
  median: number;
  nListings: number;
}

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

function passSqmFilter(l: AggInput): boolean {
  if (l.sqm === null) return true;
  return l.sqm >= MIN_SQM && l.sqm <= MAX_SQM;
}

/**
 * Pool every listing (all sources) into one bucket per bedroom count, trim the
 * extreme 5% of each large bucket, and return the median price_local per bucket.
 */
export function aggregateRent(listings: AggInput[]): RentBucket[] {
  const buckets = new Map<number, number[]>();
  for (const l of listings) {
    if (!passSqmFilter(l)) continue;
    const bed = Math.min(l.bedrooms, MAX_BEDROOMS);
    if (!buckets.has(bed)) buckets.set(bed, []);
    buckets.get(bed)!.push(l.priceLocal);
  }

  const out: RentBucket[] = [];
  for (const [bedrooms, unsorted] of buckets) {
    const prices = [...unsorted].sort((a, b) => a - b);
    let trimmed = prices;
    if (prices.length >= TRIM_MIN_BUCKET_SIZE) {
      const trimCount = Math.floor(prices.length * TRIM_FRACTION);
      trimmed = prices.slice(trimCount, prices.length - trimCount);
    }
    out.push({
      bedrooms,
      median: Math.round(percentile(trimmed, 0.5)),
      nListings: trimmed.length,
    });
  }

  return out.sort((a, b) => a.bedrooms - b.bedrooms);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/scrapers/rent/__tests__/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scrapers/rent/aggregate.ts src/scrapers/rent/__tests__/aggregate.test.ts
git commit -m "feat(rent): pooled per-bedroom median aggregation"
```

---

## Task 6: Repositories (rental_listings + rental_stats)

Unit-test the SQL/params by mocking the `query` module — no live DB needed for the test.

**Files:**
- Create: `src/repositories/RentalListingRepository.ts`
- Create: `src/repositories/RentStatsRepository.ts`
- Create: `src/repositories/__tests__/RentalListingRepository.test.ts`
- Create: `src/repositories/__tests__/RentStatsRepository.test.ts`
- Modify: `src/repositories/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/repositories/__tests__/RentalListingRepository.test.ts`:
```ts
jest.mock('../../config/database', () => ({ query: jest.fn() }));
import { query } from '../../config/database';
import { RentalListingRepository } from '../RentalListingRepository';
import { RentListingNormalized } from '../../scrapers/rent/types';

const mockQuery = query as jest.Mock;

function listing(over: Partial<RentListingNormalized> = {}): RentListingNormalized {
  return {
    source: 'olx',
    url: 'https://www.olx.ua/d/uk/obyavlenie/x-ID1.html',
    sourceListingId: '1',
    priceOriginal: 20000,
    currencyOriginal: 'UAH',
    priceLocal: 20000,
    bedrooms: 1,
    sqm: 50,
    district: 'Центр',
    ...over,
  };
}

beforeEach(() => mockQuery.mockReset());

describe('RentalListingRepository.insertMany', () => {
  test('returns 0 and does not query for an empty list', async () => {
    const repo = new RentalListingRepository();
    const n = await repo.insertMany(1, 'Kyiv', []);
    expect(n).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('builds a multi-row insert with ON CONFLICT DO NOTHING and 11 params per row', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 });
    const repo = new RentalListingRepository();
    const n = await repo.insertMany(7, 'Kyiv', [listing({ sourceListingId: '1' }), listing({ sourceListingId: '2' })]);
    expect(n).toBe(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO rental_listings/);
    expect(sql).toMatch(/ON CONFLICT \(source, source_listing_id, scraped_on\) DO NOTHING/);
    expect(params).toHaveLength(22); // 11 columns * 2 rows
    expect(params.slice(0, 11)).toEqual([7, 'Kyiv', 'olx', '1', 1, 50, 20000, 'UAH', 20000, 'Центр', 'https://www.olx.ua/d/uk/obyavlenie/x-ID1.html']);
  });
});

describe('RentalListingRepository.getDedupedForWindow', () => {
  test('queries DISTINCT ON (source, source_listing_id) within the window and returns rows', async () => {
    mockQuery.mockResolvedValue({ rows: [{ bedrooms: 1, sqm: 50, price_local: 20000 }] });
    const repo = new RentalListingRepository();
    const rows = await repo.getDedupedForWindow(7, 30);
    expect(rows).toEqual([{ bedrooms: 1, sqm: 50, price_local: 20000 }]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/DISTINCT ON \(source, source_listing_id\)/);
    expect(sql).toMatch(/scraped_at DESC/);
    expect(params).toEqual([7, 30]);
  });
});
```

Create `src/repositories/__tests__/RentStatsRepository.test.ts`:
```ts
jest.mock('../../config/database', () => ({ query: jest.fn() }));
import { query } from '../../config/database';
import { RentStatsRepository } from '../RentStatsRepository';

const mockQuery = query as jest.Mock;
beforeEach(() => mockQuery.mockReset());

describe('RentStatsRepository.upsert', () => {
  test('inserts with ON CONFLICT upsert on (country_id, city, bedrooms, period_end)', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const repo = new RentStatsRepository();
    await repo.upsert({
      countryId: 7, city: 'Kyiv', bedrooms: 1,
      periodStart: '2026-05-02', periodEnd: '2026-06-01',
      median: 22931, currency: 'UAH', nListings: 800,
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO rental_stats/);
    expect(sql).toMatch(/ON CONFLICT \(country_id, city, bedrooms, period_end\)\s*DO UPDATE/);
    expect(params).toEqual([7, 'Kyiv', 1, '2026-05-02', '2026-06-01', 22931, 'UAH', 800]);
  });
});

describe('RentStatsRepository.getLatestGroupedByCountry', () => {
  test('joins countries and returns rows for the latest period per country/city', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const repo = new RentStatsRepository();
    await repo.getLatestGroupedByCountry();
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN countries/);
    expect(sql).toMatch(/MAX\(period_end\)/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/repositories/__tests__/`
Expected: FAIL — cannot find `../RentalListingRepository` / `../RentStatsRepository`.

- [ ] **Step 3: Implement RentalListingRepository**

Create `src/repositories/RentalListingRepository.ts`:
```ts
import { query } from '../config/database';
import { RentListingNormalized } from '../scrapers/rent/types';

export interface RentAggRow {
  bedrooms: number;
  sqm: number | null;
  price_local: number;
}

const INSERT_COLUMNS = [
  'country_id', 'city', 'source', 'source_listing_id', 'bedrooms', 'sqm',
  'price_original', 'currency_original', 'price_local', 'district', 'raw_url',
];

export class RentalListingRepository {
  /** Insert a batch of listings; same-day repeats are ignored via the unique index. */
  async insertMany(countryId: number, city: string, listings: RentListingNormalized[]): Promise<number> {
    if (listings.length === 0) return 0;

    const params: unknown[] = [];
    const tuples = listings.map((l, i) => {
      const b = i * INSERT_COLUMNS.length;
      params.push(
        countryId, city, l.source, l.sourceListingId, l.bedrooms, l.sqm,
        l.priceOriginal, l.currencyOriginal, l.priceLocal, l.district, l.url,
      );
      const ph = INSERT_COLUMNS.map((_, c) => `$${b + c + 1}`).join(',');
      return `(${ph})`;
    });

    const result = await query(
      `INSERT INTO rental_listings (${INSERT_COLUMNS.join(', ')})
       VALUES ${tuples.join(', ')}
       ON CONFLICT (source, source_listing_id, scraped_on) DO NOTHING`,
      params,
    );
    return result.rowCount ?? 0;
  }

  /**
   * Deduped listings for the trailing `days`: one row per (source, listing),
   * keeping the most recent scrape, so weekly repeats are not double-counted.
   */
  async getDedupedForWindow(countryId: number, days: number): Promise<RentAggRow[]> {
    const result = await query<RentAggRow>(
      `SELECT bedrooms, sqm, price_local
       FROM (
         SELECT DISTINCT ON (source, source_listing_id)
           bedrooms, sqm, price_local, scraped_at
         FROM rental_listings
         WHERE country_id = $1
           AND scraped_at >= NOW() - ($2 || ' days')::interval
         ORDER BY source, source_listing_id, scraped_at DESC
       ) deduped`,
      [countryId, days],
    );
    return result.rows;
  }
}
```

- [ ] **Step 4: Implement RentStatsRepository**

Create `src/repositories/RentStatsRepository.ts`:
```ts
import { query } from '../config/database';

export interface RentStatUpsert {
  countryId: number;
  city: string;
  bedrooms: number;
  periodStart: string;
  periodEnd: string;
  median: number;
  currency: string;
  nListings: number;
}

export interface RentStatCountryRow {
  code: string;
  name: string;
  city: string;
  currency: string;
  period_start: string;
  period_end: string;
  bedrooms: number;
  median: string;     // numeric arrives as string from pg
  n_listings: number;
}

export class RentStatsRepository {
  async upsert(stat: RentStatUpsert): Promise<void> {
    await query(
      `INSERT INTO rental_stats
         (country_id, city, bedrooms, period_start, period_end, median, currency, n_listings, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (country_id, city, bedrooms, period_end)
       DO UPDATE SET
         median = EXCLUDED.median,
         currency = EXCLUDED.currency,
         n_listings = EXCLUDED.n_listings,
         period_start = EXCLUDED.period_start,
         computed_at = NOW()`,
      [
        stat.countryId, stat.city, stat.bedrooms, stat.periodStart, stat.periodEnd,
        stat.median, stat.currency, stat.nListings,
      ],
    );
  }

  /** Latest period per (country, city), joined to country code/name, for the API. */
  async getLatestGroupedByCountry(): Promise<RentStatCountryRow[]> {
    const result = await query<RentStatCountryRow>(
      `SELECT c.code, c.name, s.city, s.currency, s.period_start, s.period_end,
              s.bedrooms, s.median, s.n_listings
       FROM rental_stats s
       JOIN countries c ON c.id = s.country_id
       JOIN (
         SELECT country_id, city, MAX(period_end) AS period_end
         FROM rental_stats
         GROUP BY country_id, city
       ) latest
         ON latest.country_id = s.country_id
        AND latest.city = s.city
        AND latest.period_end = s.period_end
       ORDER BY c.name, s.bedrooms`,
    );
    return result.rows;
  }
}
```

- [ ] **Step 5: Export the repositories**

In `src/repositories/index.ts`, add the named exports and singletons (mirror the existing pattern):
```ts
export { RentalListingRepository } from './RentalListingRepository';
export { RentStatsRepository } from './RentStatsRepository';
```
and in the singletons block:
```ts
import { RentalListingRepository } from './RentalListingRepository';
import { RentStatsRepository } from './RentStatsRepository';

export const rentalListingRepository = new RentalListingRepository();
export const rentStatsRepository = new RentStatsRepository();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest src/repositories/__tests__/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/repositories/RentalListingRepository.ts src/repositories/RentStatsRepository.ts src/repositories/index.ts src/repositories/__tests__/
git commit -m "feat(rent): rental listing + stats repositories"
```

---

## Task 7: Port the Playwright scrapers

These hit live sites, so they are verified manually, not unit-tested. Port verbatim — they import only `playwright`, `./parse-*`, and `./types`.

**Files:**
- Create (verbatim): `src/scrapers/rent/scrape-olx.ts`, `scrape-domria.ts`, `scrape-flatfy.ts`

- [ ] **Step 1: Port the scrapers verbatim**

Run:
```bash
git show pr-32:scripts/rent-pilot/scrape-olx.ts    > src/scrapers/rent/scrape-olx.ts
git show pr-32:scripts/rent-pilot/scrape-domria.ts > src/scrapers/rent/scrape-domria.ts
git show pr-32:scripts/rent-pilot/scrape-flatfy.ts > src/scrapers/rent/scrape-flatfy.ts
```

- [ ] **Step 2: Verify they type-check**

Run: `npx tsc --noEmit`
Expected: no errors from the three new files. (`scrapeOlx`/`scrapeDomria` take no args; `scrapeFlatfy(opts?)` accepts an optional resume options object.)

- [ ] **Step 3: Commit**

```bash
git add src/scrapers/rent/scrape-olx.ts src/scrapers/rent/scrape-domria.ts src/scrapers/rent/scrape-flatfy.ts
git commit -m "feat(rent): port pilot Playwright scrapers for OLX, DOM.RIA, flatfy"
```

---

## Task 8: RentScraperService + scrape-rent script

**Files:**
- Create: `src/scrapers/rent/RentScraperService.ts`
- Create: `scripts/scrape-rent.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement the service**

Create `src/scrapers/rent/RentScraperService.ts`:
```ts
import { scrapeOlx } from './scrape-olx';
import { scrapeDomria } from './scrape-domria';
import { scrapeFlatfy } from './scrape-flatfy';
import { loadRatesToEur, buildLocalConverter, normalizeListing } from './normalize';
import { ListingRaw, RentListingNormalized } from './types';
import { RentalListingRepository } from '../../repositories/RentalListingRepository';
import { query } from '../../config/database';
import { logger } from '../../utils/logger';

const CITY = 'Kyiv';
const COUNTRY_CODE = 'UA';

interface CountryRow {
  id: number;
  currency_code: string;
}

/**
 * Scrape all three Kyiv sources, normalize to the country's currency, and
 * persist. Each source is wrapped in try/catch so a failure of one (notably
 * flatfy behind DataDome) does not abort the others.
 */
export async function scrapeRent(): Promise<void> {
  const repo = new RentalListingRepository();

  const country = (
    await query<CountryRow>('SELECT id, currency_code FROM countries WHERE code = $1', [COUNTRY_CODE])
  ).rows[0];
  if (!country) throw new Error(`Country ${COUNTRY_CODE} not found — run npm run seed`);

  const rates = await loadRatesToEur();
  if (!rates.has(country.currency_code)) {
    throw new Error(`Rate missing for ${country.currency_code} — run npm run rates:sync`);
  }
  const toLocal = buildLocalConverter(rates, country.currency_code);

  const sources: Array<{ name: string; scrape: () => Promise<ListingRaw[]> }> = [
    { name: 'olx', scrape: scrapeOlx },
    { name: 'domria', scrape: scrapeDomria },
    { name: 'flatfy', scrape: () => scrapeFlatfy() },
  ];

  for (const { name, scrape } of sources) {
    try {
      logger.info(`[rent] scraping ${name}...`);
      const raw = await scrape();
      const normalized: RentListingNormalized[] = [];
      for (const r of raw) {
        const n = normalizeListing(r, toLocal, country.currency_code);
        if (n) normalized.push(n);
      }
      const inserted = await repo.insertMany(country.id, CITY, normalized);
      logger.info(`[rent] ${name}: ${raw.length} raw, ${normalized.length} normalized, ${inserted} inserted`);
    } catch (err) {
      logger.error(`[rent] ${name} failed (continuing with remaining sources):`, err);
    }
  }
}
```

- [ ] **Step 2: Create the CLI entry point**

Create `scripts/scrape-rent.ts`:
```ts
import { scrapeRent } from '../src/scrapers/rent/RentScraperService';
import { closePool } from '../src/config/database';
import { logger } from '../src/utils/logger';

scrapeRent()
  .then(() => closePool())
  .then(() => {
    logger.info('[rent] scrape complete');
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('[rent] scrape failed:', err);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
```

- [ ] **Step 3: Add the npm script**

In `package.json` `scripts`, add:
```json
"rent:scrape": "ts-node scripts/scrape-rent.ts",
```

- [ ] **Step 4: Verify type-check and a live run (small, manual)**

Run: `npx tsc --noEmit`
Expected: no errors.

Then, with Docker DB up, seeded, and rates synced, do a real run:
```bash
npm run seed
npm run rates:sync
npm run rent:scrape
```
Expected: log lines like `[rent] olx: NNN raw, NNN normalized, NNN inserted` for olx and domria; flatfy needs a display (headed Chromium) — locally it opens a browser window, in CI it runs under xvfb (Task 11). If flatfy fails locally, the log shows `[rent] flatfy failed (continuing...)` and the script still exits 0.

Verify rows landed:
```bash
docker-compose exec -T postgres psql -U postgres -d whereislifecheaper -c "SELECT source, count(*) FROM rental_listings GROUP BY source;"
```
Expected: non-zero counts for at least `olx` and `domria`.

- [ ] **Step 5: Commit**

```bash
git add src/scrapers/rent/RentScraperService.ts scripts/scrape-rent.ts package.json
git commit -m "feat(rent): scraper service + rent:scrape CLI"
```

---

## Task 9: Aggregation script

**Files:**
- Create: `scripts/aggregate-rent.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement the aggregation entry point**

Create `scripts/aggregate-rent.ts`:
```ts
import { RentalListingRepository } from '../src/repositories/RentalListingRepository';
import { RentStatsRepository } from '../src/repositories/RentStatsRepository';
import { aggregateRent } from '../src/scrapers/rent/aggregate';
import { query, closePool } from '../src/config/database';
import { logger } from '../src/utils/logger';

const CITY = 'Kyiv';
const COUNTRY_CODE = 'UA';
const WINDOW_DAYS = 30;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const country = (
    await query<{ id: number; currency_code: string }>(
      'SELECT id, currency_code FROM countries WHERE code = $1',
      [COUNTRY_CODE],
    )
  ).rows[0];
  if (!country) throw new Error(`Country ${COUNTRY_CODE} not found — run npm run seed`);

  const listingRepo = new RentalListingRepository();
  const statsRepo = new RentStatsRepository();

  const rows = await listingRepo.getDedupedForWindow(country.id, WINDOW_DAYS);
  logger.info(`[rent:aggregate] ${rows.length} deduped listings in the last ${WINDOW_DAYS} days`);

  const buckets = aggregateRent(
    rows.map((r) => ({
      bedrooms: r.bedrooms,
      sqm: r.sqm === null ? null : Number(r.sqm),
      priceLocal: Number(r.price_local),
    })),
  );

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const b of buckets) {
    await statsRepo.upsert({
      countryId: country.id,
      city: CITY,
      bedrooms: b.bedrooms,
      periodStart: ymd(periodStart),
      periodEnd: ymd(periodEnd),
      median: b.median,
      currency: country.currency_code,
      nListings: b.nListings,
    });
    logger.info(`[rent:aggregate]   ${b.bedrooms}BR: median=${b.median} ${country.currency_code}, n=${b.nListings}`);
  }
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error('[rent:aggregate] failed:', err);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add:
```json
"rent:aggregate": "ts-node scripts/aggregate-rent.ts",
```

- [ ] **Step 3: Run it against the scraped data**

Run: `npm run rent:aggregate`
Expected: a line per bedroom bucket, e.g. `0BR: median=16468 UAH, n=...`. Then verify:
```bash
docker-compose exec -T postgres psql -U postgres -d whereislifecheaper -c "SELECT bedrooms, median, currency, n_listings FROM rental_stats ORDER BY bedrooms;"
```
Expected: one row per bedroom bucket present in the data.

- [ ] **Step 4: Commit**

```bash
git add scripts/aggregate-rent.ts package.json
git commit -m "feat(rent): 30-day dedup+pool aggregation into rental_stats"
```

---

## Task 10: API endpoint GET /api/rent

**Files:**
- Create: `src/api/routes/rent.ts`
- Create: `src/api/routes/__tests__/rent.test.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Write the failing test for the grouping helper**

Create `src/api/routes/__tests__/rent.test.ts`:
```ts
import { groupRentRowsByCountry } from '../rent';
import { RentStatCountryRow } from '../../../repositories/RentStatsRepository';

function r(over: Partial<RentStatCountryRow>): RentStatCountryRow {
  return {
    code: 'UA', name: 'Ukraine', city: 'Kyiv', currency: 'UAH',
    period_start: '2026-05-02', period_end: '2026-06-01',
    bedrooms: 0, median: '16468', n_listings: 1100, ...over,
  };
}

describe('groupRentRowsByCountry', () => {
  test('nests buckets under one entry per country with numeric median', () => {
    const out = groupRentRowsByCountry([
      r({ bedrooms: 0, median: '16468', n_listings: 1100 }),
      r({ bedrooms: 1, median: '22931', n_listings: 800 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].country).toEqual({ code: 'UA', name: 'Ukraine' });
    expect(out[0].city).toBe('Kyiv');
    expect(out[0].currency).toBe('UAH');
    expect(out[0].buckets).toEqual([
      { bedrooms: 0, median: 16468, n_listings: 1100 },
      { bedrooms: 1, median: 22931, n_listings: 800 },
    ]);
  });

  test('separates rows from different countries', () => {
    const out = groupRentRowsByCountry([
      r({ code: 'UA', name: 'Ukraine' }),
      r({ code: 'TR', name: 'Turkey', currency: 'TRY' }),
    ]);
    expect(out.map((c) => c.country.code).sort()).toEqual(['TR', 'UA']);
  });

  test('returns [] for no rows', () => {
    expect(groupRentRowsByCountry([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/api/routes/__tests__/rent.test.ts`
Expected: FAIL — cannot find `../rent`.

- [ ] **Step 3: Implement the route + helper**

Create `src/api/routes/rent.ts`:
```ts
import { Router } from 'express';
import { rentStatsRepository } from '../../repositories';
import { RentStatCountryRow } from '../../repositories/RentStatsRepository';

export interface RentBucketDto {
  bedrooms: number;
  median: number;
  n_listings: number;
}

export interface CountryRentDto {
  country: { code: string; name: string };
  city: string;
  currency: string;
  period_start: string;
  period_end: string;
  buckets: RentBucketDto[];
}

/** Pure: flatten the joined stat rows into one nested entry per country. */
export function groupRentRowsByCountry(rows: RentStatCountryRow[]): CountryRentDto[] {
  const byCountry = new Map<string, CountryRentDto>();
  for (const row of rows) {
    let entry = byCountry.get(row.code);
    if (!entry) {
      entry = {
        country: { code: row.code, name: row.name },
        city: row.city,
        currency: row.currency,
        period_start: row.period_start,
        period_end: row.period_end,
        buckets: [],
      };
      byCountry.set(row.code, entry);
    }
    entry.buckets.push({
      bedrooms: row.bedrooms,
      median: Number(row.median),
      n_listings: row.n_listings,
    });
  }
  return Array.from(byCountry.values());
}

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await rentStatsRepository.getLatestGroupedByCountry();
    res.json({ data: groupRentRowsByCountry(rows) });
  } catch (error) {
    next(error);
  }
});

export default router;
```

- [ ] **Step 4: Wire the route in server.ts**

In `src/api/server.ts`, add the import next to the other route imports:
```ts
import rentRouter from './routes/rent';
```
and register it with the other `/api/*` routes (after `ratesRouter`):
```ts
app.use('/api/rent', rentRouter);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/api/routes/__tests__/rent.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the live endpoint**

With the DB populated (Tasks 8–9) and the API running (`npm run api`), in another shell:
```bash
curl -s http://localhost:3000/api/rent | head -c 600
```
Expected: `{"data":[{"country":{"code":"UA","name":"Ukraine"},"city":"Kyiv","currency":"UAH",...,"buckets":[{"bedrooms":0,"median":...,"n_listings":...}, ...]}]}`.

- [ ] **Step 7: Commit**

```bash
git add src/api/routes/rent.ts src/api/routes/__tests__/rent.test.ts src/api/server.ts
git commit -m "feat(rent): GET /api/rent endpoint (currency-agnostic medians)"
```

---

## Task 11: Frontend rent section

The frontend has no test runner, so this task is verified by `tsc -b`/build + a manual check. Follow the existing React Query + `convertToEUR` patterns.

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`
- Create: `frontend/src/components/comparison/RentComparison.tsx`
- Modify: `frontend/src/pages/Home.tsx`
- Modify: `frontend/src/i18n/locales/en.json`, `uk.json`, `ru.json`

- [ ] **Step 1: Add the types**

In `frontend/src/types/index.ts`, append:
```ts
export interface RentBucket {
  bedrooms: number;
  median: number;
  n_listings: number;
}

export interface CountryRent {
  country: { code: string; name: string };
  city: string;
  currency: string;
  period_start: string;
  period_end: string;
  buckets: RentBucket[];
}
```

- [ ] **Step 2: Add the API client**

In `frontend/src/services/api.ts`, add `CountryRent` to the type import from `'../types'`, then add:
```ts
// Rent API
export const rentApi = {
  getAll: async (): Promise<CountryRent[]> => {
    const response = await api.get<{ data: CountryRent[] }>('/rent');
    return response.data.data;
  },
};
```

- [ ] **Step 3: Create the RentComparison component**

Create `frontend/src/components/comparison/RentComparison.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rentApi } from '../../services/api';
import { convertToEUR, formatPrice } from '../../utils/currency';
import type { CountryRent } from '../../types';

// Columns: studio (0BR) … 3BR. 3BR is flagged low-confidence per the pilot.
const SIZES = [0, 1, 2, 3];

function sizeLabel(t: (k: string) => string, bedrooms: number): string {
  if (bedrooms === 0) return t('rent.studio');
  return t('rent.nBr', { count: bedrooms } as never) as string;
}

function eurForBucket(country: CountryRent, bedrooms: number): { eur: number; n: number } | null {
  const bucket = country.buckets.find((b) => b.bedrooms === bedrooms);
  if (!bucket) return null;
  return { eur: convertToEUR(bucket.median, country.currency), n: bucket.n_listings };
}

export default function RentComparison() {
  const { t } = useTranslation();
  const { data: rents = [], isLoading } = useQuery({
    queryKey: ['rent'],
    queryFn: rentApi.getAll,
  });

  if (isLoading || rents.length === 0) return null; // hide until data exists

  return (
    <section className="card !p-4 space-y-3">
      <div>
        <h2 className="text-lg font-display font-bold text-charcoal-900">{t('rent.title')}</h2>
        <p className="text-xs text-charcoal-500">{t('rent.subtitle')}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-charcoal-500">
              <th className="py-2 pr-4 font-medium">{t('common.countries')}</th>
              {SIZES.map((s) => (
                <th key={s} className="py-2 px-3 font-medium whitespace-nowrap">
                  {sizeLabel(t, s)}
                  {s === 3 && <span className="ml-1 text-charcoal-400" title={t('rent.lowConfidence')}>*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rents.map((country) => (
              <tr key={country.country.code} className="border-t border-cream-200">
                <td className="py-2 pr-4 font-medium text-charcoal-800">{country.country.name}</td>
                {SIZES.map((s) => {
                  const cell = eurForBucket(country, s);
                  return (
                    <td key={s} className="py-2 px-3 whitespace-nowrap">
                      {cell ? (
                        <span>
                          <span className="font-semibold text-charcoal-900">
                            {formatPrice(Math.round(cell.eur), 'EUR')}
                          </span>
                          <span className="block text-xs text-charcoal-400">
                            {t('rent.listings', { count: cell.n } as never)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-charcoal-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-charcoal-400">{t('rent.lowConfidence')}</p>
    </section>
  );
}
```

- [ ] **Step 4: Render it on Home**

In `frontend/src/pages/Home.tsx`:
- add the import near the other comparison imports:
```tsx
import RentComparison from '../components/comparison/RentComparison';
```
- render it right after the closing `</section>` of the Price Comparison Section (the one containing `<ComparisonTable .../>` and `<CurrencyRatesTable />`), before the Country Stats block:
```tsx
      <RentComparison />
```

- [ ] **Step 5: Add i18n keys**

In each of `frontend/src/i18n/locales/en.json`, `uk.json`, `ru.json`, add a `rent` block. English:
```json
"rent": {
  "title": "Median rent in capitals",
  "subtitle": "Median asking rent, past 30 days",
  "studio": "Studio",
  "nBr": "{{count}}BR",
  "listings": "{{count}} listings",
  "lowConfidence": "* 3BR is a small, luxury-skewed sample — treat as indicative only."
}
```
Ukrainian (`uk.json`):
```json
"rent": {
  "title": "Медіанна оренда у столицях",
  "subtitle": "Медіанна запитувана оренда за останні 30 днів",
  "studio": "Студія",
  "nBr": "{{count}} спальні",
  "listings": "{{count}} оголошень",
  "lowConfidence": "* 3 спальні — мала вибірка з перекосом у преміум, лише орієнтовно."
}
```
Russian (`ru.json`):
```json
"rent": {
  "title": "Медианная аренда в столицах",
  "subtitle": "Медианная запрашиваемая аренда за последние 30 дней",
  "studio": "Студия",
  "nBr": "{{count}} спальни",
  "listings": "{{count}} объявлений",
  "lowConfidence": "* 3 спальни — малая выборка с перекосом в премиум, только ориентир."
}
```
> Place the `"rent"` block as a sibling of the existing top-level `"home"` / `"common"` keys; keep valid JSON (add a comma after the preceding block).

- [ ] **Step 6: Verify the frontend builds**

Run: `cd frontend && npm run build`
Expected: `tsc -b` passes and Vite builds with no type errors. (`formatPrice(x, 'EUR')` renders `€x`; `convertToEUR` uses the rates already loaded by `loadExchangeRates()` at app start.)

- [ ] **Step 7: Manual visual check**

Run the API (`npm run api`) and the frontend dev server (`npm run dev:frontend`), open the app, and confirm a "Median rent in capitals" section appears below the grocery comparison with a Ukraine row, EUR values per size, listing counts, and the 3BR `*` note.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts frontend/src/components/comparison/RentComparison.tsx frontend/src/pages/Home.tsx frontend/src/i18n/locales/
git commit -m "feat(rent): Home rent section converting medians to EUR"
```

---

## Task 12: Weekly CI workflow

**Files:**
- Create: `.github/workflows/scrape-rent.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/scrape-rent.yml`:
```yaml
name: Weekly Rent Scrape

on:
  schedule:
    # Mondays at 04:00 UTC — separate from the daily grocery scrape.
    - cron: '0 4 * * 1'
  workflow_dispatch:

jobs:
  scrape-rent:
    runs-on: ubuntu-latest
    timeout-minutes: 180

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Chromium
        run: npx playwright install chromium --with-deps

      - name: Install xvfb for headed browser support
        run: sudo apt-get update && sudo apt-get install -y xvfb

      - name: Run migrations
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: npm run migrate

      - name: Sync exchange rates
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NODE_ENV: production
        run: npm run rates:sync

      - name: Scrape rent (headed with xvfb for flatfy/DataDome)
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          PLAYWRIGHT_HEADLESS: 'false'
          NODE_ENV: production
          DISPLAY: ':99'
        run: |
          xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" \
            npm run rent:scrape

      - name: Aggregate rent stats
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NODE_ENV: production
        run: npm run rent:aggregate
```
> The scrape step never fails the job on a single source: `RentScraperService` swallows per-source errors, so a flatfy DataDome block still lets OLX + DOM.RIA persist and aggregation run.

- [ ] **Step 2: Validate the YAML**

Run: `npx --yes js-yaml .github/workflows/scrape-rent.yml > /dev/null && echo OK`
Expected: `OK` (valid YAML). If `js-yaml` is unavailable, visually confirm indentation matches `.github/workflows/scrape.yml`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/scrape-rent.yml
git commit -m "ci(rent): weekly rent scrape + aggregate workflow"
```

---

## Task 13: Full verification & branch wrap-up

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites PASS — `src/scrapers/rent/__tests__/` (parsers, normalize, aggregate), `src/repositories/__tests__/` (both repos), `src/api/routes/__tests__/rent.test.ts`.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: backend `tsc` and `frontend` Vite build both succeed.

- [ ] **Step 3: End-to-end smoke (DB up)**

Run:
```bash
npm run migrate && npm run seed && npm run rates:sync
npm run rent:scrape
npm run rent:aggregate
npm run api &   # then:
curl -s http://localhost:3000/api/rent | python3 -m json.tool | head -40
```
Expected: JSON with a Ukraine entry, `currency: "UAH"`, and bedroom buckets carrying `median` + `n_listings`. Stop the API (`kill %1`).

- [ ] **Step 4: Push and open a PR**

```bash
git push -u origin feature/rent-production
gh pr create --fill --base main --title "Production Kyiv rent feature"
```

---

## Self-review notes (filled during planning)

- **Spec coverage:** §2 user-facing table → Task 11; §3.1 tables → Task 2; §3.2 ingestion (ported pure fns + thin service) → Tasks 3, 4, 7, 8; §3.3 dedup+pool aggregation → Tasks 5, 9; §3.4 `GET /api/rent` (no `:country`) → Task 10; §3.5 frontend EUR conversion → Task 11; §3.6 weekly xvfb CI + graceful flatfy degradation → Tasks 8 (try/catch) + 12. Currency-agnostic API/DB → Tasks 2, 4, 6, 10, 11.
- **Type consistency:** `ListingRaw`/`RentListingNormalized` (types.ts) → `normalizeListing` → `RentalListingRepository.insertMany`; `RentAggRow` → `aggregateRent(AggInput)` → `RentStatsRepository.upsert(RentStatUpsert)`; `RentStatCountryRow` → `groupRentRowsByCountry` → `CountryRentDto`/frontend `CountryRent`. Names match across tasks.
- **Deviation from spec:** does not extend `BaseScraper` (§3.2 rationale); `rental_listings` uses a `scraped_on DATE` column for the dedup index instead of `scraped_at::date` (immutability requirement). Both intentional.
