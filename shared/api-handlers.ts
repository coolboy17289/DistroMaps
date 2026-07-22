import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type Distro,
  type FilterQuery,
  type Family,
  type GraphData,
  type PathResult,
  type StatsResponse,
  type SuggestPayload,
  type SuggestResponse,
} from './types';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the built dataset. We try several locations to handle both the
 * Vite dev server (frontend/server) and Vercel serverless function (the
 * project root) running contexts.
 */
function loadDataset(): GraphData {
  const candidates = [
    resolve(__dirname, '../public/data.json'),
    resolve(__dirname, '../../public/data.json'),
    // During Vercel deployment, data.json is copied into the api directory
    resolve(__dirname, '../frontend/api/data.json'),
    resolve(__dirname, 'data.json'),
    resolve(process.cwd(), 'public/data.json'),
    resolve(process.cwd(), '../public/data.json'),
    resolve(process.cwd(), 'frontend/public/data.json'),
    resolve(process.cwd(), 'frontend/api/data.json'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, 'utf-8');
      return JSON.parse(raw) as GraphData;
    } catch {
      // try next
    }
  }
  throw new Error(`Could not locate data.json. Tried: ${candidates.join(', ')}`);
}

let cached: GraphData | null = null;
export function dataset(): GraphData {
  if (!cached) cached = loadDataset();
  return cached;
}

/* -------------------------------------------------------------------------- */
/*                              HTTP utilities                                */
/* -------------------------------------------------------------------------- */

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  query: Record<string, string>,
) => Promise<void> | void;

export interface Route {
  method: string;
  pattern: RegExp;
  handle: RouteHandler;
}

/** Parse capture groups (both named and numbered) from a regex match. */
function extractParams(m: RegExpExecArray): Record<string, string> {
  const params: Record<string, string> = {};
  if (m.groups) Object.assign(params, m.groups);
  // Numbered capture groups (indices 1+)
  for (let i = 1; i < m.length; i++) {
    if (m[i] !== undefined) params[String(i)] = m[i];
  }
  return params;
}

/** Parse query string from a URL. */
function parseQueryString(url: string): Record<string, string> {
  const [, qs = ''] = url.split('?');
  const query: Record<string, string> = {};
  for (const part of qs.split('&')) {
    if (!part) continue;
    const [k, v] = part.split('=');
    if (k) query[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return query;
}

export function route(method: string, pattern: RegExp, handle: RouteHandler): Route {
  return {
    method,
    pattern,
    handle: async (req, res) => {
      const fullUrl = req.url ?? '';
      // Strip query string before pattern matching — the $ anchor in patterns
      // would fail to match URLs with ?query=... appended.
      const url = fullUrl.split('?')[0];
      if (req.method !== method) return;
      const m = pattern.exec(url);
      if (!m) return;
      const params = extractParams(m);
      const query = parseQueryString(fullUrl);
      try {
        await handle(req, res, params, query);
      } catch (err) {
        send(res, 500, { error: 'internal_error', message: (err as Error).message });
      }
    },
  };
}

export function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', headers['Content-Type'] ?? 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', headers['Cache-Control'] ?? 'public, max-age=60, s-maxage=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (body === null || body === undefined) {
    res.end();
    return;
  }
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

export async function readJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
  return new Promise<T>((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolveBody((raw ? JSON.parse(raw) : {}) as T);
      } catch (e) {
        rejectBody(e);
      }
    });
    req.on('error', rejectBody);
  });
}

/* -------------------------------------------------------------------------- */
/*                              Filter parsing                                */
/* -------------------------------------------------------------------------- */

const FILTER_REGEX = /(\w+):([^\s,]+)/g;

export function parseSearch(q: string): { filter: FilterQuery; freeText: string } {
  const filter: FilterQuery = { text: '' };
  const free: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(FILTER_REGEX.source, 'g');
  while ((m = re.exec(q)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2];
    switch (key) {
      case 'family':
        filter.family = val.toLowerCase();
        break;
      case 'init':
        filter.init = val.toLowerCase();
        break;
      case 'pkg':
        filter.pkg = val.toLowerCase();
        break;
      case 'status':
        filter.status = val.toLowerCase() as FilterQuery['status'];
        break;
      case 'country':
        filter.country = val.toLowerCase();
        break;
      case 'release':
        filter.release = val.toLowerCase() as FilterQuery['release'];
        break;
      case 'license':
        filter.license = val.toLowerCase();
        break;
      default:
        free.push(m[0]);
    }
  }
  filter.text = q.replace(re, '').trim().toLowerCase();
  return { filter, freeText: free.join(' ').trim() };
}

export function matches(distro: Distro, q: FilterQuery): boolean {
  if (q.family && distro.family !== q.family) return false;
  if (q.init && (distro.initSystem ?? '').toLowerCase() !== q.init) return false;
  if (q.pkg && (distro.packageManager ?? '').toLowerCase().replace(/\s+/g, '') !== q.pkg.replace(/\s+/g, '')) return false;
  if (q.country && (distro.country ?? '').toLowerCase() !== q.country) return false;
  if (q.release && distro.releaseModel !== q.release) return false;
  if (q.license && (distro.license ?? '').toLowerCase() !== q.license) return false;
  if (q.status && q.status !== 'all' && distro.status !== q.status) return false;
  if (q.text) {
    const t = q.text;
    const haystack = [distro.name, distro.id, distro.description, distro.country, distro.website, distro.packageManager, distro.initSystem]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(t)) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/*                              Path finding                                   */
/* -------------------------------------------------------------------------- */

export function findPath(fromId: string, toId: string): PathResult {
  const data = dataset();
  const idSet = new Set(data.distros.map((d) => d.id));
  if (!idSet.has(fromId) || !idSet.has(toId)) {
    return { from: fromId, to: toId, path: [], hops: 0, found: false };
  }
  if (fromId === toId) {
    return { from: fromId, to: toId, path: [fromId], hops: 0, found: true };
  }
  // Build adjacency in both directions for shortest path through shared ancestors.
  const adj = new Map<string, Set<string>>();
  for (const d of data.distros) {
    const allParents = [d.parent, ...(d.additionalParents ?? [])].filter(Boolean) as string[];
    if (!adj.has(d.id)) adj.set(d.id, new Set());
    for (const p of allParents) {
      if (!adj.has(p)) adj.set(p, new Set());
      adj.get(d.id)!.add(p);
      adj.get(p)!.add(d.id);
    }
  }
  // BFS
  const visited = new Set<string>([fromId]);
  const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }];
  while (queue.length) {
    const node = queue.shift()!;
    const neighbours = adj.get(node.id) ?? new Set<string>();
    for (const next of neighbours) {
      if (visited.has(next)) continue;
      visited.add(next);
      const path = [...node.path, next];
      if (next === toId) {
        return { from: fromId, to: toId, path, hops: path.length - 1, found: true };
      }
      queue.push({ id: next, path });
    }
  }
  return { from: fromId, to: toId, path: [], hops: 0, found: false };
}

/* -------------------------------------------------------------------------- */
/*                              Stats                                          */
/* -------------------------------------------------------------------------- */

type StatsKey = 'country' | 'init' | 'pkg' | 'license';

export function computeStats(): StatsResponse {
  const data = dataset();
  const build = (field: 'country' | 'initSystem' | 'packageManager' | 'license'): Map<string, number> => {
    const m = new Map<string, number>();
    for (const d of data.distros) {
      const v = d[field];
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  };
  const counters = {
    country: build('country'),
    init: build('initSystem'),
    pkg: build('packageManager'),
    license: build('license'),
  };
  const top = (m: Map<string, number>, key: StatsKey) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ [key]: value, count }) as { [K in StatsKey]: string } & { count: number });
  return {
    totalDistros: data.meta.totalDistros,
    active: data.meta.active,
    discontinued: data.meta.discontinued,
    families: data.meta.families,
    topCountries: top(counters.country, 'country'),
    topInitSystems: top(counters.init, 'init'),
    topPackageManagers: top(counters.pkg, 'pkg'),
    topLicenses: top(counters.license, 'license'),
  };
}

/* -------------------------------------------------------------------------- */
/*                              Wikipedia lookup                               */
/* -------------------------------------------------------------------------- */

const WIKI_LOOKUP_TIMEOUT_MS = 6000;

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function lookupWikipedia(topic: string): Promise<SuggestResponse['validated'] | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
  try {
    const res = await fetch(url, {
      signal: timeoutSignal(WIKI_LOOKUP_TIMEOUT_MS),
      headers: { 'Api-User-Agent': 'DistroMap/0.1 (https://distromap.example)' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      title?: string;
      description?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (!json.title) return null;
    return {
      title: json.title,
      description: json.description ?? json.extract?.slice(0, 280),
      url: json.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(topic)}`,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                              SVG OG image                                   */
/* -------------------------------------------------------------------------- */

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
}

export function renderOgSvg(slug: string, family: Family, distro?: Distro): string {
  const W = 1200;
  const H = 630;
  const accent = family.color;
  const title = distro?.name ?? slug;
  const sub = (distro?.description ?? family.description ?? 'A member of the Linux ecosystem.').slice(0, 200);
  const pills = [
    distro?.packageManager && `pkg: ${distro.packageManager}`,
    distro?.initSystem && `init: ${distro.initSystem}`,
    distro?.releaseModel && `release: ${distro.releaseModel}`,
    distro?.country && `country: ${distro.country}`,
  ]
    .filter(Boolean)
    .slice(0, 3)
    .join('   •   ');
  const status = distro?.status === 'discontinued' ? 'DISCONTINUED' : distro?.status === 'active' ? 'ACTIVE' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="80%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#08090f" stop-opacity="1"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.1"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g transform="translate(${W / 2}, 420)">
    <circle r="280" fill="none" stroke="url(#ring)" stroke-opacity="0.45" stroke-width="1.2"/>
    <circle r="200" fill="none" stroke="url(#ring)" stroke-opacity="0.55" stroke-width="1.2"/>
    <circle r="120" fill="none" stroke="url(#ring)" stroke-opacity="0.7" stroke-width="1.2"/>
    <circle r="48" fill="${accent}" />
  </g>
  <text x="60" y="100" font-family="Inter, system-ui" font-size="22" fill="#9aa3b2" font-weight="600" letter-spacing="4">DISTROMAP</text>
  ${status ? `<text x="${W - 60}" y="100" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="22" fill="${accent}" font-weight="700" letter-spacing="3">${status}</text>` : ''}
  <text x="60" y="220" font-family="Inter, system-ui" font-size="92" fill="#ffffff" font-weight="800">${escapeXml(title)}</text>
  <text x="60" y="280" font-family="Inter, system-ui" font-size="34" fill="#cdd5e2" font-weight="500">${escapeXml(family.name)} family</text>
  <foreignObject x="60" y="320" width="${W - 120}" height="100">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,system-ui;font-size:28px;color:#cdd5e2;line-height:1.4">${escapeXml(sub)}</div>
  </foreignObject>
  <text x="60" y="${H - 60}" font-family="JetBrains Mono, monospace" font-size="22" fill="#6c7589">${escapeXml(pills)}</text>
</svg>`;
}

/* -------------------------------------------------------------------------- */
/*                              Public route table                             */
/* -------------------------------------------------------------------------- */

export function buildRoutes(): Route[] {
  return [
    route('GET', /^\/api\/search$/, (_req, res, _params, query) => {
      const token = query.q ?? '';
      const { filter, freeText } = parseSearch(token);
      const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);
      const results = dataset()
        .distros.filter((d) => matches(d, filter) && (!freeText || freeText.split(/\s+/).every((t) => (d.name + ' ' + (d.description ?? '') + ' ' + (d.country ?? '')).toLowerCase().includes(t.toLowerCase()))))
        .slice(0, limit);
      send(res, 200, { results, total: results.length, query: filter });
    }),
    route('GET', /^\/api\/distro$/, (_req, res, _params, query) => {
      const id = query.slug;
      if (!id) return send(res, 400, { error: 'missing_slug' });
      const distro = dataset().distros.find((d) => d.id === id);
      if (!distro) return send(res, 404, { error: 'not_found' });
      const family = dataset().families.find((f) => f.id === distro.family);
      send(res, 200, { distro, family });
    }),
    route('GET', /^\/api\/distro\/([^/?]+)\/?$/, (_req, res, params) => {
      const distro = dataset().distros.find((d) => d.id === params['1']);
      if (!distro) return send(res, 404, { error: 'not_found' });
      const family = dataset().families.find((f) => f.id === distro.family);
      send(res, 200, { distro, family });
    }),
    route('GET', /^\/api\/path\/?$/, (_req, res, _params, query) => {
      if (!query.from || !query.to) return send(res, 400, { error: 'missing_from_or_to' });
      send(res, 200, findPath(query.from, query.to));
    }),
    route('GET', /^\/api\/path\/([^/?]+)\/([^/?]+)\/?$/, (_req, res, params) => {
      send(res, 200, findPath(params['1'], params['2']));
    }),
    route('GET', /^\/api\/compare\/?$/, (_req, res, _params, query) => {
      const ids = (query.ids ?? '').split(',').filter(Boolean);
      if (ids.length < 2) return send(res, 400, { error: 'need_two_ids' });
      const distros = ids
        .map((id) => dataset().distros.find((d) => d.id === id))
        .filter(Boolean) as Distro[];
      if (distros.length !== ids.length) return send(res, 404, { error: 'one_or_more_not_found' });
      send(res, 200, { distros });
    }),
    route('GET', /^\/api\/stats\/?$/, (_req, res) => {
      send(res, 200, computeStats());
    }),
    route('GET', /^\/api\/families\/?$/, (_req, res) => {
      send(res, 200, { families: dataset().families });
    }),
    route('GET', /^\/api\/data\/?$/, (_req, res) => {
      send(res, 200, dataset());
    }),
    route('GET', /^\/api\/og\/([^/?]+)\/?$/, (_req, res, params) => {
      const slug = params['1'];
      const data = dataset();
      const distro = data.distros.find((d) => d.id === slug);
      const family = distro ? data.families.find((f) => f.id === distro.family) : undefined;
      const fallback: Family = family ?? {
        id: 'unknown',
        name: 'Linux',
        color: '#00e5ff',
        description: 'Members of the Linux ecosystem, all descended from the Linux kernel.',
      };
      const svg = renderOgSvg(slug, fallback, distro);
      send(res, 200, svg, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=86400' });
    }),
    route('POST', /^\/api\/suggest\/?$/, async (req, res) => {
      const body = await readJsonBody<SuggestPayload>(req);
      if (!body || typeof body !== 'object') return send(res, 400, { error: 'invalid_body' });
      if (typeof body.topic !== 'string' || !body.topic.trim()) return send(res, 400, { error: 'missing_topic' });
      if (body.rationale !== undefined && typeof body.rationale !== 'string') {
        return send(res, 400, { error: 'invalid_rationale' });
      }
      if (body.submitter !== undefined && typeof body.submitter !== 'string') {
        return send(res, 400, { error: 'invalid_submitter' });
      }
      const validated = await lookupWikipedia(body.topic.trim());
      if (!validated) return send(res, 422, { error: 'wiki_lookup_failed', topic: body.topic.trim() });
      const response: SuggestResponse = {
        ok: true,
        id: Math.random().toString(36).slice(2, 10),
        validated,
      };
      send(res, 201, response);
    }),
    route('GET', /^\/api\/health\/?$/, (_req, res) => {
      send(res, 200, { status: 'ok', distros: dataset().distros.length });
    }),
  ];
}
