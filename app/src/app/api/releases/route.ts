/**
 * GET /api/releases?distro=ubuntu — Release history for a distro.
 * Returns empty array when PostgreSQL is not configured (no release data in static JSON).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const distro = request.nextUrl.searchParams.get('distro');
    if (!distro) {
      return NextResponse.json({ error: 'Missing ?distro= parameter' }, { status: 400 });
    }

    // Try PostgreSQL
    if (process.env.DATABASE_URL) {
      const { query } = await import('@/lib/db');
      const result = await query(
        `SELECT * FROM releases WHERE distro_id = $1 ORDER BY released_at DESC LIMIT 50`,
        [distro],
      );
      return NextResponse.json(result.rows);
    }

    // No release data in static mode
    return NextResponse.json([]);
  } catch (err) {
    console.error('[API] Releases error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
