/**
 * GET /api/compare?ids=a,b,c — Side-by-side comparison of distros.
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
  return { distros: [], families: [] };
}

export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get('ids') ?? '';
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);

    if (ids.length < 2 || ids.length > 4) {
      return NextResponse.json(
        { error: 'Provide 2-4 distro IDs separated by commas' },
        { status: 400 },
      );
    }

    const data = await loadData();
    const distros = ids
      .map(id => (data.distros ?? []).find((d: any) => d.id === id))
      .filter(Boolean);

    if (distros.length === 0) {
      return NextResponse.json({ error: 'No matching distros found' }, { status: 404 });
    }

    const attributes = [
      'family', 'status', 'founded', 'country', 'packageManager',
      'initSystem', 'releaseModel', 'license', 'baseDistro',
    ];

    const differences: Record<string, Record<string, string | undefined>> = {};
    for (const attr of attributes) {
      differences[attr] = {};
      for (const d of distros) {
        differences[attr][d.id] = (d as any)[attr] ?? 'N/A';
      }
    }

    return NextResponse.json({
      distros,
      attributes,
      differences,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300' },
    });
  } catch (err) {
    console.error('[API] Compare error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
