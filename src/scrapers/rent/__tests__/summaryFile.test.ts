import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The gate reads this file to decide whether the run goes red. Every way it can
 * be unusable - absent, empty, half-written, or written by an older revision -
 * has to come back as null so `check-rent-sources` reports its own error rather
 * than dying on a SyntaxError or `undefined is not iterable`.
 */

let dir: string;
let summaryFile: typeof import('../summaryFile');
const cwd = process.cwd();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rent-summary-'));
  process.chdir(dir);
  // SUMMARY_PATH is resolved from cwd at import time.
  jest.resetModules();
  summaryFile = require('../summaryFile');
});

afterEach(() => {
  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
});

const summary = {
  sources: [
    {
      name: 'olx' as const,
      countryCode: 'UA',
      city: 'Kyiv',
      expected: 'healthy' as const,
      status: 'ok' as const,
      raw: 3,
      normalized: 3,
      inserted: 3,
    },
  ],
  regressions: [],
  recovered: [],
  totalInserted: 3,
};

function writeRaw(contents: string): void {
  fs.mkdirSync(path.dirname(summaryFile.SUMMARY_PATH), { recursive: true });
  fs.writeFileSync(summaryFile.SUMMARY_PATH, contents);
}

describe('rent scrape summary file', () => {
  test('round-trips a summary and stamps when it finished', () => {
    summaryFile.writeRentSummary(summary);

    const read = summaryFile.readRentSummary();
    expect(read).toMatchObject(summary);
    expect(Date.parse(read!.finishedAt)).not.toBeNaN();
  });

  test('returns null when there is no summary at all', () => {
    expect(summaryFile.readRentSummary()).toBeNull();
  });

  test('returns null for an empty file left by a failed write', () => {
    writeRaw('');
    expect(summaryFile.readRentSummary()).toBeNull();
  });

  test('returns null for a file truncated mid-write', () => {
    writeRaw(JSON.stringify(summary).slice(0, 40));
    expect(summaryFile.readRentSummary()).toBeNull();
  });

  test('returns null for valid JSON of the wrong shape', () => {
    // e.g. a summary written by an older revision - `for (const s of
    // summary.sources)` would throw on this.
    writeRaw(JSON.stringify({ ok: true }));
    expect(summaryFile.readRentSummary()).toBeNull();
  });

  test('clearRentSummary removes a previous run so it cannot be read as this one', () => {
    summaryFile.writeRentSummary(summary);
    summaryFile.clearRentSummary();

    expect(summaryFile.readRentSummary()).toBeNull();
    // and it is not an error when there is nothing to clear
    expect(() => summaryFile.clearRentSummary()).not.toThrow();
  });

  test('leaves no temp file behind', () => {
    summaryFile.writeRentSummary(summary);

    expect(fs.readdirSync(path.dirname(summaryFile.SUMMARY_PATH))).toEqual([
      path.basename(summaryFile.SUMMARY_PATH),
    ]);
  });
});
