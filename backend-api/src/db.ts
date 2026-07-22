/**
 * Database and Redis connection management for DistroMap API.
 *
 * Uses connection pooling (pg.Pool) for PostgreSQL and ioredis for Redis
 * caching. The pool reads DATABASE_URL and REDIS_URL from the environment.
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

// ─── PostgreSQL ──────────────────────────────────────────────────────

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://distromap:changeme@localhost:5432/distromap',
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected pool error:', err.message);
});

/** Execute a parameterized query. */
export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

// ─── Redis ───────────────────────────────────────────────────────────

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null; // stop retrying
    return Math.min(times * 200, 5000);
  },
  lazyConnect: false,
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

/** Get a cached value, or compute and cache it. */
export async function cached<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch { /* cache miss */ }

  const value = await compute();

  try {
    await redis.setex(key, ttlSec, JSON.stringify(value));
  } catch { /* non-critical */ }

  return value;
}

/** Invalidate a cache key. */
export async function invalidate(key: string): Promise<void> {
  try { await redis.del(key); } catch { /* non-critical */ }
}

/** Graceful shutdown. */
export async function closeDb(): Promise<void> {
  await pool.end();
  redis.disconnect();
}
