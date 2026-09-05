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
  HTTP, which yields ~150 Sydney listings from a residential IP.
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

### The CI 403: two wrong answers before the right one

The CI 403 got explained twice before it got measured properly. Both
explanations were plausible, fit every fact then available, and were wrong.

**Wrong answer 1 - "Akamai blocks the Azure IP range."** Fit the symptom
exactly, but was pure inference from *who owns the address*, with no test.

**Wrong answer 2 - "Node 20 omits Brotli."** Bisecting headers locally showed
one header really does decide the response:

| Accept-Encoding | Result (residential IP) |
|---|---|
| `gzip, deflate, br` | 200, full payload |
| `gzip, deflate` (curl `--compressed` alone) | 403 |
| absent | 403 |

That finding is real and reproducible. The inference drawn from it was not:
Node 26 sends `br, gzip, deflate, zstd`, so the CI failure was blamed on Node 20
sending no `br`. Nobody checked what Node 20 actually sends. It sends
`br, gzip, deflate` - Brotli was never missing in CI, and pinning the header
changed nothing there.

**What the measurement showed.** A probe running both HTTP clients from one
runner (egress `20.115.95.135`, AS8075 Microsoft, US):

| Client, from the runner | Result |
|---|---|
| curl over HTTP/2, full headers | 200 - but a 2,729-byte stub, no `__NEXT_DATA__` |
| curl over HTTP/1.1, full headers | 403 |
| Node `fetch`, pinned headers | 403 |
| *(same code, residential IP)* | *200, ~1.3 MB, 227 listings* |

No client gets the real page from that egress, and every client gets it from a
residential one. So it is the egress after all - wrong answer 1 was right by
accident, having been believed for a bad reason before any evidence existed.
No change to the scraper can fix this; it needs a non-datacenter egress.
`scripts/check-domain-egress.sh` tests any candidate host. It passes both
`--compressed` and an explicit `-H 'Accept-Encoding: gzip, deflate, br'`, and
needs both: the explicit header wins on the wire (curl sends exactly it), while
`--compressed` only tells curl to decompress the reply so the `grep` for
`__NEXT_DATA__` sees markup instead of Brotli bytes. Dropping the explicit
header and leaving `--compressed` alone is the trap - curl then advertises
`deflate, gzip`, and a perfectly good egress reports as a 403.

Railway was the obvious candidate to test and was not tested: `railway ssh` and
`railway sandbox create` were both blocked by the local permission policy, and
the project's Railway footprint is a Postgres/PGBouncer pair with no app service
to borrow. Railway runs on GCP, another datacenter ASN, so the prior is poor -
but that is a prediction, not a result, and it is exactly the kind of prediction
this file now has a bad track record of trusting.

Standing lesson across all three rounds: every wrong answer here came from
reasoning about a *cause* that was never measured - what curl proves about
Playwright, what Node 26 proves about Node 20, what an ASN proves about a
request. The probe that ran both clients from one runner took one CI run and
ended the argument.
