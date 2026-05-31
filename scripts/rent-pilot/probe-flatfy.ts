import { chromium, Browser } from 'playwright';
import { parseFlatfyListPage, isDataDomeWall } from './parse-flatfy';

const BASE_URL =
  'https://flatfy.ua/uk/search?geo_id=10009580&section_id=2&page=';
const CARD_SELECTOR = 'article.realty-preview';

// Probe a spread of pages to see where pagination ends / repeats.
const PAGES = [1, 2, 10, 20, 30, 38, 39, 40, 41, 45, 50, 60];

async function main() {
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
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  const firstIdsByPage = new Map<number, string>();

  for (const p of PAGES) {
    const url = BASE_URL + p;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForSelector(CARD_SELECTOR, { timeout: 20000 });
    } catch {
      /* no cards */
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    const html = await page.content();
    const wall = isDataDomeWall(html);
    const listings = parseFlatfyListPage(html);
    const firstId = listings[0]?.url ?? '(none)';
    firstIdsByPage.set(p, firstId);

    // Try to read the headline total-count text flatfy shows.
    const countText = await page
      .locator('text=/\\d[\\d\\s ]*(оголошен|пропозиц|кварт|об.яв)/i')
      .first()
      .textContent()
      .catch(() => null);

    console.log(
      `page ${String(p).padStart(2)}: cards=${String(listings.length).padStart(3)} ` +
        `wall=${wall} firstUrl=${firstId} ${countText ? `| total="${countText.trim()}"` : ''}`,
    );

    await page.waitForTimeout(1500);
  }

  // Report which pages share the same first listing (i.e. repeat).
  const seen = new Map<string, number>();
  for (const [p, id] of firstIdsByPage) {
    if (seen.has(id) && id !== '(none)') {
      console.log(`  ⚠ page ${p} repeats page ${seen.get(id)} (same first listing)`);
    } else {
      seen.set(id, p);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
