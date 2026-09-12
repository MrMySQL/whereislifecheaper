import { chromium, Browser, Page } from 'playwright';
import { parseDomriaListPage } from './parse-domria';
import { ListingRaw } from './types';
import type { ScrapeResult } from './RentScraperService';

const BASE_URL = 'https://dom.ria.com/uk/arenda-kvartir/kiev/?page=';
const MAX_PAGES = 50;
const TARGET_LISTINGS = 1500;
const POLITE_DELAY_MS = 2500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeDomria(): Promise<ScrapeResult> {
  const browser: Browser = await chromium.launch({ headless: true });
  const collected: ListingRaw[] = [];
  let degraded: string | undefined;

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      locale: 'uk-UA',
    });
    const page: Page = await context.newPage();

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = `${BASE_URL}${pageNum}`;
      console.log(`[domria] fetching page ${pageNum}: ${url}`);

      let pageListings: ListingRaw[];
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (response && response.status() >= 400) {
          throw new Error(`HTTP ${response.status()}`);
        }
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

        const html = await page.content();
        pageListings = parseDomriaListPage(html);
      } catch (error) {
        const message = `[domria] page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`;
        if (collected.length === 0) throw new Error(message);
        degraded = `${message} after ${collected.length} listings; sample is partial`;
        console.warn(degraded);
        break;
      }
      console.log(`[domria] page ${pageNum}: ${pageListings.length} listings`);

      if (pageListings.length === 0) {
        if (pageNum === 1) throw new Error('[domria] no listings parsed from the first page');
        console.log('[domria] empty page, stopping pagination');
        break;
      }
      const seen = new Set(collected.map((l) => l.url));
      let newCount = 0;
      for (const l of pageListings) {
        if (!seen.has(l.url)) {
          seen.add(l.url);
          collected.push(l);
          newCount++;
        }
      }
      console.log(`[domria] page ${pageNum}: ${newCount} new (deduped)`);
      if (newCount === 0) {
        console.log('[domria] entire page was duplicates, stopping');
        break;
      }

      if (collected.length >= TARGET_LISTINGS) {
        console.log(`[domria] reached target of ${TARGET_LISTINGS}, stopping`);
        break;
      }

      await sleep(POLITE_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  return { listings: collected, degraded };
}
