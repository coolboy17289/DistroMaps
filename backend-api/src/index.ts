/**
 * DistroMap Backend API Server
 *
 * Express 5 server backed by PostgreSQL + Redis.
 * Provides backward-compatible routes matching the existing SPA contract,
 * plus new endpoints for recommendations, internal ingestion, and full graph data.
 */

import express from 'express';
import cors from 'cors';
import { pool, redis, closeDb, cached } from './db.js';
import { buildRoutes } from './routes.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

// ─── Middleware ───────────────────────────────────────────────────────

app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

// ─── Health check ────────────────────────────────────────────────────

app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT count(*) AS n FROM entities WHERE type = $1', ['distro']);
    res.json({ status: 'ok', distros: parseInt(rows[0].n as string, 10) });
  } catch (err) {
    res.status(500).json({ status: 'error', message: (err as Error).message });
  }
});

// ─── Mount all routes ────────────────────────────────────────────────

const routes = buildRoutes();
for (const r of routes) {
  const method = r.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
  if (method === 'get') {
    app.get(r.path, r.handler);
  } else if (method === 'post') {
    app.post(r.path, r.handler);
  }
}

// ─── Start ───────────────────────────────────────────────────────────

async function start() {
  try {
    // Verify DB connection
    await pool.query('SELECT 1');
    console.log('✓ PostgreSQL connected');

    // Verify Redis connection
    try {
      await redis.connect();
      await redis.ping();
      console.log('✓ Redis connected');
    } catch {
      console.warn('⚠ Redis not available — caching disabled');
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ DistroMap API listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('✗ Failed to start:', (err as Error).message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await closeDb();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await closeDb();
  process.exit(0);
});

start();
