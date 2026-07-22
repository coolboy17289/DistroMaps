/**
 * PostgreSQL connection pool for DistroMap.
 * Uses pg with connection pooling and graceful shutdown.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool, QueryResult, QueryResultRow } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterized query.
 */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (duration > 500) {
    console.warn(`[DB] Slow query (${duration}ms):`, text.slice(0, 100));
  }
  return result;
}

/**
 * Get a single row or null.
 */
export async function queryOne<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: any[],
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/**
 * Get the pool for transactions.
 */
export { pool };

/**
 * Graceful shutdown.
 */
export async function closePool(): Promise<void> {
  await pool.end();
}
