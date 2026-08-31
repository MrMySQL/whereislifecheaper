import request from 'supertest';
import app from '../../../api/index';
import { closePool } from '../../config/database';

// Exercises the file Vercel actually runs. api/index.ts is outside tsconfig's
// include, so nothing else in the build or the test suite ever loads it - which
// is how /api/rent stayed unmounted in production for three months.
//
// The assertions are all "not 404" rather than "200" on purpose: what these
// tests prove is that the route is mounted, and an unmounted route is exactly
// what produces a 404 here (`/api/rent` falls into the `/api/*` handler,
// `/sitemap.xml` into Express's default one). Asserting 200 would instead tie
// the guard to a reachable, seeded database - both handlers answer 500 when the
// pool is down, and that failure reads as "the route is missing" when the mount
// is perfectly fine.
describe('Vercel entry (api/index.ts)', () => {
  // Importing the entry opens the session store's pg pool; leave it open and
  // jest never exits.
  afterAll(async () => {
    await closePool();
  });

  test('GET /api/rent is served, not swallowed by the /api/* 404', async () => {
    const res = await request(app).get('/api/rent');
    expect(res.status).not.toBe(404);
    if (res.status === 200) expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/nope still 404s', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });

  test('GET /sitemap.xml is served by the function, not the SPA shell', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).not.toBe(404);
    if (res.status === 200) expect(res.headers['content-type']).toMatch(/xml/);
  });

  test('GET /api/health is served', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).not.toBe(404);
  });
});
