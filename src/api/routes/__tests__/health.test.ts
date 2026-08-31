import express from 'express';
import request from 'supertest';

/**
 * The status code is the contract: uptime monitors poll this endpoint and read
 * the code, not the body. A database outage that answered 200 (with a
 * `"degraded"` body nobody parses) is a service reporting itself up while every
 * other endpoint 500s.
 */
const mockCheckConnection = jest.fn();
jest.mock('../../../config/database', () => ({
  __esModule: true,
  checkConnection: () => mockCheckConnection(),
  default: {},
}));

import healthRouter from '../health';

const app = express();
app.use('/health', healthRouter);

beforeEach(() => {
  mockCheckConnection.mockReset();
});

describe('GET /health', () => {
  test('200 while the database answers', async () => {
    mockCheckConnection.mockResolvedValue(true);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'healthy', database: 'connected' });
  });

  test('503 when the database is unreachable', async () => {
    // checkConnection swallows the driver error and returns false, so this -
    // not the throw below - is the branch a real outage takes.
    mockCheckConnection.mockResolvedValue(false);

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'disconnected' });
  });

  test('503 when the check itself throws', async () => {
    mockCheckConnection.mockRejectedValue(new Error('pool exhausted'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'unhealthy', database: 'error' });
  });
});
