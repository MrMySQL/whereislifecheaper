# Australia Rent Scrapers Decisions

Date: 2026-06-01

## Decisions

- Added Australia as a rent ingestion target for Sydney, using the existing one-primary-city-per-country rent model. Sydney was chosen as the largest Australian rental market and the closest analogue to the existing Kyiv target.
- Chose `realestate.com.au` and `domain.com.au` as the two Australian rental portals. Current public traffic rankings place `realestate.com.au` first and `domain.com.au` second among Australian real-estate sites.
- Used Playwright-based scrapers for both portals. Plain `curl` requests returned edge access-denied responses, while a real browser exposed usable page state.
- Parsed structured in-page state instead of visible card text: Domain from `#__NEXT_DATA__`, realestate.com.au from `window.ArgonautExchange`.
- Treated bare `$` prices from Australian sources as AUD. Bare `$` remains USD for the existing Ukrainian sources unless a caller opts into another default.
- Kept source failures isolated. If one protected portal fails, the rent job continues with remaining sources and only fails when no configured source yields usable normalized listings.
- Kept the existing public API shape. `GET /api/rent` already groups latest stats by country and city, so Australia will appear automatically after scrape and aggregate jobs populate stats.

## Anti-Bot Notes

- Both Australian portals blocked direct `curl` fetches from the local environment.
- Browser navigation succeeded for both portals during selector reconnaissance.
- The new scrapers run headless first and retry headed when a page yields zero parsed listings. Set `RENT_SCRAPER_HEADED=true` to force headed mode, or `RENT_SCRAPER_DISABLE_HEADED_FALLBACK=true` to avoid headed fallback.

## Correction (2026-09-01)

The "both portals block us" conclusion above was half wrong, and the note that
`curl` was blocked is what made it look right.

- `domain.com.au` was never blocking the scraper. A bare `curl` gets a 403, but
  a plain request carrying browser headers (`Accept-Language`, `Sec-Fetch-*`,
  client hints) gets a 200 with the complete `__NEXT_DATA__` payload. What was
  actually failing was Playwright: `#__NEXT_DATA__` never appeared in the page
  it fetched, headless or headed under xvfb, so the parser - which was correct
  all along - had nothing to read. `scrape-domain-au.ts` now fetches over plain
  HTTP and the source is marked `healthy`.
- `realestate.com.au` is genuinely walled: the 429 carries Kasada `x-kpsdk-*`
  headers, and no header set alone gets past it. It stays `blocked`.
- Its list URL also read `in-sydney%2Besw` ('esw' is not a state) from the first
  commit onwards, so the region never resolved. Fixed to `%2Bnsw`.
- The headless-first/headed-fallback behaviour and the `RENT_SCRAPER_HEADED` /
  `RENT_SCRAPER_DISABLE_HEADED_FALLBACK` env vars now apply only to
  `realestate.com.au`; the Domain scraper no longer starts a browser.

Lesson: a `curl` 403 says nothing about what the browser-based scraper is
getting. The scrapers logged listing counts but never the HTTP status, so a
guess about the cause sat in a code comment for three months.
