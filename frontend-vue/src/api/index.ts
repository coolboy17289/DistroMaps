import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GraphData, Distro, Family } from '@shared/types';

let cache: GraphData | null = null;

/** Load and cache the built dataset (GraphData shape: families/distros/edges/meta). */
function load(): GraphData {
  if (!cache) {
    const raw = readFileSync(resolve('./public/data.json'), 'utf-8');
    cache = JSON.parse(raw) as GraphData;
  }
  return cache!;
}

function loadDistros(): Distro[] {
  return load().distros;
}

function loadFamilies(): Family[] {
  return load().families;
}

/** Express-style handler mounted by the Vite `apiServerPlugin`. */
export default async (req: any, res: any) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const path = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const json = (code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  try {
    if (path === '/api/health') return json(200, { status: 'ok' });

    if (path === '/api/stats') {
      const g = load();
      return json(200, g.meta);
    }

    if (path === '/api/families') {
      const distros = loadDistros();
      const counts = new Map<string, number>();
      for (const d of distros) counts.set(d.family, (counts.get(d.family) ?? 0) + 1);
      const families = loadFamilies().map((f) => ({ id: f.id, name: f.name, color: f.color, count: counts.get(f.id) ?? 0 }));
      return json(200, { families });
    }

    if (path.startsWith('/api/search')) {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 50);
      let results = loadDistros();
      if (q) {
        results = results.filter((d) =>
          d.name.toLowerCase().includes(q) ||
          (d.description ?? '').toLowerCase().includes(q) ||
          d.family.includes(q),
        );
      }
      return json(200, { ids: results.slice(0, limit).map((d) => d.id), total: results.length });
    }

    if (path === '/api/data') return json(200, load());

    if (path === '/api/suggest') {
      // Accept a topic + rationale, echo back a queued id. (No persistence in dev.)
      let topic = '';
      try { topic = (JSON.parse(await readBody(req)) ?? {}).topic ?? ''; } catch { /* empty body is fine */ }
      const id = topic ? topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'suggestion';
      return json(200, { ok: true, id, validated: { title: topic || 'Suggestion', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(topic.replace(/ /g, '_'))}` } });
    }

    if (path.startsWith('/api/path') || path.startsWith('/api/compare')) return json(200, []);

    return json(404, { error: 'not_found' });
  } catch (error) {
    console.error('API error:', error);
    return json(500, { error: 'internal_error', message: (error as Error).message });
  }
};

function readBody(req: any): Promise<string> {
  return new Promise((resolveBody) => {
    let data = '';
    req.on('data', (chunk: Buffer) => (data += chunk.toString()));
    req.on('end', () => resolveBody(data));
  });
}