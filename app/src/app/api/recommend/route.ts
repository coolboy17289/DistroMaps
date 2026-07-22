/**
 * GET /api/recommend?id=ubuntu — Get similar distro recommendations.
 * Falls back to same-family matching when vector similarity is unavailable.
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
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing ?id= parameter' }, { status: 400 });
    }

    const data = await loadData();
    const distros = data.distros ?? [];
    const target = distros.find((d: any) => d.id === id);

    if (!target) {
      return NextResponse.json({ error: 'Distro not found' }, { status: 404 });
    }

    // Score other distros by similarity
    const scored = distros
      .filter((d: any) => d.id !== id)
      .map((d: any) => {
        let score = 0;
        const reasons: string[] = [];

        // Same family = high score
        if (d.family === target.family) {
          score += 5;
          reasons.push('Same family');
        }

        // Same package manager
        if (d.packageManager && d.packageManager === target.packageManager) {
          score += 2;
          reasons.push(`Both use ${d.packageManager}`);
        }

        // Same init system
        if (d.initSystem && d.initSystem === target.initSystem) {
          score += 1;
          reasons.push(`Both use ${d.initSystem}`);
        }

        // Same release model
        if (d.releaseModel && d.releaseModel === target.releaseModel) {
          score += 1;
          reasons.push(`Both are ${d.releaseModel}`);
        }

        // Same base distro
        if (d.baseDistro && d.baseDistro === target.baseDistro) {
          score += 3;
          reasons.push(`Both based on ${d.baseDistro}`);
        }

        return {
          distro: d,
          score,
          reason: reasons[0] ?? 'Similar characteristics',
        };
      })
      .filter((r: any) => r.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5);

    return NextResponse.json({
      distro: target,
      recommendations: scored,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300' },
    });
  } catch (err) {
    console.error('[API] Recommend error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
