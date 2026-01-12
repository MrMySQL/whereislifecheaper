import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { config } from './env';

const poolConfig: PoolConfig = {
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('connect', () => {
  console.log('Database connection established');
});

/**
 * Execute a SQL query with parameters
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    console.error('Query error', { text, error });
    throw error;
  }
}

/**
 * Get a client from the pool for transaction support
 */
export async function getClient() {
  return await pool.connect();
}

/**
 * Close all database connections
 */
export async function closePool() {
  await pool.end();
  console.log('Database pool closed');
}

/**
 * Check if database connection is healthy
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export default pool;
