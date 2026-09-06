const post = jest.fn();

jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { post },
}));

import { maintenanceApi } from '../src/services/maintenanceApi';

beforeEach(() => post.mockReset());

test('country run forwards the selected country and continuation cursor', async () => {
  post.mockResolvedValue({ data: {
    id: 'run-2', status: 'completed', scanned: 25, proposed: 3, dry_run: false,
    started_at: '2026-09-06T00:00:00Z', finished_at: '2026-09-06T00:00:01Z', error: null,
    next_cursor: 'next-page', has_more: true, warnings: [], previews: [],
  } });

  await maintenanceApi.run({ limit: 25, dry_run: false, country_id: '7', cursor: 'previous-page' });

  expect(post).toHaveBeenCalledWith('/maintenance/run', {
    limit: 25, dry_run: false, country_id: '7', cursor: 'previous-page',
  });
});

test('batch review posts one action for selected unique ids', async () => {
  post.mockResolvedValue({ data: { results: [{ id: '11', status: 'approved' }, { id: '12', error: 'conflict' }] } });

  const result = await maintenanceApi.batchReview(['11', '12'], 'approve');

  expect(post).toHaveBeenCalledWith('/maintenance/suggestions/batch', {
    ids: ['11', '12'], action: 'approve',
  });
  expect(result.results[1]).toEqual({ id: '12', error: 'conflict' });
});

test('run serializes numeric country IDs as strings', async () => {
 post.mockResolvedValue({data:{}});
 await maintenanceApi.run({country_id:7,limit:25});
 expect(post).toHaveBeenCalledWith('/maintenance/run',{country_id:'7',limit:25});
});
test('batch review serializes mixed numeric and string IDs with a reason',async()=>{
 post.mockResolvedValue({data:{results:[]}});
 await maintenanceApi.batchReview([11,'12'],'reject','Wrong product');
 expect(post).toHaveBeenCalledWith('/maintenance/suggestions/batch',{ids:['11','12'],action:'reject',reason:'Wrong product'});
});
