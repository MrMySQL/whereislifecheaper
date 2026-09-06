/** Run against a disposable database: TEST_DATABASE_URL=postgres://... npm test -- productMaintenance.integration */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('offer observations and current comparisons (PostgreSQL)', () => {
  let client: Client;
  let products: import('../ProductService').ProductService;
  let canonical: import('../../repositories/CanonicalProductRepository').CanonicalProductRepository;
  let closePool: () => Promise<void>;
  let store: string;
  let secondStore: string;
  let canonicalId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const dir = path.join(__dirname, '../../database/migrations');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
    const { ProductService } = await import('../ProductService');
    const { CanonicalProductRepository } = await import('../../repositories/CanonicalProductRepository');
    closePool = (await import('../../config/database')).closePool;
    products = new ProductService();
    canonical = new CanonicalProductRepository();
  }, 60000);

  beforeEach(async () => {
    await client.query('TRUNCATE countries, canonical_products, products CASCADE');
    const countries = await client.query("INSERT INTO countries(name,code,currency_code) VALUES ('Test Turkey','T1','TRY'),('Test Spain','T2','EUR') RETURNING id");
    const stores = await client.query("INSERT INTO supermarkets(name,country_id,website_url,scraper_class) VALUES ('Store A',$1,'https://a.example','TestScraper'),('Store B',$2,'https://b.example','TestScraper') RETURNING id", countries.rows.map(r => r.id));
    store = String(stores.rows[0].id);
    secondStore = String(stores.rows[1].id);
    canonicalId = String((await client.query("INSERT INTO canonical_products(name,show_per_unit_price) VALUES('Water',true) RETURNING id")).rows[0].id);
  });

  afterAll(async () => { if (closePool) await closePool(); if (client) await client.end(); });

  const bottle = (overrides: Record<string, unknown> = {}) => ({
    name: 'Abant water 5 L', unit: 'pieces', unitQuantity: 1, price: 100,
    currency: 'TRY', isAvailable: true, isOnSale: false,
    externalId: 'water-5', productUrl: 'https://a.example/water-5', ...overrides,
  });

  async function linkAll() {
    await client.query('UPDATE products SET canonical_product_id=$1', [canonicalId]);
  }

  test('saves selling unit separately from package interpretation and price snapshot', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    const { rows: [row] } = await client.query('SELECT p.unit,p.unit_quantity,pm.availability_status,pm.last_checked_at,pm.last_available_at,pm.quantity_info,pm.raw_observation,pr.quantity_info AS price_quantity,pr.price_per_unit FROM products p JOIN product_mappings pm ON p.id=pm.product_id JOIN prices pr ON pr.product_mapping_id=pm.id');
    expect(row.unit).toBe('pieces');
    expect(row.raw_observation).toMatchObject({name:'Abant water 5 L',unit:'pieces',unit_quantity:1,price_basis:null});
    expect(Number(row.unit_quantity)).toBe(1);
    expect(row.quantity_info).toMatchObject({status:'verified',contentQuantity:5,contentUnit:'l',comparablePrice:20});
    expect(row.price_quantity).toEqual(row.quantity_info);
    expect(Number(row.price_per_unit)).toBe(20);
    expect(row.availability_status).toBe('available');
    expect(row.last_checked_at).toBeTruthy();
    expect(row.last_available_at).toBeTruthy();
  });

  test('out-of-stock sightings update observations but never create a current price', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    const initial = (await client.query('SELECT last_available_at FROM product_mappings')).rows[0];
    await products.bulkSaveProducts([bottle({isAvailable:false, price:0})], store, 'TRY');
    const row = (await client.query('SELECT availability_status,is_available,last_available_at FROM product_mappings')).rows[0];
    expect(row.availability_status).toBe('out_of_stock');
    expect(row.is_available).toBe(false);
    expect(row.last_available_at).toEqual(initial.last_available_at);
    expect(Number((await client.query('SELECT count(*) FROM prices')).rows[0].count)).toBe(1);
    await products.bulkSaveProducts([], store, 'TRY');
    expect((await client.query('SELECT availability_status FROM product_mappings')).rows[0].availability_status).toBe('out_of_stock');
    await products.bulkSaveProducts([bottle({price:125})], store, 'TRY');
    expect((await client.query('SELECT availability_status FROM product_mappings')).rows[0].availability_status).toBe('available');
    expect(Number((await client.query('SELECT count(*) FROM prices')).rows[0].count)).toBe(2);
  });

  test('single-product fallback refreshes observations even when external ID already exists', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await client.query("UPDATE product_mappings SET last_scraped_at=NOW()-INTERVAL '60 days'");
    await products.findOrCreateProduct(bottle({isAvailable:false}), store);
    const row = (await client.query('SELECT availability_status,last_scraped_at > NOW()-INTERVAL \'1 day\' AS recent FROM product_mappings')).rows[0];
    expect(row.availability_status).toBe('out_of_stock');
    expect(row.recent).toBe(true);
  });

  test('new external IDs preserve old listing history', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await products.bulkSaveProducts([bottle({externalId:'new-id',productUrl:'https://a.example/new'})], store, 'TRY');
    expect(Number((await client.query('SELECT count(*) FROM product_mappings')).rows[0].count)).toBe(2);
    expect(Number((await client.query('SELECT count(*) FROM prices')).rows[0].count)).toBe(2);
  });

  test('current comparisons omit unavailable, stale, duplicate and quantity-conflicting offers', async () => {
    await products.bulkSaveProducts([bottle(),bottle({externalId:'stale',productUrl:'https://a.example/stale'}),bottle({externalId:'unknown',productUrl:'https://a.example/unknown',name:'Water bottle',unitQuantity:1})],store,'TRY');
    await products.bulkSaveProducts([bottle({price:10,currency:'EUR',productUrl:'https://b.example/water'})],secondStore,'EUR');
    await linkAll();
    await client.query("UPDATE prices SET scraped_at=NOW()-INTERVAL '60 days' WHERE product_mapping_id IN (SELECT id FROM product_mappings WHERE external_id='stale')");
    let result = await canonical.getComparison({}, {limit:100,offset:0});
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(2);
    expect(result.data.map(r => Number(r.price_per_unit)).sort((a,b)=>a-b)).toEqual([2,20]);
    await products.bulkSaveProducts([bottle({isAvailable:false})],store,'TRY');
    result = await canonical.getComparison({}, {limit:100,offset:0});
    expect(result.total).toBe(0);
    expect(result.data).toEqual([]);
  });

  test('a new invalid-price observation cannot revive an older usable price', async () => {
    await products.bulkSaveProducts([bottle()],store,'TRY');
    await products.bulkSaveProducts([bottle({currency:'EUR',price:10})],secondStore,'EUR');
    await linkAll();
    expect((await canonical.getComparison({}, {limit:100,offset:0})).total).toBe(1);
    await products.bulkSaveProducts([bottle({price:0})],store,'TRY');
    expect((await canonical.getComparison({}, {limit:100,offset:0})).total).toBe(0);
  });

  test.each([
    { perUnit: true, unit: 'kg', quantity: 5, eligible: false },
    { perUnit: false, unit: 'l', quantity: 6, eligible: false },
    { perUnit: false, unit: 'l', quantity: 5, eligible: true },
    { perUnit: true, unit: 'l', quantity: 1, eligible: true },
  ])('comparison respects canonical policy %j', async ({perUnit, unit, quantity, eligible}) => {
    await products.bulkSaveProducts([bottle()],store,'TRY');
    await products.bulkSaveProducts([bottle({currency:'EUR',price:10})],secondStore,'EUR');
    await linkAll();
    await client.query('UPDATE canonical_products SET show_per_unit_price=$1 WHERE id=$2', [perUnit,canonicalId]);
    await client.query('INSERT INTO product_maintenance_policies(canonical_product_id,expected_unit,expected_quantity) VALUES($1,$2,$3)', [canonicalId,unit,quantity]);
    const result = await canonical.getComparison({}, {limit:100,offset:0});
    expect(result.total).toBe(eligible ? 1 : 0);
    expect(result.data).toHaveLength(eligible ? 2 : 0);
    if (!eligible) expect(result.freshness).toEqual({newest:null,oldest:null});
  });

  test('package changes preserve the original price interpretation', async () => {
    await products.bulkSaveProducts([bottle()],store,'TRY');
    await products.bulkSaveProducts([bottle({name:'Abant water 2 L',price:60})],store,'TRY');
    const snapshots = (await client.query('SELECT quantity_info FROM prices ORDER BY id')).rows;
    expect(snapshots[0].quantity_info).toMatchObject({contentQuantity:5,comparablePrice:20});
    expect(snapshots[1].quantity_info).toMatchObject({contentQuantity:2,comparablePrice:30});
  });

  test('a failed price insert rolls back its availability observation', async () => {
    await products.bulkSaveProducts([bottle()],store,'TRY');
    const before = (await client.query('SELECT quantity_info,last_checked_at FROM product_mappings')).rows[0];
    await client.query("CREATE OR REPLACE FUNCTION reject_test_price() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test price insertion failure'; END $$");
    await client.query('CREATE TRIGGER reject_test_price BEFORE INSERT ON prices FOR EACH ROW EXECUTE FUNCTION reject_test_price()');
    try {
      await expect(products.bulkSaveProducts([bottle({price:125})],store,'TRY')).rejects.toThrow('test price insertion failure');
      const after = (await client.query('SELECT quantity_info,last_checked_at FROM product_mappings')).rows[0];
      expect(after).toEqual(before);
    } finally {
      await client.query('DROP TRIGGER reject_test_price ON prices');
      await client.query('DROP FUNCTION reject_test_price()');
    }
  });

  test('migrations can be replayed without overwriting observations', async () => {
    await products.bulkSaveProducts([bottle({isAvailable:false})],store,'TRY');
    const dir = path.join(__dirname, '../../database/migrations');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await client.query(fs.readFileSync(path.join(dir,file),'utf8'));
    expect((await client.query('SELECT availability_status FROM product_mappings')).rows[0].availability_status).toBe('out_of_stock');
  });
});
