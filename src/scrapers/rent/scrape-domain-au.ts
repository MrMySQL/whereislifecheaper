import { parseDomainAuListPage } from './parse-domain-au';
import type { ScrapeResult } from './RentScraperService';
import { ListingRaw } from './types';

const BASE_URL = 'https://www.domain.com.au/rent/sydney-nsw-2000/?page=';
const MAX_PAGES = 25;
const TARGET_LISTINGS = 500;
const POLITE_DELAY_MS = 2500;
/**
 * Matches the navigation timeout the Playwright version used. `fetch` has no
 * timeout of its own, so without this a stalled connection would hang the whole
 * rent run against the job's 180-minute cap instead of failing this one source
 * and letting the others finish.
 */
const REQUEST_TIMEOUT_MS = 60000;

/**
 * domain.com.au is fetched over plain HTTP, not through Playwright.
 *
 * The site serves the complete `__NEXT_DATA__` payload to a request carrying
 * these headers, but returns nothing usable to a Playwright-driven Chromium -
 * `#__NEXT_DATA__` never appears, headless or headed under xvfb. That is what
 * made this source look permanently walled off: the parser was always correct,
 * and the browser was the thing being refused.
 *
 * A bare request (no Accept-Language, no Sec-Fetch-*, no client hints) gets a
 * 403, so these headers are load-bearing rather than decorative.
 *
 * `Accept-Encoding` must advertise Brotli, the way a real Chrome does:
 * `gzip, deflate, br` is served, plain `gzip, deflate` is refused with a 403.
 * It is pinned here rather than inherited so the
 * request cannot change under us with a Node upgrade; every Node we run today
 * already defaults to including `br`, so this is insurance, not the fix for
 * anything. undici still decompresses when the header is set by hand.
 *
 * None of this gets the page from a datacenter IP - see the note in
 * RentScraperService on why AU/domainau is still marked blocked.
 */
export const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Chromium";v="120", "Not(A:Brand";v="24", "Google Chrome";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeDomainAu(): Promise<ScrapeResult> {
  const collected: ListingRaw[] = [];
  const seen = new Set<string>();
  let degraded: string | undefined;

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}${pageNum}`;
    console.log(`[domainau] fetching page ${pageNum}: ${url}`);

    let pageListings: ListingRaw[];
    try {
      const response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`returned HTTP ${response.status}`);
      // HTTP 200 can still be a protection stub. Only a valid search payload
      // can establish that pagination reached an empty results page.
      pageListings = parseDomainAuListPage(await response.text(), true);
    } catch (error) {
      const message = `[domainau] page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`;
      if (collected.length === 0) throw new Error(message);
      degraded = `${message} after ${collected.length} listings; sample is partial`;
      console.warn(degraded);
      break;
    }

    console.log(`[domainau] page ${pageNum}: ${pageListings.length} listings`);
    if (pageListings.length === 0) break;

    let newCount = 0;
    for (const listing of pageListings) {
      if (seen.has(listing.url)) continue;
      seen.add(listing.url);
      collected.push(listing);
      newCount++;
    }
    if (newCount === 0 || collected.length >= TARGET_LISTINGS) break;
    await sleep(POLITE_DELAY_MS);
  }

  return { listings: collected, degraded };
}
