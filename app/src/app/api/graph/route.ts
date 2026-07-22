/**
 * GET /api/graph — Full graph data (nodes + edges).
 * Falls back to static data.json if PostgreSQL is unavailable.
 */

import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Try PostgreSQL first
    if (process.env.DATABASE_URL) {
      const { query } = await import('@/lib/db');
      const { cached } = await import('@/lib/redis');

      const data = await cached('graph:full', 120, async () => {
        const distrosResult = await query(`
          SELECT d.*, e.name as family_name, e.color as family_color
          FROM distros d
          JOIN entities e ON d.family_id = e.id
          WHERE d.status = 'active' OR d.status = 'discontinued'
          ORDER BY d.name
        `);

        const edgesResult = await query(`
          SELECT source, target, edge_type, confidence
          FROM edges
          WHERE edge_type IN ('based_on', 'derivative_of', 'succeeded_by')
        `);

        const familiesResult = await query(`
          SELECT id, name, color, color_secondary, description, founded
          FROM entities
          WHERE entity_type = 'family'
          ORDER BY name
        `);

        const distros = distrosResult.rows.map((d: any) => ({
          id: d.id,
          name: d.name,
          family: d.family_id,
          status: d.status,
          founded: d.founded,
          country: d.country,
          packageManager: d.package_manager,
          initSystem: d.init_system,
          releaseModel: d.release_model,
          license: d.license,
          website: d.website,
          wikipedia: d.wikipedia,
          description: d.description,
          baseDistro: d.base_distro,
        }));

        const families = familiesResult.rows.map((f: any) => ({
          id: f.id,
          name: f.name,
          color: f.color,
          colorSecondary: f.color_secondary,
          description: f.description,
          founded: f.founded,
        }));

        const edges = edgesResult.rows.map((e: any) => ({
          source: e.source,
          target: e.target,
        }));

        const active = distros.filter((d: any) => d.status === 'active').length;
        const discontinued = distros.filter((d: any) => d.status === 'discontinued').length;

        return {
          families,
          distros,
          edges,
          meta: {
            generatedAt: new Date().toISOString(),
            totalDistros: distros.length,
            active,
            discontinued,
            families: families.length,
          },
        };
      });

      return NextResponse.json(data);
    }

    // Fallback: static data.json
    const dataPath = join(process.cwd(), 'data.json');
    let data;
    try {
      data = JSON.parse(readFileSync(dataPath, 'utf-8'));
    } catch {
      // Try alternative paths
      const altPaths = [
        join(process.cwd(), '..', 'data.json'),
        join(process.cwd(), '..', 'frontend', 'public', 'data.json'),
        join(process.cwd(), '..', 'frontend-vue', 'public', 'data.json'),
      ];
      for (const p of altPaths) {
        try {
          data = JSON.parse(readFileSync(p, 'utf-8'));
          break;
        } catch { continue; }
      }
    }

    if (!data) {
      return NextResponse.json(
        { error: 'No data available' },
        { status: 503 },
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[API] Graph error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
