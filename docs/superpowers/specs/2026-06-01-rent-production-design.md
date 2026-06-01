# Rent section — production v1 (Kyiv) — design

**Status:** Approved (brainstorming phase). Ready for implementation plan.
**Date:** 2026-06-01
**Builds on:** `docs/superpowers/specs/2026-05-31-real-estate-rent-design.md` (the original rent design) and PR #32 (the throwaway Kyiv validation pilot, which passed for 0–2BR).

## 1. Goal and scope

Turn the validated Kyiv rent pilot into a real, shipped feature: scrape Kyiv rentals weekly, persist them, aggregate to a pooled median per apartment size, expose them through the API, and show them on the main page.

**In scope (v1):**
- **Ukraine only** (Kyiv). The pilot validated this one market; other capitals fan out in later PRs per the original spec's section 5.
- **All three pilot sources** — OLX.ua, DOM.RIA, flatfy.ua — pooled into a single median per apartment size.
- Production DB tables, a weekly scrape, an aggregation job, one API endpoint, and a new section on the Home page.

**Out of scope (v1):** other countries, non-capital cities, district/furnished splits, per-source comparison in the UI. (The per-source detail still exists in the raw listings table for debugging, just not in the API or UI.)

## 2. What the user sees

A new section on the Home page, below the grocery comparison, shaped like the grocery table:

- **Rows = countries** (just Ukraine in v1).
- **Columns = apartment sizes**: Studio (1-room), 1BR (2-room), 2BR (3-room), 3BR (4-room).
- **One cell per size**, showing a single **pooled median** monthly rent **converted to EUR on the frontend** (the site's common comparison currency), plus the listing count `N`.
- Section label, per the original spec's accuracy framing: **"Median asking rent, past 30 days."**
- 3BR is shown but flagged low-confidence (small sample, luxury skew — confirmed in the pilot).

The headline number is the median across **all** scraped Kyiv apartments of that size, regardless of which site listed them — not an average of per-site medians.

**Currency handling:** the site is cross-country, so the API stays currency-agnostic — it returns each country's median **in that country's own currency** plus the currency code. The frontend converts to EUR with the existing `convertToEUR(price, currency)` util (`frontend/src/utils/currency.ts`), the same path the grocery comparison already uses. No USD/EUR is baked into the API or DB.

## 3. Architecture

```
weekly CI  →  rent scrape (OLX, DOM.RIA, flatfy)  →  rental_listings
                                                          │
                                          npm run rent:aggregate
                                                          │
                                                          ▼
                                                    rental_stats
                                                          │
                                                  GET /api/rent
                                                          │
                                                   Home rent section
```

### 3.1 Data model (migration `015_create_rental_tables.sql`)

**`rental_listings`** — one row per listing per scrape (raw, source-granular):

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `country_id` | int FK → countries | |
| `city` | text | `'Kyiv'` in v1 |
| `source` | text | `'olx' \| 'domria' \| 'flatfy'` — provenance + dedup |
| `source_listing_id` | text | site's own listing id (parsed from URL/DOM) |
| `bedrooms` | int | normalized: rooms − 1 (studio = 0) |
| `sqm` | numeric | |
| `price_original` | numeric | as listed |
| `currency_original` | text | listed currency (UAH/USD) |
| `price_local` | numeric | normalized to the **country's** currency at ingest via `ExchangeRateRepository` (UAH for Ukraine; e.g. USD-native flatfy → UAH) |
| `district` | text | free-text, no geocoding |
| `listed_at` | timestamptz | nullable |
| `scraped_at` | timestamptz | run timestamp |
| `raw_url` | text | |

Unique index on `(source, source_listing_id, (scraped_at::date))` — re-running a scrape on the same day is idempotent.

**`rental_stats`** — pre-aggregated **pooled** medians the API serves (no source dimension):

| column | type | notes |
|---|---|---|
| `id` | serial PK | |
| `country_id` | int FK → countries | |
| `city` | text | |
| `bedrooms` | int | |
| `period_start` | date | window start (period_end − 30d) |
| `period_end` | date | window end (scrape date) |
| `median` | numeric | pooled median over `price_local` (the country's currency) |
| `currency` | text | the country's currency code (e.g. `'UAH'`) |
| `n_listings` | int | deduped listings in the pooled bucket |
| `computed_at` | timestamptz | |

Unique on `(country_id, city, bedrooms, period_end)`.

### 3.2 Ingestion pipeline (`src/scrapers/rent/`)

**Deliberate deviation from the original spec:** the original said rent scrapers extend `BaseScraper`. `BaseScraper`'s contract (`scrapeProductList` / `scrapeProductDetails`) is product-shaped and does not fit listings, so we do **not** force it. Instead:

- **Port the pilot's already-TDD'd pure functions** out of `scripts/rent-pilot/` into `src/scrapers/rent/`: `parse-olx`, `parse-domria`, `parse-flatfy` (cheerio HTML → `ListingRaw`), `normalize` (rooms→bedrooms, currency→the country's currency, sqm), and the median/trim logic. **Bring their fixture-based Jest tests with them** so the risky parsing stays covered.
- A thin **`RentScraperService`** drives each source: Playwright paginate → parse → normalize → `RentalListingRepository.insertMany`. Scraper wrappers stay thin; the tested pure functions do the work.
- **flatfy specifics** carry over from the pilot: headed Chromium with the automation flag masked (DataDome), resumable pagination, ~page-100 / ~2,200-listing ceiling treated as a sample. flatfy is USD-native, so its prices convert USD → the country's currency at ingest like any other source.
- The pilot's **OLX pagination fix** (canonical `kvartiry/dolgosrochnaya-arenda-kvartir/kiev/?page=N` path + per-run URL dedup) carries over — without it OLX returns the same 52 listings every page.

### 3.3 Aggregation job (`scripts/aggregate-rent.ts`, `npm run rent:aggregate`)

Runs after each scrape. Per `(country, city, bedrooms)` over the trailing 30 days:

1. **Dedup** by `source_listing_id`, keeping the latest `scraped_at` — kills listings repeated across weekly runs.
2. **Pool** all listings across OLX + DOM.RIA + flatfy.
3. **Filter** sqm to 15–300 m².
4. **Trim** the bottom/top 5% of the pooled bucket (by `price_local`).
5. **Median** over `price_local` (the country's currency); count = remaining listings.

Upserts one `rental_stats` row per bucket keyed on `(country_id, city, bedrooms, period_end)`.

The 30-day rolling window smooths weekly noise without blurring real price shifts (original spec's reasoning).

### 3.4 API (`src/api/routes/rent.ts`, `RentStatsRepository`)

**`GET /api/rent`** — all countries that have rent stats (just Ukraine in v1; grows automatically as countries are wired up, no frontend change needed). Read-only, no auth. Wired in `src/api/server.ts` alongside the other `/api/*` routes.

```jsonc
[
  {
    "country": { "code": "UA", "name": "Ukraine" },
    "city": "Kyiv",
    "currency": "UAH",            // country's own currency; frontend converts to EUR
    "period_start": "2026-05-02",
    "period_end": "2026-06-01",
    "buckets": [
      { "bedrooms": 0, "median": 16468, "n_listings": 1100 },
      { "bedrooms": 1, "median": 22931, "n_listings": 800 }
    ]
  }
]
```

`currency` sits at the country level (one currency per country); buckets carry only `median` + `n_listings`. The frontend renders `convertToEUR(median, currency)`.

There is intentionally **no** `GET /api/rent/:country` endpoint — the Home page is cross-country, so only the all-countries endpoint exists.

### 3.5 Frontend (`frontend/src/`)

- A new `RentComparison` component rendered on `Home.tsx` below the grocery comparison.
- Fetches `GET /api/rent` via the existing `services/api.ts` + React Query pattern.
- Table: rows = countries, columns = sizes (Studio/1BR/2BR/3BR), one cell = pooled `median` **converted to EUR** via `convertToEUR(median, currency)` + `N`. Same currency-conversion path the grocery comparison already uses, so EUR rates load once via `loadExchangeRates()`.
- i18n keys added to `en.json` / `uk.json` / `ru.json`.
- The section label and `N` are always visible so users can judge confidence (original spec's accuracy framing). 3BR carries a low-confidence marker.

### 3.6 CI (`.github/workflows/scrape-rent.yml`)

A new **weekly** workflow, separate from the daily grocery `scrape.yml`:

1. `docker`/DB up + `npm run migrate` + `npm run rates:sync`.
2. Rent scrape: OLX, then DOM.RIA (both headless-friendly), then flatfy under **xvfb** (headed Chromium for DataDome).
3. `npm run rent:aggregate`.

**Known fragility — flatfy/DataDome:** flatfy's headed run is the brittle part in CI. The pipeline degrades gracefully: if flatfy fails, OLX + DOM.RIA still populate `rental_listings`, aggregation still produces pooled medians over the two remaining sources, and the API/UI keep working with a lower `N`. The workflow logs the flatfy outcome rather than failing the whole job on it.

## 4. Testing

- **Ported pilot fixture tests** (parse-olx, parse-domria, parse-flatfy, normalize, aggregate median/trim) move with the code and must keep passing.
- **New, TDD'd:** the dedup-then-pool-then-median aggregation logic (the one genuinely new piece), `RentalListingRepository` and `RentStatsRepository` (insert/upsert/query), and the `/api/rent` response shape.
- `npm run build` (TS compiles), `npx jest` green.

## 5. Rollout / follow-ups (not this PR)

- Wire Turkey as the second market (original spec section 5).
- Optional dedicated `/rent` page if cross-country detail outgrows the Home section.
- Revisit DOM.RIA's 3-room inventory bias (pilot flagged it under-prices 3-room) before leaning on its 2BR contribution.
