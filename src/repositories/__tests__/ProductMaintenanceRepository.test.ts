jest.mock('../../config/database',()=>({query:jest.fn(),getClient:jest.fn()}));
import {getClient,query} from '../../config/database';
import {ProductMaintenanceRepository} from '../ProductMaintenanceRepository';
const queryMock=query as jest.Mock;
type Response = {sql: RegExp; rows: unknown[]};
function client(responses:Response[]){
 const db={query:jest.fn(),release:jest.fn()};
 db.query.mockImplementation(async(sql:string)=>{
  if(/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql)) return {rows:[]};
  const response=responses.find(response=>response.sql.test(sql));
  if(!response)throw new Error(`Unexpected query: ${sql}`);
  return {rows:response.rows};
 });
 (getClient as jest.Mock).mockResolvedValue(db);return db;
}
const suggestionSql=/SELECT \*,applied_product_updated_at::text FROM product_maintenance_suggestions/;
const productSql=/SELECT canonical_product_id::text,updated_at FROM products/;
beforeEach(()=>jest.clearAllMocks());
test('proposal uniqueness remembers rejected suggestions',async()=>{queryMock.mockResolvedValue({rows:[]});expect(await new ProductMaintenanceRepository().propose({} as any,{} as any,{} as any)).toBe(false);expect(queryMock.mock.calls[0][0]).toContain("product_maintenance_suggestions.status='pending'");});
test('repeat approval commits without product changes or duplicate audit',async()=>{
 const db=client([{sql:suggestionSql,rows:[{id:'1',status:'approved'}]}]);
 expect(await new ProductMaintenanceRepository().review('1','approve','admin',undefined,jest.fn())).toEqual({id:'1',status:'approved'});
 expect(db.query).toHaveBeenCalledWith('COMMIT');expect(db.query.mock.calls.some(c=>c[0].includes('UPDATE products')||c[0].includes('INSERT INTO product_maintenance_reviews'))).toBe(false);
});
test('undo refuses a product changed after approval and rolls back',async()=>{
 const db=client([
  {sql:suggestionSql,rows:[{id:'1',status:'approved',product_id:'3',canonical_product_id:'2',applied_product_updated_at:'2026-09-05 00:00:00.123456'}]},
  {sql:productSql,rows:[{canonical_product_id:'4'}]},
  {sql:/UPDATE products SET canonical_product_id=NULL/,rows:[]},
 ]);
 await expect(new ProductMaintenanceRepository().review('1','undo','admin',undefined,jest.fn())).rejects.toMatchObject({name:'MaintenanceConflictError',message:expect.stringContaining('undo conflict')});
 expect(db.query).toHaveBeenCalledWith('ROLLBACK');expect(db.query.mock.calls.some(c=>c[0].includes('INSERT INTO product_maintenance_reviews'))).toBe(false);expect(db.release).toHaveBeenCalled();
});
test('approval does not overwrite a classification assigned elsewhere',async()=>{
 const db=client([
  {sql:suggestionSql,rows:[{id:'1',status:'pending',product_id:'3',canonical_product_id:'2',mapping_id:'4'}]},
  {sql:productSql,rows:[{canonical_product_id:'8'}]},
  {sql:/SELECT id FROM product_mappings/,rows:[]},
  {sql:/SELECT pm.id::text mapping_id/,rows:[{product_id:'3'}]},
  {sql:/SELECT canonical_product_id FROM product_maintenance_policies/,rows:[]},
  {sql:/SELECT cp.id::text canonical_product_id/,rows:[{canonical_product_id:'2'}]},
 ]);
 await expect(new ProductMaintenanceRepository().review('1','approve','admin',undefined,jest.fn())).rejects.toMatchObject({name:'MaintenanceConflictError',message:expect.stringContaining('classification conflict')});
 expect(db.query.mock.calls.some(c=>c[0].startsWith('UPDATE products'))).toBe(false);
});
test('missing suggestion has a dedicated not-found error',async()=>{
 client([{sql:suggestionSql,rows:[]}]);
 await expect(new ProductMaintenanceRepository().review('404','approve','admin',undefined,jest.fn())).rejects.toMatchObject({name:'MaintenanceNotFoundError'});
});
test('coverage pagination returns totals even beyond the last row',async()=>{
 const db=client([{sql:/WITH coverage AS/,rows:[{coverage:[],total:1200,counts:{covered:10,stale:200,missing:1000}}]}]);
 const page=await (new ProductMaintenanceRepository() as any).coverage({limit:100,offset:1500,country:'2',gapsOnly:true});
 expect(page).toEqual({coverage:[],total:1200,counts:{covered:10,stale:200,missing:1000},limit:100,offset:1500});
 expect(db.query).toHaveBeenCalledWith(expect.stringMatching(/LIMIT \$1 OFFSET \$2/),[100,1500,'2',true]);
});
test('suggestion pagination preserves total for an empty page',async()=>{
 queryMock.mockResolvedValue({rows:[{data:[],total:250}]});
 expect(await (new ProductMaintenanceRepository() as any).suggestions('pending','2',{limit:50,offset:300})).toEqual({data:[],count:0,total:250,limit:50,offset:300});
 expect(queryMock).toHaveBeenCalledWith(expect.stringMatching(/LIMIT \$3 OFFSET \$4/),['pending','2',50,300]);
});
