import type { Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildRoutes } from '../../shared/api-handlers';

/**
 * Mount all API routes onto a Vite connect middleware stack (used in dev).
 * Delegates to the shared route table which handles all URL parsing internally.
 */
export function mountApiRoutes(app: Connect.Server): void {
  const routes = buildRoutes();
  app.use(async (req: IncomingMessage, res: ServerResponse, next) => {
    const url = (req.url ?? '').split('?')[0];
    if (!url.startsWith('/api/')) return next();

    for (const r of routes) {
      await r.handle(req, res, {}, {});
      if (res.headersSent) return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'route_not_found', url }));
  });
}
