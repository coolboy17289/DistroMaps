import { buildRoutes } from '../shared/api-handlers';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Root catch-all Vercel serverless function for /api/*.
 *
 * Vercel only auto-discovers serverless functions under the project-root
 * `api/` directory, so this root entry is what actually gets deployed
 * (the sibling `frontend/api/` copy is used only as a reference / for the
 * React dev server). All routing is delegated to the shared route table in
 * `shared/api-handlers.ts`, which handles URL parsing + dataset loading
 * itself. The only endpoint the Vue app calls at runtime is POST /api/suggest
 * (a live Wikipedia lookup that needs no dataset), but the full table is
 * mounted so every /api/* route works in production too.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const routes = buildRoutes();

  for (const r of routes) {
    await r.handle(req, res, {}, {});
    if (res.headersSent) return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'route_not_found', url: req.url }));
}