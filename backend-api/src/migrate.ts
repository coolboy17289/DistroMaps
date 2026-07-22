#!/usr/bin/env tsx
/**
 * migrate.ts — Import data/distros.json into PostgreSQL.
 *
 * Usage:
 *   npx tsx src/migrate.ts                         # default path
 *   npx tsx src/migrate.ts --source ../data/distros.json
 *
 * Reads the JSON source, upserts into entities/distros/edges tables.
 * Idempotent: safe to run multiple times.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool, closeDb } from './db.js';

interface SourceFamily {
  id: string;
  name: string;
  color: string;
  colorSecondary?: string;
  description?: string;
  founded?: number;
  rootDistroId?: string;
}

interface SourceDistro {
  id: string;
  name: string;
  familyId: string;
  parent?: string;
  additionalParents?: string[];
  status: 'active' | 'discontinued';
  founded?: number;
  country?: string;
  packageManager?: string;
  initSystem?: string;
  releaseModel?: string;
  license?: string;
  website?: string;
  wikipedia?: string;
  description?: string;
  statusNote?: string;
  discontinuedAt?: number;
  version?: string;
  architecture?: string[];
  desktopEnvironments?: string[];
  downloadUrl?: string;
  isoChecksum?: string;
  baseDistro?: string;
  lastUpdated?: string;
}

interface SourceData {
  families: SourceFamily[];
  distros: SourceDistro[];
}

async function main() {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf('--source');
  const sourcePath = sourceIdx >= 0
    ? resolve(process.cwd(), args[sourceIdx + 1])
    : resolve(process.cwd(), '../data/distros.json');

  console.log(`Reading ${sourcePath}...`);
  const data: SourceData = JSON.parse(readFileSync(sourcePath, 'utf-8'));
  console.log(`  ${data.families.length} families, ${data.distros.length} distros`);

  const client = await pool.connect();

  try {
    // ─── Insert the linux-kernel entity ──────────────────────────────
    await client.query(`
      INSERT INTO entities (id, name, type, description, website, wikipedia)
      VALUES ('linux-kernel', 'Linux kernel', 'distro',
              'The kernel at the heart of every distro, originally released by Linus Torvalds on 25 August 1991.',
              'https://www.kernel.org', 'https://en.wikipedia.org/wiki/Linux_kernel')
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO distros (entity_id, status, founded, country, license, release_model)
      VALUES ('linux-kernel', 'active', 1991, 'Finland', 'GPLv2', 'rolling')
      ON CONFLICT (entity_id) DO NOTHING
    `);

    // ─── Insert linux-kernel family ──────────────────────────────────
    await client.query(`
      INSERT INTO entities (id, name, type, description)
      VALUES ('linux-kernel', 'Linux kernel', 'family',
              'The kernel at the heart of every distro.')
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO families (entity_id, color, color_secondary, founded)
      VALUES ('linux-kernel', '#ffd166', '#ff9f1c', 1991)
      ON CONFLICT (entity_id) DO NOTHING
    `);

    let familyCount = 1;
    let distroCount = 1;
    let edgeCount = 0;

    // ─── Families ────────────────────────────────────────────────────
    for (const fam of data.families) {
      await client.query(`
        INSERT INTO entities (id, name, type, description)
        VALUES ($1, $2, 'family', $3)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = COALESCE(EXCLUDED.description, entities.description)
      `, [fam.id, fam.name, fam.description ?? null]);

      await client.query(`
        INSERT INTO families (entity_id, color, color_secondary, founded, root_distro_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (entity_id) DO UPDATE SET
          color = EXCLUDED.color,
          color_secondary = COALESCE(EXCLUDED.color_secondary, families.color_secondary),
          founded = COALESCE(EXCLUDED.founded, families.founded),
          root_distro_id = COALESCE(EXCLUDED.root_distro_id, families.root_distro_id)
      `, [fam.id, fam.color, fam.colorSecondary ?? null, fam.founded ?? null, fam.rootDistroId ?? null]);

      familyCount++;
    }
    console.log(`  ✓ ${familyCount} families`);

    // ─── Distros ─────────────────────────────────────────────────────
    for (const d of data.distros) {
      // Upsert entity
      await client.query(`
        INSERT INTO entities (id, name, type, description, website, wikipedia)
        VALUES ($1, $2, 'distro', $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = COALESCE(EXCLUDED.description, entities.description),
          website = COALESCE(EXCLUDED.website, entities.website),
          wikipedia = COALESCE(EXCLUDED.wikipedia, entities.wikipedia),
          updated_at = now()
      `, [d.id, d.name, d.description ?? null, d.website ?? null, d.wikipedia ?? null]);

      // Upsert distro details
      await client.query(`
        INSERT INTO distros (entity_id, status, founded, discontinued_at, country, version,
                             release_model, license, download_url, iso_checksum, last_updated)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (entity_id) DO UPDATE SET
          status = EXCLUDED.status,
          founded = COALESCE(EXCLUDED.founded, distros.founded),
          discontinued_at = COALESCE(EXCLUDED.discontinued_at, distros.discontinued_at),
          country = COALESCE(EXCLUDED.country, distros.country),
          version = COALESCE(EXCLUDED.version, distros.version),
          release_model = COALESCE(EXCLUDED.release_model, distros.release_model),
          license = COALESCE(EXCLUDED.license, distros.license),
          download_url = COALESCE(EXCLUDED.download_url, distros.download_url),
          iso_checksum = COALESCE(EXCLUDED.iso_checksum, distros.iso_checksum),
          last_updated = COALESCE(EXCLUDED.last_updated, distros.last_updated)
      `, [
        d.id, d.status, d.founded ?? null, d.discontinuedAt ?? null,
        d.country ?? null, d.version ?? null, d.releaseModel ?? null,
        d.license ?? null, d.downloadUrl ?? null, d.isoChecksum ?? null,
        d.lastUpdated ?? null,
      ]);

      distroCount++;

      // Family membership edge
      if (d.familyId) {
        await client.query(`
          INSERT INTO edges (source_id, target_id, rel_type)
          VALUES ($1, $2, 'belongs_to_family')
          ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
        `, [d.id, d.familyId]);
        edgeCount++;
      }

      // Parent (based_on) edge
      if (d.parent) {
        await client.query(`
          INSERT INTO edges (source_id, target_id, rel_type)
          VALUES ($1, $2, 'based_on')
          ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
        `, [d.id, d.parent]);
        edgeCount++;
      } else {
        // Auto-link family roots to linux-kernel
        await client.query(`
          INSERT INTO edges (source_id, target_id, rel_type)
          SELECT $1, 'linux-kernel', 'based_on'
          WHERE EXISTS (SELECT 1 FROM families WHERE root_distro_id = $1)
          ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
        `, [d.id]);
        edgeCount++;
      }

      // Additional parent edges
      for (const ap of d.additionalParents ?? []) {
        await client.query(`
          INSERT INTO edges (source_id, target_id, rel_type)
          VALUES ($1, $2, 'based_on')
          ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
        `, [d.id, ap]);
        edgeCount++;
      }

      // Technology edges (package manager, init system)
      if (d.packageManager && d.packageManager !== 'N/A') {
        const pkgId = d.packageManager.toLowerCase().replace(/[^a-z0-9]/g, '-');
        await client.query(`
          INSERT INTO entities (id, name, type) VALUES ($1, $2, 'technology')
          ON CONFLICT (id) DO NOTHING
        `, [pkgId, d.packageManager]);
        await client.query(`
          INSERT INTO technologies (entity_id, tech_type) VALUES ($1, 'package_manager')
          ON CONFLICT (entity_id) DO NOTHING
        `, [pkgId]);
        await client.query(`
          INSERT INTO edges (source_id, target_id, rel_type) VALUES ($1, $2, 'uses_package_mgr')
          ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
        `, [d.id, pkgId]);
        edgeCount++;
      }

      if (d.initSystem && d.initSystem !== 'N/A') {
        const initId = d.initSystem.toLowerCase().replace(/[^a-z0-9]/g, '-');
        await client.query(`
          INSERT INTO entities (id, name, type) VALUES ($1, $2, 'technology')
          ON CONFLICT (id) DO NOTHING
        `, [initId, d.initSystem]);
        await client.query(`
          INSERT INTO technologies (entity_id, tech_type) VALUES ($1, 'init_system')
          ON CONFLICT (entity_id) DO NOTHING
        `, [initId]);
        await client.query(`
          INSERT INTO edges (source_id, target_id, rel_type) VALUES ($1, $2, 'uses_init')
          ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
        `, [d.id, initId]);
        edgeCount++;
      }

      // Desktop environment edges
      for (const de of d.desktopEnvironments ?? []) {
        const deId = de.toLowerCase().replace(/[^a-z0-9]/g, '-');
        await client.query(`
          INSERT INTO entities (id, name, type) VALUES ($1, $2, 'technology')
          ON CONFLICT (id) DO NOTHING
        `, [deId, de]);
        await client.query(`
          INSERT INTO technologies (entity_id, tech_type) VALUES ($1, 'desktop_environment')
          ON CONFLICT (entity_id) DO NOTHING
        `, [deId]);
        await client.query(`
          INSERT INTO edges (source_id, target_id, rel_type) VALUES ($1, $2, 'uses_desktop')
          ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
        `, [d.id, deId]);
        edgeCount++;
      }

      // Architecture edges
      for (const arch of d.architecture ?? []) {
        const archId = arch.toLowerCase().replace(/[^a-z0-9]/g, '-');
        await client.query(`
          INSERT INTO entities (id, name, type) VALUES ($1, $2, 'technology')
          ON CONFLICT (id) DO NOTHING
        `, [archId, arch]);
        await client.query(`
          INSERT INTO technologies (entity_id, tech_type) VALUES ($1, 'architecture')
          ON CONFLICT (entity_id) DO NOTHING
        `, [archId]);
        await client.query(`
          INSERT INTO edges (source_id, target_id, rel_type) VALUES ($1, $2, 'supports_arch')
          ON CONFLICT (source_id, target_id, rel_type) DO NOTHING
        `, [d.id, archId]);
        edgeCount++;
      }
    }

    console.log(`  ✓ ${distroCount} distros`);
    console.log(`  ✓ ${edgeCount} edges`);
    console.log(`\n✓ Migration complete.`);

  } finally {
    client.release();
    await closeDb();
  }
}

main().catch((err) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
