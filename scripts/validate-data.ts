#!/usr/bin/env tsx
/**
 * Validate data/distros.json integrity before building:
 *   - every distro.familyId resolves to a family
 *   - every parent / additionalParents reference resolves to an existing distro
 *   - no duplicate distro ids or family ids
 *   - status ∈ {active, discontinued}, releaseModel (if set) is a known value
 *   - family.rootDistroId (if set) resolves to an existing distro
 * Exits non-zero with a readable report on any violation.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SourceData, DistroStatus, ReleaseModel } from '../shared/types';

const SRC = resolve(process.cwd(), 'data/distros.json');
const src = JSON.parse(readFileSync(SRC, 'utf-8')) as SourceData;

const STATUS: DistroStatus[] = ['active', 'discontinued'];
const RELEASE: ReleaseModel[] = ['rolling', 'fixed', 'semi-rolling', 'half-rolling', 'lts', 'static'];

const errors: string[] = [];
const warn: string[] = [];

// The build script (scripts/build-data.ts) injects a canonical `linux-kernel`
// family + distro, so treat it as always-present when validating the source.
const familyIds = new Set<string>(['linux-kernel']);
for (const f of src.families) {
  if (familyIds.has(f.id)) errors.push(`Duplicate family id: ${f.id}`);
  familyIds.add(f.id);
  if (!f.color || !(f.color.startsWith('#') || f.color.startsWith('hsl') || f.color.startsWith('rgb'))) {
    warn.push(`Family ${f.id} missing/invalid color`);
  }
}

const distroIds = new Set<string>();
for (const d of src.distros) {
  if (distroIds.has(d.id)) errors.push(`Duplicate distro id: ${d.id}`);
  distroIds.add(d.id);
}

for (const d of src.distros) {
  if (!familyIds.has(d.familyId)) errors.push(`Distro ${d.id} references missing family "${d.familyId}"`);
  if (!STATUS.includes(d.status)) errors.push(`Distro ${d.id} has invalid status "${d.status}"`);
  if (d.releaseModel && !RELEASE.includes(d.releaseModel)) {
    errors.push(`Distro ${d.id} has invalid releaseModel "${d.releaseModel}"`);
  }
  if (d.parent && !distroIds.has(d.parent)) {
    errors.push(`Distro ${d.id} parent "${d.parent}" does not exist`);
  }
  for (const ap of d.additionalParents ?? []) {
    if (!distroIds.has(ap)) errors.push(`Distro ${d.id} additionalParent "${ap}" does not exist`);
    if (ap === d.parent) warn.push(`Distro ${d.id} additionalParent duplicates parent`);
  }
}

for (const f of src.families) {
  if (f.rootDistroId && !distroIds.has(f.rootDistroId)) {
    errors.push(`Family ${f.id} rootDistroId "${f.rootDistroId}" does not exist`);
  }
}

// Self-parent / cycles are tolerated (the build script walks them), but flag
// a distro whose parent is itself.
for (const d of src.distros) {
  if (d.parent === d.id) errors.push(`Distro ${d.id} is its own parent`);
}

const counts = {
  // build-data.ts injects a canonical `linux-kernel` family (+1) on top of the
  // source families, so report the same count the build emits to avoid the
  // confusing 88-vs-89 mismatch between `validate:data` and `build:data`.
  families: src.families.length + 1,
  distros: src.distros.length,
  active: src.distros.filter((d) => d.status === 'active').length,
  discontinued: src.distros.filter((d) => d.status === 'discontinued').length,
};

console.log(`Data: ${counts.distros} distros (${counts.active} active, ${counts.discontinued} discontinued) across ${counts.families} families`);
if (warn.length) {
  console.log(`\nWarnings (${warn.length}):`);
  for (const w of warn) console.log(`  ⚠ ${w}`);
}
if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(`\n✗ Validation failed.`);
  process.exit(1);
}
console.log(`✓ Validation passed.`);