import { chromium, Browser } from 'playwright';
import { parseFlatfyListPage, isDataDomeWall } from './parse-flatfy';
import { ListingRaw } from './types';

const BASE_URL =
  'https://flatfy.ua/uk/search?geo_id=10009580&section_id=2&page=';

const CARD_SELECTOR = 'article.realty-preview';
const TARGET_LISTINGS = 5000;
const MAX_PAGES = 210; // flatfy serves 24/page, so ~210 pages ≈ 5000 listings.

// DataDome recovery: instead of bailing on the first wall, pause and retry the
// same page a few times (reloading usually clears a soft block). Only give up
// after WALL_RETRIES failed attempts on the same page.
const WALL_RETRIES = 4;
const WALL_BACKOFF_MS = 20000; // grows linearly per retry: 20s, 40s, 60s, ...

// How many consecutive all-duplicate pages to tolerate before treating it as the
// end of pagination. Must be generous enough to page through the overlap when
// resuming a prior run (listings shift between pages over time, so the seam of
// already-seen pages can span several pages). Real end-of-data is detected
// separately by an empty page, so a high value only costs at the resume seam.
const ZERO_ADD_TOLERANCE = 12;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ScrapeFlatfyOptions {
  /** First page to fetch (1-based). Use to resume a previous run. Default 1. */
  startPage?: number;
  /** Already-collected listings to seed dedup + the result, so a resumed run
   *  appends instead of restarting. Their URLs are pre-marked as seen. */
  seed?: ListingRaw[];
}

export async function scrapeFlatfy(
  opts: ScrapeFlatfyOptions = {},
): Promise<ListingRaw[]> {
  const startPage = Math.max(1, opts.startPage ?? 1);
  // Headed Chromium is required to bypass flatfy.ua's DataDome protection.
  const browser: Browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    locale: 'uk-UA',
    timezoneId: 'Europe/Kiev',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });

  // Hide the automation flag DataDome looks for.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  const seen = new Set<string>();
  const all: ListingRaw[] = [];
  let zeroAddStreak = 0;

  // Seed from a prior run so we append new listings and skip ones we already have.
  for (const l of opts.seed ?? []) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    all.push(l);
  }
  if (startPage > 1 || all.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[scrape-flatfy] resuming from page ${startPage} with ${all.length} seeded listings`,
    );
  }

  for (let p = startPage; p <= MAX_PAGES; p++) {
    const url = BASE_URL + p;

    // Fetch the page, recovering from DataDome walls by pausing and retrying.
    let html = '';
    let walled = false;
    for (let attempt = 0; attempt <= WALL_RETRIES; attempt++) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Wait for the React-rendered listing cards to appear.
      try {
        await page.waitForSelector(CARD_SELECTOR, { timeout: 30000 });
      } catch {
        // No cards rendered — could be the DataDome wall or an empty page.
      }

      // Nudge any lazy-loaded content.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);

      html = await page.content();

      if (!isDataDomeWall(html)) {
        walled = false;
        break;
      }

      walled = true;
      if (attempt < WALL_RETRIES) {
        const backoff = WALL_BACKOFF_MS * (attempt + 1);
        // eslint-disable-next-line no-console
        console.warn(
          `[scrape-flatfy] DataDome wall on page ${p} (attempt ${attempt + 1}/` +
            `${WALL_RETRIES}); backing off ${backoff / 1000}s and retrying.`
        );
        await sleep(backoff);
      }
    }

    if (walled) {
      // eslint-disable-next-line no-console
      console.warn(
        `[scrape-flatfy] DataDome wall persisted on page ${p} after ` +
          `${WALL_RETRIES} retries; stopping with ${all.length} listings.`
      );
      break;
    }

    const listings = parseFlatfyListPage(html);
    if (listings.length === 0) break;

    let added = 0;
    for (const l of listings) {
      if (seen.has(l.url)) continue;
      seen.add(l.url);
      all.push(l);
      added++;
    }
    // A single all-duplicate page can happen at a resume boundary or when
    // listings shift between pages, so only treat it as the end of pagination
    // after two consecutive zero-add pages.
    if (added === 0) {
      zeroAddStreak++;
      if (zeroAddStreak >= ZERO_ADD_TOLERANCE) break;
    } else {
      zeroAddStreak = 0;
    }

    if (all.length >= TARGET_LISTINGS) break;

    if (p % 10 === 0) {
      // eslint-disable-next-line no-console
      console.log(`[scrape-flatfy] page ${p}: ${all.length} listings so far`);
    }

    // Slower, jittered pacing to stay under DataDome's rate threshold.
    await page.waitForTimeout(3500 + Math.floor(Math.random() * 2500));
  }

  await browser.close();
  return all;
}
