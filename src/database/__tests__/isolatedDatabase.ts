import { Client } from 'pg';

/**
 * A throwaway database created next to TEST_DATABASE_URL's, so a suite can
 * TRUNCATE freely while other integration suites run in parallel workers.
 * Requires CREATEDB on the test server.
 */
export async function createIsolatedDatabase(baseUrl: string, label: string): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `test_${label}_${process.pid}_${Date.now()}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      const cleanup = new Client({ connectionString: baseUrl });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
