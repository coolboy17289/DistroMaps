/**
 * GET /api/search?q=... — Full-text search with structured filters.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseQuery, searchDistros } from '@/lib/query';
import type { Distro } from '@/types';

export const dynamic = 'force-dynamic';

async function loadDistros(): Promise<Distro[]> {
  // Try static data.json
  const paths = [
    join(process.cwd(), 'data.json'),
    join(process.cwd(), '..', 'data.json'),
    join(process.cwd(), '..', 'frontend', 'public', 'data.json'),
    join(process.cwd(), '..', 'frontend-vue', 'public', 'data.json'),
  ];

  for (const p of paths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'));
      return data.distros ?? [];
    } catch { continue; }
  }

  return [];
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') ?? '';
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') ?? '50'),
      200,
    );

    const distros = await loadDistros();
    const query = parseQuery(q);
    const results = searchDistros(distros, query, limit);

    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('[API] Search error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
