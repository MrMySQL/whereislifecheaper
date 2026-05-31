import { chromium, Browser, Page } from 'playwright';
import { parseOlxListPage } from './parse-olx';
import { ListingRaw } from './types';

// Use the canonical category path. The legacy `arenda-kvartir/kiev/` URL
// 301-redirects and strips the `page=` param, so every page request returned
// page 1.
const BASE_URL =
  'https://www.olx.ua/uk/nedvizhimost/kvartiry/dolgosrochnaya-arenda-kvartir/kiev/?currency=UAH&page=';
const MAX_PAGES = 25;
const TARGET_LISTINGS = 1500;
const POLITE_DELAY_MS = 2500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeOlx(): Promise<ListingRaw[]> {
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
      console.log(`[olx] fetching page ${pageNum}: ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page
        .waitForSelector('[data-cy="l-card"]', { timeout: 15000 })
        .catch(() => {});

      const html = await page.content();
      const pageListings = parseOlxListPage(html);
      console.log(`[olx] page ${pageNum}: ${pageListings.length} listings`);

      if (pageListings.length === 0) {
        console.log('[olx] empty page, stopping pagination');
        break;
      }
      // Dedup safety net: skip URLs we've already seen, in case OLX serves
      // a repeat of an earlier page or a session-pinned promoted card.
      const seen = new Set(collected.map((l) => l.url));
      let newCount = 0;
      for (const l of pageListings) {
        if (!seen.has(l.url)) {
          collected.push(l);
          newCount++;
        }
      }
      console.log(`[olx] page ${pageNum}: ${newCount} new (deduped)`);
      if (newCount === 0) {
        console.log('[olx] entire page was duplicates, stopping');
        break;
      }

      if (collected.length >= TARGET_LISTINGS) {
        console.log(`[olx] reached target of ${TARGET_LISTINGS}, stopping`);
        break;
      }

      await sleep(POLITE_DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  return collected;
}
