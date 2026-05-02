import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { config } from '../config';

// Drizzle ORM instance — used by repositories for type-safe queries
let _db: NodePgDatabase<typeof schema> | null = null;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

/**
 * PostgreSQL connection pool.
 * Uses a single pool instance shared across the application.
 * The pool manages connection lifecycle, idle timeouts, and reconnection.
 */
let pool: Pool | null = null;

/**
 * Returns the singleton PostgreSQL connection pool.
 * Creates the pool on first call.
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      ssl: config.DATABASE_URL.includes('render.com') || config.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: 20, // maximum number of clients in the pool
      idleTimeoutMillis: 30_000, // close idle clients after 30 seconds
      connectionTimeoutMillis: 5_000, // return an error after 5 seconds if connection cannot be established
      allowExitOnIdle: false,
    });

    pool.on('error', (err: Error) => {
      // Log unexpected errors on idle clients
      // eslint-disable-next-line no-console
      console.error('[DB] Unexpected error on idle client:', err.message);
    });

    pool.on('connect', () => {
      // eslint-disable-next-line no-console
      console.info('[DB] New client connected to PostgreSQL');
    });
  }

  return pool;
}

/**
 * Executes a parameterized query against the pool.
 * Automatically acquires and releases a client.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await getPool().query<T>(text, params);
  const duration = Date.now() - start;

  if (config.LOG_LEVEL === 'debug') {
    // eslint-disable-next-line no-console
    console.debug('[DB] Query executed', {
      text: text.substring(0, 100),
      duration,
      rows: result.rowCount,
    });
  }

  return result;
}

/**
 * Acquires a dedicated client from the pool for use in transactions.
 * The caller is responsible for calling client.release() when done.
 *
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     // ... queries ...
 *     await client.query('COMMIT');
 *   } catch (err) {
 *     await client.query('ROLLBACK');
 *     throw err;
 *   } finally {
 *     client.release();
 *   }
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Executes a function within a database transaction.
 * Automatically commits on success and rolls back on error.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Tests the database connection by running a simple query.
 * Used during application startup to verify connectivity.
 */
export async function testConnection(): Promise<void> {
  const result = await query<{ now: Date }>('SELECT NOW() as now');
  // eslint-disable-next-line no-console
  console.info('[DB] Connected to PostgreSQL. Server time:', result.rows[0].now);
}

/**
 * Gracefully closes the connection pool.
 * Should be called during application shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    // eslint-disable-next-line no-console
    console.info('[DB] Connection pool closed');
  }
}
