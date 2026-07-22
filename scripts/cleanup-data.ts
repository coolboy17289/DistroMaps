#!/usr/bin/env tsx
/** Clean up data issues found during review */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceData } from '../shared/types';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'data/distros.json');

const current = JSON.parse(readFileSync(SRC, 'utf-8')) as SourceData;

// Remove non-Linux BSD entries
const toRemove = new Set(['openbsd', 'freebsd', 'ghostbsd']);
current.distros = current.distros.filter(d => !toRemove.has(d.id));

// Fix Firefox OS family - it was Gonk/Android based, not Debian
const ffos = current.distros.find(d => d.id === 'firefoxos');
if (ffos) ffos.familyId = 'lineageos';

// Remove orphan steamos-family (no distros reference it)
current.families = current.families.filter(f => f.id !== 'steamos-family');

// Fix webOS - remove it since it's not a Linux distro in the traditional sense
current.distros = current.distros.filter(d => d.id !== 'webos');

// Remove kaios family if no distros reference it
const kaiosFamilyUsed = current.distros.some(d => d.familyId === 'kaios');
if (!kaiosFamilyUsed) {
  current.families = current.families.filter(f => f.id !== 'kaios');
}
// Actually kaios was added as 'kaios-family' - let me check
const kaiosFamily = current.families.find(f => f.id === 'kaios-family');
if (kaiosFamily) {
  const used = current.distros.some(d => d.familyId === 'kaios-family');
  if (!used) current.families = current.families.filter(f => f.id !== 'kaios-family');
}

// Remove kaios (distro) if it references a non-existent family
const kaiosDistro = current.distros.find(d => d.id === 'kaios');
if (kaiosDistro && current.families.every(f => f.id !== kaiosDistro!.familyId)) {
  current.distros = current.distros.filter(d => d.id !== 'kaios');
}

writeFileSync(SRC, JSON.stringify(current, null, 2));
console.log(`✓ Cleaned up ${SRC}`);
console.log(`  ${current.families.length} families`);
console.log(`  ${current.distros.length} distros`);
