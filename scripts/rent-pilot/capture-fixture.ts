// Throwaway helper: launch Playwright, load a URL, dump page HTML to disk.
// Usage: ts-node scripts/rent-pilot/capture-fixture.ts <url> <outfile>
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

async function main() {
  const [, , url, outFile] = process.argv;
  if (!url || !outFile) {
    console.error('Usage: capture-fixture.ts <url> <outFile>');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      locale: 'uk-UA',
    });
    const page = await context.newPage();
    console.log(`Loading ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const html = await page.content();
    writeFileSync(outFile, html, 'utf-8');
    console.log(`Wrote ${html.length} bytes to ${outFile}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
