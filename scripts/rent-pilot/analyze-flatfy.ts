import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { aggregate } from './aggregate';
import { loadRatesToEur, buildUsdConverter } from './normalize';
import { ListingNormalized, BucketStats } from './types';
import { closePool } from '../../src/config/database';

const DATA_DIR = join(__dirname, 'data');

// Current OLX / DOM.RIA medians (UAH/mo) from the last full pilot run (buckets.json),
// matching the figures in the PR description.
const OLX_UAH: Record<number, number> = { 0: 16000, 1: 22000, 2: 38000, 3: 101874 };
const DOMRIA_UAH: Record<number, number> = { 0: 20000, 1: 25000, 2: 30000, 3: 61078 };

// LUN.ua May 2026 median asking rent (UAH/mo) — the credible benchmark the PR
// adopted in place of Numbeo. No published 3-room figure.
const LUN_UAH: Record<number, number | null> = { 0: 18000, 1: 27000, 2: 44400, 3: null };

const ROOM_LABEL: Record<number, string> = {
  0: '1-room / studio',
  1: '2-room',
  2: '3-room',
  3: '4-room+',
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / ((a + b) / 2);
}

function signedPct(value: number, ref: number): string {
  const pct = ((value - ref) / ref) * 100;
  const sign = pct >= 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(0)}%`;
}

async function main() {
  const normalized: ListingNormalized[] = JSON.parse(
    readFileSync(join(DATA_DIR, 'flatfy-listings-normalized.json'), 'utf-8'),
  );

  // flatfy prices are USD-native; build a USD->UAH factor so we can compare
  // against the UAH-denominated OLX / DOM.RIA / LUN figures.
  const rates = await loadRatesToEur();
  const toUsd = buildUsdConverter(rates);
  const uahPerUsd = 1 / toUsd(1, 'UAH'); // USD per UAH inverted -> UAH per USD

  const buckets: BucketStats[] = aggregate(normalized).filter((b) => b.source === 'flatfy');
  const byBed = new Map<number, BucketStats>();
  for (const b of buckets) byBed.set(b.bedrooms, b);

  const lines: string[] = [];
  lines.push('# Kyiv Rent — flatfy.ua analysis');
  lines.push('');
  lines.push(
    `flatfy is a third classifieds source (lun.ua engine). After resuming pagination to ` +
      `its hard ceiling we have **${normalized.length} unique listings**, all priced in USD. ` +
      `Medians use the same method as the pilot: sqm filter (15–300 m²), 5% outlier trim per ` +
      `\`(source, bedrooms)\` bucket. USD→UAH at ~${uahPerUsd.toFixed(1)} UAH/USD.`,
  );
  lines.push('');

  // --- Per-bucket table ---
  lines.push('## flatfy median monthly rent per bedroom bucket');
  lines.push('');
  lines.push('| Bedrooms (rooms) | N | Median USD | Median UAH | p25 USD | p75 USD |');
  lines.push('|---|---|---|---|---|---|');
  for (let bed = 0; bed <= 3; bed++) {
    const b = byBed.get(bed);
    if (!b) continue;
    lines.push(
      `| ${bed} (${ROOM_LABEL[bed]}) | ${b.nListings} | $${fmt(b.medianUsd)} | ` +
        `${fmt(b.medianUsd * uahPerUsd)} | $${fmt(b.p25Usd)} | $${fmt(b.p75Usd)} |`,
    );
  }
  lines.push('');

  // --- Cross-source comparison (UAH) ---
  lines.push('## Cross-source comparison (median UAH/mo)');
  lines.push('');
  lines.push('| Bedrooms | OLX | DOM.RIA | **flatfy** | LUN (benchmark) | flatfy vs LUN | flatfy vs OLX | flatfy vs DOM.RIA |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (let bed = 0; bed <= 3; bed++) {
    const b = byBed.get(bed);
    if (!b) continue;
    const flatfyUah = b.medianUsd * uahPerUsd;
    const lun = LUN_UAH[bed];
    lines.push(
      `| ${bed} | ${fmt(OLX_UAH[bed])} | ${fmt(DOMRIA_UAH[bed])} | **${fmt(flatfyUah)}** | ` +
        `${lun ? fmt(lun) : '—'} | ${lun ? signedPct(flatfyUah, lun) : 'n/a'} | ` +
        `${signedPct(flatfyUah, OLX_UAH[bed])} | ${signedPct(flatfyUah, DOMRIA_UAH[bed])} |`,
    );
  }
  lines.push('');

  // --- Auto-generated reading notes ---
  lines.push('## Reading the data');
  lines.push('');
  for (let bed = 0; bed <= 2; bed++) {
    const b = byBed.get(bed);
    const lun = LUN_UAH[bed];
    if (!b || !lun) continue;
    const flatfyUah = b.medianUsd * uahPerUsd;
    const d = relDiff(flatfyUah, lun) * 100;
    const verdict =
      d <= 15 ? 'brackets LUN tightly' : d <= 25 ? 'within a reasonable band of LUN' : 'diverges from LUN';
    lines.push(
      `- **${bed}BR (${ROOM_LABEL[bed]})**: flatfy ${fmt(flatfyUah)} UAH vs LUN ${fmt(lun)} ` +
        `(${signedPct(flatfyUah, lun)}, ${d.toFixed(0)}% rel) — ${verdict}. ` +
        `n=${b.nListings}.`,
    );
  }
  const b3 = byBed.get(3);
  if (b3) {
    lines.push(
      `- **3BR (4-room+)**: flatfy ${fmt(b3.medianUsd * uahPerUsd)} UAH (n=${b3.nListings}) — ` +
        `no LUN reference; small-sample/luxury skew on all sources, treat as unreliable.`,
    );
  }
  lines.push('');

  const out = lines.join('\n') + '\n';
  writeFileSync(join(DATA_DIR, 'flatfy-analysis.md'), out, 'utf-8');
  // eslint-disable-next-line no-console
  console.log(out);

  await closePool().catch(() => undefined);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Analysis failed:', err);
  process.exit(1);
});
