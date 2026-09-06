import { ScrapeResult } from '../types/scraper.types';

/**
 * Fraction of a scraper's categories that may fail before the run counts as
 * degraded.
 *
 * Set from what the 2026-09-01 and 2026-09-04 runs actually contained: one
 * seasonal Mercadona category returning 410 Gone and one timed-out Arbuz page
 * are noise, while Auchan UA losing all 16 categories to a Cloudflare block is
 * the failure the run summary missed. Anything at or above this is treated as
 * "this scraper did not really run".
 */
export const CATEGORY_FAILURE_THRESHOLD = 0.5;

export interface ScrapeHealth {
  degraded: boolean;
  /** Human-readable reasons, empty when the run is healthy. */
  reasons: string[];
}

/**
 * Decide whether one scraper's result should fail the run.
 *
 * Category counts are absent for scrapers that override scrapeProductList; a
 * result without them is judged on its products and run-level errors alone
 * rather than being assumed healthy or assumed broken.
 */
export function assessScrapeResult(result: ScrapeResult): ScrapeHealth {
  const reasons: string[] = [];

  if (result.productsScraped === 0) {
    reasons.push('stored 0 products');
  }

  for (const error of result.errors) {
    reasons.push(error.message);
  }

  const attempted = result.categoriesAttempted ?? 0;
  const failed = result.categoriesFailed ?? 0;
  if (attempted > 0 && failed / attempted >= CATEGORY_FAILURE_THRESHOLD) {
    reasons.push(`${failed} of ${attempted} categories failed`);
  }

  return { degraded: reasons.length > 0, reasons };
}
