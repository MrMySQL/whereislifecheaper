# Rental scraper handbook

This handbook explains the rental pipeline and how to add a rental website to it. It is based on the repository at `608dc52`, reviewed on 2026-09-16. Website access observations below come from the existing investigation; they are not a new live availability check.

Rental scrapers are standalone functions in `src/scrapers/rent/`. They do **not** extend the grocery `BaseScraper`, use `scraperRegistry.ts`, or require a supermarket seed. The grocery commands `scraper:run` and `scraper:test` do not run rental sources.

## Contents

- [How the pipeline works](#how-the-pipeline-works)
- [Existing sources and useful examples](#existing-sources-and-useful-examples)
- [Data contract and normalization](#data-contract-and-normalization)
- [Adding a website, step by step](#adding-a-website-step-by-step)
- [Testing and running](#testing-and-running)
- [Health reporting and troubleshooting](#health-reporting-and-troubleshooting)
- [Completion checklist](#completion-checklist)

## How the pipeline works

```mermaid
flowchart TD
    A[Weekly workflow or rent:scrape] --> B[RentScraperService: targets and sources]
    B --> C[Fetch list pages with HTTP or Playwright]
    C --> D[Pure parser: ListingRaw records]
    D --> E[Normalize bedrooms, monthly prices and currency]
    E --> F[RentalListingRepository: rental_listings]
    B --> G[Per-source JSON summary]
    F --> H[rent:aggregate: trailing 30 days]
    H --> I[rental_stats]
    I --> J[GET /api/rent]
    G --> K[rent:check-sources: final health verdict]
```

| Responsibility | Implementation |
| --- | --- |
| Country/city targets | [rentTargets.ts](../src/scrapers/rent/rentTargets.ts) |
| Source registration, expectations, normalization and persistence orchestration | [RentScraperService.ts](../src/scrapers/rent/RentScraperService.ts) |
| Raw and normalized types | [types.ts](../src/scrapers/rent/types.ts) |
| Price, bedroom and listing-ID conversion | [normalize.ts](../src/scrapers/rent/normalize.ts) |
| Inserts and deduplicated window queries | [RentalListingRepository.ts](../src/repositories/RentalListingRepository.ts) |
| Tables and unique indexes | [015_create_rental_tables.sql](../src/database/migrations/015_create_rental_tables.sql) |
| Median calculation | [aggregate.ts](../src/scrapers/rent/aggregate.ts) and [aggregate-rent.ts](../scripts/aggregate-rent.ts) |
| Statistics persistence and API | [RentStatsRepository.ts](../src/repositories/RentStatsRepository.ts), [rent.ts](../src/api/routes/rent.ts) |
| Summary serialization and allowed source names | [summaryFile.ts](../src/scrapers/rent/summaryFile.ts) |
| CLI and health gate | [scrape-rent.ts](../scripts/scrape-rent.ts), [check-rent-sources.ts](../scripts/check-rent-sources.ts) |
| Scheduled execution | [scrape-rent.yml](../.github/workflows/scrape-rent.yml) |

The service runs targets and their sources **sequentially**. It loads exchange rates once, looks up each target country in PostgreSQL, and invokes the sources registered for that country. Each source collects its sample in memory before normalization and one batch insert. There is no shared rental browser manager, automatic retry wrapper, or incremental page persistence.

The workflow is configured for Mondays at 04:00 UTC, with Node 20 and a 180-minute job limit. After dependency installation it builds the backend and runs the rent regression suite. The data pipeline sequence is migrations → exchange-rate sync → scrape → aggregate → summary artifact → health gate. Chromium and xvfb support the headed sources. The artifact and health gate use `if: always()`.

### What reaches the rent comparison

The aggregation reads the latest observation of each `(source, source_listing_id)` from the trailing 30 days, filtered by country and city. It then:

1. Keeps missing area values, but excludes known areas outside 15–300 m².
2. Groups bedrooms into 0, 1, 2 and 3; 3 includes larger homes.
3. Pools listings across all sources. It does not give each source equal weight.
4. For buckets of at least 20 listings, removes `floor(n × 0.05)` observations from each price tail.
5. Stores the median and the number of observations remaining after trimming.

Deduplication is within a source, not across websites. The same apartment advertised on multiple websites can influence the median more than once. Partial samples are also persisted and included in aggregation; the health flag reports their incompleteness but does not exclude their rows. Search geography, property types and rent periods therefore matter as much as extraction accuracy.

## Existing sources and useful examples

Expectations below are the values in `SOURCES_BY_COUNTRY`, not a claim that every source currently works.

| Source ID | Target | Transport and extraction | Limits and pacing | Expected |
| --- | --- | --- | --- | --- |
| `olx` | UA / Kyiv | Headless Chromium; Cheerio cards plus embedded OLX attributes | 25 pages / 1,500 target; 2.5 s between pages | `healthy` |
| `domria` | UA / Kyiv | Headless Chromium; Cheerio cards | 50 pages / 1,500 target; 2.5 s | `healthy` |
| `flatfy` | UA / Kyiv | Headed Chromium; Cheerio cards and ID-based URLs | 210 pages / 5,000 target; 3.5–6 s jitter | `blocked` |
| `realestateau` | AU / Sydney | Chromium; embedded `ArgonautExchange` → URQL cache → rent search | 20 pages / 500 target; 2.5 s | `blocked` |
| `domainau` | AU / Sydney | Node `fetch` with explicit headers; embedded `__NEXT_DATA__` | 25 pages / 500 target; 2.5 s | `blocked` |

Listing targets are stopping thresholds checked after a whole page is added, so returned counts can exceed them. Reaching the configured page/sample limit is considered a normal finish; `ok` does not mean the entire website was crawled.

Choose the closest reference by payload and behavior:

- **DOM cards:** [parse-domria.ts](../src/scrapers/rent/parse-domria.ts) pairs with [scrape-domria.ts](../src/scrapers/rent/scrape-domria.ts). The parser locates price by currency text and rooms by their content, rather than relying only on field order.
- **Cards enriched by structured data:** [parse-olx.ts](../src/scrapers/rent/parse-olx.ts) reads JSON-encoded `window.__PRERENDERED_STATE__`, joins attributes to canonical card URLs, and falls back to title text. It decodes JSON instead of executing page scripts. The scraper also preserves the original navigation response: hydration can remove the metadata script, so room/area attributes can be recovered from that response while cards, prices and empty-state evidence still come from the live DOM. [scrape-olx.ts](../src/scrapers/rent/scrape-olx.ts) uses a canonical category URL because an older redirect dropped the pagination parameter.
- **Structured payload over HTTP:** [parse-domain-au.ts](../src/scrapers/rent/parse-domain-au.ts) handles two observed Next.js nesting layouts and lets explicit studio type override a misleading bed count. [scrape-domain-au.ts](../src/scrapers/rent/scrape-domain-au.ts) bounds requests with a 60-second abort signal and calls the parser in strict mode.
- **Nested serialized JSON:** [parse-realestate-au.ts](../src/scrapers/rent/parse-realestate-au.ts) extracts a balanced JSON object without `eval`, then decodes the cache and its rent search entries. [scrape-realestate-au.ts](../src/scrapers/rent/scrape-realestate-au.ts) also requires a valid search payload.
- **Search-scope validation and resumable collection:** [scrape-flatfy.ts](../src/scrapers/rent/scrape-flatfy.ts) checks the returned host, path, city ID, rental section and requested page number before accepting cards. Its programmatic options accept `startPage` and `seed`; they are not CLI flags or a durable checkpoint. [parse-flatfy.ts](../src/scrapers/rent/parse-flatfy.ts) builds `/redirect/{id}` URLs because card links lead to search filters, and distinguishes administrative districts from neighborhoods and residential complexes.

The [2026-09-12 investigation](investigations/2026-09-12-rent-scrapers.md) documents successful Ukrainian sources, local parser improvements, and unresolved runner access problems for the other three sources. Local successful pages do not establish a successful production scrape.

### Existing behavior to account for

- OLX uses strict listing evidence: zero parsed cards are accepted only when the current DOM contains structured state with `totalElements === 0` and an empty ads array. Without that evidence, an empty first page throws and a later empty page preserves the sample as degraded. DOM.RIA has no verified empty-results marker, so any zero-card page fails with the same first-page/later-page distinction.
- The Australian parsers default to permissive parsing. Their scrapers pass `true` for `requireSearchPayload` so a missing/malformed payload throws. realestate.com.au also rejects a nonempty search that produces no usable listings, while accepting an explicit empty results array. Domain can still skip every record in a structurally valid payload; test that case when adapting it so rejected records do not masquerade as an empty search.
- Flatfy retries detected soft DataDome pages up to four times, with 20/40/60/80-second backoffs. Explicit HTTP failures are terminal. Unknown pages without cards fail because there is no verified empty-results marker. Twelve consecutive duplicate-only pages end collection normally.
- `PLAYWRIGHT_HEADLESS` is not a shared switch for rental scrapers: OLX/DOM.RIA hardcode headless mode, Flatfy hardcodes headed mode, and Domain uses HTTP. realestate.com.au reads `RENT_SCRAPER_HEADED` and `RENT_SCRAPER_DISABLE_HEADED_FALLBACK`. Its automatic headed fallback runs only after a returned empty result; a thrown first-page refusal does not trigger it.

## Data contract and normalization

The parser returns this existing shape; use `null` for unavailable nullable fields:

```typescript
interface ListingRaw {
  source: Source;
  url: string;
  priceText: string;
  roomsText: string;
  sqmText: string | null;
  district: string | null;
  listedAtText: string | null;
}
```

| Field | What to extract |
| --- | --- |
| `source` | The new, stable source ID added to the `Source` union. Keep it within the database's 20-character limit. |
| `url` | Absolute canonical listing URL. Remove known tracking parameters, but preserve parameters that identify the listing. Do not use category links. |
| `priceText` | Advertised rent with its currency and period, e.g. `25 000 грн/міс` or `$900 per week`. Do not convert it in the parser. |
| `roomsText` | Reliable room/bedroom evidence. Prefer structured attributes to titles. For explicit bedroom counts, `1 Bed`, `2 Beds`, and `Studio` fit the current normalizer. |
| `sqmText` | Total dwelling area in square metres. Convert other area units deliberately before using this field; the current normalizer does not inspect units. |
| `district` | One administrative district or suburb, not a concatenated address. |
| `listedAtText` | Original date text if available. Currently discarded during normalization; `listed_at` is not populated by the repository. |

Normalized records contain `sourceListingId`, `priceOriginal`, `currencyOriginal`, `priceLocal`, `bedrooms`, `sqm`, `district`, `source` and `url`. Both price amounts are **monthly**, including `priceOriginal`; the original weekly amount is not stored separately.

### Rules that a new source must explicitly review

| Concern | Current behavior | New-source action |
| --- | --- | --- |
| Currency | Rental `Currency` supports `UAH`, `USD`, `EUR`, `AUD`; recognized text must contain a currency marker | Extend the union and `parsePriceText` for additional currencies; test symbols and codes. |
| Bare `$` | Means AUD only for `realestateau` and `domainau`; otherwise USD | Update the source-dependent default. Passing target currency does not change this: `normalizeListing` currently ignores that argument. |
| Price period | Only those same two Australian IDs are multiplied by `52 / 12`, rounded to an integer | Extend `AUSTRALIAN_SOURCES` for a compatible weekly AUD source, or implement explicit source/period handling. Text such as “per month” does not override the current rule. |
| Price parsing | Removes whitespace and reads a positive integer, supporting comma thousands separators | Add fixtures before supporting decimals, dot thousands separators, ranges, “from” prices, bonds or mixed payment periods. These can otherwise be misread. |
| Rooms | Ukrainian-style room counts become `rooms - 1`; explicit English beds stay unchanged; studio becomes 0 | Confirm the site's meaning. Do not apply the room subtraction to a bedroom count from another country. |
| Area | First numeric value; missing/unparseable becomes `null` | Extract total area, not living area, floor number or lot size. Convert square feet if needed. |
| Identity | Source-specific URL regexes, falling back to the full URL | Add a stable ID extraction rule and tracking-variant tests. Source IDs must distinguish listings across all targets using that source. |
| Exchange rates | `amount × rate(listed currency) / rate(target currency)`, then local price is rounded | Ensure both currencies have database rates. Rates are EUR per one currency unit. |

For example, `realestateau` `$900 per week`, `1 Bed`, targeting AUD becomes monthly `priceOriginal = 3900`, `priceLocal = 3900`, `bedrooms = 1`. Ukrainian `2 кімнати` becomes `bedrooms = 1`. A missing currency token or unrecognized rooms text causes `normalizeListing` to return `null`; a missing required exchange rate throws and fails that source before its batch is inserted.

## Adding a website, step by step

### 1. Establish the search and collect evidence

Start with a specific country/city and long-term residential rental search. Record its exact geography, property types, rent period, currency, pagination format and listing identity. Inspect a first page and a later page; verify redirects preserve those filters. Exclude sales, holiday lets, parking, commercial property and shared rooms unless the product intentionally supports them.

Inspect the response for usable HTML, embedded state, or a structured endpoint available through the site's normal access path. Use HTTP when it reliably supplies the data; use Playwright when rendering or session setup is necessary. Test the intended runner as well as the local machine before drawing access conclusions. A 200 status alone is insufficient.

Save representative responses in `src/scrapers/rent/__tests__/fixtures/`: a populated page, a different later page with overlap, a verified empty result, and a blocked/invalid response if observed. Keep enough structure to exercise the real parser while removing unrelated scripts and personal/contact/session data. Record capture date, URL/search scope and transport in the test or source notes. Do not invent a real site's empty-results marker from assumptions.

### 2. Add the source type and pure parser

Add a literal such as `example` to `Source` in [types.ts](../src/scrapers/rent/types.ts). Then create `src/scrapers/rent/parse-example.ts` exporting `parseExampleListPage(html: string): ListingRaw[]` (or a documented strict variant).

Keep parsing independent of browser, network and database access. Resolve relative URLs against the portal origin and canonicalize them. Validate structured payload shape before mapping items. Skip malformed individual records with deliberate test coverage, but distinguish an invalid search payload from a verified empty search. For JSON embedded in scripts, extract and decode the data; do not execute the script.

Write fixture tests that assert actual IDs, prices, bedrooms, area and districts, not merely a nonzero count. Run a parser-to-normalizer test too: raw extraction success alone does not prove that a listing will be saved.

### 3. Implement bounded page collection

Create `src/scrapers/rent/scrape-example.ts`. Use the existing contract from `RentScraperService.ts` through a **type-only import**, avoiding a runtime dependency on the orchestration/database layer:

```typescript
import type { ScrapeResult } from './RentScraperService';
import type { ListingRaw } from './types';
```

The service accepts either `ListingRaw[]` or `{ listings: ListingRaw[]; degraded?: string }`. Prefer the object form so interrupted pagination can preserve data honestly.

This HTTP template illustrates the collection contract. It is an adaptation template, not a runnable source: implement the three site-specific helpers and choose limits from evidence. `parseExampleListPage` must throw for an invalid payload and may return `[]` only for a verified empty search; if its records all fail extraction, report that separately.

```typescript
import type { ScrapeResult } from './RentScraperService';
import type { ListingRaw } from './types';
import { parseExampleListPage } from './parse-example';
import { buildSearchUrl, assertSearchScope } from './example-search';

export async function scrapeExample(): Promise<ScrapeResult> {
  const listings: ListingRaw[] = [];
  const seen = new Set<string>();
  const maxPages = 25;       // Choose for this source.
  const targetListings = 500;

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    try {
      const response = await fetch(buildSearchUrl(pageNum), {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      assertSearchScope(response.url);
      const pageListings = parseExampleListPage(await response.text());
      if (pageListings.length === 0) break;

      let added = 0;
      for (const listing of pageListings) {
        if (seen.has(listing.url)) continue;
        seen.add(listing.url);
        listings.push(listing);
        added++;
      }
      if (added === 0 || listings.length >= targetListings) break;
    } catch (error) {
      const reason = `[example] page ${pageNum}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      if (listings.length === 0) throw new Error(reason);
      return {
        listings,
        degraded: `${reason}; sample is partial (${listings.length} listings)`,
      };
    }
    if (pageNum < maxPages) {
      await new Promise<void>((resolve) => setTimeout(resolve, 2500));
    }
  }
  return { listings };
}
```

For Playwright, use the same loop/error semantics, set navigation/render timeouts, inspect the returned HTTP response and final URL, and close the browser in `finally` immediately around all work after launch. Wait for a meaningful selector or payload. Browser settings, retry policy and pacing belong to the rental source itself; grocery environment defaults do not provide them automatically.

Record page number, requested/final URL, status, parsed count, new unique count and stopping reason. Include title/payload diagnostics for unexpected pages. Preserve earlier records with `degraded` when a later page fails; throw if nothing has been collected. Use bounded retries only for conditions the implementation can recognize, respecting source rate limits. An access refusal needs an access diagnosis, not speculative selector changes.

### 4. Wire normalization and identity

Implement the rules identified in the normalization table. A new weekly Australian source needs both the weekly conversion rule and the bare-dollar rule updated; adding only its `Source` literal is insufficient. If a website mixes periods, the current source-only rule cannot represent it correctly: extend the contract/normalizer with tests before accepting those listings.

Update `extractSourceListingId` for the new URL format. Persistence ignores conflicts on `(source, source_listing_id, scraped_on)`; neither country nor city is in that key. Same-day reruns do not update existing prices. Different days create observations that aggregation later deduplicates. Avoid IDs that are unique only within a city, or explicitly namespace them.

### 5. Register the source and target

Add an import and an entry to `SOURCES_BY_COUNTRY` in [RentScraperService.ts](../src/scrapers/rent/RentScraperService.ts), for example inside the existing `UA` array:

```typescript
{ name: 'example', scrape: scrapeExample, expect: 'healthy' },
```

Use `healthy` for an enabled source expected to work. `blocked` is an explicit, documented known access limitation; it is not an “untested” setting. It still attempts the scrape and only changes health classification. Validate before enabling; do not hide parser defects behind a blocked expectation.

Also add `example: true` to `SOURCE_NAMES` in [summaryFile.ts](../src/scrapers/rent/summaryFile.ts). This exhaustive record is easy to miss: the new source must be accepted by the summary reader and health gate. Update the service tests' module mocks, expected source list, and summary round-trip coverage.

If the source serves an existing target, no target change is needed. For a new country, add its country/currency to [countries.ts](../src/database/seeds/countries.ts), add the target to [rentTargets.ts](../src/scrapers/rent/rentTargets.ts), and register that country's sources. Additional currencies also need [exchangeRates.data.json](../src/constants/exchangeRates.data.json), which supplies fallback rates and derives the tracked currency list for [sync-exchange-rates.ts](../scripts/sync-exchange-rates.ts). Verify the rates actually exist in the database after syncing.

**Adding another city requires more than appending a target.** Today `SourceConfig.scrape` takes no arguments, and source URLs hardcode Kyiv or Sydney. The service would run the same city search again and label its results with the new target city. Make source selection/search configuration target-aware first—for example, pass `RentTarget` to the scraper and choose supported URLs per city, or register sources by `(country, city)`. Test that two city targets request different correct searches and persist the correct city. Also check geographic overlap and the globally scoped source-ID deduplication key.

A new source using the existing fields normally needs no rental schema migration: `source` is a varchar, not a database enum. Changes such as storing original payment period or listing dates require corresponding type, normalization, repository and migration work.

### 6. Extend tests and document operational evidence

Use the matrix below. When introducing a new registered scraper, mock it in the service suite so unit tests cannot accidentally hit the website. Update this handbook's source inventory and record any access limitations with their date and runner context. Promote a `blocked` source to `healthy` only after an expected complete sample succeeds on the intended runner; partial results are not recovery.

## Testing and running

Run commands from the repository root. The examples below describe operations for developing a source; this handbook's creation did not run live scrapers or write rental data.

### Offline tests

| Layer | Required cases | Existing reference |
| --- | --- | --- |
| Parser | Real fields, relative/canonical URLs, missing fields, studio versus beds, correct area/district, malformed and empty payloads | [parse-domain-au.test.ts](../src/scrapers/rent/__tests__/parse-domain-au.test.ts), [parse-olx.test.ts](../src/scrapers/rent/__tests__/parse-olx.test.ts) |
| Normalization | Currency markers, dollar ambiguity, monthly amount, rooms versus bedrooms, stable ID, rejected prices | [normalize.test.ts](../src/scrapers/rent/__tests__/normalize.test.ts) |
| Pagination | A later page contributes a new ID plus an overlap; duplicate-only stopping; caps; correct search scope | [scrape-domain-au.test.ts](../src/scrapers/rent/__tests__/scrape-domain-au.test.ts), [scrape-flatfy.test.ts](../src/scrapers/rent/__tests__/scrape-flatfy.test.ts) |
| Failure handling | First-page 403/429, timeout, HTTP 200 protection stub, later failures preserving `degraded`, browser cleanup | [scrape-realestate-au.test.ts](../src/scrapers/rent/__tests__/scrape-realestate-au.test.ts) |
| Service | Source registration, raw/normalized/inserted counts, failure isolation, no usable sources, healthy regression, blocked recovery, partial sample | [RentScraperService.test.ts](../src/scrapers/rent/__tests__/RentScraperService.test.ts) |
| Summary and gate | New source survives serialization; source/city appears in verdict; missing/stale summaries fail | [summaryFile.test.ts](../src/scrapers/rent/__tests__/summaryFile.test.ts), [check-rent-sources.test.ts](../scripts/__tests__/check-rent-sources.test.ts) |

Mock `fetch` or Playwright for transport tests. Use fake timers or mocked delays for long waits. Mock the database boundary when importing normalization: `normalize.ts` imports `ExchangeRateRepository`, whose database module requires `DATABASE_URL` at import time even if no query runs. A dummy test URL can satisfy configuration, but is not a substitute for mocking any code that queries the database.

```bash
# After creating the new files: focused source tests.
npm test -- --runInBand --runTestsByPath src/scrapers/rent/__tests__/parse-example.test.ts src/scrapers/rent/__tests__/scrape-example.test.ts

# Existing rental pipeline, CLI, persistence and API regression coverage.
# Dummy URL satisfies import-time configuration; these tests do not query it.
DATABASE_URL=postgresql://test:test@127.0.0.1:1/rent_tests npm test -- --runInBand --runTestsByPath src/scrapers/rent/__tests__/*.test.ts scripts/__tests__/scrape-rent.test.ts scripts/__tests__/check-rent-sources.test.ts src/repositories/__tests__/RentalListingRepository.test.ts src/repositories/__tests__/RentStatsRepository.test.ts src/api/routes/__tests__/rent.test.ts

# Backend type checking, including the exhaustive source-name record.
npm run build:backend
```

`--runTestsByPath` restricts execution to the specified files; without it, Jest's path patterns can also match test copies under local `.worktrees/`. The backend TypeScript build excludes `scripts/` and test files, so it does not replace the CLI/Jest checks. If shared frontend currency data or UI code changes, also run `npm run build` and the relevant frontend tests.

### One-source live smoke test without persistence

The rent CLI currently has no source/city filter, dry-run flag or page-limit flag. To exercise one existing scraper without running the service, import the scraper module directly:

```bash
node -r ts-node/register <<'NODE'
const { scrapeDomainAu } = require('./src/scrapers/rent/scrape-domain-au');
(async () => {
  const result = await scrapeDomainAu();
  console.log(JSON.stringify({
    count: result.listings.length,
    degraded: result.degraded ?? null,
    sample: result.listings.slice(0, 3),
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
NODE
```

This example makes live requests up to Domain's existing caps and may report an access refusal; it does not insert records. Substitute the new module/function after implementation. For a genuinely small first probe, add and test a source-specific page-limit option or use a one-page capture script. Never import `scripts/scrape-rent.ts` for a dry run: it starts the full service on import.

### End-to-end run with persistence

Use Node 20 to match the configured CI runtime. Install dependencies with `npm ci`; for browser sources install Chromium with `npx playwright install chromium` (Linux CI uses `--with-deps`). Configure `DATABASE_URL` for the intended development database. The following commands perform database writes:

```bash
npm run migrate
npm run seed
npm run rates:sync
npm run rent:scrape
npm run rent:aggregate
npm run rent:check-sources
```

On Linux without a display, replace the scrape command with:

```bash
xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" npm run rent:scrape
```

The full scrape attempts every configured source. Inspect `logs/rent-scrape-summary.json` after completion and retain the CI artifact when evaluating runner behavior. Verify saved rows as well as the JSON counters:

```sql
SELECT c.code, l.city, l.source, l.scraped_on,
       COUNT(*) AS listings,
       MIN(l.price_local) AS min_monthly_rent,
       MAX(l.price_local) AS max_monthly_rent
FROM rental_listings l
JOIN countries c ON c.id = l.country_id
WHERE l.scraped_on = CURRENT_DATE
GROUP BY c.code, l.city, l.source, l.scraped_on
ORDER BY c.code, l.city, l.source;
```

Check representative `source_listing_id`, `currency_original`, `price_original`, `price_local`, `bedrooms` and `raw_url` values against the captured page. After aggregation, `GET /api/rent` should include the expected country/city, currency, period and bedroom buckets when usable observations exist.

## Health reporting and troubleshooting

The service reports an outcome per `(countryCode, city, source)` with `raw`, `normalized` and `inserted` counts. The meanings are deliberately different:

| Status | Meaning |
| --- | --- |
| `ok` | Usable normalized listings reached a successful insert attempt and the scraper did not report degradation. Inserted count can be zero on a same-day rerun. |
| `degraded` | Usable records reached persistence, but collection was interrupted. The reason is stored in the outcome's `error` field. |
| `dead` | No records survived normalization, including an empty raw result. A retained degradation reason can still explain why. |
| `error` | Scraping, normalization or persistence threw. Other sources are still attempted for source-level failures. |

Any expected-healthy outcome other than `ok` is a regression. Expected-blocked sources warn; only `ok` puts them in `recovered`. If no source has usable normalized data successfully passed to persistence, the service throws. Missing country/target currency setup can also abort outside the per-source catch.

`rent:scrape` can exit successfully with regressions so surviving data can still be aggregated. The separate `rent:check-sources` command supplies the failing health verdict. A green workflow means the configured healthy expectations passed; it does not mean all sources worked.

The scrape CLI removes the previous summary first and aborts if removal fails. A completed summary is written through a temporary file and rename, with `finishedAt`. The health gate rejects missing, malformed, future-dated or older-than-six-hours summaries. The CLI's short report omits a degraded outcome's reason; inspect the JSON or health-gate output for that detail.

| Symptom | Diagnosis and next check |
| --- | --- |
| First request is 403/429 | Inspect access evidence and runner context; a parser cannot fix a response that lacks listing data. |
| HTTP 200, no cards/payload | Check page title, final URL, body shape and strict payload validation before treating it as an empty search. |
| Many raw records, few normalized | Compare rejected price/currency and rooms values; OLX's structured attributes illustrate how title-only parsing loses usable records. |
| Prices off by roughly 4.33× | Check the source's weekly/monthly rule and avoid converting twice. |
| Unexpected converted prices | Check the `$` default and exchange-rate direction/availability. |
| Repeated page 1 or no new IDs | Inspect final URLs and pagination parameters; test actual overlap plus new listings. |
| Later redirect contains sale listings | Validate city and rental filters before parsing; Flatfy has regression coverage for this case. |
| Positive normalized count, zero inserted | Check same-day unique-key conflicts. Existing observations are ignored, not updated. |
| New source rejected by summary reader | Update `SOURCE_NAMES`, then check summary tests and backend compilation. |
| New city gets wrong/missing data | Check hardcoded source URLs and source-ID conflicts before assuming the target list routes searches. |
| Successful local scrape, failed CI | Compare the same search from the intended runner; retain status/payload evidence and avoid declaring recovery from local results. |
| Fresh scrape fails but API still shows rent | The API reads the latest stored statistics, with no freshness cutoff here. Inspect `period_end` and source-health output. |

## Completion checklist

- [ ] Exact rental scope and pagination verified, including a later page and final URL.
- [ ] Pure parser plus representative fixtures; extracted fields checked through normalization.
- [ ] Stable source ID, canonical URLs and listing IDs implemented and tested.
- [ ] Currency, payment period, room semantics and area units handled explicitly.
- [ ] Bounded transport, deduplication, completion detection, partial-result reporting and cleanup tested.
- [ ] `Source`, `SOURCES_BY_COUNTRY`, `SOURCE_NAMES` and service mocks/expectations updated.
- [ ] Country/target/rates added where needed; multiple-city routing implemented before adding a second city for a country.
- [ ] Rental regression suites and backend compilation pass; affected frontend checks pass if applicable.
- [ ] Live evidence from the intended runner establishes the expected collection result.
- [ ] Saved sample and monthly prices checked; aggregation/API output verified.
- [ ] Summary and health gate evaluated, with any `blocked` expectation supported by documented evidence.
- [ ] Source inventory and operational notes updated.
