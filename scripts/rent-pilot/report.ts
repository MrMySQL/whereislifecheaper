import { BucketStats } from './types';
import { NumbeoKyivBenchmarks, numbeoBlendedUah } from './numbeo-benchmarks';

const CROSS_SOURCE_TOLERANCE = 0.15;
const NUMBEO_TOLERANCE = 0.20;
const MIN_BUCKET_SIZE_FOR_CHECK = 30;

export interface PilotEvaluation {
  crossSourcePass: boolean;
  crossSourceDetails: Array<{
    bedrooms: number;
    olx: number;
    domria: number;
    relDiff: number;
    pass: boolean;
    skipped?: string;
  }>;
  numbeoPass: boolean;
  numbeoDetails: Array<{
    bedrooms: number;
    source: string;
    median: number;
    numbeoBlend: number;
    relDiff: number;
    pass: boolean;
  }>;
  overallPass: boolean;
}

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / ((a + b) / 2);
}

export function evaluatePilot(
  buckets: BucketStats[],
  numbeo: NumbeoKyivBenchmarks,
): PilotEvaluation {
  const byBucket = new Map<number, Map<string, BucketStats>>();
  for (const b of buckets) {
    if (!byBucket.has(b.bedrooms)) byBucket.set(b.bedrooms, new Map());
    byBucket.get(b.bedrooms)!.set(b.source, b);
  }

  const crossSourceDetails: PilotEvaluation['crossSourceDetails'] = [];
  for (const [bedrooms, sources] of byBucket) {
    const olx = sources.get('olx');
    const domria = sources.get('domria');
    if (!olx || !domria) continue;

    if (
      olx.nListings < MIN_BUCKET_SIZE_FOR_CHECK ||
      domria.nListings < MIN_BUCKET_SIZE_FOR_CHECK
    ) {
      crossSourceDetails.push({
        bedrooms,
        olx: olx.medianLocal,
        domria: domria.medianLocal,
        relDiff: relDiff(olx.medianLocal, domria.medianLocal),
        pass: true,
        skipped: `bucket too small (olx=${olx.nListings}, domria=${domria.nListings})`,
      });
      continue;
    }

    const rd = relDiff(olx.medianLocal, domria.medianLocal);
    crossSourceDetails.push({
      bedrooms,
      olx: olx.medianLocal,
      domria: domria.medianLocal,
      relDiff: rd,
      pass: rd <= CROSS_SOURCE_TOLERANCE,
    });
  }
  const crossSourcePass = crossSourceDetails.every((d) => d.pass);

  const numbeoTargets: Array<{ bedrooms: number; blend: number }> = [
    {
      bedrooms: 1,
      blend: numbeoBlendedUah(
        numbeo.oneBedCenterUahPerMonth,
        numbeo.oneBedOutsideUahPerMonth,
      ),
    },
    {
      bedrooms: 3,
      blend: numbeoBlendedUah(
        numbeo.threeBedCenterUahPerMonth,
        numbeo.threeBedOutsideUahPerMonth,
      ),
    },
  ];
  const numbeoDetails: PilotEvaluation['numbeoDetails'] = [];
  for (const { bedrooms, blend } of numbeoTargets) {
    const sources = byBucket.get(bedrooms);
    if (!sources) continue;
    for (const [sourceName, b] of sources) {
      if (b.nListings < MIN_BUCKET_SIZE_FOR_CHECK) continue;
      const rd = relDiff(b.medianLocal, blend);
      numbeoDetails.push({
        bedrooms,
        source: sourceName,
        median: b.medianLocal,
        numbeoBlend: blend,
        relDiff: rd,
        pass: rd <= NUMBEO_TOLERANCE,
      });
    }
  }
  const numbeoPass = numbeoDetails.length > 0 && numbeoDetails.every((d) => d.pass);

  return {
    crossSourcePass,
    crossSourceDetails,
    numbeoPass,
    numbeoDetails,
    overallPass: crossSourcePass && numbeoPass,
  };
}

function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function renderReport(
  buckets: BucketStats[],
  numbeo: NumbeoKyivBenchmarks,
): string {
  const evalResult = evaluatePilot(buckets, numbeo);

  const lines: string[] = [];
  lines.push('# Kyiv Rent Pilot — Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Numbeo captured: ${numbeo.capturedOn}`);
  lines.push('');
  lines.push(`## Verdict: ${evalResult.overallPass ? '**PASS**' : '**FAIL**'}`);
  lines.push('');
  lines.push(
    `- Cross-source agreement (≤15% diff): **${evalResult.crossSourcePass ? 'PASS' : 'FAIL'}**`,
  );
  lines.push(
    `- Numbeo benchmark (≤20% diff for 1BR/3BR): **${evalResult.numbeoPass ? 'PASS' : 'FAIL'}**`,
  );
  lines.push('');

  lines.push('## Per-bucket medians');
  lines.push('');
  lines.push(
    '| Source | Bedrooms | N | Dropped | Median UAH/mo | Median USD/mo | p25 USD | p75 USD |',
  );
  lines.push(
    '|--------|----------|---|---------|---------------|---------------|---------|---------|',
  );
  for (const b of buckets) {
    lines.push(
      `| ${b.source} | ${b.bedrooms} | ${b.nListings} | ${b.nDropped} | ` +
        `${fmtMoney(b.medianLocal)} | ${fmtMoney(b.medianUsd)} | ` +
        `${fmtMoney(b.p25Usd)} | ${fmtMoney(b.p75Usd)} |`,
    );
  }
  lines.push('');

  lines.push('## Cross-source comparison (OLX vs DOM.RIA)');
  lines.push('');
  lines.push('| Bedrooms | OLX UAH | DOM.RIA UAH | Rel diff | Pass | Note |');
  lines.push('|----------|---------|-------------|----------|------|------|');
  for (const d of evalResult.crossSourceDetails) {
    lines.push(
      `| ${d.bedrooms} | ${fmtMoney(d.olx)} | ${fmtMoney(d.domria)} | ${fmtPct(d.relDiff)} | ` +
        `${d.pass ? 'yes' : 'no'} | ${d.skipped ?? ''} |`,
    );
  }
  lines.push('');

  lines.push('## Numbeo comparison (blended center+outside)');
  lines.push('');
  lines.push(
    '| Bedrooms | Source | Median UAH | Numbeo blend UAH | Rel diff | Pass |',
  );
  lines.push(
    '|----------|--------|------------|------------------|----------|------|',
  );
  for (const d of evalResult.numbeoDetails) {
    lines.push(
      `| ${d.bedrooms} | ${d.source} | ${fmtMoney(d.median)} | ${fmtMoney(d.numbeoBlend)} | ` +
        `${fmtPct(d.relDiff)} | ${d.pass ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');

  lines.push('## Interpretation guide');
  lines.push('');
  lines.push(
    '- If **cross-source FAIL but Numbeo PASS for one source**: one classifieds site is biased (likely toward higher-end listings). Investigate listing distribution by district before trusting either source.',
  );
  lines.push(
    '- If **cross-source PASS but Numbeo FAIL**: classifieds asking prices systematically differ from Numbeo crowd-sourced averages. Likely cause: asking-vs-closing rent gap, or stale Numbeo data. Acceptable to proceed if magnitude is consistent (e.g. ~25% high in both sources).',
  );
  lines.push(
    '- If **both FAIL**: methodology issue — recheck room→bedroom normalization and outlier trim.',
  );
  lines.push('');

  return lines.join('\n');
}
