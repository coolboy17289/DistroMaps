#!/usr/bin/env tsx
/**
 * One-shot data hygiene + expansion for data/distros.json.
 *
 *   1. Fixes pre-existing dangling parent/family references that the build
 *      script silently tolerated (dropped edges):
 *        - mandrake/conectiva parent "redhat" → valid Red Hat lineage
 *        - add the missing ALT Linux & ROSA family-root distros so their
 *          children resolve
 *        - rosa rootDistroId → an existing distro; rosa-linux moved to rosa family
 *        - fill in missing family colors (coreos / slax / fireos)
 *   2. Appends a curated batch of REAL distributions (Bazzite already exists)
 *      to bring the dataset comfortably above 500, with correct family +
 *      parent lineage. New families are added only where a distro genuinely
 *      belongs to none of the existing ones.
 *
 * Idempotent: appends/fills only when an id is absent, so re-runs are safe.
 * Run `tsx scripts/validate-data.ts` afterwards to confirm integrity.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SourceData, SourceFamily, SourceDistro, DistroStatus, ReleaseModel } from '../shared/types';

const SRC = resolve(process.cwd(), 'data/distros.json');
const src = JSON.parse(readFileSync(SRC, 'utf-8')) as SourceData;

const haveDistro = new Set(src.distros.map((d) => d.id));
const haveFamily = new Set(src.families.map((f) => f.id));

// ---------------------------------------------------------------------------
// 1. Hygiene fixes
// ---------------------------------------------------------------------------

function patchDistro(id: string, patch: Partial<SourceDistro>) {
  const d = src.distros.find((x) => x.id === id);
  if (!d) { console.warn(`  ! fix: distro ${id} not found`); return; }
  Object.assign(d, patch);
}

// Mandrake & Conectiva were Red Hat derivatives; "redhat" isn't a distro here,
// so point them at the valid Red Hat lineage (rhel) and the Mandrake→Mandriva
// succession (conectiva merged into Mandrake to form Mandriva).
patchDistro('mandrake', { parent: 'rhel' });
patchDistro('conectiva', { parent: 'mandrake' });

// ALT Linux family had no base distro; its children parented "altlinux".
const altlinuxBase: SourceDistro = {
  id: 'altlinux',
  familyId: 'altlinux',
  name: 'ALT Linux',
  status: 'active',
  founded: 2001,
  country: 'Russia',
  packageManager: 'apt-rpm',
  initSystem: 'systemd',
  releaseModel: 'rolling',
  license: 'GPL',
  website: 'https://www.basealt.ru',
  wikipedia: 'https://en.wikipedia.org/wiki/ALT_Linux',
  description: 'Russian RPM-based distribution family built on the Sisyphus repository; the family root for ALT Linux Server/Workstation editions.',
};
if (!haveDistro.has('altlinux')) { src.distros.push(altlinuxBase); haveDistro.add('altlinux'); }

// ROSA family root should point at an existing distro; move rosa-linux into
// the rosa family (it was misplaced under mandriva).
const rosaFam = src.families.find((f) => f.id === 'rosa');
if (rosaFam) rosaFam.rootDistroId = 'rosa-fresh';
patchDistro('rosa-linux', { familyId: 'rosa' });

// Fill missing family colors.
function setColor(id: string, color: string) {
  const f = src.families.find((x) => x.id === id);
  if (f && !f.color) f.color = color;
}
setColor('coreos', '#2980b9');
setColor('slax', '#b03060');
setColor('fireos', '#ff9900');

// ---------------------------------------------------------------------------
// 2. Expansion — curated, real distributions
// ---------------------------------------------------------------------------

const newFamilies: SourceFamily[] = [
  { id: 'deepin', name: 'Deepin', color: '#2ca7f8', description: 'Chinese distribution with its own Deepin Desktop Environment, Debian-based.', founded: 2009, rootDistroId: 'deepin' },
  { id: 'pardus', name: 'Pardus', color: '#f0a000', description: 'Turkish national distribution, Debian-based.', founded: 2003, rootDistroId: 'pardus' },
  { id: 'whonix', name: 'Whonix', color: '#6c3b6e', description: 'Privacy-focused distribution routed through Tor, Debian-based.', founded: 2012, rootDistroId: 'whonix' },
  { id: 'kaos', name: 'KaOS', color: '#5f8fb4', description: 'Independent KDE-first rolling distribution.', founded: 2013, rootDistroId: 'kaos' },
  { id: 'clearlinux', name: 'Clear Linux', color: '#41c0f0', description: "Intel's performance-optimized rolling distribution.", founded: 2014, rootDistroId: 'clear-linux' },
  { id: 'aosc', name: 'AOSC', color: '#4a90d9', description: 'AOSC OS, independent rolling distribution from the Anthon Open Source Community.', founded: 2011, rootDistroId: 'aosc' },
];

type Add = Omit<SourceDistro, 'id'> & { id: string };
const newDistros: Add[] = [
  // --- Ubuntu flavors & derivatives ---
  d('kubuntu', 'ubuntu', 'ubuntu', { founded: 2005, description: 'Official Ubuntu flavor shipping the KDE Plasma desktop.', website: 'https://kubuntu.org', wikipedia: 'https://en.wikipedia.org/wiki/Kubuntu' }),
  d('xubuntu', 'ubuntu', 'ubuntu', { founded: 2006, description: 'Official Ubuntu flavor with the Xfce desktop, lighter on resources.', website: 'https://xubuntu.org', wikipedia: 'https://en.wikipedia.org/wiki/Xubuntu' }),
  d('lubuntu', 'ubuntu', 'ubuntu', { founded: 2008, description: 'Lightweight Ubuntu flavor using LXQt.', website: 'https://lubuntu.me', wikipedia: 'https://en.wikipedia.org/wiki/Lubuntu' }),
  d('ubuntu-budgie', 'ubuntu', 'ubuntu', { founded: 2016, description: 'Ubuntu flavor featuring the Budgie desktop.', website: 'https://ubuntubudgie.org', wikipedia: 'https://en.wikipedia.org/wiki/Ubuntu_Budgie' }),
  d('ubuntu-mate', 'ubuntu', 'ubuntu', { founded: 2014, description: 'Ubuntu flavor bringing back the MATE desktop.', website: 'https://ubuntu-mate.org', wikipedia: 'https://en.wikipedia.org/wiki/Ubuntu_MATE' }),
  d('ubuntu-studio', 'ubuntu', 'ubuntu', { founded: 2007, description: 'Ubuntu flavor preloaded for audio, video and graphics production.', website: 'https://ubuntustudio.org', wikipedia: 'https://en.wikipedia.org/wiki/Ubuntu_Studio' }),
  d('ubuntukylin', 'ubuntu', 'ubuntu', { founded: 2013, country: 'China', description: 'Ubuntu flavor tailored for Chinese users.', website: 'https://www.ubuntukylin.com', wikipedia: 'https://en.wikipedia.org/wiki/Ubuntu_Kylin' }),
  d('ubuntu-unity', 'ubuntu', 'ubuntu', { founded: 2021, description: 'Ubuntu remix restoring the Unity desktop.', website: 'https://ubuntuunity.org', wikipedia: 'https://en.wikipedia.org/wiki/Ubuntu_Unity' }),
  d('edubuntu', 'ubuntu', 'ubuntu', { founded: 2005, description: 'Ubuntu flavor bundled for schools and classrooms.', website: 'https://www.edubuntu.org', wikipedia: 'https://en.wikipedia.org/wiki/Edubuntu' }),
  d('ubuntu-cinnamon', 'ubuntu', 'ubuntu', { founded: 2016, description: 'Ubuntu flavor with the Cinnamon desktop.', website: 'https://ubuntucinnamon.org', wikipedia: 'https://en.wikipedia.org/wiki/Ubuntu_Cinnamon' }),
  d('kde-neon', 'ubuntu', 'ubuntu', { founded: 2016, description: 'KDE-focused distribution built on Ubuntu LTS to showcase the latest KDE software.', website: 'https://neon.kde.org', wikipedia: 'https://en.wikipedia.org/wiki/KDE_neon' }),
  d('pop-os', 'ubuntu', 'ubuntu', { founded: 2017, country: 'United States', description: "System76's Ubuntu-based distribution tuned for creators and NVIDIA out of the box.", website: 'https://pop.system76.com', wikipedia: 'https://en.wikipedia.org/wiki/Pop!_OS' }),
  d('zorin-os', 'ubuntu', 'ubuntu', { founded: 2009, country: 'Ireland', description: 'Ubuntu-based desktop aimed at Windows/macOS migrants.', website: 'https://zorin.com/os', wikipedia: 'https://en.wikipedia.org/wiki/Zorin_OS' }),
  d('backbox', 'ubuntu', 'ubuntu', { founded: 2010, description: 'Ubuntu-based distribution for penetration testing and security assessment.', website: 'https://www.backbox.org', wikipedia: 'https://en.wikipedia.org/wiki/BackBox' }),
  d('voyager', 'ubuntu', 'ubuntu', { founded: 2007, country: 'France', description: 'French Ubuntu remix with a customized GNOME/Shell experience.', website: 'https://voyagerlive.org', wikipedia: 'https://en.wikipedia.org/wiki/Voyager_(operating_system)' }),
  d('emmabuntus', 'ubuntu', 'ubuntu', { founded: 2013, country: 'France', description: 'Ubuntu/XFCE distribution built for refurbished computers and solidarity projects.', website: 'https://emmabuntus.org', wikipedia: 'https://en.wikipedia.org/wiki/Emmabunt%C3%BCs' }),
  d('robolinux', 'ubuntu', 'ubuntu', { founded: 2011, status: 'discontinued', discontinuedAt: 2020, description: 'Ubuntu-based distribution that could run Windows in a VM, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Robolinux' }),
  d('ultimate-edition', 'ubuntu', 'ubuntu', { founded: 2006, status: 'discontinued', description: 'Heavily customized Ubuntu remix bundling extra software, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Ultimate_Edition' }),
  d('ubuntudde', 'ubuntu', 'ubuntu', { founded: 2019, country: 'China', description: 'Ubuntu remix shipping the Deepin Desktop Environment.', website: 'https://ubuntudde.com', wikipedia: 'https://en.wikipedia.org/wiki/UbuntuDDE' }),

  // --- Debian family ---
  d('bunsenlabs', 'debian', 'debian', { founded: 2015, description: 'CrunchBang successor built on Debian, lightweight Openbox desktop.', website: 'https://www.bunsenlabs.org', wikipedia: 'https://en.wikipedia.org/wiki/BunsenLabs' }),
  d('crunchbang-pp', 'debian', 'debian', { founded: 2015, description: 'CrunchBang++ — community continuation of CrunchBang on Debian.', website: 'https://crunchbangplusplus.org', wikipedia: 'https://en.wikipedia.org/wiki/CrunchBang%2B%2B' }),
  d('siduction', 'debian', 'debian', { founded: 2011, releaseModel: 'rolling', description: 'Rolling distribution derived from Debian unstable (sid).', website: 'https://siduction.org', wikipedia: 'https://en.wikipedia.org/wiki/Siduction' }),
  d('kaisen', 'debian', 'debian', { founded: 2020, description: 'Debian-based distribution for computer forensics and incident response.', website: 'https://kaisen-linux.com', wikipedia: 'https://en.wikipedia.org/wiki/Kaisen_Linux' }),
  d('elive', 'debian', 'debian', { founded: 2002, description: 'Debian-based distribution with the Enlightenment desktop.', website: 'https://www.elivecd.org', wikipedia: 'https://en.wikipedia.org/wiki/Elive' }),
  d('astra', 'debian', 'debian', { founded: 2008, country: 'Russia', description: 'Russian Debian-based distribution for secure and government use.', website: 'https://www.astra-linux.com', wikipedia: 'https://en.wikipedia.org/wiki/Astra_Linux' }),
  d('lmde', 'mint', 'debian', { founded: 2011, description: 'Linux Mint Debian Edition — the Mint desktop directly on Debian rather than Ubuntu.', website: 'https://www.linuxmint.com', wikipedia: 'https://en.wikipedia.org/wiki/Linux_Mint_Debian_Edition' }),
  d('refracta', 'devuan', 'devuan', { founded: 2011, description: 'Devuan-based distribution with tools to build a custom live system.', website: 'https://refracta.org', wikipedia: 'https://en.wikipedia.org/wiki/Refracta' }),

  // --- Fedora family (atomic images + spins) ---
  d('silverblue', 'fedora', 'fedora', { founded: 2018, releaseModel: 'rolling', description: 'Fedora Atomic workstation variant with an immutable ostree root and GNOME.', website: 'https://fedoraproject.org/silverblue', wikipedia: 'https://en.wikipedia.org/wiki/Fedora_Silverblue' }),
  d('kinoite', 'fedora', 'fedora', { founded: 2021, releaseModel: 'rolling', description: 'Fedora Atomic KDE variant (the KDE counterpart to Silverblue).', website: 'https://fedoraproject.org/kinoite', wikipedia: 'https://en.wikipedia.org/wiki/Fedora_Kinoite' }),
  d('sericea', 'fedora', 'fedora', { founded: 2023, releaseModel: 'rolling', description: 'Fedora Atomic i3/Sway variant.', website: 'https://fedoraproject.org/sericea', wikipedia: 'https://fedoraproject.org/sericea' }),
  d('onyx', 'fedora', 'fedora', { founded: 2024, releaseModel: 'rolling', description: 'Fedora Atomic Sway variant.', website: 'https://fedoraproject.org/onyx' }),
  d('aurora', 'fedora', 'kinoite', { founded: 2023, releaseModel: 'rolling', description: 'Universal Blue image built on Fedora Kinoite for a polished KDE atomic desktop.', website: 'https://getaurora.dev', wikipedia: 'https://en.wikipedia.org/wiki/Universal_Blue' }),
  d('bluefin', 'fedora', 'silverblue', { founded: 2023, releaseModel: 'rolling', description: 'Universal Blue image on Fedora Silverblue with an opinionated GNOME setup.', website: 'https://projectbluefin.io', wikipedia: 'https://en.wikipedia.org/wiki/Universal_Blue' }),
  d('secureblue', 'fedora', 'silverblue', { founded: 2023, releaseModel: 'rolling', description: 'Hardened Fedora Silverblue-based image focused on security and privacy.', website: 'https://secureblue.dev', wikipedia: 'https://secureblue.dev' }),
  d('fedora-kde', 'fedora', 'fedora', { founded: 2004, description: 'Fedora spin shipping the KDE Plasma desktop.', website: 'https://fedoraproject.org/spins/kde', wikipedia: 'https://en.wikipedia.org/wiki/Fedora_(operating_system)' }),
  d('fedora-xfce', 'fedora', 'fedora', { founded: 2004, description: 'Fedora spin with the Xfce desktop.', website: 'https://fedoraproject.org/spins/xfce' }),
  d('fedora-lxqt', 'fedora', 'fedora', { founded: 2015, description: 'Fedora spin with the LXQt lightweight desktop.', website: 'https://fedoraproject.org/spins/lxqt' }),
  d('fedora-cinnamon', 'fedora', 'fedora', { founded: 2014, description: 'Fedora spin with the Cinnamon desktop.', website: 'https://fedoraproject.org/spins/cinnamon' }),
  d('fedora-soas', 'fedora', 'fedora', { founded: 2009, description: 'Sugar on a Stick — Fedora spin with the Sugar learning environment.', website: 'https://fedoraproject.org/spins/soas', wikipedia: 'https://en.wikipedia.org/wiki/Sugar_(software)' }),
  d('fedora-i3', 'fedora', 'fedora', { founded: 2020, description: 'Fedora spin with the i3 tiling window manager.', website: 'https://fedoraproject.org/spins/i3' }),
  d('fedora-sway', 'fedora', 'fedora', { founded: 2021, description: 'Fedora spin with the Sway Wayland compositor.', website: 'https://fedoraproject.org/spins/sway' }),
  d('fedora-astronomy', 'fedora', 'fedora', { founded: 2010, description: 'Fedora Lab for astronomy and scientific computing.', website: 'https://labs.fedoraproject.org/astronomy' }),
  d('fedora-design', 'fedora', 'fedora', { founded: 2009, description: 'Fedora Design Suite for graphic and multimedia designers.', website: 'https://labs.fedoraproject.org/design-suite' }),
  d('fedora-games', 'fedora', 'fedora', { founded: 2011, description: 'Fedora spin bundled with open-source games.', website: 'https://labs.fedoraproject.org/games' }),
  d('fedora-jam', 'fedora', 'fedora', { founded: 2013, description: 'Fedora Lab for audio and music production.', website: 'https://labs.fedoraproject.org/jam' }),
  d('fedora-robotics', 'fedora', 'fedora', { founded: 2013, description: 'Fedora Lab for robotics and maker work.', website: 'https://labs.fedoraproject.org/robotics' }),
  d('fedora-security', 'fedora', 'fedora', { founded: 2011, description: 'Fedora Security Lab for auditing and forensics.', website: 'https://labs.fedoraproject.org/security' }),
  d('risios', 'fedora', 'fedora', { founded: 2020, status: 'discontinued', description: 'Fedora remix with GNOME Shell customizations, discontinued.', website: 'https://risiorg.github.io' }),
  d('berry-linux', 'fedora', 'fedora', { founded: 2003, country: 'Japan', description: 'Japanese Fedora-based distribution.', website: 'https://berry-linux.com', wikipedia: 'https://en.wikipedia.org/wiki/Berry_Linux' }),

  // --- openSUSE family ---
  d('opensuse-tumbleweed', 'opensuse', 'opensuse', { founded: 2010, releaseModel: 'rolling', description: 'openSUSE rolling-release distribution.', website: 'https://www.opensuse.org', wikipedia: 'https://en.wikipedia.org/wiki/openSUSE' }),
  d('opensuse-leap', 'opensuse', 'opensuse', { founded: 2015, releaseModel: 'fixed', description: 'openSUSE regular-release distribution sharing its base with SUSE Linux Enterprise.', website: 'https://www.opensuse.org', wikipedia: 'https://en.wikipedia.org/wiki/openSUSE' }),
  d('opensuse-microos', 'opensuse', 'opensuse', { founded: 2019, releaseModel: 'rolling', description: 'openSUSE transactional micro-derivative for containers and edge.', website: 'https://microos.opensuse.org', wikipedia: 'https://en.wikipedia.org/wiki/OpenSUSE#MicroOS' }),
  d('aeon', 'opensuse', 'opensuse-microos', { founded: 2023, releaseModel: 'rolling', description: 'openSUSE Aeon — immutable GNOME desktop built on MicroOS.', website: 'https://aeon.opensuse.org', wikipedia: 'https://en.wikipedia.org/wiki/OpenSUSE#Aeon' }),
  d('kalpa', 'opensuse', 'opensuse-microos', { founded: 2023, releaseModel: 'rolling', description: 'openSUSE Kalpa — immutable KDE desktop built on MicroOS.', website: 'https://kalpa.opensuse.org', wikipedia: 'https://en.wikipedia.org/wiki/OpenSUSE#Kalpa' }),
  d('slowroll', 'opensuse', 'opensuse', { founded: 2024, releaseModel: 'semi-rolling', description: 'openSUSE Slowroll — a slower-moving rolling release between Leap and Tumbleweed.', website: 'https://en.opensuse.org/openSUSE:Slowroll' }),
  d('geckolinux', 'opensuse', 'opensuse', { founded: 2016, description: 'openSUSE-based distribution with a polished out-of-the-box desktop.', website: 'https://geckolinux.github.io', wikipedia: 'https://en.wikipedia.org/wiki/GeckoLinux' }),

  // --- Arch family ---
  d('archcraft', 'arch', 'arch', { founded: 2020, releaseModel: 'rolling', description: 'Minimal, beautiful Arch-based distribution focused on tiling WMs.', website: 'https://archcraft.io', wikipedia: 'https://en.wikipedia.org/wiki/Archcraft' }),
  d('archbang', 'arch', 'arch', { founded: 2010, releaseModel: 'rolling', description: 'Arch-based distribution with a preconfigured Openbox desktop.', website: 'https://archbang.org', wikipedia: 'https://en.wikipedia.org/wiki/ArchBang' }),
  d('obarun', 'arch', 'arch', { founded: 2014, releaseModel: 'rolling', description: 'Arch-based distribution using its own s6/66 init system.', website: 'https://web.obarun.org', wikipedia: 'https://en.wikipedia.org/wiki/Obarun' }),
  d('parabola', 'arch', 'arch', { founded: 2010, releaseModel: 'rolling', description: 'Fully free Arch-based distribution endorsed by the GNU FSDG.', website: 'https://www.parabola.nu', wikipedia: 'https://en.wikipedia.org/wiki/Parabola_GNU/Linux-libre' }),
  d('hyperbola', 'arch', 'arch', { founded: 2017, status: 'discontinued', discontinuedAt: 2024, releaseModel: 'rolling', description: 'Free Arch-based distribution (later pivoting to a BSD base), discontinued as a Linux distro.', website: 'https://www.hyperbola.info', wikipedia: 'https://en.wikipedia.org/wiki/Hyperbola_GNU/Linux-libre' }),
  d('rebornos', 'arch', 'arch', { founded: 2018, releaseModel: 'rolling', description: 'Arch-based distribution aimed at ease of use with multiple desktop options.', website: 'https://rebornos.org', wikipedia: 'https://en.wikipedia.org/wiki/RebornOS' }),
  d('chakra', 'arch', 'arch', { founded: 2006, status: 'discontinued', discontinuedAt: 2019, description: 'KDE-focused Arch-based distribution, discontinued.', website: 'https://chakralinux.org', wikipedia: 'https://en.wikipedia.org/wiki/Chakra_Linux' }),
  d('antergos', 'arch', 'arch', { founded: 2012, status: 'discontinued', discontinuedAt: 2019, releaseModel: 'rolling', description: 'Arch-based distribution with its own graphical installer, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Antergos' }),
  d('bluestar', 'arch', 'arch', { founded: 2014, releaseModel: 'rolling', description: 'Arch-based distribution with a customized KDE Plasma desktop.', website: 'https://bluestarlinux.org', wikipedia: 'https://en.wikipedia.org/wiki/BlueStar_Linux' }),
  d('archlabs', 'arch', 'arch', { founded: 2017, releaseModel: 'rolling', description: 'Arch-based distribution focused on minimal tiling-WM setups.', website: 'https://archlabslinux.com', wikipedia: 'https://en.wikipedia.org/wiki/ArchLabs' }),
  d('linhes', 'arch', 'arch', { founded: 2006, releaseModel: 'rolling', description: 'Arch-based distribution built around the MythTV media center.', website: 'https://www.linhes.org', wikipedia: 'https://en.wikipedia.org/wiki/LinHES' }),

  // --- Slackware family ---
  d('slint', 'slackware', 'slackware', { founded: 2018, description: 'Accessible Slackware-based distribution for visually impaired users.', website: 'https://slint.fr', wikipedia: 'https://en.wikipedia.org/wiki/Slint_Linux' }),
  d('absolute', 'slackware', 'slackware', { founded: 2005, status: 'discontinued', discontinuedAt: 2021, description: 'Slackware-based distribution with a light desktop, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/Absolute_Linux' }),
  d('slackel', 'slackware', 'slackware', { founded: 2010, country: 'Greece', description: 'Greek Slackware-based distribution with a KDE/Openbox desktop.', website: 'https://slackel.sourceforge.io', wikipedia: 'https://en.wikipedia.org/wiki/Slackel' }),
  d('vector-linux', 'slackware', 'slackware', { founded: 2003, status: 'discontinued', description: 'Slackware-based distribution aimed at ease of use, discontinued.', wikipedia: 'https://en.wikipedia.org/wiki/VectorLinux' }),

  // --- Gentoo family ---
  d('funtoo', 'gentoo', 'gentoo', { founded: 2008, releaseModel: 'rolling', description: 'Gentoo fork started by Gentoo founder Daniel Robbins, meta-structured.', website: 'https://www.funtoo.org', wikipedia: 'https://en.wikipedia.org/wiki/Funtoo_Linux' }),
  d('sabayon', 'gentoo', 'gentoo', { founded: 2005, status: 'discontinued', discontinuedAt: 2020, releaseModel: 'rolling', description: 'Binary Gentoo derivative, discontinued (reborn as Sabayon/Mocaccino).', website: 'https://sabayon.org', wikipedia: 'https://en.wikipedia.org/wiki/Sabayon_Linux' }),
  d('pentoo', 'gentoo', 'gentoo', { founded: 2006, releaseModel: 'rolling', description: 'Gentoo-based distribution focused on security and penetration testing.', website: 'https://www.pentoo.org', wikipedia: 'https://en.wikipedia.org/wiki/Pentoo' }),
  d('redcore', 'gentoo', 'gentoo', { founded: 2016, releaseModel: 'rolling', description: 'Gentoo-based binary distribution aimed at desktop ease of use.', website: 'https://redcorelinux.org', wikipedia: 'https://en.wikipedia.org/wiki/Redcore_Linux' }),

  // --- Puppy family flavors ---
  d('precise-puppy', 'puppy', 'puppy', { founded: 2012, status: 'discontinued', description: 'Puppy variant built on Ubuntu Precise packages, discontinued.' }),
  d('bionicpup', 'puppy', 'puppy', { founded: 2018, description: 'Puppy variant built on Ubuntu Bionic packages.', website: 'https://puppylinux.com' }),
  d('fossapup', 'puppy', 'puppy', { founded: 2020, description: 'Puppy variant built on the fossapup base with a modernized look.', website: 'https://puppylinux.com' }),

  // --- New families ---
  d('deepin', 'deepin', 'debian', { founded: 2009, country: 'China', releaseModel: 'rolling', description: 'Chinese distribution featuring its own Deepin Desktop Environment, Debian-based.', website: 'https://www.deepin.org', wikipedia: 'https://en.wikipedia.org/wiki/Deepin' }),
  d('pardus', 'pardus', 'debian', { founded: 2003, country: 'Turkey', description: 'Turkish national distribution, originally independent PISI-based, now Debian-based.', website: 'https://www.pardus.org.tr', wikipedia: 'https://en.wikipedia.org/wiki/Pardus_(operating_system)' }),
  d('whonix', 'whonix', 'debian', { founded: 2012, releaseModel: 'rolling', description: 'Privacy-focused distribution that routes all traffic through Tor; Debian-based, split into gateway + workstation.', website: 'https://www.whonix.org', wikipedia: 'https://en.wikipedia.org/wiki/Whonix' }),
  d('whonix-gateway', 'whonix', 'whonix', { founded: 2012, releaseModel: 'rolling', description: 'Whonix gateway component that runs the Tor process and acts as a router.' }),
  d('whonix-workstation', 'whonix', 'whonix', { founded: 2012, releaseModel: 'rolling', description: 'Whonix workstation component isolated behind the gateway over an internal network.' }),
  d('kaos', 'kaos', undefined, { founded: 2013, releaseModel: 'rolling', description: 'Independent rolling distribution built around KDE and Qt, not derived from another distro.', website: 'https://kaosx.us', wikipedia: 'https://en.wikipedia.org/wiki/KaOS_(operating_system)' }),
  d('clear-linux', 'clearlinux', undefined, { founded: 2014, country: 'United States', releaseModel: 'rolling', description: "Intel's performance-optimized rolling distribution for developers.", website: 'https://clearlinux.org', wikipedia: 'https://en.wikipedia.org/wiki/Clear_Linux_OS' }),
  d('aosc', 'aosc', undefined, { founded: 2011, country: 'China', releaseModel: 'rolling', description: 'AOSC OS from the Anthon Open Source Community, an independent rolling distribution.', website: 'https://aosc.io', wikipedia: 'https://en.wikipedia.org/wiki/AOSC_OS' }),
];

/** Helper to build a SourceDistro with sensible defaults. */
function d(id: string, family: string, parent: string | undefined, over: Partial<SourceDistro>): Add {
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
  const map: Record<string, string> = {
    ubuntu: 'apt/dpkg', debian: 'apt/dpkg', mint: 'apt/dpkg', fedora: 'dnf/rpm',
    opensuse: 'zypper/rpm', arch: 'pacman', slackware: 'slackpkg/tgz', gentoo: 'emerge',
    puppy: 'pet', deepin: 'apt/dpkg', pardus: 'apt/dpkg', whonix: 'apt/dpkg',
    kaos: 'pacman', clearlinux: 'swupd', aosc: 'dpkg/apt', devuan: 'apt/dpkg',
  };
  return map[family] ?? 'various';
}
function defaultRelease(family: string): ReleaseModel | undefined {
  if (family === 'arch' || family === 'kaos' || family === 'gentoo' || family === 'clearlinux' || family === 'aosc') return 'rolling';
  if (family === 'fedora' || family === 'opensuse' || family === 'ubuntu' || family === 'debian') return 'fixed';
  return undefined;
}

// ---------------------------------------------------------------------------
// Merge (idempotent)
// ---------------------------------------------------------------------------

let addedFamilies = 0;
for (const f of newFamilies) {
  if (!haveFamily.has(f.id)) { src.families.push(f); haveFamily.add(f.id); addedFamilies++; }
}

let addedDistros = 0;
for (const nd of newDistros) {
  if (haveDistro.has(nd.id)) continue;
  src.distros.push(nd);
  haveDistro.add(nd.id);
  addedDistros++;
}

writeFileSync(SRC, JSON.stringify(src, null, 2) + '\n');

const active = src.distros.filter((x) => x.status === 'active').length;
console.log(`+ ${addedFamilies} families, + ${addedDistros} distros`);
console.log(`  → ${src.distros.length} distros total (${active} active, ${src.distros.length - active} discontinued) across ${src.families.length} families`);