#!/usr/bin/env tsx
/**
 * Batch 2 of dataset expansion (run after expand-distros.ts).
 *
 *   - Removes currently-empty families (a pre-existing wart: the data had
 *     families like `antergos`, `parabola`, `kaos`, `nobara`, etc. whose distros
 *     were actually filed under their upstream family).
 *   - Moves the Deepin distro into the (previously empty) `deepin` family and
 *     adds UOS as its child — Deepin genuinely is its own family.
 *   - Appends a curated batch of REAL, genuinely-new distributions to bring
 *     the total comfortably above 500, with correct family + parent lineage.
 *
 * Idempotent. Follow with `tsx scripts/validate-data.ts`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SourceData, SourceFamily, SourceDistro, ReleaseModel } from '../shared/types';

const SRC = resolve(process.cwd(), 'data/distros.json');
const src = JSON.parse(readFileSync(SRC, 'utf-8')) as SourceData;

const haveDistro = new Set(src.distros.map((d) => d.id));
const haveFamily = new Set(src.families.map((f) => f.id));

// ---------------------------------------------------------------------------
// 1. Remove empty families (keep `deepin`, which we populate below).
// ---------------------------------------------------------------------------
const distroCountByFamily = new Map<string, number>();
for (const d of src.distros) distroCountByFamily.set(d.familyId, (distroCountByFamily.get(d.familyId) ?? 0) + 1);
const keepDeepin = haveFamily.has('deepin');
let removedFamilies = 0;
src.families = src.families.filter((f) => {
  if (f.id === 'deepin') return true;
  const n = distroCountByFamily.get(f.id) ?? 0;
  if (n === 0) { removedFamilies++; return false; }
  return true;
});

// ---------------------------------------------------------------------------
// 2. Move Deepin into its own family + add UOS.
// ---------------------------------------------------------------------------
if (!haveFamily.has('deepin')) {
  src.families.push({ id: 'deepin', name: 'Deepin', color: '#2ca7f8', description: 'Chinese distribution with its own DDE, Debian-based.', founded: 2009, rootDistroId: 'deepin' });
  haveFamily.add('deepin');
}
const deepinDistro = src.distros.find((d) => d.id === 'deepin');
if (deepinDistro) deepinDistro.familyId = 'deepin';
const uos: SourceDistro = {
  id: 'uos', familyId: 'deepin', name: 'UOS', parent: 'deepin', status: 'active', founded: 2019, country: 'China',
  packageManager: 'apt/dpkg', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free',
  website: 'https://www.uniontech.com', wikipedia: 'https://en.wikipedia.org/wiki/Deepin#UOS',
  description: 'UnionTech OS (UOS), the commercial sibling of Deepin for the Chinese market.',
};
if (!haveDistro.has('uos')) { src.distros.push(uos); haveDistro.add('uos'); }

// ---------------------------------------------------------------------------
// 3. New independent families (each gets a base distro, so non-empty).
// ---------------------------------------------------------------------------
const newFamilies: SourceFamily[] = [
  { id: 'frugalware', name: 'Frugalware', color: '#b8860b', description: 'Independent distribution combining Slackware-style layout with pacman.', founded: 2004, rootDistroId: 'frugalware' },
  { id: 'exherbo', name: 'Exherbo', color: '#7a5c9c', description: 'Independent source-based distribution built with Paludis.', founded: 2008, rootDistroId: 'exherbo' },
  { id: 'sourcemage', name: 'Source Mage', color: '#5a8a3a', description: 'Independent source-based distribution managed by spell casting.', founded: 2002, rootDistroId: 'sourcemage' },
  { id: 'armbian', name: 'Armbian', color: '#e87722', description: 'Debian/Ubuntu-based distribution for ARM single-board computers.', founded: 2014, rootDistroId: 'armbian' },
  { id: 'photon', name: 'Photon OS', color: '#607d8b', description: "VMware's container-optimized RPM distribution.", founded: 2015, rootDistroId: 'photon' },
  { id: 'openeuler', name: 'openEuler', color: '#c0392b', description: 'Open-source community distribution from the OpenAtom Foundation.', founded: 2019, rootDistroId: 'openeuler' },
  { id: 'endless', name: 'Endless OS', color: '#6c3483', description: 'Debian-based immutable OSTree desktop for offline-first use.', founded: 2011, rootDistroId: 'endless' },
  { id: 't2', name: 'T2 SDE', color: '#7f8c8d', description: 'Independent source-based distribution built with the T2 System Development Environment.', founded: 2004, rootDistroId: 't2' },
  { id: 'adelie', name: 'Adelie', color: '#1b6ca8', description: 'Independent OpenRC distribution focused on PowerPC and libre software.', founded: 2016, rootDistroId: 'adelie' },
];
for (const f of newFamilies) {
  if (!haveFamily.has(f.id)) { src.families.push(f); haveFamily.add(f.id); }
}

// ---------------------------------------------------------------------------
// 4. New distros
// ---------------------------------------------------------------------------
type Add = SourceDistro;
const list: Add[] = [
  // Debian-based
  D('maemo', 'debian', 'debian', { founded: 2005, status: 'discontinued', discontinuedAt: 2011, country: 'Finland', description: 'Debian-based platform for Nokia internet tablets, discontinued (successor: MeeGo/Mer).', wikipedia: 'https://en.wikipedia.org/wiki/Maemo' }),
  D('musix', 'debian', 'debian', { founded: 2005, status: 'discontinued', country: 'Argentina', description: 'Debian-based distribution for audio production and libre multimedia, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/MusiX' }),
  D('skolelinux', 'debian', 'debian', { founded: 2001, country: 'Norway', description: 'Debian Pure Blend for schools, also packaged as Debian-Edu.', website: 'https://www.skolelinux.org', wikipedia: 'https://en.wikipedia.org/wiki/Debian-Edu' }),
  D('dietpi', 'debian', 'debian', { founded: 2014, country: 'United Kingdom', releaseModel: 'rolling', description: 'Lightweight Debian-based distribution optimized for single-board computers.', website: 'https://dietpi.com', wikipedia: 'https://en.wikipedia.org/wiki/DietPi' }),
  D('yunohost', 'debian', 'debian', { founded: 2012, country: 'France', description: 'Debian-based self-hosting server distribution with a web admin panel.', website: 'https://yunohost.org', wikipedia: 'https://en.wikipedia.org/wiki/YunoHost' }),
  D('freedombox', 'debian', 'debian', { founded: 2010, description: 'Debian-based private server appliance for the home.', website: 'https://www.freedombox.org', wikipedia: 'https://en.wikipedia.org/wiki/FreedomBox' }),
  D('subgraph', 'debian', 'debian', { founded: 2014, status: 'discontinued', description: 'Debian-based security-focused distribution with sandboxing, dormant.', website: 'https://subgraph.com', wikipedia: 'https://en.wikipedia.org/wiki/Subgraph_(operating_system)' }),
  D('gnewsense', 'debian', 'debian', { founded: 2006, status: 'discontinued', discontinuedAt: 2016, description: 'FSF-endorsed fully-free Debian-based distribution, discontinued.', website: 'https://www.gnewsense.org', wikipedia: 'https://en.wikipedia.org/wiki/gNewSense' }),
  D('dynebolic', 'debian', 'debian', { founded: 2003, country: 'Netherlands', description: 'Debian-based live distribution for multimedia activists.', website: 'https://dyne.org/software/dynebolic/', wikipedia: 'https://en.wikipedia.org/wiki/Dyne:bolic' }),
  D('blankon', 'debian', 'debian', { founded: 2005, country: 'Indonesia', description: 'Indonesian Debian-based distribution.', website: 'https://blankon.or.id', wikipedia: 'https://en.wikipedia.org/wiki/BlankOn' }),
  D('biglinux', 'debian', 'debian', { founded: 2003, country: 'Brazil', releaseModel: 'rolling', description: 'Brazilian Debian-based distribution with a customized KDE desktop.', website: 'https://www.biglinux.com.br', wikipedia: 'https://en.wikipedia.org/wiki/BigLinux' }),

  // Ubuntu-based
  D('tuxedo-os', 'ubuntu', 'ubuntu', { founded: 2022, country: 'Germany', description: 'TUXEDO Computers Ubuntu-based distribution tuned for their laptops.', website: 'https://tuxedo-os.org', wikipedia: 'https://en.wikipedia.org/wiki/TUXEDO_OS' }),
  D('chaletos', 'ubuntu', 'ubuntu', { founded: 2014, status: 'discontinued', discontinuedAt: 2018, description: 'Ubuntu-based distribution mimicking the Windows look, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/ChaletOS' }),
  D('zentyal', 'ubuntu', 'ubuntu', { founded: 2010, country: 'Spain', description: 'Ubuntu-based small-business server distribution (drop-in Windows DC alternative).', website: 'https://zentyal.com', wikipedia: 'https://en.wikipedia.org/wiki/Zentyal' }),
  D('remnux', 'ubuntu', 'ubuntu', { founded: 2010, description: 'Ubuntu-based toolkit for reverse-engineering and malware analysis.', website: 'https://remnux.org', wikipedia: 'https://en.wikipedia.org/wiki/REMnux' }),
  D('tsurugi', 'ubuntu', 'ubuntu', { founded: 2017, description: 'Ubuntu-based heavy forensics and investigation distribution.', website: 'https://tsurugi-linux.org', wikipedia: 'https://tsurugi-linux.org' }),
  D('csi-linux', 'ubuntu', 'ubuntu', { founded: 2021, description: 'Ubuntu-based digital forensics distribution for cybersecurity investigators.', website: 'https://csilinux.com', wikipedia: 'https://csilinux.com' }),
  D('security-onion', 'ubuntu', 'ubuntu', { founded: 2010, country: 'United States', description: 'Ubuntu-based platform for network security monitoring and threat hunting.', website: 'https://securityonionsolutions.com', wikipedia: 'https://en.wikipedia.org/wiki/Security_Onion' }),
  D('pear-os', 'ubuntu', 'ubuntu', { founded: 2007, status: 'discontinued', discontinuedAt: 2017, country: 'France', description: 'Ubuntu-based distribution with a macOS-like look, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Pear_OS' }),
  D('chromixium', 'ubuntu', 'ubuntu', { founded: 2015, status: 'discontinued', discontinuedAt: 2016, description: 'Ubuntu-based distribution mimicking ChromeOS, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Chromixium' }),
  D('pinguy', 'ubuntu', 'ubuntu', { founded: 2011, status: 'discontinued', discontinuedAt: 2018, country: 'United Kingdom', description: 'Ubuntu-based distribution preconfigured for usability, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Pinguy_OS' }),
  D('moonos', 'ubuntu', 'ubuntu', { founded: 2008, status: 'discontinued', discontinuedAt: 2013, country: 'Cambodia', description: 'Ubuntu-based distribution with the GNOME desktop, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/MoonOS' }),
  D('gos', 'ubuntu', 'ubuntu', { founded: 2007, status: 'discontinued', discontinuedAt: 2010, country: 'United States', description: 'Ubuntu-based distribution for low-cost cloud netbooks, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/GOS_(operating_system)' }),
  D('feren-os', 'ubuntu', 'ubuntu', { founded: 2015, description: 'Ubuntu-based distribution with a customized desktop and toolset.', website: 'https://ferenos.weebly.com', wikipedia: 'https://en.wikipedia.org/wiki/Feren_OS' }),

  // Fedora family
  D('fuduntu', 'fedora', 'fedora', { founded: 2010, status: 'discontinued', discontinuedAt: 2014, description: 'Fedora-based distribution targeting netbooks, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Fuduntu' }),
  D('regata-os', 'fedora', 'fedora', { founded: 2019, country: 'Brazil', description: 'Brazilian Fedora-based distribution for gamers and creators.', website: 'https://regataosl.com', wikipedia: 'https://en.wikipedia.org/wiki/Regata_OS' }),
  D('nst', 'fedora', 'fedora', { founded: 2003, country: 'United States', description: 'Network Security Toolkit — Fedora-based live distribution for security analysis.', website: 'https://www.networksecuritytoolkit.org', wikipedia: 'https://en.wikipedia.org/wiki/Network_Security_Toolkit' }),
  D('redstar-os', 'fedora', 'fedora', { founded: 2002, country: 'North Korea', status: 'active', description: "Fedora-based distribution developed in North Korea for domestic use.", wikipedia: 'https://en.wikipedia.org/wiki/Red_Star_OS' }),

  // Arch family
  D('athena-os', 'arch', 'arch', { founded: 2022, releaseModel: 'rolling', description: 'Arch-based distribution for cybersecurity and pentesting practice.', website: 'https://athena-os.org', wikipedia: 'https://athena-os.org' }),
  D('apricity', 'arch', 'arch', { founded: 2015, status: 'discontinued', discontinuedAt: 2017, releaseModel: 'rolling', description: 'Arch-based distribution with a polished GNOME desktop, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Apricity_OS' }),
  D('archstrike', 'arch', 'arch', { founded: 2015, releaseModel: 'rolling', description: 'Arch-based repository/distribution for penetration testing.', website: 'https://archstrike.org', wikipedia: 'https://en.wikipedia.org/wiki/ArchStrike' }),

  // Slackware family
  D('mazonos', 'slackware', 'slackware', { founded: 2018, country: 'Turkey', description: 'Slackware-based distribution with the FVWM desktop.', website: 'https://mazonos.com', wikipedia: 'https://mazonos.com' }),

  // Gentoo family
  D('ututo', 'gentoo', 'gentoo', { founded: 2000, status: 'discontinued', country: 'Argentina', releaseModel: 'rolling', description: 'Argentine Gentoo-based libre distribution, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Ututo' }),

  // RHEL family
  D('nethserver', 'rhel', 'centos', { founded: 2011, country: 'Italy', description: 'CentOS/RHEL-based small-business server distribution.', website: 'https://www.nethserver.org', wikipedia: 'https://en.wikipedia.org/wiki/NethServer' }),
  D('anolis', 'rhel', 'rhel', { founded: 2021, country: 'China', description: 'Chinese RHEL-compatible server distribution (Anolis OS).', website: 'https://openanolis.org', wikipedia: 'https://en.wikipedia.org/wiki/Anolis_OS' }),
  D('eurolinux', 'rhel', 'rhel', { founded: 2021, country: 'Poland', description: 'Polish RHEL-compatible enterprise distribution.', website: 'https://eurolinux.eu', wikipedia: 'https://en.wikipedia.org/wiki/EuroLinux' }),
  D('springdale', 'rhel', 'rhel', { founded: 2003, country: 'United States', description: "Princeton University's RHEL clone (formerly PUIAS).", website: 'https://springdale.math.ias.edu', wikipedia: 'https://en.wikipedia.org/wiki/Springdale_Linux' }),

  // Kali family
  D('backtrack', 'kali', 'ubuntu', { founded: 2006, status: 'discontinued', discontinuedAt: 2013, description: 'Ubuntu-based penetration-testing distribution, the predecessor to Kali Linux.', wikipedia: 'https://en.wikipedia.org/wiki/BackTrack' }),

  // openSUSE family
  // (GeckoLinux / Tumbleweed / Leap etc. were added in batch 1.)

  // Raspbian family
  D('raspberry-pi-os', 'raspbian', 'raspbian', { founded: 2012, country: 'United Kingdom', description: 'The Raspberry Pi Foundation Debian derivative (formerly Raspbian), the default Pi OS.', website: 'https://www.raspberrypi.com/software', wikipedia: 'https://en.wikipedia.org/wiki/Raspberry_Pi_OS' }),

  // Puppy family
  D('easy-os', 'puppy', 'puppy', { founded: 2017, description: 'Independent distribution by the Puppy creator using containers (Easy Containers).', website: 'https://easyos.org', wikipedia: 'https://en.wikipedia.org/wiki/EasyOS' }),

  // OpenWrt family
  D('librecmc', 'openwrt', 'openwrt', { founded: 2013, description: 'FSF-endorsed libre fork of OpenWrt for fully-free wireless routers.', website: 'https://librecmc.org', wikipedia: 'https://en.wikipedia.org/wiki/LibreCMC' }),
  D('gargoyle', 'openwrt', 'openwrt', { founded: 2008, description: 'OpenWrt fork focused on router bandwidth monitoring and QoS.', website: 'https://www.gargoyle-router.com', wikipedia: 'https://en.wikipedia.org/wiki/Gargoyle_(router_firmware)' }),

  // Manjaro family
  D('mabox', 'manjaro', 'manjaro', { founded: 2019, country: 'Poland', releaseModel: 'rolling', description: 'Manjaro-based distribution with a tuned Openbox/Tint2 desktop.', website: 'https://maboxlinux.org', wikipedia: 'https://en.wikipedia.org/wiki/Mabox' }),

  // ChromeOS family
  D('fydeos', 'chromeos', 'chromeos', { founded: 2018, country: 'China', releaseModel: 'rolling', description: 'Chromium-based distribution (FydeOS) for mainstream hardware, with Android app support.', website: 'https://fydeos.io', wikipedia: 'https://en.wikipedia.org/wiki/FydeOS' }),
  D('chromeos-flex', 'chromeos', 'chromeos', { founded: 2022, country: 'United States', description: "Google's ChromeOS for existing PCs and Macs.", website: 'https://chromeos.google/flex', wikipedia: 'https://en.wikipedia.org/wiki/ChromeOS_Flex' }),
  D('cloudready', 'chromeos', 'chromeos', { founded: 2015, status: 'discontinued', discontinuedAt: 2022, country: 'United States', description: 'Neverware Chromium-based distribution for older PCs, discontinued (folded into ChromeOS Flex).', wikipedia: 'https://en.wikipedia.org/wiki/CloudReady' }),

  // Independent new families
  D('frugalware', 'frugalware', undefined, { founded: 2004, country: 'Hungary', releaseModel: 'rolling', description: 'Independent distribution blending a Slackware-style layout with the pacman package manager.', website: 'https://frugalware.org', wikipedia: 'https://en.wikipedia.org/wiki/Frugalware' }),
  D('exherbo', 'exherbo', undefined, { founded: 2008, status: 'discontinued', discontinuedAt: 2023, releaseModel: 'rolling', description: 'Independent source-based distribution using the Paludis package manager, discontinued.', website: 'https://www.exherbolinux.org', wikipedia: 'https://en.wikipedia.org/wiki/Exherbo' }),
  D('sourcemage', 'sourcemage', undefined, { founded: 2002, releaseModel: 'rolling', description: 'Independent source-based distribution where packages are "spells" cast from source.', website: 'https://sourcemage.org', wikipedia: 'https://en.wikipedia.org/wiki/Source_Mage_GNU/Linux' }),
  D('armbian', 'armbian', 'debian', { founded: 2014, description: 'Debian/Ubuntu-based distribution built for ARM single-board computers.', website: 'https://www.armbian.com', wikipedia: 'https://en.wikipedia.org/wiki/Armbian' }),
  D('photon', 'photon', undefined, { founded: 2015, country: 'United States', releaseModel: 'rolling', description: "VMware's container-optimized RPM distribution for cloud-native workloads.", website: 'https://vmware.github.io/photon/', wikipedia: 'https://en.wikipedia.org/wiki/Photon_OS' }),
  D('openeuler', 'openeuler', undefined, { founded: 2019, country: 'China', releaseModel: 'rolling', description: 'Open-source community Linux distribution from the OpenAtom Foundation.', website: 'https://www.openeuler.org', wikipedia: 'https://en.wikipedia.org/wiki/OpenEuler' }),
  D('endless', 'endless', 'debian', { founded: 2011, country: 'United States', releaseModel: 'lts', description: 'Debian-based immutable OSTree desktop built for offline-first and education use.', website: 'https://endlessos.org', wikipedia: 'https://en.wikipedia.org/wiki/Endless_OS' }),
  D('t2', 't2', undefined, { founded: 2004, releaseModel: 'rolling', description: 'Independent source-based distribution built with the T2 System Development Environment.', website: 'https://t2sde.org', wikipedia: 'https://en.wikipedia.org/wiki/T2_SDE' }),
  D('adelie', 'adelie', undefined, { founded: 2016, country: 'United States', releaseModel: 'rolling', description: 'Independent OpenRC distribution focused on PowerPC hardware and libre software.', website: 'https://www.adelielinux.org', wikipedia: 'https://en.wikipedia.org/wiki/Adelie_Linux' }),
];

function D(id: string, family: string, parent: string | undefined, over: Partial<SourceDistro> & { name?: string }): Add {
  return {
    id,
    familyId: family,
    name: over.name ?? id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
    parent,
    status: over.status ?? 'active',
    founded: over.founded,
    country: over.country,
    packageManager: over.packageManager ?? defaultPkg(family),
    initSystem: over.initSystem ?? 'systemd',
    releaseModel: over.releaseModel ?? defaultRelease(family),
    license: over.license ?? 'Free',
    website: over.website,
    wikipedia: over.wikipedia,
    description: over.description,
    statusNote: over.statusNote,
    discontinuedAt: over.discontinuedAt,
  };
}
function defaultPkg(family: string): string {
  const m: Record<string, string> = {
    debian: 'apt/dpkg', ubuntu: 'apt/dpkg', fedora: 'dnf/rpm', rhel: 'dnf/rpm', arch: 'pacman',
    slackware: 'slackpkg/tgz', gentoo: 'emerge', kali: 'apt/dpkg', raspbian: 'apt/dpkg', puppy: 'pet',
    openwrt: 'opkg', manjaro: 'pacman', chromeos: 'rpm', deepin: 'apt/dpkg', frugalware: 'pacman',
    exherbo: 'paludis', sourcemage: 'cast', armbian: 'apt/dpkg', photon: 'tdnf/rpm', openeuler: 'dnf/rpm',
    endless: 'apt/dpkg', t2: 'T2', adelie: 'apk',
  };
  return m[family] ?? 'various';
}
function defaultRelease(family: string): ReleaseModel | undefined {
  if (['arch', 'gentoo', 'frugalware', 'exherbo', 'sourcemage', 't2', 'adelie', 'photon', 'openeuler'].includes(family)) return 'rolling';
  if (['fedora', 'ubuntu', 'debian', 'rhel'].includes(family)) return 'fixed';
  return undefined;
}

let added = 0;
for (const nd of list) {
  if (haveDistro.has(nd.id)) continue;
  src.distros.push(nd);
  haveDistro.add(nd.id);
  added++;
}

writeFileSync(SRC, JSON.stringify(src, null, 2) + '\n');
const active = src.distros.filter((x) => x.status === 'active').length;
console.log(`- ${removedFamilies} empty families removed`);
console.log(`+ ${added} distros (+ UOS)`);
console.log(`  → ${src.distros.length} distros total (${active} active, ${src.distros.length - active} discontinued) across ${src.families.length} families`);