// Captured from https://www.numbeo.com/cost-of-living/in/Kiev on 2026-05-31.
// Numbeo "Last update" on the page: 29 May 2026.
// Numbeo updates page values via crowdsourced submissions — replace these if re-running the pilot.

export interface NumbeoKyivBenchmarks {
  capturedOn: string;
  oneBedCenterUahPerMonth: number;
  oneBedOutsideUahPerMonth: number;
  threeBedCenterUahPerMonth: number;
  threeBedOutsideUahPerMonth: number;
}

export const NUMBEO_KYIV: NumbeoKyivBenchmarks = {
  capturedOn: '2026-05-31',
  oneBedCenterUahPerMonth: 28000,
  oneBedOutsideUahPerMonth: 16533,
  threeBedCenterUahPerMonth: 54137,
  threeBedOutsideUahPerMonth: 27818,
};

// For the comparison the pilot uses the simple average of "centre" and "outside centre"
// since our scraped sample is mixed across districts.
export function numbeoBlendedUah(centre: number, outside: number): number {
  return (centre + outside) / 2;
}
