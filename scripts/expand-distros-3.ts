#!/usr/bin/env tsx
/** Batch 3 — final top-up to clear 500 comfortably. Idempotent. */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SourceData, SourceDistro } from '../shared/types';

const SRC = resolve(process.cwd(), 'data/distros.json');
const src = JSON.parse(readFileSync(SRC, 'utf-8')) as SourceData;

const haveDistro = new Set(src.distros.map((d) => d.id));
const haveFamily = new Set(src.families.map((f) => f.id));

if (!haveFamily.has('parted-magic')) {
  src.families.push({ id: 'parted-magic', name: 'Parted Magic', color: '#8e44ad', description: 'Independent commercial live distribution for disk partitioning and recovery.', founded: 2003, rootDistroId: 'parted-magic' });
  haveFamily.add('parted-magic');
}

const list: SourceDistro[] = [
  {
    id: 'av-linux', familyId: 'debian', name: 'AV Linux', parent: 'debian', status: 'active', founded: 2008,
    description: 'Debian/MX-based distribution tuned for audio and video production.',
    packageManager: 'apt/dpkg', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free',
    website: 'https://www.bandshed.net/avlinux/', wikipedia: 'https://en.wikipedia.org/wiki/AV_Linux',
  },
  {
    id: 'boss-linux', familyId: 'debian', name: 'BOSS Linux', parent: 'debian', status: 'active', founded: 2007, country: 'India',
    description: 'Bharat Operating System Solutions — Indian government Debian-based distribution.',
    packageManager: 'apt/dpkg', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free',
    website: 'https://boss.bosslinux.in', wikipedia: 'https://en.wikipedia.org/wiki/BOSS_Linux',
  },
  {
    id: 'red-hat-linux', familyId: 'rhel', name: 'Red Hat Linux', parent: 'linux-kernel', status: 'discontinued', discontinuedAt: 2004, founded: 1994, country: 'United States',
    description: 'The original Red Hat community distribution (1994–2003), predecessor of both Fedora and RHEL.',
    packageManager: 'rpm', initSystem: 'SysV', releaseModel: 'fixed', license: 'GPL',
    wikipedia: 'https://en.wikipedia.org/wiki/Red_Hat_Linux',
  },
  {
    id: 'fedora-core', familyId: 'fedora', name: 'Fedora Core', parent: 'red-hat-linux', status: 'discontinued', discontinuedAt: 2007, founded: 2003, country: 'United States',
    description: 'The original Fedora name (2003–2007) succeeding Red Hat Linux, before becoming plain Fedora.',
    packageManager: 'yum/rpm', initSystem: 'SysV', releaseModel: 'fixed', license: 'Free',
    wikipedia: 'https://en.wikipedia.org/wiki/Fedora_(operating_system)',
  },
  {
    id: 'parted-magic', familyId: 'parted-magic', name: 'Parted Magic', status: 'active', founded: 2003,
    description: 'Independent commercial live distribution for disk partitioning, cloning and recovery.',
    packageManager: 'pacman', initSystem: 'init', releaseModel: 'rolling', license: 'Commercial',
    website: 'https://partedmagic.com', wikipedia: 'https://en.wikipedia.org/wiki/Parted_Magic',
  },
  {
    id: 'parsix', familyId: 'debian', name: 'Parsix', parent: 'debian', status: 'discontinued', discontinuedAt: 2016, founded: 2005, country: 'Iran',
    description: 'Iranian Debian-based desktop distribution, discontinued.',
    packageManager: 'apt/dpkg', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free',
    wikipedia: 'https://en.wikipedia.org/wiki/Parsix_GNU/Linux',
  },
  {
    id: 'ctkarch', familyId: 'arch', name: 'CTKArch', parent: 'arch', status: 'discontinued', discontinuedAt: 2014, founded: 2009,
    description: 'Minimal Arch-based distribution for live USBs, discontinued.',
    packageManager: 'pacman', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free',
    wikipedia: 'https://en.wikipedia.org/wiki/CTKArch',
  },
  {
    id: 'bridge-linux', familyId: 'arch', name: 'Bridge Linux', parent: 'arch', status: 'discontinued', discontinuedAt: 2013, founded: 2012,
    description: 'Arch-based distribution aiming to ease the Arch install experience, discontinued.',
    packageManager: 'pacman', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free',
    wikipedia: 'https://en.wikipedia.org/wiki/Bridge_Linux',
  },
];

let added = 0;
for (const nd of list) {
  if (haveDistro.has(nd.id)) continue;
  src.distros.push(nd);
  haveDistro.add(nd.id);
  added++;
}

writeFileSync(SRC, JSON.stringify(src, null, 2) + '\n');
const active = src.distros.filter((x) => x.status === 'active').length;
console.log(`+ ${added} distros`);
console.log(`  → ${src.distros.length} distros total (${active} active, ${src.distros.length - active} discontinued) across ${src.families.length} families`);