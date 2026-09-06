/**
 * Wall-clock budget for a single scraper when neither SCRAPER_DEADLINE_MS nor
 * a registry override says otherwise.
 *
 * Without this, one scraper that never returns holds the whole run open until
 * the CI job is killed — which is exactly what Woolworths did from 2026-04-28
 * to 2026-08-01, costing 33 consecutive runs. The default leaves room for the
 * slowest healthy scraper (Voli, ~28 min on the 2026-08-01 run) with margin.
 *
 * Lives in its own module so the registry, which declares per-scraper
 * overrides against this number, and its tests can read it without pulling in
 * ScraperService and everything behind it.
 */
export const FALLBACK_SCRAPER_DEADLINE_MS = 45 * 60 * 1000;
