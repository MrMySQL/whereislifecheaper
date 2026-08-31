import fs from 'fs';
import path from 'path';
import { RentScrapeSummary } from './RentScraperService';

/**
 * Where `rent:scrape` leaves its per-source summary for `rent:check-sources`
 * to read after the aggregate step. Its own module so the reader does not have
 * to import the scrape script, which starts a scrape on import.
 */
export const SUMMARY_PATH = path.join(process.cwd(), 'logs', 'rent-scrape-summary.json');

export function writeRentSummary(summary: RentScrapeSummary): void {
  fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
}

export function readRentSummary(): RentScrapeSummary | null {
  if (!fs.existsSync(SUMMARY_PATH)) return null;
  return JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8')) as RentScrapeSummary;
}
