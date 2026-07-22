#!/usr/bin/env tsx
/**
 * Build script: reads data/distros.json (single source of truth),
 * computes parent-of edges, links family-roots to linux-kernel, then
 * emits frontend/public/data.json which the SPA reads on boot.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Distro, Edge, Family, GraphData, SourceData } from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'data/distros.json');
const OUT = resolve(ROOT, 'frontend/public/data.json');
const API_OUT = resolve(ROOT, 'frontend/api/data.json');
const VUE_OUT = resolve(ROOT, 'frontend-vue/public/data.json');
// Root-level copy so the Vercel root `api/[...all].ts` serverless function can
// read the dataset via `process.cwd()/data.json` (bundled via includeFiles).
const ROOT_OUT = resolve(ROOT, 'data.json');

type Source = SourceData;

function buildGraph(src: Source): GraphData {
  // Ensure the canonical Linux kernel family + distro.
  const families: Family[] = [
    {
      id: 'linux-kernel',
      name: 'Linux kernel',
      color: '#ffd166',
      colorSecondary: '#ff9f1c',
      description: 'The kernel at the heart of every distro, originally released by Linus Torvalds on 25 August 1991.',
      founded: 1991,
    },
  ];
  const seenFamily = new Set<string>(['linux-kernel']);
  for (const f of src.families) {
    if (seenFamily.has(f.id)) continue;
    seenFamily.add(f.id);
    families.push(f);
  }

  const distros: Distro[] = [];
  distros.push({
    id: 'linux-kernel',
    name: 'Linux kernel',
    family: 'linux-kernel',
    status: 'active',
    founded: 1991,
    country: 'Finland',
    packageManager: 'N/A',
    initSystem: 'N/A',
    releaseModel: 'rolling',
    license: 'GPLv2',
    website: 'https://www.kernel.org',
    wikipedia: 'https://en.wikipedia.org/wiki/Linux_kernel',
    description: 'The kernel at the heart of every distro, originally released by Linus Torvalds on 25 August 1991.',
    statusNote: 'Active',
  });
  const seenDistro = new Set<string>(['linux-kernel']);

  for (const partial of src.distros) {
    if (seenDistro.has(partial.id)) continue;
    seenDistro.add(partial.id);
    const familyId = partial.familyId;
    if (!familyId) throw new Error(`Distro ${partial.id} is missing a family`);
    distros.push({ ...partial, family: familyId } as Distro);
  }

  // Auto-link family-roots to the kernel.
  const familyRoots = new Set<string>();
  for (const f of src.families) {
    if (f.rootDistroId) familyRoots.add(f.rootDistroId);
  }
  for (const d of distros) {
    if (familyRoots.has(d.id) && !d.parent) d.parent = 'linux-kernel';
  }

  // Compute edges.
  const edges: Edge[] = [];
  const seenEdge = new Set<string>();
  for (const d of distros) {
    const all = [d.parent, ...(d.additionalParents ?? [])].filter(Boolean) as string[];
    for (const p of all) {
      const key = `${p}->${d.id}`;
      if (seenEdge.has(key)) continue;
      seenEdge.add(key);
      edges.push({ source: p, target: d.id });
    }
  }

  let active = 0;
  let discontinued = 0;
  for (const d of distros) {
    if (d.status === 'discontinued') discontinued++;
    else active++;
  }

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
}

function main() {
  const src = JSON.parse(readFileSync(SRC, 'utf-8')) as Source;

  // Enrich distros with ISO metadata if available (written by autonomous-crawler.ts)
  // This fills in downloadUrl/isoChecksum/version/architecture from probed download pages.
  const ISO_META = resolve(ROOT, 'data/iso-metadata.json');
  try {
    if (existsSync(ISO_META)) {
      const isoMeta = JSON.parse(readFileSync(ISO_META, 'utf-8')) as Record<string, {
        downloadUrl?: string; isoChecksum?: string; version?: string; architecture?: string[]; probedAt: string;
      }>;
      for (const d of src.distros) {
        const iso = isoMeta[d.id];
        if (!iso) continue;
        // Fill in structured fields only if the distro doesn't already have them
        if (!d.downloadUrl && iso.downloadUrl) d.downloadUrl = iso.downloadUrl;
        if (!d.isoChecksum && iso.isoChecksum) d.isoChecksum = iso.isoChecksum;
        if (!d.version && iso.version) d.version = iso.version;
        if ((!d.architecture || d.architecture.length === 0) && iso.architecture?.length) {
          d.architecture = iso.architecture as any;
        }
      }
    }
  } catch { /* ISO metadata not available or malformed — skip */ }

  const graph = buildGraph(src);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(graph));
  // Copy to api directory so Vercel serverless function can find it reliably
  mkdirSync(dirname(API_OUT), { recursive: true });
  writeFileSync(API_OUT, JSON.stringify(graph));
  // Copy to the Vue 3 frontend's public dir so it boots from its own /data.json.
  mkdirSync(dirname(VUE_OUT), { recursive: true });
  writeFileSync(VUE_OUT, JSON.stringify(graph));
  // Root-level copy for the Vercel serverless function (see ROOT_OUT above).
  writeFileSync(ROOT_OUT, JSON.stringify(graph));
  console.log(
    `✓ ${graph.distros.length} distros (${graph.meta.active} active, ${graph.meta.discontinued} discontinued) across ${graph.families.length} families → ${OUT}`,
  );
}

main();
