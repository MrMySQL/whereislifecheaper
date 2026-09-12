# REWE on GitHub Actions — 2026-09-12

## Previous finding

PR #45 repaired REWE's postcode-first delivery market chooser and verified
13,027 products across all 15 categories locally on September 6. The chooser
must select Lieferservice for 10115 and confirm DELIVERY/240557 through the
market configuration endpoint. That fix is already on main.

## Current CI failure

The September 10 run (34452129146) hit REWE's branded Cloudflare interstitial.
Its screenshot still showed an unchecked verification widget when the scraper
logged "Cloudflare challenge solved (URL redirect detected)". Cloudflare retains
`/shop/` in the address bar, so that URL cannot prove the shop loaded. The next
postcode-field wait timed out; the run saved zero products.

A live browser inspection found that both the challenge iframe and its checkbox
are behind closed shadow roots. Ordinary Playwright selectors cannot locate
these nodes. The browser's frame list exposes the challenge frame, and Chromium
CDP exposes the checkbox's rendered box. Frame-relative checkbox coordinates
must be offset by the iframe's page-relative bounding box.

## Changes and validation

- Discover Cloudflare frames through `page.frames()`.
- Use a Chromium DOM fallback for checkboxes inside closed shadow roots.
- Remove URL-based challenge-success detection.
- Regression tests cover an unchanged challenge URL, hidden iframe, and nested
  closed-shadow checkbox coordinates. All 57 REWE/base/deadline tests pass.
- Full clean-checkout Jest suite: 494 passed, 34 skipped (`--forceExit` is
  needed for existing open test handles). Backend TypeScript compilation passes.
- A real Chromium fixture with nested closed shadow roots confirmed that the
  CDP fallback clicks the rendered checkbox at the correct page position.
- A local existing-session smoke test returned 320 priced Tierbedarf products.
- A fresh local profile selected Berlin delivery and returned 321 priced
  Tierbedarf products in 36 seconds, with no errors. Counts can vary with the
  live catalog and recommendations.

## Connection comparison

The repository still has a `SCRAPER_PROXY_URL` secret, but the daily workflow
had stopped passing it after configuration changed to a per-store JSON map.
A test mapped that existing secret to REWE only. Actions run 34661475102
confirmed a Webshare connection and checkbox clicks, but Cloudflare remained
active and zero products were saved. The old proxy is not a demonstrated fix.

Direct-runner comparison: run 34661707198, same challenge-handler code with the
proxy mapping removed. **Succeeded: 13,047 products stored across all 15
categories, 142 listing pages, zero failed products, zero errors, 24 minutes
13 seconds.** The log confirms the initial Cloudflare challenge was solved on
the first attempt after the closed-shadow checkbox click, followed by delivery
market 240557 for 10115. This was a real challenged hosted-runner session, not
merely a run that happened to avoid Cloudflare.

The experimental legacy-proxy wiring was removed. The final fix uses the
existing direct GitHub runner connection and requires no new secret or runner.

- [Successful Actions run](https://github.com/MrMySQL/whereislifecheaper/actions/runs/34661707198)
- [Fix PR #49](https://github.com/MrMySQL/whereislifecheaper/pull/49)

The fix is on the PR branch; scheduled runs on main receive it after merge.

## Commands

```sh
DATABASE_URL=postgresql://localhost/rewe_test npm test -- --runInBand --runTestsByPath \
  src/scrapers/germany/__tests__/ReweScraper.marketSelection.test.ts \
  src/scrapers/__tests__/BaseScraper.categoryErrors.test.ts \
  src/services/__tests__/ScraperService.deadline.test.ts
npm run build:backend

# Read-only live smoke test; does not save products to the database.
DATABASE_URL=postgresql://localhost/rewe_test PLAYWRIGHT_HEADLESS=false \
  npm run scraper:test -- ReweScraper tierbedarf
```
