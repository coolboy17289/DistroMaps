/**
 * Redis client for DistroMap caching.
 * Uses ioredis with lazy connection and graceful shutdown.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import Redis from 'ioredis';

let client: Redis | null = null;

function getClient(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });
    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
  }
  return client;
}

/**
 * Get a cached value by key.
 */
export async function cacheGet<T = any>(key: string): Promise<T | null> {
  try {
    const redis = getClient();
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet(
  key: string,
  value: any,
  ttlSeconds: number = 300,
): Promise<void> {
  try {
    const redis = getClient();
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    console.error('[Redis] Set error:', err);
  }
}

/**
 * Invalidate (delete) a cached key.
 */
export async function cacheInvalidate(key: string): Promise<void> {
  try {
    const redis = getClient();
    await redis.del(key);
  } catch {
    // ignore
  }
}

/**
 * Read-through cache: get from cache, or compute and store.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;

  const value = await compute();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/**
 * Close the Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
