import type { GraphData, StatsResponse, PathResult } from '@shared/types';

/**
 * Thin fetchers for the dataset + API routes. In dev these are served by the
 * Vite `apiServerPlugin` (same origin, port 5175). In production the static
 * `data.json` is served alongside the SPA.
 */

export async function fetchData(): Promise<GraphData> {
  const res = await fetch('/data.json');
  if (!res.ok) throw new Error(`Failed to load dataset: ${res.status}`);
  return (await res.json()) as GraphData;
}

export async function fetchStats(): Promise<StatsResponse | null> {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return null;
    return (await res.json()) as StatsResponse;
  } catch {
    return null;
  }
}

export async function fetchPath(from: string, to: string): Promise<PathResult | null> {
  try {
    const res = await fetch(`/api/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) return null;
    return (await res.json()) as PathResult;
  } catch {
    return null;
  }
}

export async function fetchSearch(q: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { ids?: string[] };
    return json.ids ?? [];
  } catch {
    return [];
  }
}