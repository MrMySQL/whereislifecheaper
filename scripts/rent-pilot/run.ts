import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scrapeOlx } from './scrape-olx';
import { scrapeDomria } from './scrape-domria';
import { scrapeFlatfy } from './scrape-flatfy';
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

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeListingsCsv(
  filename: string,
  normalized: ListingNormalized[],
  rawByUrl: Map<string, ListingRaw>,
) {
  const header = [
    'source',
    'url',
    'price_local',
    'currency',
    'price_usd',
    'bedrooms',
    'sqm',
    'price_per_sqm_usd',
    'district',
    'rooms_text_raw',
    'sqm_text_raw',
    'price_text_raw',
  ];
  const rows = [header.join(',')];
  for (const n of normalized) {
    const raw = rawByUrl.get(n.url);
    const pricePerSqm = n.sqm && n.sqm > 0 ? (n.priceUsd / n.sqm).toFixed(2) : '';
    rows.push(
      [
        n.source,
        n.url,
        n.priceLocal,
        n.currency,
        n.priceUsd.toFixed(2),
        n.bedrooms,
        n.sqm ?? '',
        pricePerSqm,
        n.district ?? '',
        raw?.roomsText ?? '',
        raw?.sqmText ?? '',
        raw?.priceText ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  writeFileSync(join(DATA_DIR, filename), rows.join('\n') + '\n', 'utf-8');
}

function writeRawCsv(filename: string, raw: ListingRaw[]) {
  const header = [
    'source',
    'url',
    'price_text',
    'rooms_text',
    'sqm_text',
    'district',
    'listed_at_text',
  ];
  const rows = [header.join(',')];
  for (const r of raw) {
    rows.push(
      [
        r.source,
        r.url,
        r.priceText,
        r.roomsText,
        r.sqmText ?? '',
        r.district ?? '',
        r.listedAtText ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  writeFileSync(join(DATA_DIR, filename), rows.join('\n') + '\n', 'utf-8');
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

  console.log('\n=== Scraping flatfy.ua ===');
  const flatfyRaw: ListingRaw[] = await scrapeFlatfy();
  writeJson('flatfy-listings-raw.json', flatfyRaw);
  console.log(`flatfy: collected ${flatfyRaw.length} raw listings`);

  const allRaw = [...olxRaw, ...domriaRaw, ...flatfyRaw];

  console.log('\n=== Normalizing ===');
  const all: ListingNormalized[] = [];
  for (const raw of allRaw) {
    const norm = normalizeListing(raw, toUsd);
    if (norm) all.push(norm);
  }
  writeJson('listings-normalized.json', all);
  console.log(`Normalized: ${all.length} / ${allRaw.length} listings`);

  const rawByUrl = new Map<string, ListingRaw>();
  for (const r of allRaw) rawByUrl.set(r.url, r);
  writeListingsCsv('listings.csv', all, rawByUrl);
  writeRawCsv('listings-raw.csv', allRaw);
  console.log(`Wrote listings.csv (${all.length} rows) and listings-raw.csv (${allRaw.length} rows)`);

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
