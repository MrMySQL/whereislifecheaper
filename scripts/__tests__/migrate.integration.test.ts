/** Run against a disposable server: TEST_DATABASE_URL=postgres://... npm test -- migrate.integration */
import { Client } from 'pg';
import { applyMigrations } from '../migrate';
import { createIsolatedDatabase, runTeardown } from '../../src/database/__tests__/isolatedDatabase';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('applyMigrations (PostgreSQL)', () => {
  let url: string;
  let drop: () => Promise<void>;
  const clients: Client[] = [];

  async function connect() {
    const client = new Client({ connectionString: url });
    await client.connect();
    clients.push(client);
    return client;
  }

  beforeAll(async () => ({ url, drop } = await createIsolatedDatabase(databaseUrl!, 'migrate')));
  afterAll(() => runTeardown([...clients.map(c => () => c.end()), drop]));

  test('concurrent runners on a fresh database both succeed', async () => {
    // scrape.yml and scrape-rent.yml can migrate at the same time. Without the
    // lock, the second runner's IF NOT EXISTS / DO-block DDL races the first.
    const [a, b] = await Promise.all([connect(), connect()]);
    const [first, second] = await Promise.all([applyMigrations(a), applyMigrations(b)]);
    expect(second).toEqual(first);
    const { rows } = await a.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'prices' AND column_name = 'first_seen_at'");
    expect(rows[0].n).toBe(1);
  }, 60000);

  test('a failing migration rolls back the whole run and releases the lock', async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    fs.writeFileSync(path.join(dir, '001_ok.sql'), 'CREATE TABLE rollback_probe (id int);');
    fs.writeFileSync(path.join(dir, '002_bad.sql'), 'SELECT * FROM table_that_does_not_exist;');
    const client = await connect();
    await expect(applyMigrations(client, dir)).rejects.toThrow('table_that_does_not_exist');
    const { rows } = await client.query("SELECT to_regclass('rollback_probe') AS t");
    expect(rows[0].t).toBeNull();
    // Lock released: a normal run still goes through on the same connection.
    await expect(applyMigrations(client)).resolves.toContain('020_price_periods.sql');
  }, 60000);
});
