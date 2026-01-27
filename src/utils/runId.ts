import { randomBytes } from 'crypto';

/**
 * Generate a unique, short run ID for scraper processes.
 * Format: run-xxxxxx (6 hex characters)
 * This helps identify and filter logs from a specific scraping run.
 */
export function generateRunId(): string {
  const bytes = randomBytes(3); // 3 bytes = 6 hex chars
  return `run-${bytes.toString('hex')}`;
}
