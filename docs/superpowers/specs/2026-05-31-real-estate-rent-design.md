# Real estate rent section — design

**Status:** Approved (brainstorming phase). Implementation gated on Ukraine pilot pass.
**Date:** 2026-05-31

## 1. Goal and scope

Add a "rent" section to the site showing **median monthly rent for studio / 1BR / 2BR / 3BR apartments in each country's capital**, refreshed weekly, presented in local currency and USD.

- Capitals only. No intra-country city breakdown.
- All ten existing countries are eventual targets (TR, ME, ES, UZ, UA, KZ, DE, MY, AL, AT).
- **Before any of this ships, a one-off Ukraine pilot validates that scraping classifieds produces numbers representative enough to publish.** No production code lands until the pilot passes.

## 2. The Ukraine pilot (validation phase)

The pilot lives in a throwaway `scripts/rent-pilot/` directory. It is not wired into the production scraper registry, database tables, or API. Its only output is a markdown report with a pass/fail verdict.

### Sources
- OLX.ua — Kyiv long-term rentals
- DOM.RIA — Kyiv long-term rentals

Two sources are required. Two-source agreement (or disagreement) is the core signal of the pilot.

### Collection
- Target ~300–500 listings per source, paginated.
- Per-listing fields captured:
  - price (numeric)
  - currency (UAH/USD as listed)
  - rooms (Ukrainian "N-комнатная" format)
  - square meters
  - district (free-text, no geocoding)
  - listing URL
  - listing date

### Normalization
- **Rooms → bedrooms:** Ukrainian convention counts living room as a room. Mapping: `N-комнатная → N-1 bedrooms`. So 1-room = studio, 2-room = 1BR, 3-room = 2BR, 4-room = 3BR.
- **Currency → USD:** convert using the current rate from the existing exchange-rate sync infrastructure.

### Outlier handling
Drop listings that meet any of these:
- No price, no room count, or no square meters
- Square meters < 15 or > 300
- Price in the bottom 5% or top 5% of its bedroom bucket (per source)

### Aggregation
- **Median**, not mean — robust to long-tail luxury listings and data-entry errors.
- Computed per (source, bedroom-bucket).

### Validation comparison
Three-way comparison table: OLX median vs DOM.RIA median vs Numbeo's published "Apartment (1 BR) in city centre / outside centre" and "Apartment (3 BR) in city centre / outside centre" for Kyiv.

Numbeo does not publish studio or 2BR numbers, so those buckets only get the OLX-vs-DOM.RIA cross-check.

### Pass criteria
The pilot passes if **both** of the following hold:
1. OLX and DOM.RIA medians are within ~15% of each other in every bedroom bucket where both have ≥30 listings after trimming.
2. For the buckets Numbeo publishes (1BR, 3BR), both sources are within ~20% of Numbeo.

If the pilot fails, the report must document *which* axis disagreed — sources vs each other, or sources vs Numbeo. This pinpoints whether the problem is source-specific bias, the room→bedroom normalization, stale Numbeo data, or sample-size/outlier-trim choices, and informs whether to iterate on methodology or abandon classifieds as a data source.

## 3. Production architecture (only if pilot passes)

### Scrapers
- One scraper per country, extending the existing `BaseScraper`, placed in `src/scrapers/{country}/` alongside the grocery scrapers.
- Naming convention: `OlxKyivRentScraper`, `SahibindenAnkaraRentScraper`, etc.
- Listings are not products. They do **not** reuse the grocery `products` / `prices` / `product_mappings` schema.

### Database tables
- `rental_listings`
  - `id`, `country_id`, `city`, `source`, `source_listing_id`
  - `bedrooms`, `sqm`
  - `price_local`, `currency`, `price_usd`
  - `district` (text, no geocoding)
  - `listed_at`, `scraped_at`
  - `raw_url`
  - One row per listing per scrape.
- `rental_stats`
  - `country_id`, `city`, `bedrooms`, `period_start`, `period_end`, `source`
  - `median_usd`, `median_local`, `currency`
  - `n_listings`
  - Pre-aggregated medians the API serves.

### Aggregation job
- Runs after each weekly scrape.
- Recomputes `rental_stats` over the trailing 30 days of listings, partitioned by (country, source, bedrooms).
- 30-day rolling window smooths weekly noise without going so wide that price shifts get blurred.

### API
- New endpoint: `GET /api/rent/:country`
- Returns bedroom-bucketed medians (USD and local), `n_listings`, and the period covered.

### Cadence
- Weekly. Separate GitHub Actions workflow from the daily grocery scrape.
- Rent doesn't move daily and listings repeat across days, so daily would be waste and noise.

## 4. Accuracy framing for users

Capital-level median asking rent is a **directionally-correct cost-of-living comparator** ("Kyiv is cheaper than Berlin"), not a personal budget number. Actual rent depends heavily on district, condition, and furnishing — none of which v1 captures.

The UI must label the figure as:

> "Median asking rent in [Capital], past 30 days, from N listings"

with `N` visible to the user so they can judge confidence themselves. Adding district and furnished splits is a clear v2 extension if v1 numbers prove credible in production.

## 5. Rollout

1. Ukraine pilot → pass/fail report.
2. If pass: build the production architecture in section 3 with Ukraine as the first wired-up country.
3. Apply the same two-source-comparative methodology to Turkey (sahibinden + hepsiemlak) as a second validation in a different market.
4. If Turkey also passes, fan out one source per remaining country. Each country's PR brings:
   - one scraper
   - the per-country room→bedroom normalization rules
   - a short validation note comparing the scrape's medians to Numbeo for that capital

## 6. Out of scope for v1

Explicitly deferred to keep v1 shippable:

- Non-capital cities
- Intra-city geographic splits (center vs outskirts)
- Furnished / unfurnished split
- Short-term and Airbnb-style rentals
- Purchase prices (vs rent)
- Historical time-series UI (data is stored; UI does not yet expose a chart)

## 7. Open risks

- **Source longevity.** Classifieds sites change layouts. Per-country scraper maintenance is recurring work.
- **Listing duplication across sources.** Same apartment posted on OLX and DOM.RIA could appear in both samples. v1 does not deduplicate; the median is robust to mild double-counting, but this should be checked during the pilot.
- **Asking rent ≠ closing rent.** Classifieds list asking prices, which trend higher than what tenants actually pay. This is a systematic upward bias affecting every country equally, so cross-country comparison stays valid, but absolute numbers will skew high.
- **Numbeo as benchmark.** Numbeo is crowdsourced and can be stale or thin in less-trafficked capitals (Podgorica, Tashkent, Tirana). For those, the OLX-vs-DOM.RIA-style two-source agreement will need to carry more of the validation weight than the Numbeo comparison.
