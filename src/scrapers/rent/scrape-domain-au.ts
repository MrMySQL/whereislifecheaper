import { parseDomainAuListPage } from './parse-domain-au';
import { ListingRaw } from './types';

const BASE_URL = 'https://www.domain.com.au/rent/sydney-nsw-2000/?page=';
const MAX_PAGES = 25;
const TARGET_LISTINGS = 500;
const POLITE_DELAY_MS = 2500;

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
 * `Accept-Encoding` is the load-bearing one, and it is set explicitly rather
 * than left to the runtime on purpose. Akamai wants Brotli advertised, the way
 * a real Chrome does: `gzip, deflate, br` is served, plain `gzip, deflate` is
 * refused with a 403. Node's own default differs by version - Node 26 sends
 * `br, gzip, deflate, zstd` and works, Node 20 (what CI runs) does not include
 * `br` and got the 403 that first looked like the runner's IP being blocked.
 * Pinning it here makes the request identical on every Node. undici still
 * decompresses the response when the header is set by hand.
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

export async function scrapeDomainAu(): Promise<ListingRaw[]> {
  const collected: ListingRaw[] = [];
  const seen = new Set<string>();

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}${pageNum}`;
    console.log(`[domainau] fetching page ${pageNum}: ${url}`);

    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
      // The status is the entire diagnosis of a block, and returning [] here
      // would reach the summary as "0 raw" - the same thing a page that simply
      // parsed to nothing looks like. Once some pages are in hand, though, a
      // refusal is a reason to stop rather than to throw away real listings.
      const message = `[domainau] page ${pageNum} returned HTTP ${response.status}`;
      if (collected.length === 0) throw new Error(message);
      console.warn(`${message}; keeping the ${collected.length} listings already collected`);
      break;
    }

    const pageListings = parseDomainAuListPage(await response.text());
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

  return collected;
}
