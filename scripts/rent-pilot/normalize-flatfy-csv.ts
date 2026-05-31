import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadRatesToEur, buildUsdConverter, normalizeListing } from './normalize';
import { ListingRaw, ListingNormalized, Source, Currency } from './types';
import { closePool } from '../../src/config/database';

const DATA_DIR = join(__dirname, 'data');
const IN_FILE = 'flatfy-listings-raw.csv';
const OUT_CSV = 'flatfy-listings.csv';
const OUT_JSON = 'flatfy-listings-normalized.json';

/** Parse a single CSV line, honouring double-quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

function readRawCsv(filename: string): ListingRaw[] {
  const text = readFileSync(join(DATA_DIR, filename), 'utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  lines.shift(); // drop header
  return lines.map((line) => {
    const [source, url, priceText, roomsText, sqmText, district, listedAtText] =
      parseCsvLine(line);
    return {
      source: source as Source,
      url,
      priceText,
      roomsText,
      sqmText: sqmText || null,
      district: district || null,
      listedAtText: listedAtText || null,
    };
  });
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

async function buildConverter(): Promise<(amount: number, currency: Currency) => number> {
  try {
    const rates = await loadRatesToEur();
    if (rates.has('USD')) {
      console.log(`Rates loaded from DB: USD=${rates.get('USD')}, UAH=${rates.get('UAH')}`);
      return buildUsdConverter(rates);
    }
    console.warn('USD rate missing from DB; falling back to identity for USD-only data.');
  } catch (err) {
    console.warn(`Could not load rates from DB (${(err as Error).message}); ` +
      'falling back to identity converter (flatfy prices are USD-only).');
  }
  // All flatfy prices are in USD, so USD->USD is identity. Reject anything else.
  return (amount: number, currency: Currency): number => {
    if (currency !== 'USD') {
      throw new Error(`No rate available to convert ${currency} without the DB`);
    }
    return amount;
  };
}

async function main() {
  const raw = readRawCsv(IN_FILE);
  console.log(`Read ${raw.length} raw listings from ${IN_FILE}`);

  const toUsd = await buildConverter();

  const normalized: ListingNormalized[] = [];
  let dropped = 0;
  for (const r of raw) {
    const n = normalizeListing(r, toUsd);
    if (n) normalized.push(n);
    else dropped++;
  }
  console.log(`Normalized ${normalized.length} / ${raw.length} (dropped ${dropped})`);

  const rawByUrl = new Map<string, ListingRaw>();
  for (const r of raw) rawByUrl.set(r.url, r);

  writeListingsCsv(OUT_CSV, normalized, rawByUrl);
  writeFileSync(
    join(DATA_DIR, OUT_JSON),
    JSON.stringify(normalized, null, 2),
    'utf-8',
  );
  console.log(`Wrote ${OUT_CSV} (${normalized.length} rows) and ${OUT_JSON}`);

  await closePool().catch(() => undefined);
}

main().catch((err) => {
  console.error('Normalization failed:', err);
  process.exit(1);
});
