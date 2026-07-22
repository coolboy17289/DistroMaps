/**
 * GET /api/distro/:slug — Single distro with connections.
 */

import { NextRequest, NextResponse } from 'next/server';
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
  return { distros: [], families: [], edges: [] };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const { slug } = params;
    const data = await loadData();
    const distros = data.distros ?? [];
    const families = data.families ?? [];
    const edges = data.edges ?? [];

    const distro = distros.find((d: any) => d.id === slug);
    if (!distro) {
      return NextResponse.json({ error: 'Distro not found' }, { status: 404 });
    }

    const family = families.find((f: any) => f.id === distro.family);

    // Find connections
    const connections = edges
      .filter((e: any) => e.source === slug || e.target === slug)
      .map((e: any) => {
        const otherId = e.source === slug ? e.target : e.source;
        const other = distros.find((d: any) => d.id === otherId);
        return {
          id: otherId,
          name: other?.name ?? otherId,
          direction: e.source === slug ? 'parent' : 'child',
        };
      });

    // Find same-family distros
    const siblings = distros
      .filter((d: any) => d.family === distro.family && d.id !== slug)
      .slice(0, 10)
      .map((d: any) => ({ id: d.id, name: d.name }));

    return NextResponse.json({
      distro,
      family,
      connections,
      siblings,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('[API] Distro error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
