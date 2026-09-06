import fs from 'fs';
import path from 'path';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('maintenance review PostgreSQL', () => {
  let query: typeof import('../../config/database').query;
  let closePool: typeof import('../../config/database').closePool;
  let Repository: typeof import('../../repositories/ProductMaintenanceRepository').ProductMaintenanceRepository;
  let Service: typeof import('../ProductMaintenanceService').ProductMaintenanceService;
  let interpret: typeof import('../../utils/productQuantity').interpretProductQuantity;
  let serial = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    ({ query, closePool } = require('../../config/database'));
    ({ ProductMaintenanceRepository: Repository } = require('../../repositories/ProductMaintenanceRepository'));
    ({ ProductMaintenanceService: Service } = require('../ProductMaintenanceService'));
    ({ interpretProductQuantity: interpret } = require('../../utils/productQuantity'));
    const directory = path.join(__dirname, '../../database/migrations');
    for (let pass = 0; pass < 2; pass++) {
      for (const file of fs.readdirSync(directory).filter(f => f.endsWith('.sql')).sort()) {
        await query(fs.readFileSync(path.join(directory, file), 'utf8'));
      }
    }
  }, 30000);
  afterAll(async () => { if (closePool) await closePool(); });

  async function fixture() {
    const suffix = `${Date.now()}-${++serial}`;
    const country = (await query("INSERT INTO countries(name,code,currency_code) VALUES('Maintenance integration','ZX','EUR') ON CONFLICT(code) DO UPDATE SET currency_code='EUR' RETURNING id")).rows[0].id;
    const store = (await query("INSERT INTO supermarkets(country_id,name,website_url,scraper_class) VALUES($1,$2,'https://test.invalid','test') RETURNING id", [country, suffix])).rows[0].id;
    const canonical = String((await query("INSERT INTO canonical_products(name,show_per_unit_price) VALUES($1,true) RETURNING id", [`Apple 1 kg ${suffix}`])).rows[0].id);
    const oldProduct = (await query("INSERT INTO products(name,canonical_product_id) VALUES('Jabuka 1 kg',$1) RETURNING id", [canonical])).rows[0].id;
    await query("INSERT INTO product_mappings(product_id,supermarket_id,external_id,url,availability_status,last_checked_at) VALUES($1,$2,'old','https://test.invalid/old','out_of_stock',now())", [oldProduct, store]);
    const product = String((await query("INSERT INTO products(name,unit,unit_quantity) VALUES('Jabuka 5 kg','pieces',1) RETURNING id")).rows[0].id);
    const quantity = interpret({ name: 'Jabuka 5 kg', unit: 'pieces', unitQuantity: 1, price: 4 });
    const mapping = String((await query("INSERT INTO product_mappings(product_id,supermarket_id,external_id,url,availability_status,last_checked_at,quantity_info) VALUES($1,$2,'new','https://test.invalid/new','available',now(),$3) RETURNING id", [product, store, JSON.stringify(quantity)])).rows[0].id);
    await query("INSERT INTO prices(product_mapping_id,price,currency,quantity_info) VALUES($1,4,'EUR',$2)", [mapping, JSON.stringify(quantity)]);
    const repository = new Repository();
    const allTargets = repository.targets.bind(repository);
    repository.targets = async (_limit, gapsOnly) => (await allTargets(10000, gapsOnly)).filter(t => t.canonical_product_id === canonical && String(t.supermarket_id) === String(store));
    const service = new Service(repository, async (_target, candidates) => candidates.map(candidate => candidate.mapping_id));
    return { service, repository, canonical, product, mapping, quantity };
  }
  async function proposal(f: Awaited<ReturnType<typeof fixture>>) {
    await f.service.run(25, false);
    return String((await f.service.suggestions()).data.find(s => String(s.mapping_id) === f.mapping)!.id);
  }

  test('local exemplar finds new retailer ID and permits a five kg per-unit bag', async () => {
    const f = await fixture();
    const id = await proposal(f);
    expect(id).toBeTruthy();
    expect((await f.service.suggestions()).data.find(s => String(s.id) === id)?.payload.quantity).toMatchObject({ contentQuantity: 5, contentUnit: 'kg' });
  });
  test('rejected proposals are remembered on repeated runs', async () => {
    const f = await fixture();
    const id = await proposal(f);
    await f.service.review(id, 'reject', 'integration');
    expect((await f.service.run(25, false)).proposed).toBe(0);
    expect((await query('SELECT status FROM product_maintenance_suggestions WHERE id=$1', [id])).rows[0].status).toBe('rejected');
  });
  test('approval rechecks stock, then audits once and supports idempotent undo', async () => {
    const f = await fixture();
    const id = await proposal(f);
    await query("UPDATE product_mappings SET availability_status='out_of_stock' WHERE id=$1", [f.mapping]);
    await expect(f.service.review(id, 'approve', 'integration')).rejects.toThrow('unavailable');
    await query("UPDATE product_mappings SET availability_status='available' WHERE id=$1", [f.mapping]);
    await f.service.review(id, 'approve', 'integration');
    await f.service.review(id, 'approve', 'integration');
    expect((await query('SELECT canonical_product_id::text FROM products WHERE id=$1', [f.product])).rows[0].canonical_product_id).toBe(f.canonical);
    expect(Number((await query("SELECT count(*) FROM product_maintenance_reviews WHERE suggestion_id=$1 AND action='approve'", [id])).rows[0].count)).toBe(1);
    expect((await f.service.review(id, 'undo', 'integration')).status).toBe('undone');
    expect((await f.service.review(id, 'undo', 'integration')).status).toBe('undone');
    expect((await query('SELECT canonical_product_id FROM products WHERE id=$1', [f.product])).rows[0].canonical_product_id).toBeNull();
  });
  test('undo refuses a classification edited after approval', async () => {
    const f = await fixture();
    const id = await proposal(f);
    await f.service.review(id, 'approve', 'integration');
    await query('UPDATE products SET canonical_product_id=NULL WHERE id=$1', [f.product]);
    await expect(f.service.review(id, 'undo', 'integration')).rejects.toThrow('undo conflict');
    expect((await query('SELECT status FROM product_maintenance_suggestions WHERE id=$1', [id])).rows[0].status).toBe('approved');
  });
  test('coverage uses latest price only and rejects changed observation snapshots', async () => {
    const f = await fixture();
    await query('UPDATE products SET canonical_product_id=$2 WHERE id=$1', [f.product, f.canonical]);
    expect((await f.repository.targets())[0].fresh_count).toBe(1);
    const conflict = { ...f.quantity, status: 'conflict', comparablePrice: null };
    await query("INSERT INTO prices(product_mapping_id,price,currency,quantity_info,scraped_at) VALUES($1,4,'EUR',$2,now()+interval '1 second')", [f.mapping, JSON.stringify(conflict)]);
    expect((await f.repository.targets())[0].fresh_count).toBe(0);
    await query('UPDATE product_mappings SET quantity_info=$2 WHERE id=$1', [f.mapping, JSON.stringify(conflict)]);
    expect((await f.repository.targets())[0].fresh_count).toBe(0);
  });
  test('pending proposals refresh changed raw evidence before approval', async () => {
    const f = await fixture();
    const id = await proposal(f);
    await query("UPDATE products SET name='Jabuka fresh 5 kg' WHERE id=$1", [f.product]);
    await expect(f.service.review(id, 'approve', 'integration')).rejects.toThrow('details changed');
    expect((await f.service.run(25, false)).proposed).toBe(1);
    expect((await f.service.review(id, 'approve', 'integration')).status).toBe('approved');
  });
  test('offer raw description and explicit price basis take precedence over shared product fields', async () => {
    const f = await fixture();
    const quantity = interpret({ name: 'Jabuka bag', description: '5 kg', unit: 'pieces', unitQuantity: 1, price: 4, priceBasis: 'kg' });
    await query('UPDATE product_mappings SET raw_observation=$2,quantity_info=$3 WHERE id=$1', [f.mapping, JSON.stringify({ name: 'Jabuka bag', description: '5 kg', unit: 'pieces', unit_quantity: 1, price_basis: 'kg' }), JSON.stringify(quantity)]);
    await query("INSERT INTO prices(product_mapping_id,price,currency,quantity_info,scraped_at) VALUES($1,4,'EUR',$2,now()+interval '1 second')", [f.mapping, JSON.stringify(quantity)]);
    const id = await proposal(f);
    expect((await f.service.review(id, 'approve', 'integration')).status).toBe('approved');
  });
});
