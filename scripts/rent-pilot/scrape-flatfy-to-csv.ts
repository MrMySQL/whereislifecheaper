import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scrapeFlatfy } from './scrape-flatfy';
import { ListingRaw, Source } from './types';

const DATA_DIR = join(__dirname, 'data');
const OUT_FILE = 'flatfy-listings-raw.csv';

// flatfy renders 24 listing cards per page; used to estimate the resume page.
const CARDS_PER_PAGE = 24;

/** Parse one CSV line, honouring double-quoted fields with embedded commas. */
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

/** Read an existing raw CSV so a run can resume and append to it. */
function readExistingRaw(filename: string): ListingRaw[] {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/).filter((l) => l.length > 0);
  lines.shift(); // header
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
  console.log('=== Scraping flatfy.ua ===');

  // Resume from the existing CSV: seed dedup with what we already have and
  // restart paging just before where the last run left off (the slight overlap
  // is removed by URL dedup, and guards against a gap from the partial page).
  const existing = readExistingRaw(OUT_FILE);
  const startPage = existing.length
    ? Math.max(1, Math.floor(existing.length / CARDS_PER_PAGE))
    : 1;
  if (existing.length) {
    console.log(
      `Found ${existing.length} existing listings; resuming from page ${startPage}.`,
    );
  }

  const flatfyRaw = await scrapeFlatfy({ startPage, seed: existing });
  const added = flatfyRaw.length - existing.length;
  console.log(
    `flatfy: ${flatfyRaw.length} total raw listings (+${added} new this run)`,
  );

  writeRawCsv(OUT_FILE, flatfyRaw);
  console.log(`Wrote ${join(DATA_DIR, OUT_FILE)} (${flatfyRaw.length} rows)`);
}

main().catch((err) => {
  console.error('flatfy scrape failed:', err);
  process.exit(1);
});
