# Rent scraper investigation — 2026-09-12

## Production evidence

The [September 7 run](https://github.com/MrMySQL/whereislifecheaper/actions/runs/34103850892) finished successfully, but only the Ukrainian OLX and DOM.RIA sources inserted listings:

| Source | Raw | Normalized | Inserted | Observed result |
| --- | ---: | ---: | ---: | --- |
| OLX | 1,211 | 809 | 766 | Healthy, with substantial parsing loss |
| DOM.RIA | 1,001 | 1,001 | 1,001 | Healthy |
| Flatfy | 0 | 0 | 0 | Empty result after roughly 32 seconds; no DataDome retry diagnostic |
| realestate.com.au | 0 | 0 | 0 | Empty results in both headless and headed browsers |
| Domain | 0 | 0 | 0 | HTTP 403 on page 1 |

The green workflow means sources *expected healthy* passed. It does not mean all five sources worked. Keep the three blocked expectations until a complete scrape succeeds from the production runner.

## Read-only live checks

- OLX: plain HTTP was refused, but the existing Playwright browser received a real page. Embedded `window.__PRERENDERED_STATE__` contains room counts and areas absent from listing titles; title-only extraction loses otherwise usable listings. Promoted/organic tracking parameters also make one listing look like multiple URLs. On the same captured page, the fix raised normalized listings from 39/52 to 52/52 and recovered area for all 52 (previously 8).
- DOM.RIA: the existing live browser returned HTTP 200 with 23 cards; all 23 parsed and normalized with unique URLs. No parser defect was reproduced.
- Flatfy: both plain HTTP and the existing headed browser returned 24 cards locally. This does not establish the cause of the CI refusal. A late-page request returned an unfiltered search with sale listings, requiring search-scope validation. The changed scraper was exercised against page 210 and rejected the unfiltered redirect before accepting its cards. Administrative district extraction also confused microdistrict links with district links.
- Domain: local HTTP returned a full `__NEXT_DATA__` payload. The live payload includes studios with `beds: 1` and studios without a numeric bed count, so property type must take precedence over the bed field. On the same captured page, parsed and normalized listings increased from 17 to 18, with three studios correctly assigned to the zero-bedroom bucket. A full local scrape then collected 37 listings before page 3 returned 403; it now preserves those listings as degraded, not recovered.
- realestate.com.au: HTTP and the existing browser returned 429 with `x-kpsdk-*` headers. This is a Kasada refusal, not an empty rental search. Parser changes cannot establish recovery while the server refuses the page.

## Remaining operational verification

After release, inspect the next runner's per-source summary. Flatfy needs the exact status, final URL, and page title of its refused/unrecognized response. Domain needs an authorized execution environment/egress that receives the listing payload. realestate.com.au needs an authorized access path that does not receive the Kasada refusal. Local parser tests and local successful pages do not prove any of those production access issues resolved.

No production database writes, workflow dispatch, or deployment were performed during this investigation.

## Changes and regression coverage

The source fixes include OLX structured attributes and URL deduplication, Domain studio classification, Flatfy district/scope validation, and preservation of partial listings after HTTP/navigation failures. Australian scrapers now reject missing or malformed search payloads instead of interpreting protection stubs as empty results. Source-health reporting retains the refusal reason through normalization and describes partial regressions accurately.

Follow-up PR review hardened HTTP 200 empty-page handling: an unverified zero-card page is a failure and preserves an existing sample as degraded. Flatfy also rejects redirects that drop or change the requested page number. Realestate.com.au strict parsing rejects a nonempty search result that produces no usable listings while still accepting an explicitly empty result array.

Regression fixtures include reduced examples from the captured OLX and Domain pages. CLI tests invoke the repository's installed ts-node directly, avoiding package resolution/network access from temporary working directories.

Final verification: 135 tests passed across 17 suites covering rent parsers, scrapers, normalization, aggregation, source reporting, CLI health checks and the rent API. `npm run build` passed (backend and frontend); existing frontend Browserslist/chunk-size warnings remain. Independent reviews found no substantive introduced issue.

## GitHub Actions follow-up

Runner evidence showed continued OLX normalization loss despite the initial parser fix (1,214 raw / 959 normalized in the superseded verification run). A bounded live comparison of original navigation response HTML against the hydrated DOM confirmed that OLX removes its metadata script during hydration. On the same page-20 capture, response metadata recovery improved normalization from 36/52 to 51/52 and area coverage from 6/52 to 52/52. The remaining listing specifies `5+ кімнат` and remains excluded because its exact bedroom count is unknown.

The scraper now retains room/area metadata from the original response while reading cards, prices, and empty-result evidence from the current DOM. Metadata is matched by canonical listing URL, and original response data cannot turn a missing live card page into a successful sample. The weekly Actions workflow also builds the backend and runs the rent regression suite before scraping.
