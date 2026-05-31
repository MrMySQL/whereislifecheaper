import { evaluatePilot, renderReport } from '../report';
import { BucketStats } from '../types';
import { NumbeoKyivBenchmarks } from '../numbeo-benchmarks';

const numbeoFixture: NumbeoKyivBenchmarks = {
  capturedOn: '2026-05-31',
  oneBedCenterUahPerMonth: 20000,
  oneBedOutsideUahPerMonth: 14000,
  threeBedCenterUahPerMonth: 40000,
  threeBedOutsideUahPerMonth: 28000,
};

function bucket(
  source: 'olx' | 'domria',
  bedrooms: number,
  medianLocal: number,
  n = 100,
): BucketStats {
  return {
    source,
    bedrooms,
    nListings: n,
    nDropped: 5,
    medianLocal,
    medianUsd: medianLocal / 36,
    p25Usd: (medianLocal / 36) * 0.8,
    p75Usd: (medianLocal / 36) * 1.2,
  };
}

describe('evaluatePilot', () => {
  test('passes when sources agree within 15% and both are within 20% of Numbeo blend', () => {
    const buckets: BucketStats[] = [
      bucket('olx', 1, 17500),
      bucket('domria', 1, 17800),
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    expect(result.overallPass).toBe(true);
  });

  test('fails when OLX and DOM.RIA disagree by more than 15% for the same bucket', () => {
    const buckets: BucketStats[] = [
      bucket('olx', 1, 16000),
      bucket('domria', 1, 25000),
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    expect(result.overallPass).toBe(false);
    expect(result.crossSourcePass).toBe(false);
  });

  test('fails when both sources agree but are more than 20% off Numbeo', () => {
    const buckets: BucketStats[] = [
      bucket('olx', 1, 30000),
      bucket('domria', 1, 31000),
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    expect(result.overallPass).toBe(false);
    expect(result.numbeoPass).toBe(false);
  });

  test('does not require Numbeo agreement for studio or 2BR (Numbeo does not publish those)', () => {
    const buckets: BucketStats[] = [
      bucket('olx', 0, 8000),
      bucket('domria', 0, 8500),
      bucket('olx', 1, 17500),
      bucket('domria', 1, 17800),
      bucket('olx', 2, 25000),
      bucket('domria', 2, 25500),
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    expect(result.overallPass).toBe(true);
  });

  test('skips buckets with fewer than 30 listings from cross-source check', () => {
    const buckets: BucketStats[] = [
      { ...bucket('olx', 1, 16000), nListings: 10 },
      { ...bucket('domria', 1, 25000), nListings: 10 },
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const result = evaluatePilot(buckets, numbeoFixture);
    expect(result.crossSourcePass).toBe(true);
  });
});

describe('renderReport', () => {
  test('renders a markdown string with verdict and counts', () => {
    const buckets: BucketStats[] = [
      bucket('olx', 1, 17500),
      bucket('domria', 1, 17800),
      bucket('olx', 3, 33000),
      bucket('domria', 3, 34500),
    ];
    const md = renderReport(buckets, numbeoFixture);
    expect(md).toMatch(/Verdict/);
    expect(md).toMatch(/PASS|FAIL/);
    expect(md).toMatch(/olx/);
    expect(md).toMatch(/domria/);
    expect(md).toMatch(/Numbeo/);
  });
});
