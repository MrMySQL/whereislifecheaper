import { chromium, Browser, Page } from 'playwright';
import { parseDomriaListPage } from './parse-domria';
import { ListingRaw } from './types';

const BASE_URL = 'https://dom.ria.com/uk/arenda-kvartir/kiev/?page=';
const MAX_PAGES = 25;
const TARGET_LISTINGS = 500;
const POLITE_DELAY_MS = 2500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeDomria(): Promise<ListingRaw[]> {
  const browser: Browser = await chromium.launch({ headless: true });
  const collected: ListingRaw[] = [];

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

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

      const html = await page.content();
      const pageListings = parseDomriaListPage(html);
      console.log(`[domria] page ${pageNum}: ${pageListings.length} listings`);

      if (pageListings.length === 0) {
        console.log('[domria] empty page, stopping pagination');
        break;
      }
      collected.push(...pageListings);

      if (collected.length >= TARGET_LISTINGS) {
        console.log(`[domria] reached target of ${TARGET_LISTINGS}, stopping`);
        break;
      }

      await sleep(POLITE_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  return collected;
}
