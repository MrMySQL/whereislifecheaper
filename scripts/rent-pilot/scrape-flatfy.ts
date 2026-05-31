import { chromium, Browser } from 'playwright';
import { parseFlatfyListPage, isDataDomeWall } from './parse-flatfy';
import { ListingRaw } from './types';

const BASE_URL =
  'https://flatfy.ua/uk/search?geo_id=10009580&section_id=2&page=';

const CARD_SELECTOR = 'article.realty-preview';
const TARGET_LISTINGS = 1500;
const MAX_PAGES = 50;

export async function scrapeFlatfy(): Promise<ListingRaw[]> {
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

  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = BASE_URL + p;
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

    const html = await page.content();

    if (isDataDomeWall(html)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[scrape-flatfy] DataDome wall detected on page ${p} (${url}); stopping.`
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
    if (added === 0) break;

    if (all.length >= TARGET_LISTINGS) break;

    await page.waitForTimeout(2000 + Math.floor(Math.random() * 1500));
  }

  await browser.close();
  return all;
}
