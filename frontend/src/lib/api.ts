import type { GraphData, PathResult, StatsResponse } from '@shared/types';

export async function fetchData(): Promise<GraphData> {
  const res = await fetch('/data.json');
  if (!res.ok) throw new Error(`Failed to load dataset: ${res.status}`);
  return res.json();
}

export async function fetchStats(): Promise<StatsResponse | null> {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchFamilies(): Promise<{ id: string; name: string; color: string }[]> {
  try {
    const res = await fetch('/api/families');
    if (!res.ok) return [];
    const j = await res.json();
    return j.families ?? [];
  } catch {
    return [];
  }
}

export async function fetchSearch(q: string): Promise<import('@shared/types').Distro[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=40`);
    if (!res.ok) return [];
    const j = await res.json();
    return j.results ?? [];
  } catch {
    return [];
  }
}

export async function fetchPath(from: string, to: string): Promise<PathResult | null> {
  try {
    const res = await fetch(`/api/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function suggestDistro(topic: string, rationale?: string, submitter?: string) {
  const res = await fetch('/api/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, rationale, submitter }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function ogUrl(slug: string): string {
  return `/api/og/${encodeURIComponent(slug)}`;
}
