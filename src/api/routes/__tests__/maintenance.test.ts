import express from 'express';
import request from 'supertest';
jest.mock('../../../repositories/ProductMaintenanceRepository', () => ({ ProductMaintenanceRepository: jest.fn() }));
import { createMaintenanceRouter } from '../maintenance';

function app(role?: 'admin' | 'user') {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.isAuthenticated = (() => Boolean(role)) as typeof req.isAuthenticated;
    if (role) req.user = { id: 7, role, google_id: 'test-7', email: 'test@example.test', name: 'Test user', picture_url: null, is_active: true };
    next();
  });
  const service = {
    overview: jest.fn().mockResolvedValue({ coverage: [], runs: [] }),
    suggestions: jest.fn().mockResolvedValue({ data: [], count: 0 }),
    run: jest.fn().mockResolvedValue({ id: '1' }),
    review: jest.fn().mockResolvedValue({ id: '3', status: 'approved' }),
  };
  a.use('/maintenance', createMaintenanceRouter(service as any));
  return { a, service };
}

const endpoints = [
  ['get', '/overview'], ['get', '/suggestions'], ['post', '/run'],
  ['post', '/suggestions/3/approve'], ['post', '/suggestions/3/reject'], ['post', '/suggestions/3/undo'],
] as const;

describe.each([{ role: undefined, status: 401 }, { role: 'user' as const, status: 403 }])('access control for $role', ({role, status}) => {
  test.each(endpoints)('%s %s rejects access before service execution', async (method, path) => {
    const { a, service } = app(role);
    expect((await request(a)[method](`/maintenance${path}`)).status).toBe(status);
    for (const call of Object.values(service)) expect(call).not.toHaveBeenCalled();
  });
});

test('admin can read coverage and run status', async () => {
  expect((await request(app('admin').a).get('/maintenance/overview')).body).toEqual({ coverage: [], runs: [] });
});

test.each([{limit:26}, {limit:0}, {limit:1.5}, {limit:'3'}, {dry_run:'false'}])('rejects invalid run options %j', async body => {
  const {a, service} = app('admin');
  expect((await request(a).post('/maintenance/run').send(body)).status).toBe(400);
  expect(service.run).not.toHaveBeenCalled();
});

test('passes bounded dry-run options unchanged', async () => {
  const {a, service} = app('admin');
  expect((await request(a).post('/maintenance/run').send({limit:3,dry_run:true})).status).toBe(200);
  expect(service.run).toHaveBeenCalledWith(3,true);
});

test.each(['approve','reject','undo'] as const)('%s uses the authenticated actor, ignoring a spoofed body actor', async action => {
  const {a, service} = app('admin');
  expect((await request(a).post(`/maintenance/suggestions/3/${action}`).send({actor:'999',reason:'Checked retailer evidence'})).status).toBe(200);
  expect(service.review).toHaveBeenCalledWith('3',action,'7','Checked retailer evidence');
});

test('preserves review conflict details for the UI', async () => {
  const {a, service} = app('admin');
  service.review.mockRejectedValue(new Error('Candidate changed since this suggestion was created'));
  const result = await request(a).post('/maintenance/suggestions/3/approve').send({});
  expect(result.status).toBe(409);
  expect(result.body.error).toBe('Candidate changed since this suggestion was created');
});

test.each(['/suggestions?status=invalid','/suggestions?country_id=abc'])('rejects malformed filters %s', async path => {
  const {a, service} = app('admin');
  expect((await request(a).get(`/maintenance${path}`)).status).toBe(400);
  expect(service.suggestions).not.toHaveBeenCalled();
});
