// Debug script: fetch OLX pages 1, 2, 5, 10 and compare the listing URLs each returns.
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

const URLS = [
  { label: 'canonical page=1', url: 'https://www.olx.ua/uk/nedvizhimost/kvartiry/dolgosrochnaya-arenda-kvartir/kiev/?page=1' },
  { label: 'canonical page=2', url: 'https://www.olx.ua/uk/nedvizhimost/kvartiry/dolgosrochnaya-arenda-kvartir/kiev/?page=2' },
  { label: 'canonical page=5', url: 'https://www.olx.ua/uk/nedvizhimost/kvartiry/dolgosrochnaya-arenda-kvartir/kiev/?page=5' },
  { label: 'canonical page=25', url: 'https://www.olx.ua/uk/nedvizhimost/kvartiry/dolgosrochnaya-arenda-kvartir/kiev/?page=25' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    locale: 'uk-UA',
  });
  const page = await context.newPage();

  try {
    for (const { label, url } of URLS) {
      console.log(`\n=== ${label}: ${url}`);
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`  HTTP ${resp?.status()} → final URL: ${page.url()}`);
      await page.waitForSelector('[data-cy="l-card"]', { timeout: 15000 }).catch(() => {});

      const html = await page.content();
      const $ = cheerio.load(html);
      const cards = $('[data-cy="l-card"]');
      const ids: string[] = [];
      cards.each((_, el) => {
        const href = $(el).find('a[href]').first().attr('href') ?? '';
        const m = href.match(/-ID([a-zA-Z0-9]+)\.html/);
        if (m) ids.push(m[1]);
      });
      console.log(`  cards=${cards.length}, unique IDs=${new Set(ids).size}`);
      console.log(`  first 5 IDs: ${ids.slice(0, 5).join(',')}`);

      // Look for pagination link patterns OLX actually uses
      const paginationLinks = $('a[href*="page="], a[href*="?p="], [data-testid="pagination-list"] a').slice(0, 5);
      const paginationSamples: string[] = [];
      paginationLinks.each((_, el) => {
        const href = $(el).attr('href');
        if (href) paginationSamples.push(href);
      });
      if (paginationSamples.length) {
        console.log(`  pagination links seen: ${paginationSamples.join(' | ')}`);
      } else {
        console.log(`  no pagination links found`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
