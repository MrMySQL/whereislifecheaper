import request from 'supertest';
import app from '../../../api/index';
import { closePool } from '../../config/database';

// Exercises the file Vercel actually runs. api/index.ts is outside tsconfig's
// include, so nothing else in the build or the test suite ever loads it - which
// is how /api/rent stayed unmounted in production for three months.
describe('Vercel entry (api/index.ts)', () => {
  // Importing the entry opens the session store's pg pool; leave it open and
  // jest never exits.
  afterAll(async () => {
    await closePool();
  });

  test('GET /api/rent is served, not swallowed by the /api/* 404', async () => {
    const res = await request(app).get('/api/rent');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/nope still 404s', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });

  test('GET /sitemap.xml returns XML, not the SPA shell', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
  });
});
