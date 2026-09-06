import fs from 'fs';
import path from 'path';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('maintenance pagination PostgreSQL', () => {
  let query: typeof import('../../config/database').query;
  let closePool: typeof import('../../config/database').closePool;
  let repository: import('../ProductMaintenanceRepository').ProductMaintenanceRepository;
  let country: string;
  let store: string;
  let canonicals: string[] = [];
  const prefix = `pagination-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    ({ query, closePool } = require('../../config/database'));
    const { ProductMaintenanceRepository } = require('../ProductMaintenanceRepository');
    repository = new ProductMaintenanceRepository();
    const directory = path.join(__dirname, '../../database/migrations');
    for (const file of fs.readdirSync(directory).filter(f => f.endsWith('.sql')).sort()) {
      await query(fs.readFileSync(path.join(directory, file), 'utf8'));
    }
    country = String((await query("INSERT INTO countries(name,code,currency_code) VALUES($1,'QZ','EUR') RETURNING id", [prefix])).rows[0].id);
    store = String((await query("INSERT INTO supermarkets(country_id,name,website_url,scraper_class) VALUES($1,$2,'https://test.invalid','test') RETURNING id", [country,prefix])).rows[0].id);
    canonicals = (await query("INSERT INTO canonical_products(name) SELECT $1 || n::text FROM generate_series(1,1005) n RETURNING id::text", [prefix])).rows.map(row=>row.id);
    await query("INSERT INTO products(name) SELECT $1 || n::text FROM generate_series(1,205) n", [prefix]);
    await query("INSERT INTO product_mappings(product_id,supermarket_id,external_id,url) SELECT id,$1,id::text,'https://test.invalid' FROM products WHERE name LIKE $2", [store,`${prefix}%`]);
    await query(`INSERT INTO product_maintenance_suggestions(canonical_product_id,mapping_id,product_id,country_id,supermarket_id,payload)
      SELECT $1,id,product_id,$2,supermarket_id,'{}'::jsonb FROM product_mappings WHERE supermarket_id=$3`, [canonicals[0],country,store]);
  }, 30000);

  afterAll(async () => {
    if (store) {
      await query('DELETE FROM product_maintenance_reviews WHERE suggestion_id IN (SELECT id FROM product_maintenance_suggestions WHERE supermarket_id=$1)', [store]);
      await query('DELETE FROM product_maintenance_suggestions WHERE supermarket_id=$1', [store]);
      await query('DELETE FROM prices WHERE product_mapping_id IN (SELECT id FROM product_mappings WHERE supermarket_id=$1)', [store]);
      await query('DELETE FROM product_mappings WHERE supermarket_id=$1', [store]);
      await query('DELETE FROM supermarkets WHERE id=$1', [store]);
    }
    await query('DELETE FROM products WHERE name LIKE $1', [`${prefix}%`]);
    await query('DELETE FROM canonical_products WHERE id=ANY($1::int[])', [canonicals]);
    if (country) await query('DELETE FROM countries WHERE id=$1', [country]);
    await closePool();
  });

  test('all coverage gaps remain reachable beyond 1000 with stable totals and country filtering', async () => {
    const first = await repository.coverage({country,gapsOnly:true,limit:200});
    expect(first.total).toBeGreaterThan(1000);
    expect(first.counts.missing).toBe(first.total);
    const seen = new Set(first.coverage.map(row=>row.canonical_product_id));
    for (let offset=200; offset<first.total; offset+=200) {
      const page = await repository.coverage({country,gapsOnly:true,limit:200,offset});
      expect(page.total).toBe(first.total);
      expect(page.coverage.every(row=>row.country_id===country && row.status==='missing')).toBe(true);
      for(const row of page.coverage) {
        expect(seen.has(row.canonical_product_id)).toBe(false);
        seen.add(row.canonical_product_id);
      }
    }
    expect(canonicals.every(id=>seen.has(id))).toBe(true);
    expect(seen.size).toBe(first.total);
    const empty = await repository.coverage({country,gapsOnly:true,offset:first.total+100});
    expect(empty.coverage).toEqual([]);expect(empty.total).toBe(first.total);expect(empty.counts).toEqual(first.counts);
  });

  test('coverage, discovery and approval reject a price older than the identical quantity observation', async () => {
    const quantity = require('../../utils/productQuantity').interpretProductQuantity({name:'Water 5 l',unit:'pieces',unitQuantity:1,price:3});
    const raw = {name:'Water 5 l',description:null,unit:'pieces',unit_quantity:1,price_basis:'package'};
    const mapping = (await query('SELECT id,product_id FROM product_mappings WHERE supermarket_id=$1 ORDER BY id LIMIT 1', [store])).rows[0];
    await query("UPDATE product_mappings SET raw_observation=$2,quantity_info=$3,last_checked_at=now(),availability_status='available' WHERE id=$1", [mapping.id,JSON.stringify(raw),JSON.stringify(quantity)]);
    await query("INSERT INTO prices(product_mapping_id,price,currency,quantity_info,scraped_at) VALUES($1,3,'EUR',$2,now()-interval '1 minute')", [mapping.id,JSON.stringify(quantity)]);
    await query('UPDATE products SET canonical_product_id=$2 WHERE id=$1', [mapping.product_id,canonicals[0]]);
    const coverage = await repository.coverage({country,gapsOnly:false,limit:200});
    const observed = coverage.coverage.find(row=>row.canonical_product_id===canonicals[0]);
    // Covered rows sort last, so use a direct target query for the assertion.
    const target = (await repository.targets(10000)).find(row=>row.canonical_product_id===canonicals[0] && row.supermarket_id===store)!;
    await query('UPDATE products SET canonical_product_id=NULL WHERE id=$1', [mapping.product_id]);
    const candidates = await repository.candidates({...target,name:'Water 5 l',aliases:[]});
    const suggestion = (await query('UPDATE product_maintenance_suggestions SET payload=$2 WHERE mapping_id=$1 RETURNING id', [mapping.id,JSON.stringify({raw})])).rows[0];
    const { ProductMaintenanceService } = require('../../services/ProductMaintenanceService');
    const review = new ProductMaintenanceService(repository).review(String(suggestion.id),'approve','integration');
    await expect(review).rejects.toThrow('classification conflict');
    expect(target.fresh_count).toBe(0);
    expect(observed?.fresh_count ?? target.fresh_count).toBe(0);
    expect(candidates).toEqual([]);
    await query('DELETE FROM prices WHERE product_mapping_id=$1', [mapping.id]);
  });

  test('suggestions after 200 are reachable and empty pages retain the filtered total', async () => {
    const first = await repository.suggestions('pending',country,{limit:200});
    const last = await repository.suggestions('pending',country,{limit:200,offset:200});
    expect(first).toMatchObject({count:200,total:205});expect(last).toMatchObject({count:5,total:205});
    const ids = [...first.data,...last.data].map(row=>String(row.id));
    expect(new Set(ids).size).toBe(205);
    expect(ids.map(Number)).toEqual(ids.map(Number).sort((a,b)=>b-a));
    expect(await repository.suggestions('pending',country,{offset:300})).toMatchObject({data:[],count:0,total:205});
    expect(await repository.suggestions('approved',country)).toMatchObject({data:[],total:0});
  });
});
