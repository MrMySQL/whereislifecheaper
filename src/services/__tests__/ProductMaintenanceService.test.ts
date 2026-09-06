jest.mock('../../repositories/ProductMaintenanceRepository',()=>({ProductMaintenanceRepository:jest.fn()}));
import { ProductMaintenanceService } from '../ProductMaintenanceService';
import { Candidate, MaintenanceTarget } from '../../types/maintenance.types';
const target={name:'Water 5 l',canonical_product_id:'1',expected_unit:null,expected_quantity:null} as MaintenanceTarget;
const candidate={mapping_id:'1',product_id:'2',name:'Water 5 l',price:3,unit:'pieces',unit_quantity:1,canonical_product_id:null,availability_status:'available',last_checked_at:new Date().toISOString(),scraped_at:new Date().toISOString()} as Candidate;
test('interprets raw piece selling unit before checking five liter contents',()=>{
 expect(new ProductMaintenanceService({} as any).validate(candidate,target).contentQuantity).toBe(5);
});
test.each([{availability_status:'out_of_stock'},{scraped_at:'2000-01-01'},{canonical_product_id:'8'},{name:'Water 1 l'}])('rejects ineligible candidate %j',(change)=>{
 expect(()=>new ProductMaintenanceService({} as any).validate({...candidate,...change},target)).toThrow();
});
test('AI invented ids cannot enlarge deterministic eligible candidate set',async()=>{
 const repo={markChecked:jest.fn(),start:jest.fn().mockResolvedValue({id:'1'}),targets:jest.fn().mockResolvedValue([{...target,status:'missing'}]),candidates:jest.fn().mockResolvedValue([candidate]),propose:jest.fn().mockResolvedValue(true),finish:jest.fn().mockImplementation((_id,scanned,proposed)=>({scanned,proposed}))};
 const service=new ProductMaintenanceService(repo as any,async()=>['invented','1']);
 expect(await service.run(1,false)).toEqual({scanned:1,proposed:1});expect(repo.propose).toHaveBeenCalledTimes(1);
});
test('dry runs do not create review suggestions',async()=>{
 const repo={markChecked:jest.fn(),start:jest.fn().mockResolvedValue({id:'1'}),targets:jest.fn().mockResolvedValue([{...target,status:'missing'}]),candidates:jest.fn().mockResolvedValue([candidate]),propose:jest.fn(),finish:jest.fn()};
 await new ProductMaintenanceService(repo as any).run(1,true);expect(repo.propose).not.toHaveBeenCalled();
});
test('per-unit canonical allows a five kg package for an apple one kg comparison',()=>{
 expect(new ProductMaintenanceService({} as any).validate({...candidate,name:'Apple 5 kg'}, {...target,name:'Apple 1 kg',show_per_unit_price:true}).contentQuantity).toBe(5);
});
test('price snapshots cannot be reinterpreted from a changed package name',()=>{
 expect(()=>new ProductMaintenanceService({} as any).validate({...candidate,quantity_info:{version:1,status:'verified',contentQuantity:1,contentUnit:'l',priceBasis:'package',comparablePrice:3,evidence:[]}},target)).toThrow('snapshot');
});
test('policy exclusions prevent forms such as juice from fruit proposals',()=>{
 expect(()=>new ProductMaintenanceService({} as any).validate({...candidate,name:'Apple juice 1 l'}, {...target,name:'Apple',excluded_terms:['juice']})).toThrow('Excluded');
});
test('explicit per-kg snapshot preserves price basis of a package',()=>{
 const quantity={version:1 as const,status:'verified' as const,contentQuantity:5,contentUnit:'kg' as const,priceBasis:'kg' as const,comparablePrice:3,evidence:[]};
 expect(new ProductMaintenanceService({} as any).validate({...candidate,name:'Apple 5 kg',quantity_info:quantity}, {...target,name:'Apple 1 kg',show_per_unit_price:true}).comparablePrice).toBe(3);
});
test.each([NaN,Infinity,-1,0])('nonpositive or nonfinite snapshot price %s is refused',(comparablePrice)=>{
 const quantity={version:1 as const,status:'verified' as const,contentQuantity:5,contentUnit:'l' as const,priceBasis:'package' as const,comparablePrice,evidence:[]};
 expect(()=>new ProductMaintenanceService({} as any).validate({...candidate,quantity_info:quantity},target)).toThrow();
});
