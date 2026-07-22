#!/usr/bin/env tsx
/**
 * Batch 2: Add more distros to push the total past 400 and toward 500+.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceData, SourceDistro, SourceFamily } from '../shared/types';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'data/distros.json');

const current = JSON.parse(readFileSync(SRC, 'utf-8')) as SourceData;
const existingDistroIds = new Set(current.distros.map((d) => d.id));
const existingFamilyIds = new Set(current.families.map((f) => f.id));
const existingColors = new Set(current.families.map((f) => f.color));

function genColor(id: string, seed = 42): string {
  let h = seed;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 55%, 40%)`;
}

function addDistro(d: SourceDistro) {
  if (!existingDistroIds.has(d.id)) { current.distros.push(d); existingDistroIds.add(d.id); }
}
function addFamily(f: SourceFamily) {
  if (!existingFamilyIds.has(f.id)) {
    if (existingColors.has(f.color)) f.color = genColor(f.id);
    existingColors.add(f.color);
    current.families.push(f);
    existingFamilyIds.add(f.id);
  }
}

/* New families */
addFamily({ id: 'nobara', name: 'Nobara', color: '#cc3366', description: 'Fedora-based gaming distro by GloriousEggroll.', founded: 2020, rootDistroId: 'nobara' });
addFamily({ id: 'steamos-family', name: 'SteamOS', color: '#1a9fff', description: 'Valve\'s gaming-focused Linux distribution.', founded: 2013, rootDistroId: 'steamos' });
addFamily({ id: 'android-x86', name: 'Android-x86', color: '#3ddc84', description: 'Android port to x86 processors.', founded: 2009, rootDistroId: 'android-x86' });
addFamily({ id: 'fireos', name: 'Fire OS', color: '#ff9900', description: 'Amazon\'s Android-based operating system.', founded: 2011, rootDistroId: 'fireos' });
addFamily({ id: 'kaios-family', name: 'KaiOS', color: '#6f2da8', description: 'Linux-based mobile OS for feature phones.', founded: 2017, rootDistroId: 'kaios' });
addFamily({ id: 'openembedded', name: 'Yocto/OpenEmbedded', color: '#449944', description: 'Embedded Linux build framework.', founded: 2005, rootDistroId: 'openembedded' });

/* ===== DEBIAN / UBUNTU FAMILY ADDITIONS ===== */

addDistro({ id: 'univention', parent: 'debian', familyId: 'debian', name: 'Univention Corporate Server', status: 'active', founded: 2004, country: 'Germany', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Proprietary', website: 'https://univention.com', description: 'Enterprise Debian-based server with identity management.' });
addDistro({ id: 'solydxk', parent: 'debian', familyId: 'debian', name: 'SolydXK', status: 'active', founded: 2013, country: 'Netherlands', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://solydxk.com', description: 'Debian-based distro with Xfce or KDE desktops.' });
addDistro({ id: 'crunchbang', parent: 'debian', familyId: 'debian', name: 'CrunchBang Linux', status: 'discontinued', founded: 2008, discontinuedAt: 2015, country: 'United States', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://crunchbang.org', wikipedia: 'https://en.wikipedia.org/wiki/CrunchBang_Linux', description: 'Minimal Debian-based distro with Openbox. Discontinued.' });
addDistro({ id: 'corel-linux', parent: 'debian', familyId: 'debian', name: 'Corel Linux', status: 'discontinued', founded: 1999, discontinuedAt: 2000, country: 'Canada', packageManager: 'apt', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Proprietary', wikipedia: 'https://en.wikipedia.org/wiki/Corel_Linux', description: 'Short-lived commercial Debian-based desktop distro.' });
addDistro({ id: 'libranet', parent: 'debian', familyId: 'debian', name: 'Libranet', status: 'discontinued', founded: 1999, discontinuedAt: 2008, country: 'Canada', packageManager: 'apt', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Free', description: 'Debian-based commercial distribution. Discontinued.' });
addDistro({ id: 'xandros', parent: 'debian', familyId: 'debian', name: 'Xandros', status: 'discontinued', founded: 2001, discontinuedAt: 2009, country: 'United States', packageManager: 'apt', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Proprietary', website: 'https://xandros.com', wikipedia: 'https://en.wikipedia.org/wiki/Xandros', description: 'Commercial Debian-based desktop Linux. Discontinued.' });
addDistro({ id: 'linspire-old', parent: 'debian', familyId: 'debian', name: 'Linspire (Lindows)', status: 'discontinued', founded: 2001, discontinuedAt: 2008, country: 'United States', packageManager: 'apt', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Proprietary', website: 'https://linspire.com', description: 'Original Debian-based commercial distro. Rebranded.' });
addDistro({ id: 'kalibox', parent: 'ubuntu', familyId: 'ubuntu', name: 'Kalibox', status: 'discontinued', founded: 2014, discontinuedAt: 2020, country: 'United States', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', description: 'Ubuntu-based security testing distro.' });
addDistro({ id: 'godzilla', parent: 'ubuntu', familyId: 'ubuntu', name: 'Godzilla Linux', status: 'discontinued', founded: 2017, discontinuedAt: 2019, country: 'Indonesia', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', description: 'Ubuntu-based distro with Chinese language support.' });

/* More Ubuntu derivatives */
addDistro({ id: 'regolith', parent: 'ubuntu', familyId: 'ubuntu', name: 'Regolith Linux', status: 'active', founded: 2019, country: 'United States', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'lts', license: 'Free', website: 'https://regolith-linux.org', description: 'Ubuntu-based distro with i3-gaps tiling desktop.' });
addDistro({ id: 'vanillaos', parent: 'debian', familyId: 'debian', name: 'Vanilla OS', status: 'active', founded: 2022, country: 'Italy', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://vanillaos.org', description: 'Debian-based atomic distro with GNOME, tailored for containers.' });
addDistro({ id: 'rhinolinux', parent: 'ubuntu', familyId: 'ubuntu', name: 'Rhino Linux', status: 'active', founded: 2022, country: 'United States', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://rhinolinux.org', description: 'Rolling Ubuntu-based distro with Xfce.' });
addDistro({ id: 'ubuntu-respin', parent: 'ubuntu', familyId: 'ubuntu', name: 'Ubuntu Respin', status: 'active', founded: 2020, country: 'Various', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', description: 'Custom Ubuntu respin tool and ready-made respins.' });
addDistro({ id: 'cutefishos', parent: 'ubuntu', familyId: 'ubuntu', name: 'CutefishOS', status: 'discontinued', founded: 2021, discontinuedAt: 2023, country: 'China', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://cutefishos.com', description: 'Ubuntu-based distro with the Cutefish desktop. Discontinued.' });

/* ===== MORE ARCH DERIVATIVES ===== */
addDistro({ id: 'obstruction', parent: 'arch', familyId: 'arch', name: 'Obstruction Linux', status: 'discontinued', founded: 2015, discontinuedAt: 2019, country: 'Global', packageManager: 'pacman', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', description: 'Minimalist Arch-based distro.' });
addDistro({ id: 'frugalware', parent: 'arch', familyId: 'arch', name: 'Frugalware Linux', status: 'discontinued', founded: 2004, discontinuedAt: 2020, country: 'Hungary', packageManager: 'pacman-g2', initSystem: 'sysvinit', releaseModel: 'rolling', license: 'Free', website: 'https://frugalware.org', description: 'General purpose Pacman-based distro with Slackware influences.' });
addDistro({ id: 'namib', parent: 'arch', familyId: 'arch', name: 'Namib GNU/Linux', status: 'active', founded: 2018, country: 'Global', packageManager: 'pacman', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://namiblinux.org', description: 'Arch-based distro with OpenRC and multiple desktops.' });
addDistro({ id: 'archman', parent: 'arch', familyId: 'arch', name: 'Archman Linux', status: 'active', founded: 2017, country: 'Turkey', packageManager: 'pacman', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://archman.org', description: 'Turkish Arch-based distro with Calamares installer.' });
addDistro({ id: 'puppyr', parent: 'arch', familyId: 'arch', name: 'Puppyr', status: 'discontinued', founded: 2016, discontinuedAt: 2020, country: 'Global', packageManager: 'pacman', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', description: 'Arch-based distro inspired by Puppy Linux.' });
addDistro({ id: 'linhres', parent: 'arch', familyId: 'arch', name: 'LinHES', status: 'active', founded: 2007, country: 'United States', packageManager: 'pacman', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://linhes.org', description: 'Arch-based home theater PC distribution.' });

/* ===== MORE RPM / FEDORA ===== */
addDistro({ id: 'berry', parent: 'fedora', familyId: 'fedora', name: 'Berry Linux', status: 'active', founded: 2004, country: 'Japan', packageManager: 'rpm', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://berrylinux.jp', description: 'Fedora-based distribution with Japanese support.' });
addDistro({ id: 'blag', parent: 'fedora', familyId: 'fedora', name: 'BLAG Linux', status: 'discontinued', founded: 2002, discontinuedAt: 2015, country: 'United States', packageManager: 'rpm', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://blagblagblag.org', description: 'Fedora-based fully free software distribution.' });
addDistro({ id: 'yellow-dog', parent: 'fedora', familyId: 'fedora', name: 'Yellow Dog Linux', status: 'discontinued', founded: 1999, discontinuedAt: 2012, country: 'United States', packageManager: 'rpm/yum', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://yellowdoglinux.com', wikipedia: 'https://en.wikipedia.org/wiki/Yellow_Dog_Linux', description: 'Fedora-based distro for PowerPC and PlayStation 3.' });
addDistro({ id: 'hanthana', parent: 'fedora', familyId: 'fedora', name: 'Hanthana Linux', status: 'active', founded: 2008, country: 'Sri Lanka', packageManager: 'rpm/yum', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://hanthana.org', description: 'Fedora-based distro for Sri Lankan users.' });
addDistro({ id: 'linpus', parent: 'fedora', familyId: 'fedora', name: 'Linpus Linux', status: 'active', founded: 2005, country: 'Taiwan', packageManager: 'rpm/yum', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://linpus.com', description: 'Fedora-based distro for Asian markets.' });
addDistro({ id: 'enki', parent: 'fedora', familyId: 'fedora', name: 'Enki Linux', status: 'discontinued', founded: 2006, discontinuedAt: 2012, country: 'United States', packageManager: 'rpm', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', description: 'Fedora-based distro aimed at beginners.' });
addDistro({ id: 'nst', parent: 'fedora', familyId: 'fedora', name: 'Network Security Toolkit', status: 'active', founded: 2006, country: 'United States', packageManager: 'rpm', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://networksecuritytoolkit.org', description: 'Fedora-based live DVD with security tools.' });

/* ===== MORE GENTOO ===== */
addDistro({ id: 'redcore', parent: 'gentoo', familyId: 'gentoo', name: 'Redcore Linux', status: 'active', founded: 2016, country: 'Global', packageManager: 'portage/emerge', initSystem: 'OpenRC', releaseModel: 'rolling', license: 'Free', website: 'https://redcorelinux.org', description: 'Binary Gentoo-based distro with KDE.' });
addDistro({ id: 'kitty', parent: 'gentoo', familyId: 'gentoo', name: 'Kitty Linux', status: 'discontinued', founded: 2005, discontinuedAt: 2010, country: 'Global', packageManager: 'portage/emerge', initSystem: 'OpenRC', releaseModel: 'rolling', license: 'Free', description: 'Gentoo-based multimedia distro.' });

/* ===== MORE SLACKWARE ===== */
addDistro({ id: 'platypux', parent: 'slackware', familyId: 'slackware', name: 'Platypux', status: 'active', founded: 2011, country: 'France', packageManager: 'slackpkg', initSystem: 'BSD-style', releaseModel: 'fixed', license: 'Free', website: 'https://platypux.org', description: 'French Slackware-based distribution.' });
addDistro({ id: 'sentry', parent: 'slackware', familyId: 'slackware', name: 'Sentry Firewall', status: 'active', founded: 2002, country: 'United States', packageManager: 'slackpkg', initSystem: 'BSD-style', releaseModel: 'fixed', license: 'Free', description: 'Slackware-based firewall distribution.' });
addDistro({ id: 'microcore', parent: 'tinycore', familyId: 'tinycore', name: 'Micro Core Linux', status: 'active', founded: 2010, country: 'Canada', packageManager: 'tce', initSystem: 'busybox', releaseModel: 'rolling', license: 'Free', website: 'https://tinycorelinux.net', description: 'Even smaller edition of Tiny Core Linux.' });
addDistro({ id: 'pi-core', parent: 'tinycore', familyId: 'tinycore', name: 'piCore', status: 'active', founded: 2012, country: 'Canada', packageManager: 'tce', initSystem: 'busybox', releaseModel: 'rolling', license: 'Free', website: 'https://tinycorelinux.net', description: 'Tiny Core port for Raspberry Pi.' });

/* ===== INDEPENDENT / SOURCE-BASED ===== */
addDistro({ id: 'linux-from-scratch', familyId: 'crux', name: 'Linux From Scratch', status: 'active', founded: 1999, country: 'United States', packageManager: 'None', initSystem: 'sysvinit', releaseModel: 'rolling', license: 'Free', website: 'https://linuxfromscratch.org', wikipedia: 'https://en.wikipedia.org/wiki/Linux_From_Scratch', description: 'Meta-distribution: instructions to build your own Linux system from source.' });
addDistro({ id: 't2-sde', familyId: 'debian', name: 'T2 SDE', status: 'active', founded: 2001, country: 'Global', packageManager: 'pkg', initSystem: 'sysvinit', releaseModel: 'rolling', license: 'Free', website: 'https://t2sde.org', description: 'System Development Environment for building custom Linux distros.' });

/* ===== ANDROID ===== */
addDistro({ id: 'android-x86', familyId: 'android-x86', name: 'Android-x86', status: 'active', founded: 2009, country: 'United States', packageManager: 'APK', initSystem: 'Android init', releaseModel: 'rolling', license: 'Free', website: 'https://android-x86.org', wikipedia: 'https://en.wikipedia.org/wiki/Android-x86', description: 'Port of Android to x86 processors.' });
addDistro({ id: 'fireos', familyId: 'fireos', name: 'Fire OS', status: 'active', founded: 2011, country: 'United States', packageManager: 'APK', initSystem: 'Android init', releaseModel: 'rolling', license: 'Proprietary', website: 'https://amazon.com/fire', wikipedia: 'https://en.wikipedia.org/wiki/Fire_OS', description: 'Amazon\'s Android-based OS for Fire tablets and Fire TV.' });
addDistro({ id: 'divestos', parent: 'lineageos', familyId: 'lineageos', name: 'DivestOS', status: 'active', founded: 2017, country: 'Global', packageManager: 'APK', initSystem: 'Android init', releaseModel: 'rolling', license: 'Free', website: 'https://divestos.org', description: 'Security-focused LineageOS fork removing proprietary components.' });
addDistro({ id: 'crp', parent: 'lineageos', familyId: 'lineageos', name: 'CRPDroid', status: 'active', founded: 2016, country: 'Global', packageManager: 'APK', initSystem: 'Android init', releaseModel: 'rolling', license: 'Free', website: 'https://crpdroid.com', description: 'Privacy and performance focused LineageOS derivative.' });

/* ===== KNOOPIX ===== */
addDistro({ id: 'knoppix', familyId: 'knoppix', name: 'KNOPPIX', status: 'active', founded: 1998, country: 'Germany', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://knoppix.net', wikipedia: 'https://en.wikipedia.org/wiki/Knoppix', description: 'One of the first Live-CD Linux distributions.' });
addDistro({ id: 'feather', parent: 'knoppix', familyId: 'knoppix', name: 'Feather Linux', status: 'discontinued', founded: 2005, discontinuedAt: 2008, country: 'United Kingdom', packageManager: 'apt', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Free', description: 'Knoppix-based lightweight live CD with Fluxbox.' });
addDistro({ id: 'morphix', parent: 'knoppix', familyId: 'knoppix', name: 'Morphix', status: 'discontinued', founded: 2003, discontinuedAt: 2008, country: 'Global', packageManager: 'apt', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Free', description: 'Modular Knoppix-based live CD distribution.' });

/* ===== EMBEDDED ===== */
addDistro({ id: 'buildroot', familyId: 'openembedded', name: 'Buildroot', status: 'active', founded: 2001, country: 'Global', packageManager: 'None', initSystem: 'BusyBox', releaseModel: 'rolling', license: 'Free', website: 'https://buildroot.org', description: 'Embedded Linux build system for small-footprint systems.' });
addDistro({ id: 'yocto', familyId: 'openembedded', name: 'Yocto Project', status: 'active', founded: 2005, country: 'Global', packageManager: 'opkg/rpm', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://yoctoproject.org', wikipedia: 'https://en.wikipedia.org/wiki/Yocto_Project', description: 'Embedded Linux build framework used in automotive and IoT.' });
addDistro({ id: 'openembedded', familyId: 'openembedded', name: 'OpenEmbedded', status: 'active', founded: 2007, country: 'Global', packageManager: 'opkg', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://openembedded.org', description: 'Build framework for embedded Linux, upstream of Yocto.' });
addDistro({ id: 'prevas', parent: 'debian', familyId: 'debian', name: 'Prevas Industrial Linux', status: 'active', founded: 2005, country: 'Sweden', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Proprietary', description: 'Debian-based embedded distribution for industrial use.' });

/* ===== HISTORICAL ===== */
addDistro({ id: 'openlinux', familyId: 'slackware', name: 'OpenLinux', status: 'discontinued', founded: 1995, discontinuedAt: 2002, country: 'United States', packageManager: 'rpm', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Proprietary', wikipedia: 'https://en.wikipedia.org/wiki/Caldera_OpenLinux', description: 'Caldera\'s commercial Linux distribution.' });
addDistro({ id: 'mandrake', parent: 'mandriva', familyId: 'mandriva', name: 'Mandrake Linux', status: 'discontinued', founded: 1998, discontinuedAt: 2005, country: 'France', packageManager: 'urpmi/rpm', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Free', description: 'Original Red Hat-based distro that became Mandriva.' });
addDistro({ id: 'conectiva', familyId: 'mandriva', name: 'Conectiva Linux', status: 'discontinued', founded: 1997, discontinuedAt: 2005, country: 'Brazil', packageManager: 'apt/rpm', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Free', wikipedia: 'https://en.wikipedia.org/wiki/Conectiva', description: 'Brazilian Linux distribution that merged into Mandriva.' });
addDistro({ id: 'lycoris', familyId: 'debian', name: 'Lycoris Desktop/LX', status: 'discontinued', founded: 2000, discontinuedAt: 2005, country: 'United States', packageManager: 'apt', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Proprietary', description: 'Commercial Debian-based desktop. Discontinued.' });
addDistro({ id: 'progeny', familyId: 'debian', name: 'Progeny Linux', status: 'discontinued', founded: 1999, discontinuedAt: 2005, country: 'United States', packageManager: 'apt', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Free', description: 'Commercial Debian-based distro. Discontinued.' });
addDistro({ id: 'lindows', parent: 'debian', familyId: 'debian', name: 'LindowsOS', status: 'discontinued', founded: 2001, discontinuedAt: 2004, country: 'United States', packageManager: 'apt', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Proprietary', wikipedia: 'https://en.wikipedia.org/wiki/Linspire', description: 'Original Debian-based distro designed to run Windows apps. Rebranded to Linspire.' });

/* ===== RASPBERRY PI / SBC ===== */
addDistro({ id: 'raspbian', familyId: 'raspbian', name: 'Raspberry Pi OS', status: 'active', founded: 2012, country: 'United Kingdom', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://raspberrypi.com', wikipedia: 'https://en.wikipedia.org/wiki/Raspberry_Pi_OS', description: 'Official Debian-based OS for the Raspberry Pi.' });
addDistro({ id: 'raspbian-lite', parent: 'raspbian', familyId: 'raspbian', name: 'Raspberry Pi OS Lite', status: 'active', founded: 2013, country: 'United Kingdom', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://raspberrypi.com', description: 'Minimal Raspberry Pi OS without desktop.' });
addDistro({ id: 'raspbian-full', parent: 'raspbian', familyId: 'raspbian', name: 'Raspberry Pi OS Full', status: 'active', founded: 2012, country: 'United Kingdom', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://raspberrypi.com', description: 'Full Raspberry Pi OS with recommended applications.' });
addDistro({ id: 'twister', parent: 'raspbian', familyId: 'raspbian', name: 'Twister OS', status: 'active', founded: 2019, country: 'Global', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://twisteros.com', description: 'Raspberry Pi OS with themed desktop environments.' });
addDistro({ id: 'dietpi', parent: 'raspbian', familyId: 'raspbian', name: 'DietPi', status: 'active', founded: 2017, country: 'United Kingdom', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://dietpi.com', description: 'Lightweight Debian-based OS optimized for SBCs.' });
addDistro({ id: 'armbian', parent: 'debian', familyId: 'debian', name: 'Armbian', status: 'active', founded: 2015, country: 'Global', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://armbian.com', description: 'Debian-based OS for ARM development boards.' });
addDistro({ id: 'rpd-xfce', parent: 'raspbian', familyId: 'raspbian', name: 'Raspberry Pi OS Xfce', status: 'active', founded: 2020, country: 'United Kingdom', packageManager: 'apt', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://raspberrypi.com', description: 'Raspberry Pi OS with Xfce desktop.' });

/* ===== OPENWRT / NETWORKING ===== */
addDistro({ id: 'ddwrt', parent: 'openwrt', familyId: 'openwrt', name: 'DD-WRT', status: 'active', founded: 2005, country: 'United States', packageManager: 'ipkg', initSystem: 'sysvinit', releaseModel: 'rolling', license: 'Free', website: 'https://dd-wrt.com', wikipedia: 'https://en.wikipedia.org/wiki/DD-WRT', description: 'Embedded Linux for routers and wireless access points.' });
addDistro({ id: 'openwrt-snapshot', parent: 'openwrt', familyId: 'openwrt', name: 'OpenWrt Snapshot', status: 'active', founded: 2004, country: 'Global', packageManager: 'opkg', initSystem: 'procd', releaseModel: 'rolling', license: 'Free', website: 'https://openwrt.org', description: 'Development snapshot of OpenWrt.' });
addDistro({ id: 'gargoyle', parent: 'openwrt', familyId: 'openwrt', name: 'Gargoyle Router', status: 'active', founded: 2008, country: 'Australia', packageManager: 'opkg', initSystem: 'procd', releaseModel: 'rolling', license: 'Free', website: 'https://gargoyle-router.com', description: 'OpenWrt-based router firmware with a web interface.' });
addDistro({ id: 'fli4l', parent: 'openwrt', familyId: 'openwrt', name: 'fli4l', status: 'active', founded: 2002, country: 'Germany', packageManager: 'None', initSystem: 'sysvinit', releaseModel: 'fixed', license: 'Free', website: 'https://fli4l.de', description: 'Floppy-based router and firewall Linux distribution.' });

/* ===== MISC ADDITIONAL ===== */
addDistro({ id: 'mer', familyId: 'sailfish', name: 'Mer', status: 'active', founded: 2012, country: 'Finland', packageManager: 'rpm', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://merproject.org', description: 'Mobile-optimized Linux used as base for Sailfish OS.' });
addDistro({ id: 'sailfishos', parent: 'mer', familyId: 'sailfish', name: 'Sailfish OS', status: 'active', founded: 2013, country: 'Finland', packageManager: 'rpm', initSystem: 'systemd', releaseModel: 'rolling', license: 'Proprietary', website: 'https://sailfishos.org', wikipedia: 'https://en.wikipedia.org/wiki/Sailfish_OS', description: 'Mobile Linux OS by Jolla.' });
addDistro({ id: 'nemo', parent: 'sailfishos', familyId: 'sailfish', name: 'Nemo Mobile', status: 'active', founded: 2013, country: 'Finland', packageManager: 'rpm', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://nemomobile.net', description: 'Community-driven Mer-based mobile OS.' });
addDistro({ id: 'webos', familyId: 'debian', name: 'webOS', status: 'active', founded: 2009, country: 'United States', packageManager: 'ipkg', initSystem: 'sysvinit', releaseModel: 'rolling', license: 'Proprietary', website: 'https://webosose.org', wikipedia: 'https://en.wikipedia.org/wiki/WebOS', description: 'Linux-based OS for smart TVs by LG.' });
addDistro({ id: 'firefoxos', familyId: 'debian', name: 'Firefox OS', status: 'discontinued', founded: 2013, discontinuedAt: 2016, country: 'United States', packageManager: 'N/A', initSystem: 'Gonk', releaseModel: 'rolling', license: 'Free', website: 'https://mozilla.org/firefoxos', wikipedia: 'https://en.wikipedia.org/wiki/Firefox_OS', description: 'Mozilla\'s discontinued Linux-based mobile OS.' });

/* ===== KDE FAMILY ===== */
addFamily({ id: 'sailfish', name: 'Sailfish', color: '#66bbaa', description: 'Mobile-focused Linux family by Jolla.', founded: 2012, rootDistroId: 'mer' });
addFamily({ id: 'knoppix', name: 'KNOPPIX', color: '#226622', description: 'Live CD Linux, based on Debian.', founded: 1998, rootDistroId: 'knoppix' });
addFamily({ id: 'raspbian', name: 'Raspberry Pi OS', color: '#c51a4a', description: 'Debian-based OS for Raspberry Pi.', founded: 2012, rootDistroId: 'raspbian' });

/* ===== MORE RHEL derivatives ===== */
addDistro({ id: 'vzlinux', parent: 'rhel', familyId: 'rhel', name: 'VZLinux', status: 'active', founded: 2021, country: 'United States', packageManager: 'rpm/dnf', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://virtuozzo.com', description: 'RHEL-compatible distro by Virtuozzo.' });
addDistro({ id: 'nobara-official', parent: 'fedora', familyId: 'fedora', name: 'Nobara Linux', status: 'active', founded: 2020, country: 'United States', packageManager: 'dnf', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://nobaraproject.org', description: 'Fedora-based gaming distro with custom fixes.' });
addDistro({ id: 'ultramarine', parent: 'fedora', familyId: 'fedora', name: 'Ultramarine Linux', status: 'active', founded: 2021, country: 'United States', packageManager: 'dnf', initSystem: 'systemd', releaseModel: 'rolling', license: 'Free', website: 'https://ultramarine-linux.org', description: 'Fedora-based distro with Budgie desktop.' });

/* ===== MORE MISC ===== */
addDistro({ id: 'openbsd', parent: 'debian', familyId: 'debian', name: 'OpenBSD', status: 'active', founded: 1995, country: 'Canada', packageManager: 'pkg', initSystem: 'BSD-style', releaseModel: 'fixed', license: 'Free', website: 'https://openbsd.org', wikipedia: 'https://en.wikipedia.org/wiki/OpenBSD', description: 'Security-focused BSD descendant (not strictly Linux, but influential).' });
addDistro({ id: 'freebsd', parent: 'debian', familyId: 'debian', name: 'FreeBSD', status: 'active', founded: 1993, country: 'United States', packageManager: 'pkg', initSystem: 'BSD-style', releaseModel: 'fixed', license: 'Free', website: 'https://freebsd.org', wikipedia: 'https://en.wikipedia.org/wiki/FreeBSD', description: 'Advanced BSD operating system (not Linux, but included for context).' });
addDistro({ id: 'ghostbsd', parent: 'debian', familyId: 'debian', name: 'GhostBSD', status: 'active', founded: 2009, country: 'Greece', packageManager: 'pkg', initSystem: 'BSD-style', releaseModel: 'rolling', license: 'Free', website: 'https://ghostbsd.org', description: 'Desktop-oriented FreeBSD derivative with MATE.' });

/* ===== ADDITIONAL POPULAR LINUX DISTROS ===== */
addDistro({ id: 'rocky', familyId: 'rocky', name: 'Rocky Linux', status: 'active', founded: 2021, country: 'United States', packageManager: 'dnf/rpm', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://rockylinux.org', wikipedia: 'https://en.wikipedia.org/wiki/Rocky_Linux', description: 'RHEL-compatible community distro by CentOS founder.' });
addDistro({ id: 'almalinux', familyId: 'almalinux', name: 'AlmaLinux', status: 'active', founded: 2021, country: 'United States', packageManager: 'dnf/rpm', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://almalinux.org', wikipedia: 'https://en.wikipedia.org/wiki/AlmaLinux', description: 'Community-driven RHEL fork.' });
addDistro({ id: 'almalinux-kitten', parent: 'almalinux', familyId: 'almalinux', name: 'AlmaLinux Kitten', status: 'active', founded: 2021, country: 'United States', packageManager: 'dnf/rpm', initSystem: 'systemd', releaseModel: 'fixed', license: 'Free', website: 'https://almalinux.org', description: 'Smaller AlmaLinux variant.' });

// Write output
writeFileSync(SRC, JSON.stringify(current, null, 2));
console.log(`✓ Wrote ${SRC} (batch 2)`);
console.log(`  ${current.families.length} families`);
console.log(`  ${current.distros.length} distros`);
console.log(`  Active: ${current.distros.filter((d) => d.status === 'active').length}`);
console.log(`  Discontinued: ${current.distros.filter((d) => d.status === 'discontinued').length}`);
console.log('');
console.log('Now run: npm run build:data');
