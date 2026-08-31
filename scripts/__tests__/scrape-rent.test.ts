import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The scrape has to leave the gate with nothing to read if it cannot guarantee
 * the summary at `logs/rent-scrape-summary.json` is its own. The gate accepts
 * any summary younger than six hours, so a leftover file this run could not
 * delete would be read as this run's verdict the moment the scrape then died
 * before writing.
 *
 * Spawned rather than imported: importing scrape-rent.ts starts a scrape.
 */

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'scrape-rent.ts');

jest.setTimeout(120_000);

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rent-scrape-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('aborts when the previous summary cannot be cleared', () => {
  // A directory where the summary file goes: rmSync answers EISDIR. Any
  // undeletable leftover (a read-only mount, a permission change) lands here.
  fs.mkdirSync(path.join(dir, 'logs', 'rent-scrape-summary.json'), { recursive: true });

  const res = spawnSync('npx', ['ts-node', SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      // The abort happens before anything connects; .env is not on the path
      // from this working directory, so config/env needs the variable set.
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused@127.0.0.1:1/unused',
      TS_NODE_PROJECT: path.join(ROOT, 'tsconfig.json'),
    },
  });

  expect(res.status).toBe(1);
  expect(`${res.stdout}${res.stderr}`).toMatch(/cannot clear the previous scrape summary/);
});
