/**
 * DistroMap API Routes
 *
 * Backward-compatible with the existing SPA contract (same route shapes as
 * shared/api-handlers.ts) but powered by PostgreSQL instead of JSON files.
 * Also adds new endpoints: /api/recommend, /api/internal/ingest, /api/graph.
 */

import type { Request, Response } from 'express';
import { pool, cached, invalidate } from './db.js';

type RouteHandler = (req: Request, res: Response) => Promise<void>;

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

/** Parse key:value filters from search query. */
function parseFilters(q: string): { text: string; filters: Record<string, string> } {
  const filters: Record<string, string> = {};
  const free: string[] = [];
  const re = /(\w+):([^\s,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2];
    if (['family', 'init', 'pkg', 'status', 'country', 'release', 'license', 'base', 'desktop', 'architecture'].includes(key)) {
      filters[key] = val.toLowerCase();
    } else {
      free.push(m[0]);
    }
  }
  const text = q.replace(re, '').trim().toLowerCase();
  return { text, filters };
}

export function buildRoutes(): Route[] {
  return [
    // ─── Search ─────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/api/search',
      handler: async (req, res) => {
        const q = (req.query.q as string) ?? '';
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const { text, filters } = parseFilters(q);

        try {
          const conditions: string[] = ["e.type = 'distro'"];
          const params: unknown[] = [];
          let idx = 1;

          if (text) {
            conditions.push(`(e.name ILIKE $${idx} OR e.description ILIKE $${idx})`);
            params.push(`%${text}%`);
            idx++;
          }
          if (filters.family) {
            conditions.push(`EXISTS (SELECT 1 FROM edges ef WHERE ef.source_id = e.id AND ef.rel_type = 'belongs_to_family' AND ef.target_id = $${idx})`);
            params.push(filters.family);
            idx++;
          }
          if (filters.status) {
            conditions.push(`d.status = $${idx}`);
            params.push(filters.status);
            idx++;
          }
          if (filters.country) {
            conditions.push(`LOWER(d.country) = $${idx}`);
            params.push(filters.country);
            idx++;
          }
          if (filters.release) {
            conditions.push(`d.release_model = $${idx}`);
            params.push(filters.release);
            idx++;
          }
          if (filters.pkg) {
            conditions.push(`EXISTS (SELECT 1 FROM edges ep JOIN entities ep2 ON ep2.id = ep.target_id WHERE ep.source_id = e.id AND ep.rel_type = 'uses_package_mgr' AND LOWER(ep2.name) LIKE $${idx})`);
            params.push(`%${filters.pkg}%`);
            idx++;
          }
          if (filters.init) {
            conditions.push(`EXISTS (SELECT 1 FROM edges ei JOIN entities ei2 ON ei2.id = ei.target_id WHERE ei.source_id = e.id AND ei.rel_type = 'uses_init' AND LOWER(ei2.name) LIKE $${idx})`);
            params.push(`%${filters.init}%`);
            idx++;
          }
          if (filters.base) {
            conditions.push(`EXISTS (SELECT 1 FROM edges eb JOIN entities eb2 ON eb2.id = eb.target_id WHERE eb.source_id = e.id AND eb.rel_type = 'based_on' AND LOWER(eb2.name) LIKE $${idx})`);
            params.push(`%${filters.base}%`);
            idx++;
          }
          if (filters.desktop) {
            conditions.push(`EXISTS (SELECT 1 FROM edges ed JOIN entities ed2 ON ed2.id = ed.target_id WHERE ed.source_id = e.id AND ed.rel_type = 'uses_desktop' AND LOWER(ed2.name) LIKE $${idx})`);
            params.push(`%${filters.desktop}%`);
            idx++;
          }
          if (filters.architecture) {
            conditions.push(`EXISTS (SELECT 1 FROM edges ea JOIN entities ea2 ON ea2.id = ea.target_id WHERE ea.source_id = e.id AND ea.rel_type = 'supports_arch' AND LOWER(ea2.name) LIKE $${idx})`);
            params.push(`%${filters.architecture}%`);
            idx++;
          }
          if (filters.license) {
            conditions.push(`LOWER(d.license) = $${idx}`);
            params.push(filters.license);
            idx++;
          }

          params.push(limit);
          const sql = `
            SELECT e.id, e.name, e.description, e.website, e.wikipedia,
                   d.status, d.founded, d.country, d.version,
                   d.release_model AS "releaseModel", d.license,
                   (SELECT e2.name FROM edges ep JOIN entities e2 ON e2.id = ep.target_id WHERE ep.source_id = e.id AND ep.rel_type = 'uses_package_mgr' LIMIT 1) AS "packageManager",
                   (SELECT e3.name FROM edges ei JOIN entities e3 ON e3.id = ei.target_id WHERE ei.source_id = e.id AND ei.rel_type = 'uses_init' LIMIT 1) AS "initSystem",
                   fam.name AS family_name, fam.id AS family_id
            FROM entities e
            JOIN distros d ON d.entity_id = e.id
            LEFT JOIN edges efam ON efam.source_id = e.id AND efam.rel_type = 'belongs_to_family'
            LEFT JOIN entities fam ON fam.id = efam.target_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY e.name
            LIMIT $${idx}
          `;
          const { rows } = await pool.query(sql, params);
          res.json({ results: rows, total: rows.length, query: { text, ...filters } });
        } catch (err) {
          res.status(500).json({ error: 'query_failed', message: (err as Error).message });
        }
      },
    },

    // ─── Single Distro ──────────────────────────────────────────────
    {
      method: 'GET',
      path: '/api/distro/:slug',
      handler: async (req, res) => {
        const slug = req.params.slug;
        try {
          const { rows } = await pool.query(`
            SELECT e.*, d.*, fam.name AS family_name, fam.id AS family_id, fam.color AS family_color
            FROM entities e
            JOIN distros d ON d.entity_id = e.id
            LEFT JOIN edges efam ON efam.source_id = e.id AND efam.rel_type = 'belongs_to_family'
            LEFT JOIN entities fam ON fam.id = efam.target_id
            WHERE e.id = $1 AND e.type = 'distro'
          `, [slug]);

          if (rows.length === 0) {
            res.status(404).json({ error: 'not_found' });
            return;
          }

          const row = rows[0];
          res.json({
            distro: {
              id: row.id, name: row.name, description: row.description,
              website: row.website, wikipedia: row.wikipedia,
              status: row.status, founded: row.founded, country: row.country,
              version: row.version, releaseModel: row.release_model,
              license: row.license, downloadUrl: row.download_url,
              packageManager: row.package_manager, initSystem: row.init_system,
            },
            family: row.family_id ? {
              id: row.family_id, name: row.family_name, color: row.family_color,
            } : null,
          });
        } catch (err) {
          res.status(500).json({ error: 'query_failed', message: (err as Error).message });
        }
      },
    },

    // ─── Path between two distros ───────────────────────────────────
    {
      method: 'GET',
      path: '/api/path',
      handler: async (req, res) => {
        const from = req.query.from as string;
        const to = req.query.to as string;
        if (!from || !to) {
          res.status(400).json({ error: 'missing_from_or_to' });
          return;
        }
        try {
          // BFS through edges (bidirectional)
          const { rows } = await pool.query(`
            WITH RECURSIVE path AS (
              SELECT $1::text AS node, ARRAY[$1::text] AS visited, 0 AS depth
              UNION ALL
              SELECT CASE WHEN e.source_id = p.node THEN e.target_id ELSE e.source_id END,
                     p.visited || CASE WHEN e.source_id = p.node THEN e.target_id ELSE e.source_id END,
                     p.depth + 1
              FROM path p
              JOIN edges e ON (e.source_id = p.node OR e.target_id = p.node)
              WHERE NOT (CASE WHEN e.source_id = p.node THEN e.target_id ELSE e.source_id END = ANY(p.visited))
                AND p.depth < 20
            )
            SELECT visited, depth FROM path WHERE node = $2 ORDER BY depth LIMIT 1
          `, [from, to]);

          if (rows.length === 0) {
            res.json({ from, to, path: [], hops: 0, found: false });
            return;
          }
          res.json({ from, to, path: rows[0].visited, hops: rows[0].depth, found: true });
        } catch (err) {
          res.status(500).json({ error: 'query_failed', message: (err as Error).message });
        }
      },
    },

    // ─── Compare distros ────────────────────────────────────────────
    {
      method: 'GET',
      path: '/api/compare',
      handler: async (req, res) => {
        const ids = ((req.query.ids as string) ?? '').split(',').filter(Boolean);
        if (ids.length < 2) {
          res.status(400).json({ error: 'need_two_ids' });
          return;
        }
        try {
          const { rows } = await pool.query(`
            SELECT e.id, e.name, e.description, e.website,
                   d.status, d.founded, d.country, d.version,
                   d.release_model AS "releaseModel", d.license,
                   d.package_manager AS "packageManager", d.init_system AS "initSystem"
            FROM entities e
            JOIN distros d ON d.entity_id = e.id
            WHERE e.id = ANY($1)
          `, [ids]);
          res.json({ distros: rows });
        } catch (err) {
          res.status(500).json({ error: 'query_failed', message: (err as Error).message });
        }
      },
    },

    // ─── Stats ──────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/api/stats',
      handler: async (_req, res) => {
        try {
          const stats = await cached('stats', 300, async () => {
            const [total, active, discontinued, families, countries, inits, pkgs, licenses] = await Promise.all([
              pool.query("SELECT count(*) FROM entities WHERE type = 'distro'"),
              pool.query("SELECT count(*) FROM distros WHERE status = 'active'"),
              pool.query("SELECT count(*) FROM distros WHERE status = 'discontinued'"),
              pool.query("SELECT count(*) FROM entities WHERE type = 'family'"),
              pool.query("SELECT country, count(*) AS n FROM distros WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC LIMIT 8"),
              pool.query("SELECT e.name AS init, count(*) AS n FROM edges ei JOIN entities e ON e.id = ei.target_id WHERE ei.rel_type = 'uses_init' GROUP BY e.name ORDER BY n DESC LIMIT 8"),
              pool.query("SELECT e.name AS pkg, count(*) AS n FROM edges ep JOIN entities e ON e.id = ep.target_id WHERE ep.rel_type = 'uses_package_mgr' GROUP BY e.name ORDER BY n DESC LIMIT 8"),
              pool.query("SELECT license, count(*) AS n FROM distros WHERE license IS NOT NULL GROUP BY license ORDER BY n DESC LIMIT 8"),
            ]);
            return {
              totalDistros: parseInt(total.rows[0].n as string),
              active: parseInt(active.rows[0].n as string),
              discontinued: parseInt(discontinued.rows[0].n as string),
              families: parseInt(families.rows[0].n as string),
              topCountries: countries.rows.map((r) => ({ country: r.country, count: parseInt(r.n as string) })),
              topInitSystems: inits.rows.map((r) => ({ init: r.init, count: parseInt(r.n as string) })),
              topPackageManagers: pkgs.rows.map((r) => ({ pkg: r.pkg, count: parseInt(r.n as string) })),
              topLicenses: licenses.rows.map((r) => ({ license: r.license, count: parseInt(r.n as string) })),
            };
          });
          res.json(stats);
        } catch (err) {
          res.status(500).json({ error: 'query_failed', message: (err as Error).message });
        }
      },
    },

    // ─── Families ───────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/api/families',
      handler: async (_req, res) => {
        try {
          const rows = await cached('families', 600, async () => {
            const result = await pool.query(`
              SELECT e.id, e.name, e.description, f.color, f.color_secondary AS "colorSecondary", f.founded
              FROM entities e
              JOIN families f ON f.entity_id = e.id
              ORDER BY e.name
            `);
            return result.rows;
          });
          res.json({ families: rows });
        } catch (err) {
          res.status(500).json({ error: 'query_failed', message: (err as Error).message });
        }
      },
    },

    // ─── Full Graph Data ────────────────────────────────────────────
    {
      method: 'GET',
      path: '/api/graph',
      handler: async (_req, res) => {
        try {
          const graph = await cached('graph', 120, async () => {
            const [entities, edges, meta] = await Promise.all([
              pool.query(`
                SELECT e.id, e.name, e.type, e.description, e.website, e.logo_url,
                       d.status, d.founded, d.country, d.version, d.release_model AS "releaseModel",
                       d.license, d.download_url, d.downloadUrl,
                       f.color AS family_color, f.color_secondary AS family_color_secondary,
                       efam.target_id AS family_id,
                       eparent.target_id AS parent_id
                FROM entities e
                LEFT JOIN distros d ON d.entity_id = e.id AND e.type = 'distro'
                LEFT JOIN families f ON f.entity_id = e.id AND e.type = 'family'
                LEFT JOIN edges efam ON efam.source_id = e.id AND efam.rel_type = 'belongs_to_family'
                LEFT JOIN edges eparent ON eparent.source_id = e.id AND eparent.rel_type = 'based_on'
              `),
              pool.query("SELECT source_id, target_id, rel_type FROM edges"),
              pool.query(`
                SELECT
                  (SELECT count(*) FROM entities WHERE type = 'distro') AS total,
                  (SELECT count(*) FROM distros WHERE status = 'active') AS active,
                  (SELECT count(*) FROM distros WHERE status = 'discontinued') AS discontinued,
                  (SELECT count(*) FROM entities WHERE type = 'family') AS families
              `),
            ]);
            return {
              nodes: entities.rows,
              edges: edges.rows.map((e) => ({ source: e.source_id, target: e.target_id, type: e.rel_type })),
              meta: {
                totalDistros: parseInt(meta.rows[0].total),
                active: parseInt(meta.rows[0].active),
                discontinued: parseInt(meta.rows[0].discontinued),
                families: parseInt(meta.rows[0].families),
                generatedAt: new Date().toISOString(),
              },
            };
          });
          res.json(graph);
        } catch (err) {
          res.status(500).json({ error: 'query_failed', message: (err as Error).message });
        }
      },
    },

    // ─── Recommend Similar Distros ──────────────────────────────────
    {
      method: 'GET',
      path: '/api/recommend',
      handler: async (req, res) => {
        const id = req.query.id as string;
        const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
        if (!id) {
          res.status(400).json({ error: 'missing_id' });
          return;
        }
        try {
          // Try vector similarity first
          const vectorResult = await pool.query(`
            SELECT e.id, e.name, e.description, 1 - (emb1.embedding <=> emb2.embedding) AS similarity
            FROM embeddings emb1
            JOIN embeddings emb2 ON emb2.entity_id != emb1.entity_id
            JOIN entities e ON e.id = emb2.entity_id
            WHERE emb1.entity_id = $1
            ORDER BY emb1.embedding <=> emb2.embedding
            LIMIT $2
          `, [id, limit]);

          if (vectorResult.rows.length > 0) {
            res.json({ recommendations: vectorResult.rows, method: 'vector' });
            return;
          }

          // Fallback: same family + similar properties
          const fallbackResult = await pool.query(`
            SELECT e2.id, e2.name, e2.description
            FROM entities e1
            JOIN edges ef1 ON ef1.source_id = e1.id AND ef1.rel_type = 'belongs_to_family'
            JOIN edges ef2 ON ef2.target_id = ef1.target_id AND ef2.rel_type = 'belongs_to_family'
            JOIN entities e2 ON e2.id = ef2.source_id AND e2.id != e1.id
            WHERE e1.id = $1
            ORDER BY e2.name
            LIMIT $2
          `, [id, limit]);

          res.json({ recommendations: fallbackResult.rows, method: 'family' });
        } catch (err) {
          res.status(500).json({ error: 'query_failed', message: (err as Error).message });
        }
      },
    },

    // ─── Internal Ingest (for Python scrapers) ──────────────────────
    {
      method: 'POST',
      path: '/api/internal/ingest',
      handler: async (req, res) => {
        const payload = req.body;
        if (typeof payload?.id !== 'string' || typeof payload?.name !== 'string' || !payload.id || !payload.name) {
          res.status(400).json({ error: 'missing_id_or_name' });
          return;
        }

        // Input length validation
        const MAX_DESC = 2000;
        const MAX_NAME = 200;
        const MAX_URL = 2000;
        if (typeof payload.name === 'string' && payload.name.length > MAX_NAME) {
          res.status(400).json({ error: 'name_too_long' });
          return;
        }
        if (typeof payload.description === 'string' && payload.description.length > MAX_DESC) {
          payload.description = payload.description.slice(0, MAX_DESC);
        }
        for (const urlField of ['website', 'wikipedia', 'downloadUrl']) {
          if (typeof payload[urlField] === 'string' && payload[urlField].length > MAX_URL) {
            res.status(400).json({ error: `${urlField}_too_long` });
            return;
          }
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Upsert entity
          await client.query(`
            INSERT INTO entities (id, name, type, description, website, wikipedia, logo_url, metadata)
            VALUES ($1, $2, 'distro', $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
              name = COALESCE(EXCLUDED.name, entities.name),
              description = COALESCE(EXCLUDED.description, entities.description),
              website = COALESCE(EXCLUDED.website, entities.website),
              wikipedia = COALESCE(EXCLUDED.wikipedia, entities.wikipedia),
              logo_url = COALESCE(EXCLUDED.logo_url, entities.logo_url),
              metadata = entities.metadata || EXCLUDED.metadata,
              updated_at = now()
          `, [payload.id, payload.name, payload.description, payload.website, payload.wikipedia, payload.logoUrl, JSON.stringify(payload.metadata ?? {})]);

          // Upsert distro details
          await client.query(`
            INSERT INTO distros (entity_id, status, founded, country, version, release_model, license, download_url, iso_checksum)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (entity_id) DO UPDATE SET
              status = COALESCE(EXCLUDED.status, distros.status),
              founded = COALESCE(EXCLUDED.founded, distros.founded),
              country = COALESCE(EXCLUDED.country, distros.country),
              version = COALESCE(EXCLUDED.version, distros.version),
              release_model = COALESCE(EXCLUDED.release_model, distros.release_model),
              license = COALESCE(EXCLUDED.license, distros.license),
              download_url = COALESCE(EXCLUDED.download_url, distros.download_url),
              iso_checksum = COALESCE(EXCLUDED.iso_checksum, distros.iso_checksum),
              last_updated = now()
          `, [payload.id, payload.status ?? 'active', payload.founded, payload.country, payload.version, payload.releaseModel, payload.license, payload.downloadUrl, payload.isoChecksum]);

          // Upsert edges
          if (payload.parent) {
            await client.query(`
              INSERT INTO edges (source_id, target_id, rel_type, confidence)
              VALUES ($1, $2, 'based_on', $3)
              ON CONFLICT (source_id, target_id, rel_type) DO UPDATE SET confidence = EXCLUDED.confidence
            `, [payload.id, payload.parent, payload.confidence ?? 1.0]);
          }
          if (payload.familyId) {
            await client.query(`
              INSERT INTO edges (source_id, target_id, rel_type)
              VALUES ($1, $2, 'belongs_to_family')
              ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
            `, [payload.id, payload.familyId]);
          }

          // Create technology nodes and edges from metadata
          const meta = payload.metadata ?? {};
          const techEdges: Array<{ type: string; value: string; techType: string }> = [];
          if (payload.packageManager) techEdges.push({ type: 'uses_package_mgr', value: payload.packageManager, techType: 'package_manager' });
          if (payload.initSystem) techEdges.push({ type: 'uses_init', value: payload.initSystem, techType: 'init_system' });
          if (payload.version) {
            // Store version on the distro record (already handled by distros upsert above)
          }
          const architectures: string[] = meta.architecture ?? [];
          for (const arch of architectures) {
            techEdges.push({ type: 'supports_arch', value: arch, techType: 'architecture' });
          }
          const desktops: string[] = meta.desktop_environments ?? [];
          for (const de of desktops) {
            techEdges.push({ type: 'uses_desktop', value: de, techType: 'desktop_environment' });
          }

          for (const te of techEdges) {
            const techId = te.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (!techId) continue;
            await client.query(`
              INSERT INTO entities (id, name, type) VALUES ($1, $2, 'technology')
              ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
            `, [techId, te.value]);
            await client.query(`
              INSERT INTO technologies (entity_id, tech_type) VALUES ($1, $2)
              ON CONFLICT (entity_id) DO NOTHING
            `, [techId, te.techType]);
            await client.query(`
              INSERT INTO edges (source_id, target_id, rel_type) VALUES ($1, $2, $3::edge_type)
              ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
            `, [payload.id, techId, te.type]);
          }

          await client.query('COMMIT');

          // Invalidate caches
          await Promise.all([invalidate('graph'), invalidate('stats'), invalidate('families')]);

          res.json({ ok: true, id: payload.id });
        } catch (err) {
          await client.query('ROLLBACK');
          res.status(500).json({ error: 'ingest_failed', message: (err as Error).message });
        } finally {
          client.release();
        }
      },
    },

    // ─── Releases ───────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/api/releases',
      handler: async (req, res) => {
        const distroId = req.query.distro as string;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        try {
          if (distroId) {
            const { rows } = await pool.query(
              'SELECT * FROM releases WHERE distro_id = $1 ORDER BY release_date DESC LIMIT $2',
              [distroId, limit],
            );
            res.json({ releases: rows });
          } else {
            const { rows } = await pool.query(
              'SELECT * FROM releases ORDER BY release_date DESC LIMIT $1',
              [limit],
            );
            res.json({ releases: rows });
          }
        } catch (err) {
          res.status(500).json({ error: 'query_failed', message: (err as Error).message });
        }
      },
    },
  ];
}
