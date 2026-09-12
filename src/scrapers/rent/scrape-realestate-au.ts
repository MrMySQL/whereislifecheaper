import { chromium, Browser, Page } from 'playwright';
import { parseRealestateAuListPage } from './parse-realestate-au';
import { ListingRaw } from './types';
import type { ScrapeResult } from './RentScraperService';

// `%2B` is the '+' joining suburb and state: `in-sydney+nsw`. This read
// `%2Besw` from the first commit onwards - 'esw' is not a state, so the region
// never resolved. Kasada refuses the request before the path matters today,
// but the URL has to be right for any anti-bot work to be worth doing.
const BASE_URL = 'https://www.realestate.com.au/rent/in-sydney%2Bnsw/list-';
const MAX_PAGES = 20;
const TARGET_LISTINGS = 500;
const POLITE_DELAY_MS = 2500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collect(headless: boolean): Promise<ScrapeResult> {
  const browser: Browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const collected: ListingRaw[] = [];
  const seen = new Set<string>();
  let degraded: string | undefined;

  try {
    const context = await browser.newContext({
      locale: 'en-AU',
      timezoneId: 'Australia/Sydney',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page: Page = await context.newPage();

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = `${BASE_URL}${pageNum}`;
      console.log(`[realestateau] fetching page ${pageNum}: ${url}`);
      let pageListings: ListingRaw[];
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (!response) throw new Error('navigation returned no response');
        if (!response.ok()) throw new Error(`returned HTTP ${response.status()}`);
        await page.waitForTimeout(3000);
        pageListings = parseRealestateAuListPage(await page.content(), true);
      } catch (error) {
        const message = `[realestateau] page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`;
        if (collected.length === 0) throw new Error(message);
        degraded = `${message} after ${collected.length} listings; sample is partial`;
        console.warn(degraded);
        break;
      }
      console.log(`[realestateau] page ${pageNum}: ${pageListings.length} listings`);
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
  } finally {
    await browser.close();
  }

  return { listings: collected, degraded };
}

export async function scrapeRealestateAu(): Promise<ScrapeResult> {
  const forceHeaded = process.env.RENT_SCRAPER_HEADED === 'true';
  const result = await collect(!forceHeaded);
  if (result.listings.length > 0 || forceHeaded || process.env.RENT_SCRAPER_DISABLE_HEADED_FALLBACK === 'true') {
    return result;
  }
  console.warn('[realestateau] no listings in headless mode; retrying headed');
  return collect(false);
}
