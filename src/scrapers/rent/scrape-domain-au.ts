import { chromium, Browser, Page } from 'playwright';
import { parseDomainAuListPage } from './parse-domain-au';
import { ListingRaw } from './types';

const BASE_URL = 'https://www.domain.com.au/rent/sydney-nsw-2000/?page=';
const MAX_PAGES = 25;
const TARGET_LISTINGS = 500;
const POLITE_DELAY_MS = 2500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collect(headless: boolean): Promise<ListingRaw[]> {
  const browser: Browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const collected: ListingRaw[] = [];
  const seen = new Set<string>();

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
      console.log(`[domainau] fetching page ${pageNum}: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('#__NEXT_DATA__', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);

      const pageListings = parseDomainAuListPage(await page.content());
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
  } finally {
    await browser.close();
  }

  return collected;
}

export async function scrapeDomainAu(): Promise<ListingRaw[]> {
  const forceHeaded = process.env.RENT_SCRAPER_HEADED === 'true';
  const listings = await collect(!forceHeaded);
  if (listings.length > 0 || forceHeaded || process.env.RENT_SCRAPER_DISABLE_HEADED_FALLBACK === 'true') {
    return listings;
  }
  console.warn('[domainau] no listings in headless mode; retrying headed');
  return collect(false);
}
