import fs from 'fs';
import path from 'path';

/**
 * `api/index.ts` (the Vercel serverless entry) and `src/api/server.ts` (the
 * local/long-running entry) each build their own Express app and register
 * routes by hand. They drift silently: the rent feature was mounted only in
 * server.ts, so `/api/rent` 404'd in production for three months while every
 * test and every local run passed.
 *
 * This locks the invariant: every `/api/...` prefix served by one entry point
 * must be served by the other.
 */

const ROOT = path.join(__dirname, '..', '..', '..');

function apiMounts(relPath: string): string[] {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const mounts = [...src.matchAll(/app\.use\(\s*'(\/api\/[^']*)'/g)].map((m) => m[1]);
  return [...new Set(mounts)].filter((m) => m !== '/api/*').sort();
}

describe('API entry point parity', () => {
  test('both entry points mount the same /api prefixes', () => {
    expect(apiMounts('api/index.ts')).toEqual(apiMounts('src/api/server.ts'));
  });

  test('the /api/* 404 handler is registered after every /api route', () => {
    for (const relPath of ['api/index.ts', 'src/api/server.ts']) {
      const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      const notFoundAt = src.indexOf("app.use('/api/*'");
      expect(notFoundAt).toBeGreaterThan(-1);

      // A route mounted after the catch-all is unreachable - it 404s instead.
      const lastRouteAt = Math.max(
        ...[...src.matchAll(/app\.use\(\s*'\/api\/(?!\*)[^']*'/g)].map((m) => m.index ?? -1),
      );
      expect(lastRouteAt).toBeLessThan(notFoundAt);
    }
  });
});
