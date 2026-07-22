/**
 * GET /api/families — All families with colors and distro counts.
 */

import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

async function loadData() {
  const paths = [
    join(process.cwd(), 'data.json'),
    join(process.cwd(), '..', 'data.json'),
    join(process.cwd(), '..', 'frontend', 'public', 'data.json'),
  ];
  for (const p of paths) {
    try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { continue; }
  }
  return { families: [], distros: [] };
}

export async function GET() {
  try {
    const data = await loadData();
    const families = (data.families ?? []).map((f: any) => ({
      ...f,
      distroCount: (data.distros ?? []).filter((d: any) => d.family === f.id).length,
    }));

    return NextResponse.json(families, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
    });
  } catch (err) {
    console.error('[API] Families error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
