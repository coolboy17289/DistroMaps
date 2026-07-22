/**
 * GET /api/distros — List all distros with pagination.
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
    try {
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch { continue; }
  }
  return { distros: [], families: [] };
}

export async function GET(request: NextRequest) {
  try {
    const data = await loadData();
    const distros = data.distros ?? [];

    const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '50'), 200);
    const offset = (page - 1) * limit;

    const sliced = distros.slice(offset, offset + limit);

    return NextResponse.json({
      distros: sliced,
      pagination: {
        page,
        limit,
        total: distros.length,
        pages: Math.ceil(distros.length / limit),
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error('[API] Distros error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
