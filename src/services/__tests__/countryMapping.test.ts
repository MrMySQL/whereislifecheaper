jest.mock('../../repositories/ProductMaintenanceRepository', () => ({ProductMaintenanceRepository: jest.fn()}));
import { ProductMaintenanceService } from '../ProductMaintenanceService';
import { MaintenanceConflictError, MaintenanceTarget, Candidate } from '../../types/maintenance.types';
const target = {canonical_product_id:'1',name:'Sugar 1 kg',country_id:'2',country_name:'Vietnam',country_code:'VN',supermarket_id:'3',supermarket_name:'Shop',mapped_count:0,fresh_count:0,status:'missing',aliases:[],expected_unit:null,expected_quantity:null} as MaintenanceTarget;
const candidate = {mapping_id:'4',product_id:'5',name:'Đường trắng 1 kg',price:2,unit:'kg',unit_quantity:1,canonical_product_id:null,availability_status:'available',last_checked_at:new Date().toISOString(),scraped_at:new Date().toISOString(),url:'https://example.com/sugar'} as Candidate;
function repository() {return {start:jest.fn().mockResolvedValue({id:'1'}),finish:jest.fn().mockImplementation((_id,scanned,proposed)=>({scanned,proposed})),targets:jest.fn().mockResolvedValue([target]),candidates:jest.fn().mockImplementation(async(t)=>t.aliases.includes('đường')?[candidate]:[]),propose:jest.fn().mockResolvedValue(true),markChecked:jest.fn(),vocabulary:jest.fn().mockResolvedValue([]),saveVocabulary:jest.fn(),review:jest.fn()};}
test('cold country gets candidates using generated local vocabulary and preview never writes', async()=>{
 const repo=repository();const service=new (ProductMaintenanceService as any)(repo as any,undefined,async()=>['đường']);
 const result=await service.run(1,true,{country:'2'});
 expect(result.previews).toEqual([expect.objectContaining({product_name:'Đường trắng 1 kg',canonical_name:'Sugar 1 kg'})]);
 expect(repo.start).not.toHaveBeenCalled();expect(repo.finish).not.toHaveBeenCalled();expect(repo.propose).not.toHaveBeenCalled();expect(repo.saveVocabulary).not.toHaveBeenCalled();expect(repo.markChecked).not.toHaveBeenCalled();
});
test('country continuation only advances across scanned targets',async()=>{
 const repo=repository();repo.targets.mockResolvedValue([target,{...target,canonical_product_id:'2'},{...target,canonical_product_id:'3'}]);
 const result=await new (ProductMaintenanceService as any)(repo as any,undefined,async()=>['đường']).run(2,false,{country:'2',cursor:'0:0'});
 expect(result).toMatchObject({scanned:2,proposed:2,next_cursor:'2:3',has_more:true});
 expect(repo.targets).toHaveBeenCalledWith(3,true,{country:'2',cursor:'0:0'});
});
test('translation failure is visible and does not prevent existing keyword search',async()=>{
 const repo=repository();repo.candidates.mockResolvedValue([candidate]);
 const result=await new (ProductMaintenanceService as any)(repo as any,undefined,async()=>{throw Error('provider secret');}).run(1,true,{country:'2'});
 expect(result.previews).toHaveLength(1);expect(result.warnings.join(' ')).toContain('translation');expect(JSON.stringify(result)).not.toContain('provider secret');
});
test('batch review commits valid items and reports stale conflicts individually',async()=>{
 const repo=repository();repo.review.mockImplementation(async(id:string)=>{if(id==='2')throw new MaintenanceConflictError('Offer became stale');return {id,status:'approved'};});
 const result=await new (ProductMaintenanceService as any)(repo as any).reviewBatch(['1','2','3'],'approve','admin');
 expect(result.results).toEqual([{id:'1',status:'approved'},{id:'2',error:'Offer became stale'},{id:'3',status:'approved'}]);
});
test.each([{country:'0'},{country:'2',cursor:'nope'},{cursor:'1:2'}])('invalid scope rejected before DB work %j',async(options)=>{
 const repo=repository();await expect(new (ProductMaintenanceService as any)(repo as any).run(1,true,options)).rejects.toThrow();expect(repo.targets).not.toHaveBeenCalled();
});

test('AI omissions only exclude evaluated candidates and keep unseen candidates after ranked matches',async()=>{
 const repo=repository();repo.targets.mockResolvedValue([{...target,country_code:'GB'}]);
 repo.candidates.mockResolvedValue(Array.from({length:25},(_,i)=>({...candidate,mapping_id:String(i+1),name:'Sugar 1 kg'})));
 const ranker=jest.fn().mockResolvedValue(['2']);
 const result=await new ProductMaintenanceService(repo as any,ranker,async()=>[]).run(1,true,{country:'2'});
 expect(ranker.mock.calls[0][1]).toHaveLength(20);
 expect(result.previews.map(p=>String(p.mapping_id))).toEqual(['2','21','22','23','24']);
});
