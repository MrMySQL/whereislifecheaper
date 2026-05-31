import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scrapeOlx } from './scrape-olx';
import { scrapeDomria } from './scrape-domria';
import { loadRatesToEur, buildUsdConverter, normalizeListing } from './normalize';
import { aggregate } from './aggregate';
import { renderReport } from './report';
import { NUMBEO_KYIV } from './numbeo-benchmarks';
import { ListingRaw, ListingNormalized } from './types';
import { closePool } from '../../src/config/database';

const DATA_DIR = join(__dirname, 'data');

function writeJson(filename: string, value: unknown) {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(value, null, 2), 'utf-8');
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  console.log('Loading exchange rates from DB...');
  const rates = await loadRatesToEur();
  if (!rates.has('UAH')) {
    throw new Error('UAH rate missing — run `npm run rates:sync` first');
  }
  const toUsd = buildUsdConverter(rates);
  console.log(`Rates loaded: UAH=${rates.get('UAH')}, USD=${rates.get('USD')}`);

  console.log('\n=== Scraping OLX ===');
  const olxRaw: ListingRaw[] = await scrapeOlx();
  writeJson('olx-listings-raw.json', olxRaw);
  console.log(`OLX: collected ${olxRaw.length} raw listings`);

  console.log('\n=== Scraping DOM.RIA ===');
  const domriaRaw: ListingRaw[] = await scrapeDomria();
  writeJson('domria-listings-raw.json', domriaRaw);
  console.log(`DOM.RIA: collected ${domriaRaw.length} raw listings`);

  console.log('\n=== Normalizing ===');
  const all: ListingNormalized[] = [];
  for (const raw of [...olxRaw, ...domriaRaw]) {
    const norm = normalizeListing(raw, toUsd);
    if (norm) all.push(norm);
  }
  writeJson('listings-normalized.json', all);
  console.log(`Normalized: ${all.length} / ${olxRaw.length + domriaRaw.length} listings`);

  console.log('\n=== Aggregating ===');
  const buckets = aggregate(all);
  writeJson('buckets.json', buckets);
  for (const b of buckets) {
    console.log(`  ${b.source} ${b.bedrooms}BR: n=${b.nListings}, median=$${b.medianUsd.toFixed(0)}`);
  }

  console.log('\n=== Generating report ===');
  const md = renderReport(buckets, NUMBEO_KYIV);
  const reportPath = join(DATA_DIR, 'report.md');
  writeFileSync(reportPath, md, 'utf-8');
  console.log(`Report written to: ${reportPath}`);

  await closePool();
}

main().catch((err) => {
  console.error('Pilot failed:', err);
  process.exit(1);
});
