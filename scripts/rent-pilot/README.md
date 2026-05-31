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
