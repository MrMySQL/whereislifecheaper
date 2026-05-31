# Rent Pilot — Kyiv (Throwaway Validation)

Validates whether scraping classifieds (OLX.ua + DOM.RIA, plus flatfy.ua — see below, currently blocked by DataDome) produces a representative median rent figure for Kyiv apartments. Output decides whether to build the production rent feature described in `docs/superpowers/specs/2026-05-31-real-estate-rent-design.md`.

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

Both sites change their DOM occasionally. If a parser test fails or the scraper returns empty pages:

1. Re-capture the fixture using the helper:
   ```bash
   npx ts-node scripts/rent-pilot/capture-fixture.ts \
     'https://www.olx.ua/uk/nedvizhimost/arenda-kvartir/kiev/?currency=UAH' \
     scripts/rent-pilot/__tests__/fixtures/olx-list-page.html
   ```
   (Same idea for DOM.RIA with its URL.)
2. Adjust the selector constants at the top of `parse-olx.ts` or `parse-domria.ts`.
3. Re-run the parser tests, then re-run the pilot.

## Pass criteria

See spec section 2 — pass requires both:

- OLX vs DOM.RIA medians within ~15% for each bucket with ≥30 listings.
- Both sources within ~20% of Numbeo's blended (centre+outside) figure for 1BR and 3BR.

## flatfy.ua source (⚠️ blocked by DataDome)

`scrape-flatfy.ts` + `parse-flatfy.ts` add a third source: flatfy.ua Kyiv long-term rent (`geo_id=10009580&section_id=2`). It is wired into `run.ts` exactly like OLX/DOM.RIA (returns `ListingRaw[]`, normalized/aggregated/CSV'd through the shared pipeline).

**flatfy.ua sits behind DataDome.** Both the page and its `/api/realties` JSON endpoint return a `geo.captcha-delivery.com` CAPTCHA wall to headless Chromium — confirmed even with fingerprint hardening and an in-context fetch carrying the DataDome cookie. `scrape-flatfy.ts` detects this wall (`isDataDomeWall`), logs a clear "blocked by DataDome" warning, and returns 0 listings rather than pretending the page was empty.

To actually collect flatfy data you need a CAPTCHA-cleared session — e.g. a residential-proxy + CAPTCHA-solver service supplying a valid `datadome` cookie to the Playwright context. Once you can reach a real list page, capture a fixture with `capture-fixture.ts` and tighten the selectors in `parse-flatfy.ts`, which are currently **provisional** (validated only against a synthetic fixture, `__tests__/fixtures/flatfy-list-page.html`, never real flatfy HTML).
