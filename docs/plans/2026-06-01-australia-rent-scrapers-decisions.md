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
