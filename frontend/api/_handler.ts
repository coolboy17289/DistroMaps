import { buildRoutes } from '../../shared/api-handlers';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const config = { runtime: 'nodejs20.x' };

/**
 * Adapter that lets the Vercel `req`/`res` objects route through our shared
 * API handlers. Keeps the serverless functions tiny — every /api/*.ts file
 * just re-exports this handler.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const routes = buildRoutes();
  const url = (req.url ?? '').split('?')[0];
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec(url + (req.url?.includes('?') ? '?' + (req.url?.split('?')[1] ?? '') : ''));
    if (!m) continue;
    return r.handle(req, res, m.groups ?? {}, parseQuery(req.url ?? ''));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'route_not_found' }));
}

function parseQuery(url: string): Record<string, string> {
  const qs = url.split('?')[1] ?? '';
  const out: Record<string, string> = {};
  for (const part of qs.split('&')) {
    if (!part) continue;
    const [k, v] = part.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return out;
}
