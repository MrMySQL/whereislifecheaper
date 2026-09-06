/** Only run with a disposable TEST_DATABASE_URL: fixtures are truncated. */
import fs from 'fs';
import path from 'path';
import {Client} from 'pg';
const url=process.env.TEST_DATABASE_URL;
const integration=url?describe:describe.skip;
integration('country onboarding against PostgreSQL',()=>{
 let db:Client,service:import('../ProductMaintenanceService').ProductMaintenanceService,repo:import('../../repositories/ProductMaintenanceRepository').ProductMaintenanceRepository,close:()=>Promise<void>;
 let italy:string,romania:string,store:string,canonical:string;
 beforeAll(async()=>{
  process.env.DATABASE_URL=url;db=new Client({connectionString:url});await db.connect();
  const dir=path.join(__dirname,'../../database/migrations');for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await db.query(fs.readFileSync(path.join(dir,file),'utf8'));
  const {ProductMaintenanceService}=await import('../ProductMaintenanceService');const {ProductMaintenanceRepository}=await import('../../repositories/ProductMaintenanceRepository');
  repo=new ProductMaintenanceRepository();service=new ProductMaintenanceService(repo,undefined,async()=>['zucchero']);close=(await import('../../config/database')).closePool;
 },60000);
 beforeEach(async()=>{
  await db.query('TRUNCATE countries,canonical_products,products,product_maintenance_runs CASCADE');
  const countries=await db.query("INSERT INTO countries(name,code,currency_code) VALUES('Italy','IT','EUR'),('Romania','RO','RON') RETURNING id");[italy,romania]=countries.rows.map(r=>String(r.id));
  const stores=await db.query("INSERT INTO supermarkets(name,country_id,website_url,scraper_class) VALUES('Italy store',$1,'https://it.example','Test'),('Romania store',$2,'https://ro.example','Test') RETURNING id",[italy,romania]);store=String(stores.rows[0].id);
  canonical=String((await db.query("INSERT INTO canonical_products(name) VALUES('Sugar 1 kg') RETURNING id")).rows[0].id);
  const {ProductService}=await import('../ProductService');const products=new ProductService();
  await products.bulkSaveProducts([{name:'Zucchero bianco 1 kg',unit:'kg',unitQuantity:1,price:2,currency:'EUR',isAvailable:true,isOnSale:false,externalId:'sugar',productUrl:'https://it.example/sugar'}],store,'EUR');
 });
 afterAll(async()=>{if(close)await close();if(db)await db.end();});
 test('new country has zero mappings, translated discovery finds it and preview leaves tables untouched',async()=>{
  expect((await db.query('SELECT count(*)::int n FROM products WHERE canonical_product_id IS NOT NULL')).rows[0].n).toBe(0);
  const result=await service.run(25,true,{country:italy});
  expect(result.previews.map(p=>p.product_name)).toEqual(['Zucchero bianco 1 kg']);expect(result.has_more).toBe(false);
  for(const table of ['product_maintenance_runs','product_maintenance_suggestions','product_mapping_vocabulary','product_maintenance_checks'])expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
 });
 test('country keyset continuation excludes other countries and already processed targets',async()=>{
  await db.query("INSERT INTO canonical_products(name) VALUES('Salt 1 kg'),('Water 1 L')");
  const first=await service.run(1,true,{country:italy});expect(first).toMatchObject({scanned:1,has_more:true,next_cursor:`${canonical}:${store}`});
  const next=await repo.targets(25,true,{country:italy,cursor:first.next_cursor!});expect(next).toHaveLength(2);expect(next.every(t=>t.country_id===italy)).toBe(true);expect(next.every(t=>t.canonical_product_id!==canonical)).toBe(true);
 });
 test('whole-word retrieval excludes cola inside chocolate names',async()=>{
  const {ProductService}=await import('../ProductService');
  await new ProductService().bulkSaveProducts(['Cioccolato drink 500 ml','Coca-Cola Original 500 ml'].map((name,i)=>({name,unit:'ml',unitQuantity:500,price:2,currency:'EUR',isAvailable:true,isOnSale:false,externalId:`drink${i}`,productUrl:`https://it.example/drink${i}`})),store,'EUR');
  const target=(await repo.targets(25,true,{country:italy}))[0];
  const candidates=await repo.candidates({...target,name:'Cola 0.5L',aliases:[]});
  expect(candidates.map(c=>c.name)).toEqual(['Coca-Cola Original 500 ml']);
 });
 test('apply saves proposals and country vocabulary; selected approval and undo update coverage',async()=>{
  await service.run(25,false,{country:italy});const suggestions=await service.suggestions('pending',italy);expect(suggestions.total).toBe(1);
  const id=String(suggestions.data[0].id);expect(await service.reviewBatch([id],'approve','test-admin')).toEqual({results:[{id,status:'approved'}]});
  expect((await repo.coverage({country:italy})).counts.covered).toBe(1);
  await service.review(id,'undo','test-admin');expect((await repo.coverage({country:italy})).counts.missing).toBe(1);
  const target=(await repo.targets(25,true,{country:italy}))[0];expect(await repo.vocabulary(target)).toEqual(['zucchero']);expect(await repo.candidates({...target,aliases:['zucchero']})).toEqual([]);
  expect((await repo.vocabulary({...target,country_id:romania}))).toEqual([]);
 });
 test('batch reports stale conflict without applying it or losing successful approvals',async()=>{
  const {ProductService}=await import('../ProductService');await new ProductService().bulkSaveProducts([{name:'Zucchero fine 1 kg',unit:'kg',unitQuantity:1,price:3,currency:'EUR',isAvailable:true,isOnSale:false,externalId:'sugar2',productUrl:'https://it.example/sugar2'}],store,'EUR');
  await service.run(25,false,{country:italy});const list=(await service.suggestions('pending',italy)).data;expect(list).toHaveLength(2);
  await db.query("UPDATE product_mappings SET availability_status='out_of_stock' WHERE id=$1",[list[0].mapping_id]);
  const result=await service.reviewBatch(list.map(s=>String(s.id)),'approve','test-admin');expect(result.results[0].error).toContain('unavailable');expect(result.results[1].status).toBe('approved');
  expect((await db.query('SELECT count(*)::int n FROM products WHERE canonical_product_id IS NOT NULL')).rows[0].n).toBe(1);
 });
 test('vocabulary is removed with either parent, including tables created before cascade support',async()=>{
  // Recreate the original constraints to exercise the deployed-schema upgrade.
  await db.query(`ALTER TABLE product_mapping_vocabulary
   DROP CONSTRAINT product_mapping_vocabulary_canonical_product_id_fkey,
   ADD FOREIGN KEY (canonical_product_id) REFERENCES canonical_products(id),
   DROP CONSTRAINT product_mapping_vocabulary_country_id_fkey,
   ADD FOREIGN KEY (country_id) REFERENCES countries(id)`);
  const migration=path.join(__dirname,'../../database/migrations/019_mapping_vocabulary_cascade.sql');
  const sql=fs.readFileSync(migration,'utf8');await db.query(sql);await db.query(sql);
  const orphanCountry=String((await db.query("INSERT INTO countries(name,code,currency_code) VALUES('Test','ZZ','EUR') RETURNING id")).rows[0].id);
  const orphanCanonical=String((await db.query("INSERT INTO canonical_products(name) VALUES('Test product') RETURNING id")).rows[0].id);
  await db.query("INSERT INTO product_mapping_vocabulary(canonical_product_id,country_id,source_name) VALUES($1,$2,'Test product'),($3,$4,'Sugar 1 kg')",[orphanCanonical,italy,canonical,orphanCountry]);
  await db.query('DELETE FROM canonical_products WHERE id=$1',[orphanCanonical]);
  await db.query('DELETE FROM countries WHERE id=$1',[orphanCountry]);
  expect((await db.query('SELECT count(*)::int n FROM product_mapping_vocabulary')).rows[0].n).toBe(0);
 });

});
