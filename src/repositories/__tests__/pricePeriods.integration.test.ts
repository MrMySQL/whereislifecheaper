/** Run against a disposable database: TEST_DATABASE_URL=postgres://... npm test -- pricePeriods.integration */
import { Client } from 'pg';
import { applyMigrations } from '../../../scripts/migrate';
import { createIsolatedDatabase } from '../../database/__tests__/isolatedDatabase';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('price periods (PostgreSQL)', () => {
  let client: Client;
  let products: import('../../services/ProductService').ProductService;
  let history: import('../ProductRepository').ProductRepository;
  let closePool: () => Promise<void>;
  let store: string;
  let dropDatabase: (() => Promise<void>) | undefined;

  const migrate = () => applyMigrations(client);

  beforeAll(async () => {
    // Own database: the TRUNCATEs below must not hit other suites' rows.
    const isolated = await createIsolatedDatabase(databaseUrl!, 'price_periods');
    dropDatabase = isolated.drop;
    process.env.DATABASE_URL = isolated.url;
    client = new Client({ connectionString: isolated.url });
    await client.connect();
    await migrate();
    const { ProductService } = await import('../../services/ProductService');
    const { ProductRepository } = await import('../ProductRepository');
    closePool = (await import('../../config/database')).closePool;
    products = new ProductService();
    history = new ProductRepository();
  }, 60000);

  beforeEach(async () => {
    await client.query('TRUNCATE countries, canonical_products, products CASCADE');
    const country = await client.query("INSERT INTO countries(name,code,currency_code) VALUES ('Test Turkey','T1','TRY') RETURNING id");
    const stores = await client.query("INSERT INTO supermarkets(name,country_id,website_url,scraper_class) VALUES ('Store A',$1,'https://a.example','TestScraper') RETURNING id", [country.rows[0].id]);
    store = String(stores.rows[0].id);
  });

  afterAll(async () => {
    if (closePool) await closePool();
    if (client) await client.end();
    if (dropDatabase) await dropDatabase();
  });

  const bottle = (overrides: Record<string, unknown> = {}) => ({
    name: 'Abant water 5 L', unit: 'pieces', unitQuantity: 1, price: 100,
    currency: 'TRY', isAvailable: true, isOnSale: false,
    externalId: 'water-5', productUrl: 'https://a.example/water-5', ...overrides,
  });

  const periods = async () => (await client.query(
    'SELECT price::float, first_seen_at, scraped_at FROM prices ORDER BY first_seen_at, id'
  )).rows;

  /** Pretend every recorded sighting happened `days` earlier. */
  async function ageEverything(days: number) {
    const shift = `${days} days`;
    await client.query('UPDATE prices SET first_seen_at = first_seen_at - $1::interval, scraped_at = scraped_at - $1::interval', [shift]);
    await client.query('UPDATE product_mappings SET last_checked_at = last_checked_at - $1::interval, last_scraped_at = last_scraped_at - $1::interval', [shift]);
  }

  test('migrations stay idempotent with the period schema', async () => {
    await migrate();
    const cols = (await client.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='prices'")).rows;
    expect(cols.map(c => c.column_name)).toContain('first_seen_at');
    expect(cols.map(c => c.column_name)).not.toContain('created_at');
    expect(cols.find(c => c.column_name === 'first_seen_at')?.is_nullable).toBe('NO');
    const idx = (await client.query("SELECT indexname FROM pg_indexes WHERE tablename='prices'")).rows.map(r => r.indexname);
    expect(idx).toEqual(expect.arrayContaining(['prices_pkey', 'idx_prices_mapping_scraped']));
    expect(idx).not.toEqual(expect.arrayContaining(['idx_prices_mapping']));
    expect(idx).not.toContain('idx_prices_scraped_at');
    expect(idx).not.toContain('idx_prices_currency');
  });

  test('an unchanged price extends one period instead of adding rows', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    const rows = await periods();
    expect(rows).toHaveLength(1);
    expect(rows[0].scraped_at.getTime()).toBeGreaterThan(rows[0].first_seen_at.getTime());
    // Readers compare the newest price with the newest check.
    const { rows: [fresh] } = await client.query(
      'SELECT pr.scraped_at >= pm.last_checked_at AS checked, pm.quantity_info IS NOT DISTINCT FROM pr.quantity_info AS same_quantity FROM prices pr JOIN product_mappings pm ON pm.id = pr.product_mapping_id'
    );
    expect(fresh).toEqual({ checked: true, same_quantity: true });
  });

  test('a price change opens a new period and keeps the old one', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await products.bulkSaveProducts([bottle({ price: 120 })], store, 'TRY');
    await products.bulkSaveProducts([bottle({ price: 120 })], store, 'TRY');
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    expect((await periods()).map(r => r.price)).toEqual([100, 120, 100]);
  });

  test('a sale flag or original price change opens a new period', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await products.bulkSaveProducts([bottle({ isOnSale: true, originalPrice: 130 })], store, 'TRY');
    expect(await periods()).toHaveLength(2);
  });

  test('a sub-cent difference that rounds to the stored price continues the period', async () => {
    // No known contents, so quantity_info carries no unrounded unit price.
    const loaf = (price: number) => bottle({ name: 'Village bread', unitQuantity: undefined, price });
    await products.bulkSaveProducts([loaf(2.5)], store, 'TRY');
    await products.bulkSaveProducts([loaf(2.499)], store, 'TRY');
    expect(await periods()).toHaveLength(1);
    const { rows: [q] } = await client.query("SELECT quantity_info->'comparablePrice' AS cp FROM prices");
    expect(q.cp).toBeNull();
  });

  test('a changed unit price inside quantity_info opens a period, keeping it equal to the mapping', async () => {
    // Readers require pm.quantity_info IS NOT DISTINCT FROM the newest price's.
    await products.bulkSaveProducts([bottle({ price: 2.5 })], store, 'TRY');
    await products.bulkSaveProducts([bottle({ price: 2.499 })], store, 'TRY');
    expect(await periods()).toHaveLength(2);
  });

  test('an out-of-stock sighting in between starts a new period at the same price', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await products.bulkSaveProducts([bottle({ isAvailable: false, price: 0 })], store, 'TRY');
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    expect((await periods()).map(r => r.price)).toEqual([100, 100]);
  });

  test('a scrape missing the product does not break the period', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await products.bulkSaveProducts([], store, 'TRY');
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    expect(await periods()).toHaveLength(1);
  });

  test('bridges one missed scrape but not a longer outage', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await ageEverything(6);
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    expect(await periods()).toHaveLength(1);
    await ageEverything(8);
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    expect(await periods()).toHaveLength(2);
  });

  test('the single-product fallback writes periods too', async () => {
    await products.saveProduct(bottle(), store);
    await products.saveProduct(bottle(), store);
    expect(await periods()).toHaveLength(1);
  });

  test('price history draws both ends of a period, clipped to the window', async () => {
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await ageEverything(5);
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    await ageEverything(5);
    await products.bulkSaveProducts([bottle()], store, 'TRY');
    const productId = String((await client.query('SELECT id FROM products')).rows[0].id);

    const wide = await history.getPriceHistory(productId, { days: 30 });
    expect(wide).toHaveLength(2);
    const [newest, oldest] = wide.map(p => new Date(p.scraped_at).getTime());
    expect(Date.now() - newest).toBeLessThan(60_000);
    expect(Math.round((Date.now() - oldest) / 86_400_000)).toBe(10);

    const narrow = await history.getPriceHistory(productId, { days: 7 });
    expect(narrow).toHaveLength(2);
    expect(Math.round((Date.now() - new Date(narrow[1].scraped_at).getTime()) / 86_400_000)).toBe(7);
  });
});
