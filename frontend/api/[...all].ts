import { buildRoutes } from '../../shared/api-handlers';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const config = { runtime: 'nodejs20.x' };

/**
 * Catch-all Vercel serverless function for /api/*.
 * Delegates to the shared route table which handles all URL parsing internally.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const routes = buildRoutes();

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec(req.url ?? '');
    if (!m) continue;
    await r.handle(req, res, {}, {});
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'route_not_found', url: req.url }));
}
