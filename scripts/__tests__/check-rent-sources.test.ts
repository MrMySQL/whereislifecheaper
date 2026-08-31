import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The gate decides whether the weekly rent run goes red, so it is exercised as
 * the process CI actually runs: a real `ts-node scripts/check-rent-sources.ts`
 * against a summary file, asserting on the exit code and the annotations.
 *
 * It reads `logs/rent-scrape-summary.json` relative to the working directory,
 * so each case runs in its own temp directory.
 */

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-rent-sources.ts');

jest.setTimeout(120_000);

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rent-gate-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function outcome(over: Record<string, unknown> = {}) {
  return {
    name: 'olx',
    countryCode: 'UA',
    city: 'Kyiv',
    expected: 'healthy',
    status: 'ok',
    raw: 10,
    normalized: 10,
    inserted: 10,
    ...over,
  };
}

function writeSummary(summary: Record<string, unknown>): void {
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'logs', 'rent-scrape-summary.json'),
    JSON.stringify({ finishedAt: new Date().toISOString(), ...summary }),
  );
}

function runGate(): { status: number; out: string } {
  const res = spawnSync('npx', ['ts-node', SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: 'true', TS_NODE_PROJECT: path.join(ROOT, 'tsconfig.json') },
  });
  return { status: res.status ?? -1, out: `${res.stdout}${res.stderr}` };
}

describe('rent source health gate', () => {
  test('passes when every source expected healthy is healthy', () => {
    writeSummary({
      sources: [outcome()],
      regressions: [],
      recovered: [],
      totalInserted: 10,
    });

    const { status, out } = runGate();

    expect(status).toBe(0);
    expect(out).toMatch(/all sources expected healthy are healthy/);
  });

  test('fails when there is no summary, rather than crashing on the parse', () => {
    const { status, out } = runGate();

    expect(status).toBe(1);
    expect(out).toMatch(/did the scrape step run\?/);
    expect(out).not.toMatch(/SyntaxError/);
  });

  test('fails on a truncated summary with the same clear message', () => {
    fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'logs', 'rent-scrape-summary.json'), '{"sources":[{"na');

    const { status, out } = runGate();

    expect(status).toBe(1);
    expect(out).toMatch(/did the scrape step run\?/);
    expect(out).not.toMatch(/SyntaxError/);
  });

  test("fails on a previous run's leftover summary instead of reporting its verdict", () => {
    writeSummary({
      finishedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      sources: [outcome()],
      regressions: [],
      recovered: [],
      totalInserted: 10,
    });

    const { status, out } = runGate();

    expect(status).toBe(1);
    expect(out).toMatch(/not from this run/);
  });

  test('names the failing city when two targets share a source name', () => {
    const kyiv = outcome();
    const lviv = outcome({ city: 'Lviv', status: 'dead', raw: 0, normalized: 0, inserted: 0 });
    writeSummary({
      sources: [kyiv, lviv],
      regressions: [lviv],
      recovered: [],
      totalInserted: 10,
    });

    const { status, out } = runGate();

    expect(status).toBe(1);
    expect(out).toMatch(/::error::UA\/Lviv\/olx is expected to be healthy/);
    expect(out).not.toMatch(/::error::UA\/Kyiv/);
  });

  test('warns instead of celebrating when a healthy run inserted nothing', () => {
    // Same-day re-run: every row conflicts, insertMany returns 0, and every
    // source still reports ok.
    writeSummary({
      sources: [outcome({ inserted: 0 })],
      regressions: [],
      recovered: [],
      totalInserted: 0,
    });

    const { status, out } = runGate();

    expect(status).toBe(0);
    expect(out).toMatch(/::warning::UA\/Kyiv\/olx scraped 10 listings but inserted 0/);
    expect(out).toMatch(/::warning::No listings were inserted by any source/);
  });

  test('does not print each annotation twice in CI', () => {
    writeSummary({
      sources: [outcome()],
      regressions: [],
      recovered: [],
      totalInserted: 10,
    });

    const { out } = runGate();

    expect(out).toMatch(/::notice::UA\/Kyiv\/olx: 10 listings inserted/);
    expect(out).not.toMatch(/\[notice\] /);
  });
});
