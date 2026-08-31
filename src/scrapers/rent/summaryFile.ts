import fs from 'fs';
import path from 'path';
import type { RentScrapeSummary } from './RentScraperService';

/**
 * Where `rent:scrape` leaves its per-source summary for `rent:check-sources`
 * to read after the aggregate step. Its own module so the reader does not have
 * to import the scrape script, which starts a scrape on import.
 */
export const SUMMARY_PATH = path.join(process.cwd(), 'logs', 'rent-scrape-summary.json');

/** The summary as it lands on disk: what the scrape returned, plus when. */
export type StoredRentSummary = RentScrapeSummary & { finishedAt: string };

/**
 * Drop any summary left by an earlier run.
 *
 * `SUMMARY_PATH` is a fixed path, so without this a scrape that dies before it
 * can write leaves the previous run's file behind and the gate happily reports
 * last week's verdict as this week's.
 */
export function clearRentSummary(): void {
  fs.rmSync(SUMMARY_PATH, { force: true });
}

export function writeRentSummary(summary: RentScrapeSummary): void {
  const stored: StoredRentSummary = { ...summary, finishedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
  // Write-then-rename: a kill mid-write leaves the temp file, not a truncated
  // summary at the path the gate reads.
  const tmp = `${SUMMARY_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stored, null, 2));
  fs.renameSync(tmp, SUMMARY_PATH);
}

/**
 * Read the summary, or return null if there isn't a usable one.
 *
 * Null covers every "the gate has nothing to judge" case - absent, empty,
 * truncated, or written by a revision with a different shape - so the caller
 * reports its own "did the scrape step run?" error instead of dying on a raw
 * SyntaxError or `undefined is not iterable`.
 */
export function readRentSummary(): StoredRentSummary | null {
  let text: string;
  try {
    text = fs.readFileSync(SUMMARY_PATH, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  return isStoredSummary(parsed) ? parsed : null;
}

function isStoredSummary(value: unknown): value is StoredRentSummary {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.sources) &&
    Array.isArray(v.regressions) &&
    Array.isArray(v.recovered) &&
    typeof v.totalInserted === 'number' &&
    typeof v.finishedAt === 'string'
  );
}
