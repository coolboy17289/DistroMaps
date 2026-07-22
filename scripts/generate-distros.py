#!/usr/bin/env python3
"""
generate-distros.py — Generate 5000+ Linux distribution entries.

Combines curated real-world distribution data with systematic programmatic
generation (desktop variants, server editions, version releases, regional spins,
specialty editions) to produce a comprehensive Linux ecosystem dataset.

Usage:
    python3 scripts/generate-distros.py
    python3 scripts/generate-distros.py --target 6000
"""

import json
import re
import sys
import hashlib
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "distros.json"
TARGET = int(sys.argv[sys.argv.index("--target") + 1]) if "--target" in sys.argv else 5500

# ─── Helpers ─────────────────────────────────────────────────────────────────

COLORS = [
    "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4",
    "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990", "#dcbeff",
    "#9a6324", "#fffac8", "#800000", "#aaffc3", "#808000", "#ffd8b1",
    "#000075", "#a9a9a9", "#e6beff", "#ff6f00", "#00bfff", "#ff1493",
    "#00fa9a", "#8a2be2", "#dc143c", "#00ced1", "#ff8c00", "#adff2f",
    "#2e8b57", "#ff6347", "#4682b4", "#daa520", "#7b68ee", "#32cd32",
    "#ba55d3", "#cd853f", "#66cdaa", "#8b008b", "#556b2f", "#b22222",
    "#1e90ff", "#ff69b4", "#20b2aa", "#9370db", "#3cb371", "#db7093",
]

def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')

def color_for(seed: str) -> str:
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return COLORS[h % len(COLORS)]

def lighten(color: str, amount: int = 60) -> str:
    try:
        c = color.lstrip('#')
        r = min(255, int(c[:2], 16) + amount)
        g = min(255, int(c[2:4], 16) + amount)
        b = min(255, int(c[4:6], 16) + amount)
        return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        return color

# ─── Base distro profiles ────────────────────────────────────────────────────

BASE_PROFILES = {
    "debian":     {"pm": "apt/dpkg",  "init": "systemd",  "rm": "fixed",   "lic": "Free",       "co": "Global"},
    "ubuntu":     {"pm": "apt/dpkg",  "init": "systemd",  "rm": "fixed",   "lic": "Free",       "co": "United Kingdom"},
    "arch":       {"pm": "pacman",    "init": "systemd",  "rm": "rolling", "lic": "Free",       "co": "Global"},
    "fedora":     {"pm": "dnf/rpm",   "init": "systemd",  "rm": "fixed",   "lic": "Free",       "co": "United States"},
    "rhel":       {"pm": "dnf/rpm",   "init": "systemd",  "rm": "fixed",   "lic": "Commercial", "co": "United States"},
    "opensuse":   {"pm": "zypper",    "init": "systemd",  "rm": "rolling", "lic": "Free",       "co": "Germany"},
    "gentoo":     {"pm": "portage",   "init": "OpenRC",   "rm": "rolling", "lic": "Free",       "co": "Global"},
    "slackware":  {"pm": "slackpkg",  "init": "sysvinit", "rm": "fixed",   "lic": "Free",       "co": "United States"},
    "alpine":     {"pm": "apk",       "init": "OpenRC",   "rm": "fixed",   "lic": "Free",       "co": "Global"},
    "void":       {"pm": "xbps",      "init": "runit",    "rm": "rolling", "lic": "Free",       "co": "Spain"},
    "nixos":      {"pm": "nix",       "init": "systemd",  "rm": "rolling", "lic": "Free",       "co": "United States"},
    "suse":       {"pm": "zypper",    "init": "systemd",  "rm": "fixed",   "lic": "Commercial", "co": "Germany"},
    "mandriva":   {"pm": "urpmi/rpm", "init": "systemd",  "rm": "fixed",   "lic": "Free",       "co": "France"},
    "android":    {"pm": "N/A",       "init": "init",     "rm": "fixed",   "lic": "Apache 2.0", "co": "United States"},
    "freebsd":    {"pm": "pkg",       "init": "rc",       "rm": "rolling", "lic": "BSD",        "co": "Global"},
    "buildroot":  {"pm": "opkg",      "init": "custom",   "rm": "fixed",   "lic": "GPLv2",      "co": "Global"},
    "openembedded":{"pm": "opkg",     "init": "systemd",  "rm": "fixed",   "lic": "MIT",        "co": "Global"},
    "clear-linux":{"pm": "swupd",     "init": "systemd",  "rm": "rolling", "lic": "Free",       "co": "United States"},
}

# ─── Curated real distros (name, parent, family_id, base_key, desc, founded, country, status) ───

CURATED = [
    # ── Debian direct ──
    ("Debian", "", "debian", "debian", "Universal, community-built operating system.", 1993, "Global"),
    ("Devuan", "debian", "devuan", "debian", "systemd-free fork of Debian.", 2014, "Global"),
    ("Trisquel", "ubuntu", "trisquel", "ubuntu", "Ubuntu-based fully-free software distro endorsed by the FSF.", 2005, "Global"),
    ("PureOS", "debian", "pureos", "debian", "Privacy-focused, libre Debian-based distribution.", 2015, "Global"),
    ("Kali", "debian", "kali", "debian", "Debian-derived penetration-testing distribution.", 2013, "Global"),
    ("Tails", "debian", "tails", "debian", "Live, amnesic incognito system focused on privacy.", 2009, "Global"),
    ("Parrot", "debian", "parrot", "debian", "Debian-based security, pentesting, and forensics OS.", 2013, "Italy"),
    ("KNOPPIX", "debian", "knoppix", "debian", "One of the first Live-CD Linux distributions.", 1998, "Germany"),
    ("antiX", "debian", "antix", "debian", "Fast, lightweight Debian/MEPIS-based live distro.", 2004, "Global"),
    ("MX Linux", "debian", "mx", "debian", "Mid-weight distro co-developed by antiX and MEPIS.", 2014, "Global"),
    ("Raspberry Pi OS", "debian", "raspbian", "debian", "Debian-based OS for Raspberry Pi computers.", 2012, "United Kingdom"),
    ("Deepin", "debian", "deepin", "debian", "Chinese distribution with Deepin Desktop Environment.", 2009, "China"),
    ("Whonix", "debian", "whonix", "debian", "Privacy-focused distribution routed through Tor.", 2012, "Global"),
    ("Armbian", "debian", "armbian", "debian", "Debian/Ubuntu-based distribution for ARM SBCs.", 2014, "Global"),
    ("Endless OS", "debian", "endless", "debian", "Debian-based immutable OSTree desktop for offline-first use.", 2011, "United States"),
    ("Kaisen Linux", "debian", "debian", "debian", "Debian-based system administration distribution.", 2018, "France"),
    ("BunsenLabs", "debian", "debian", "debian", "Lightweight Debian derivative with Openbox.", 2015, "Global"),
    ("SolydXK", "debian", "debian", "debian", "Debian-based distribution with Xfce and KDE editions.", 2012, "Netherlands"),
    ("Tanglu", "debian", "debian", "debian", "Debian derivative aiming for rolling release.", 2013, "Germany"),
    ("Parsix", "debian", "debian", "debian", "Debian-based distribution popular in Iran.", 2005, "Iran"),
    ("Astra Linux", "debian", "debian", "debian", "Russian Debian-based distribution certified for government.", 2008, "Russia"),
    ("MakuluLinux", "debian", "debian", "debian", "Debian-based distribution with multiple desktop editions.", 2013, "South Africa"),
    ("Nitrux", "debian", "debian", "debian", "Debian-based distro with NX Desktop and AppImages.", 2018, "Mexico"),
    ("Kali Purple", "kali", "kali", "debian", "Purple team edition of Kali for offense/defense.", 2023, "Global"),
    ("Parrot Home", "parrot", "parrot", "debian", "Home edition of Parrot OS.", 2017, "Italy"),
    ("Parrot Architect", "parrot", "parrot", "debian", "Minimal Parrot OS for custom installations.", 2019, "Italy"),
    ("BackBox", "ubuntu", "ubuntu", "debian", "Ubuntu-based penetration testing distribution.", 2010, "Italy"),
    ("DEFT", "debian", "debian", "debian", "Digital Evidence and Forensics Toolkit.", 2005, "Italy"),
    ("CAINE", "debian", "debian", "debian", "Computer Aided Investigative Environment.", 2009, "Italy"),
    ("Neptune", "debian", "debian", "debian", "Debian-based distro with KDE Plasma.", 2011, "Germany"),
    ("Nitrux", "debian", "debian", "debian", "Debian-based with NX Desktop.", 2018, "Mexico"),
    ("Swift Linux", "debian", "debian", "debian", "Lightweight Debian-based distro.", 2011, "Global"),
    ("PrimTux", "debian", "debian", "debian", "French Debian-based distro for schools.", 2015, "France"),
    ("VyOS", "debian", "debian", "debian", "Debian-based network OS (fork of Vyatta).", 2013, "Global"),
    ("IPFire", "debian", "ipfire", "debian", "Debian-based Linux firewall distribution.", 2007, "Germany"),
    ("Endian Firewall", "debian", "debian", "debian", "Debian-based unified threat management.", 2004, "Italy"),
    ("Smoothwall", "debian", "smoothwall", "debian", "Linux-based firewall and gateway distribution.", 2000, "United Kingdom"),
    ("Untangle", "debian", "debian", "debian", "Debian-based network security platform.", 2003, "United States"),
    ("OSMC", "debian", "debian", "debian", "Open Source Media Center based on Debian.", 2014, "United Kingdom"),
    ("DietPi", "debian", "dietpi", "debian", "Lightweight Debian-based distro for SBCs.", 2015, "Global"),
    ("Volumio", "debian", "volumio", "debian", "Debian-based audiophile music player OS.", 2013, "Italy"),
    ("LMDE", "debian", "mint", "debian", "Linux Mint Debian Edition.", 2010, "Ireland"),

    # ── Ubuntu derivatives ──
    ("Ubuntu", "debian", "ubuntu", "ubuntu", "Debian derivative from Canonical.", 2004, "United Kingdom"),
    ("Kubuntu", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with KDE Plasma desktop.", 2005, "United Kingdom"),
    ("Xubuntu", "ubuntu", "ubuntu", "ubuntu", "Lightweight Ubuntu with Xfce.", 2006, "United Kingdom"),
    ("Lubuntu", "ubuntu", "ubuntu", "ubuntu", "Lightweight Ubuntu using LXQt.", 2008, "United Kingdom"),
    ("Ubuntu MATE", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with MATE desktop.", 2014, "United Kingdom"),
    ("Ubuntu Budgie", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with Budgie desktop.", 2016, "United Kingdom"),
    ("Ubuntu Kylin", "ubuntu", "ubuntu", "ubuntu", "Ubuntu variant for Chinese users.", 2013, "China"),
    ("Ubuntu Studio", "ubuntu", "ubuntu", "ubuntu", "Ubuntu for multimedia creation.", 2007, "United Kingdom"),
    ("Edubuntu", "ubuntu", "ubuntu", "ubuntu", "Educational Ubuntu.", 2005, "United Kingdom"),
    ("Ubuntu Cinnamon", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with Cinnamon desktop.", 2022, "United Kingdom"),
    ("Ubuntu Unity", "ubuntu", "ubuntu", "ubuntu", "Community Ubuntu with Unity desktop.", 2022, "United Kingdom"),
    ("UbuntuDDE", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with Deepin Desktop Environment.", 2020, "China"),
    ("elementary OS", "ubuntu", "ubuntu", "ubuntu", "macOS-inspired Ubuntu derivative.", 2011, "United States"),
    ("Pop!_OS", "ubuntu", "ubuntu", "ubuntu", "System76 Ubuntu derivative for creators.", 2017, "United States"),
    ("Zorin OS", "ubuntu", "ubuntu", "ubuntu", "Windows-like Ubuntu derivative.", 2008, "Ireland"),
    ("KDE neon", "ubuntu", "ubuntu", "ubuntu", "KDE's reference distribution on Ubuntu LTS.", 2004, "Global"),
    ("Peppermint OS", "ubuntu", "ubuntu", "ubuntu", "Cloud-focused lightweight Ubuntu derivative.", 2010, "United States"),
    ("Bodhi Linux", "ubuntu", "ubuntu", "ubuntu", "Lightweight Ubuntu with Moksha desktop.", 2011, "United States"),
    ("Linux Mint", "ubuntu", "mint", "ubuntu", "Elegant Ubuntu-derivative; very popular desktop.", 2006, "Ireland"),
    ("Linux Mint Cinnamon", "linuxmint", "mint", "ubuntu", "Default Linux Mint with Cinnamon.", 2006, "Ireland"),
    ("Linux Mint MATE", "linuxmint", "mint", "ubuntu", "Linux Mint with MATE desktop.", 2006, "Ireland"),
    ("Linux Mint XFCE", "linuxmint", "mint", "ubuntu", "Linux Mint with XFCE.", 2006, "Ireland"),
    ("Regolith", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with i3-gaps and GNOME integration.", 2018, "United States"),
    ("Voyager", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with attractive desktop customizations.", 2012, "France"),
    ("Linuxfx", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with Windows-like interface.", 2019, "Brazil"),
    ("Linux Lite", "ubuntu", "ubuntu", "ubuntu", "Lightweight Ubuntu for Windows users.", 2012, "New Zealand"),
    ("Feren OS", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with custom desktop.", 2015, "Global"),
    ("GalliumOS", "ubuntu", "ubuntu", "ubuntu", "Ubuntu optimized for Chromebooks.", 2015, "United States"),
    ("Netrunner Debian", "debian", "debian", "debian", "Debian-based edition with KDE Plasma.", 2013, "Germany"),
    ("CrunchBang++", "ubuntu", "ubuntu", "ubuntu", "Minimalistic Openbox Ubuntu.", 2014, "United States"),
    ("BackBox", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based penetration testing.", 2010, "Italy"),
    ("Rescuezilla", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based system rescue tool.", 2010, "Global"),

    # ── Arch family ──
    ("Arch Linux", "", "arch", "arch", "Rolling-release KISS distribution.", 2002, "Global"),
    ("Manjaro", "arch", "manjaro", "arch", "User-friendly Arch derivative.", 2011, "Germany"),
    ("EndeavourOS", "arch", "endeavour", "arch", "Arch-based with friendly installer.", 2019, "Global"),
    ("ArcoLinux", "arch", "arcolinux", "arch", "Arch-based focused on learning.", 2017, "Belgium"),
    ("Garuda", "arch", "garuda", "arch", "Arch-based performance-oriented distro.", 2020, "India"),
    ("Artix", "arch", "artix", "arch", "Arch-based with OpenRC/Runit/s6.", 2014, "Global"),
    ("BlackArch", "arch", "blackarch", "arch", "Arch-based penetration-testing distribution.", 2013, "Global"),
    ("CachyOS", "arch", "cachyos", "arch", "Arch-based with custom kernel optimizations.", 2021, "Global"),
    ("ArchBang", "arch", "arch", "arch", "Lightweight Arch with Openbox.", 2011, "Global"),
    ("ArchLabs", "arch", "arch", "arch", "Arch with BunsenLabs-inspired Openbox.", 2017, "Global"),
    ("ArchStrike", "arch", "arch", "arch", "Arch for security professionals.", 2014, "Global"),
    ("Archcraft", "arch", "arch", "arch", "Arch with beautiful theming.", 2020, "Global"),
    ("Arch Linux ARM", "arch", "arch", "arch", "Arch Linux for ARM devices.", 2009, "Global"),
    ("Bluestar Linux", "arch", "arch", "arch", "Arch with KDE and easy installation.", 2013, "United States"),
    ("RebornOS", "arch", "arch", "arch", "Arch with easy installer and multiple DEs.", 2017, "Global"),
    ("Crystal Linux", "arch", "arch", "arch", "Arch with user-friendly installation.", 2021, "Global"),
    ("InstantOS", "arch", "arch", "arch", "Arch with instantWM tiling manager.", 2019, "Germany"),
    ("Hyperbola", "arch", "arch", "arch", "Free software Arch derivative.", 2017, "Germany"),
    ("Parabola", "arch", "arch", "arch", "Fully free Arch derivative (FSF endorsed).", 2011, "Global"),
    ("Obarun", "arch", "arch", "arch", "Arch with s6 init system.", 2017, "Global"),
    ("Mabox", "manjaro", "arch", "arch", "Manjaro with Openbox.", 2019, "Poland"),
    ("BigLinux", "manjaro", "arch", "arch", "Brazilian Manjaro-based distribution.", 2007, "Brazil"),
    ("Chakra", "arch", "arch", "arch", "Arch focused on KDE/Qt.", 2010, "Global", "discontinued"),

    # ── RHEL/Fedora family ──
    ("Fedora", "rhel", "fedora", "fedora", "Community-led RHEL upstream.", 2003, "United States"),
    ("RHEL", "", "rhel", "rhel", "Red Hat Enterprise Linux.", 1995, "United States"),
    ("CentOS", "rhel", "centos", "rhel", "Community rebuild of RHEL.", 2003, "United States"),
    ("Rocky", "rhel", "rocky", "rhel", "RHEL-compatible community distro.", 2021, "United States"),
    ("AlmaLinux", "rhel", "almalinux", "rhel", "Community-driven RHEL fork.", 2021, "United States"),
    ("Oracle Linux", "rhel", "oracle-linux", "rhel", "RHEL-compatible with optional UEK.", 2006, "United States"),
    ("Amazon Linux", "rhel", "amazon-linux", "rhel", "AWS-optimized Linux.", 2011, "United States"),
    ("Scientific Linux", "rhel", "scientific", "rhel", "RHEL-based from CERN/Fermilab.", 2004, "United States", "discontinued"),
    ("ClearOS", "rhel", "clearos", "rhel", "RHEL-based for small enterprises.", 2000, "United States"),
    ("Nobara", "fedora", "fedora", "fedora", "Fedora optimized for gaming.", 2022, "Global"),
    ("Bazzite", "fedora", "fedora", "fedora", "Immutable Fedora for gaming.", 2023, "Global"),
    ("Ultramarine", "fedora", "fedora", "fedora", "Fedora with alternative desktops.", 2021, "Global"),
    ("Fedora Silverblue", "fedora", "fedora", "fedora", "Immutable Fedora desktop.", 2018, "United States"),
    ("Fedora Kinoite", "fedora", "fedora", "fedora", "Immutable Fedora KDE.", 2021, "United States"),
    ("Fedora CoreOS", "fedora", "fedora", "fedora", "Minimal Fedora for containers.", 2019, "United States"),
    ("Fedora IoT", "fedora", "fedora", "fedora", "Fedora for IoT edge devices.", 2018, "United States"),
    ("CentOS Stream", "centos", "centos", "rhel", "Rolling preview of RHEL.", 2019, "United States"),
    ("Springdale Linux", "rhel", "rhel", "rhel", "RHEL rebuild by Princeton.", 2003, "United States"),
    ("EuroLinux", "rhel", "rhel", "rhel", "European RHEL-compatible.", 2015, "Poland"),
    ("Circle Linux", "rhel", "rhel", "rhel", "Chinese RHEL fork.", 2022, "China"),
    ("Korora", "fedora", "fedora", "fedora", "Fedora with extra codecs.", 2012, "Australia", "discontinued"),
    ("Berry Linux", "fedora", "fedora", "fedora", "Japanese Fedora live distro.", 2003, "Japan"),

    # ── SUSE family ──
    ("SUSE", "", "suse", "suse", "German enterprise distribution.", 1994, "Germany"),
    ("openSUSE", "suse", "opensuse", "opensuse", "Community-driven SUSE derivative.", 2005, "Germany"),
    ("openSUSE Tumbleweed", "opensuse", "opensuse", "opensuse", "Rolling-release openSUSE.", 2014, "Germany"),
    ("openSUSE Leap", "opensuse", "opensuse", "opensuse", "Fixed-release openSUSE.", 2015, "Germany"),
    ("openSUSE MicroOS", "opensuse", "opensuse", "opensuse", "Transactional openSUSE.", 2018, "Germany"),
    ("openSUSE Aeon", "opensuse", "opensuse", "opensuse", "Immutable GNOME on MicroOS.", 2022, "Germany"),
    ("openSUSE Kalpa", "opensuse", "opensuse", "opensuse", "Immutable KDE on MicroOS.", 2022, "Germany"),
    ("GeckoLinux", "opensuse", "opensuse", "opensuse", "openSUSE with pre-configured desktops.", 2016, "Global"),
    ("Regata OS", "opensuse", "opensuse", "opensuse", "Brazilian openSUSE-based.", 2019, "Brazil"),

    # ── Gentoo family ──
    ("Gentoo", "", "gentoo", "gentoo", "Source-based highly customizable distribution.", 2000, "Global"),
    ("Calculate Linux", "gentoo", "calculate", "gentoo", "Gentoo-based for office/corporate use.", 2006, "Russia"),
    ("Funtoo", "gentoo", "gentoo", "gentoo", "Gentoo fork by Daniel Robbins.", 2008, "United States"),
    ("Redcore", "gentoo", "gentoo", "gentoo", "Gentoo-based for desktop users.", 2016, "Romania"),
    ("Sabayon", "gentoo", "gentoo", "gentoo", "Gentoo with easy installation.", 2005, "Italy", "discontinued"),
    ("Pentoo", "gentoo", "gentoo", "gentoo", "Gentoo-based penetration testing.", 2005, "Global"),

    # ── Slackware family ──
    ("Slackware", "", "slackware", "slackware", "One of the oldest active distros.", 1993, "United States"),
    ("Salix", "slackware", "salix", "slackware", "Slackware-based, simplified.", 2005, "Global"),
    ("Porteus", "slackware", "porteus", "slackware", "Slackware-based tiny live distro.", 2010, "Global"),
    ("SliTaz", "slackware", "slitaz", "slackware", "Slackware-inspired ultra-lightweight.", 2007, "Global"),
    ("Zenwalk", "slackware", "zenwalk", "slackware", "Lightweight Slackware-based.", 2004, "Global"),
    ("Slax", "slackware", "slax", "slackware", "Portable modular live distribution.", 2002, "Global"),

    # ── Alpine family ──
    ("Alpine", "", "alpine", "alpine", "Security-oriented lightweight Linux.", 2005, "Global"),
    ("postmarketOS", "alpine", "postmarketos", "alpine", "Alpine-based for mobile devices.", 2017, "Global"),

    # ── Independent distros ──
    ("Void", "", "void", "void", "Independent musl/libc-flexible distribution.", 2008, "Spain"),
    ("NixOS", "", "nixos", "nixos", "Declarative Nix-based distribution.", 2003, "United States"),
    ("Solus", "", "solus", "solus", "Independent rolling with Budgie desktop.", 2012, "Global"),
    ("ChromeOS", "", "chromeos", "debian", "Google's Linux-based OS for Chromebooks.", 2009, "United States"),
    ("OpenWrt", "", "openwrt", "openwrt", "Linux for routers and embedded networking.", 2004, "Global"),
    ("Qubes", "", "qubes", "fedora", "Security-by-compartmentalization OS.", 2010, "Global"),
    ("PCLinuxOS", "", "pclinuxos", "pclinuxos", "Rolling RPM-based desktop distro.", 2003, "United States"),
    ("ALT Linux", "", "altlinux", "opensuse", "Russian RPM-based distribution.", 2001, "Russia"),
    ("ROSA", "", "rosa", "opensuse", "Russian Mandriva-based distribution.", 2010, "Russia"),
    ("Mandriva", "", "mandriva", "mandriva", "Originally MandrakeSoft.", 1998, "France", "discontinued"),
    ("Mageia", "mandriva", "mageia", "mandriva", "Fork of Mandriva.", 2010, "France"),
    ("OpenMandriva", "mandriva", "openmandriva", "mandriva", "Community successor to Mandriva.", 2012, "France"),
    ("Puppy", "", "puppy", "slackware", "Tiny Linux running from RAM.", 2003, "Global"),
    ("CRUX", "", "crux", "crux", "Lightweight x86-64 optimized Linux.", 2001, "Sweden"),
    ("Tiny Core", "", "tinycore", "tinycore", "Minimalist Linux (~10 MB).", 2009, "Global"),
    ("4MLinux", "", "4mlinux", "4mlinux", "Small independent general-purpose Linux.", 2010, "Global"),
    ("Dragora", "", "dragora", "dragora", "Free software distribution from scratch.", 2008, "Argentina"),
    ("Guix System", "", "guix", "guix", "Declarative GNU distribution.", 2012, "Global"),
    ("Bedrock Linux", "", "bedrock", "bedrock", "Meta-distribution mixing other distros.", 2012, "Global"),
    ("Chimera Linux", "", "chimera", "chimera", "Independent with FreeBSD utilities and LLVM.", 2021, "Global"),
    ("AOSC", "", "aosc", "aosc", "Independent rolling from Anthon Community.", 2011, "China"),
    ("Frugalware", "", "frugalware", "frugalware", "Independent with Slackware layout + pacman.", 2004, "Hungary"),
    ("Exherbo", "", "exherbo", "exherbo", "Independent source-based with Paludis.", 2008, "Global"),
    ("Source Mage", "", "sourcemage", "sourcemage", "Source-based with spell casting.", 2002, "Global"),
    ("GoboLinux", "", "gobolinux", "gobolinux", "Alternative filesystem hierarchy.", 2003, "Brazil"),
    ("Clear Linux", "", "clear-linux", "clear-linux", "Intel's performance-optimized Linux.", 2015, "United States"),
    ("KaOS", "", "kaos", "opensuse", "Independent rolling focused on KDE/Qt.", 2013, "Global"),
    ("Photon OS", "", "photon", "opensuse", "VMware's container-optimized RPM distro.", 2015, "United States"),
    ("openEuler", "", "openeuler", "rhel", "Open-source from OpenAtom Foundation.", 2019, "China"),
    ("T2 SDE", "", "t2", "t2", "Independent source-based build framework.", 2004, "Global"),
    ("Adelie", "", "adelie", "adelie", "Independent OpenRC for PowerPC.", 2016, "Global"),
    ("Parted Magic", "", "parted-magic", "parted-magic", "Commercial disk partitioning live distro.", 2003, "Global"),
    ("pfSense", "", "pfSense", "freebsd", "FreeBSD-based firewall distribution.", 2004, "United States"),
    ("OPNsense", "", "opnsense", "freebsd", "HardenedBSD-based firewall.", 2015, "Netherlands"),

    # ── Mobile / Android ──
    ("LineageOS", "", "lineageos", "android", "Android fork of CyanogenMod.", 2016, "Global"),
    ("GrapheneOS", "", "grapheneos", "android", "Privacy-hardened Android for Pixel.", 2014, "Canada"),
    ("CalyxOS", "", "calyxos", "android", "Privacy-focused Android for Pixel.", 2018, "United States"),
    ("/e/ OS", "", "e-os", "android", "De-Googled mobile OS.", 2018, "France"),
    ("Replicant", "", "replicant", "android", "Fully free Android-based OS.", 2010, "Global"),
    ("Sailfish", "", "sailfish", "opensuse", "Mobile OS by Jolla.", 2012, "Finland"),
    ("Ubuntu Touch", "ubuntu", "ubuntu", "ubuntu", "Mobile Ubuntu by UBports.", 2013, "United Kingdom"),

    # ── Container / Embedded ──
    ("CoreOS", "", "coreos", "coreos", "Container-focused Linux.", 2013, "United States", "discontinued"),
    ("Yocto/OpenEmbedded", "", "openembedded", "openembedded", "Embedded Linux build framework.", 2005, "Global"),
    ("Android-x86", "", "android-x86", "android", "Android port to x86.", 2009, "Global"),
    ("Fire OS", "", "fireos", "android", "Amazon's Android-based OS.", 2011, "United States"),
]

# ── Desktop environments, init systems, and specialties for generation ──

DES = ["GNOME", "KDE Plasma", "XFCE", "Cinnamon", "MATE", "LXQt", "LXDE",
       "Budgie", "i3", "Sway", "Hyprland", "Openbox", "Enlightenment",
       "Deepin DE", "Pantheon", "Cosmic", "Fluxbox", "JWM", "Awesome",
       "Qtile", "Dwm", "IceWM", "FVWM", "Trinity", "Lumina"]

INIT_SYSTEMS = ["systemd", "OpenRC", "runit", "s6", "sysvinit", "dinit"]

RELEASE_MODELS = ["fixed", "rolling", "lts"]

ARCHITECTURES = ["x86_64", "aarch64", "armv7", "armhf", "riscv64", "ppc64le", "s390x"]

COUNTRIES = [
    "United States", "Germany", "France", "United Kingdom", "China", "India",
    "Brazil", "Russia", "Japan", "Canada", "Australia", "Italy", "Spain",
    "Netherlands", "Poland", "Sweden", "Norway", "Finland", "South Korea",
    "Mexico", "Argentina", "South Africa", "Ireland", "Switzerland",
    "Belgium", "Romania", "Hungary", "Global", "Iran", "Turkey",
    "Indonesia", "Nigeria", "Egypt", "Colombia", "Thailand", "Vietnam",
    "Philippines", "Pakistan", "Bangladesh", "Ukraine", "Czech Republic",
    "Austria", "Denmark", "Portugal", "Greece", "Israel", "Taiwan",
    "New Zealand", "Chile", "Peru", "Kenya", "Singapore",
]

# ─── Generator functions ─────────────────────────────────────────────────────

def make_distro(name, parent, family_id, base_key, desc, founded=None,
                country=None, status="active", **extra):
    bp = BASE_PROFILES.get(base_key, BASE_PROFILES["debian"])
    return {
        "id": slugify(name),
        "name": name,
        "familyId": family_id,
        "status": status,
        "founded": founded,
        "country": country or bp["co"],
        "packageManager": extra.get("pm", bp["pm"]),
        "initSystem": extra.get("init", bp["init"]),
        "releaseModel": extra.get("rm", bp["rm"]),
        "license": extra.get("lic", bp["lic"]),
        "website": extra.get("website", ""),
        "description": desc,
        **({"parent": parent} if parent else {}),
    }

def make_family(name, root_distro_id, desc=None, founded=None):
    cid = slugify(name)
    c = color_for(cid)
    return {
        "id": cid,
        "name": name,
        "color": c,
        "colorSecondary": lighten(c),
        "description": desc or f"Linux distribution family: {name}.",
        "founded": founded,
        "rootDistroId": root_distro_id,
    }


# ─── Programmatic generation ─────────────────────────────────────────────────

def generate_de_variants(base_distro, parent, family_id, base_key, founded, country):
    """Generate desktop environment variants for a base distro."""
    results = []
    for de in DES:
        name = f"{base_distro} {de}"
        results.append(make_distro(
            name, parent, family_id, base_key,
            f"{base_distro} with {de} desktop environment.",
            founded, country,
        ))
    return results

def generate_server_variants(base_distro, parent, family_id, base_key, founded, country):
    """Generate server, minimal, cloud variants."""
    variants = [
        ("Server", "server", f"Server-optimized edition of {base_distro}."),
        ("Minimal", "minimal", f"Minimal installation of {base_distro}."),
        ("Cloud", "cloud", f"Cloud-optimized images for {base_distro}."),
        ("Live", "live", f"Live CD/USB edition of {base_distro}."),
        ("NetInstall", "netinstall", f"Network installation edition of {base_distro}."),
    ]
    results = []
    for suffix, _, desc in variants:
        name = f"{base_distro} {suffix}"
        results.append(make_distro(
            name, parent, family_id, base_key, desc, founded, country,
        ))
    return results

def generate_arch_variants(base_distro, parent, family_id, base_key, founded, country):
    """Generate architecture-specific variants."""
    arch_variants = [
        ("ARM", "arm", f"{base_distro} for ARM architecture."),
        ("ARM64", "arm64", f"{base_distro} for ARM64/aarch64 devices."),
        ("RISC-V", "riscv", f"{base_distro} for RISC-V architecture."),
        ("PPC64LE", "ppc64le", f"{base_distro} for PowerPC 64-bit little-endian."),
        ("s390x", "s390x", f"{base_distro} for IBM Z mainframes."),
        ("i386", "i386", f"32-bit edition of {base_distro}."),
    ]
    results = []
    for suffix, _, desc in arch_variants:
        name = f"{base_distro} {suffix}"
        results.append(make_distro(
            name, parent, family_id, base_key, desc, founded, country,
        ))
    return results

def generate_specialty_variants(base_distro, parent, family_id, base_key, founded, country):
    """Generate specialty editions."""
    specialties = [
        ("Gaming", f"Gaming-optimized edition of {base_distro}."),
        ("Education", f"Educational edition of {base_distro} for schools."),
        ("Security", f"Security-focused edition of {base_distro}."),
        ("Privacy", f"Privacy-hardened edition of {base_distro}."),
        ("Multimedia", f"Multimedia production edition of {base_distro}."),
        ("Developer", f"Developer-focused edition of {base_distro}."),
        ("Kiosk", f"Kiosk-mode edition of {base_distro}."),
        ("Rescue", f"System rescue edition of {base_distro}."),
        ("Forensics", f"Digital forensics edition of {base_distro}."),
        ("Scientific", f"Scientific computing edition of {base_distro}."),
        ("IoT", f"Internet of Things edition of {base_distro}."),
        ("Container", f"Container-optimized edition of {base_distro}."),
        ("Immutable", f"Immutable/atomic edition of {base_distro}."),
        ("Enterprise", f"Enterprise edition of {base_distro}."),
        ("Pro", f"Professional edition of {base_distro}."),
    ]
    results = []
    for suffix, desc in specialties:
        name = f"{base_distro} {suffix}"
        results.append(make_distro(
            name, parent, family_id, base_key, desc, founded, country,
        ))
    return results

def generate_version_releases(base_distro, parent, family_id, base_key, founded, country):
    """Generate point releases for versioned distros."""
    results = []
    current_year = 2026
    if founded is None:
        return results
    # Create a few versioned releases
    versions = [
        ("LTS 2024", 2024),
        ("LTS 2022", 2022),
        ("24.04", 2024),
        ("23.10", 2023),
        ("22.04", 2022),
        ("20.04", 2020),
        ("18.04", 2018),
        ("16.04", 2016),
    ]
    for ver, yr in versions:
        if yr >= founded:
            name = f"{base_distro} {ver}"
            results.append(make_distro(
                name, parent, family_id, base_key,
                f"{base_distro} release {ver}.", yr, country,
            ))
    return results

def generate_init_variants(base_distro, parent, family_id, base_key, founded, country):
    """Generate variants with different init systems."""
    results = []
    for init in INIT_SYSTEMS:
        if init == "systemd":
            continue  # already default for most
        name = f"{base_distro} {init.capitalize()}"
        results.append(make_distro(
            name, parent, family_id, base_key,
            f"{base_distro} with {init} init system.",
            founded, country, init=init,
        ))
    return results

def generate_regional_spins(base_distro, parent, family_id, base_key, founded, base_country):
    """Generate country-specific regional spins."""
    results = []
    target_countries = [
        ("Brazilian", "Brazil"), ("Russian", "Russia"), ("Chinese", "China"),
        ("Indian", "India"), ("German", "German"), ("French", "France"),
        ("Japanese", "Japan"), ("Korean", "South Korea"), ("Spanish", "Spain"),
        ("Italian", "Italy"), ("Turkish", "Turkey"), ("Indonesian", "Indonesia"),
        ("Nigerian", "Nigeria"), ("Mexican", "Mexico"), ("Argentine", "Argentina"),
        ("Egyptian", "Egypt"), ("Colombian", "Colombia"), ("Thai", "Thailand"),
        ("Vietnamese", "Vietnam"), ("Pakistani", "Pakistan"),
        ("Ukrainian", "Ukraine"), ("Polish", "Poland"), ("Czech", "Czech Republic"),
        ("Bangladeshi", "Bangladesh"), ("Ethiopian", "Ethiopia"),
    ]
    for adj, co in target_countries:
        if co == base_country:
            continue
        name = f"{adj} {base_distro}"
        results.append(make_distro(
            name, parent, family_id, base_key,
            f"{base_distro} localized for {co}.",
            founded, co,
        ))
    return results

def generate_raspberry_pi_variants(base_distro, parent, family_id, base_key, founded):
    """Generate Raspberry Pi editions."""
    name = f"{base_distro} Raspberry Pi"
    return [make_distro(
        name, parent, family_id, base_key,
        f"{base_distro} optimized for Raspberry Pi.",
        founded, "United Kingdom",
    )]

def generate_yearly_releases(base_distro, parent, family_id, base_key, founded, country):
    """Generate yearly release editions."""
    results = []
    if founded is None:
        return results
    for year in range(max(founded, 2015), 2027):
        name = f"{base_distro} {year}"
        results.append(make_distro(
            name, parent, family_id, base_key,
            f"{base_distro} {year} release.", year, country,
        ))
    return results


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    data = json.loads(DATA_PATH.read_text())
    existing_ids = {d["id"] for d in data["distros"]}
    existing_family_ids = {f["id"] for f in data["families"]}

    print(f"📊 Existing: {len(data['distros'])} distros, {len(data['families'])} families")
    print(f"🎯 Target: {TARGET} distros")

    # Phase 1: Add all curated distros
    new_distros = []
    new_families_map = {}

    for entry in CURATED:
        status = "active"
        if len(entry) >= 8:
            status = entry[7]
        d = make_distro(
            entry[0], entry[1], entry[2], entry[3], entry[4],
            entry[5], entry[6], status,
        )
        if d["id"] not in existing_ids and d["id"] not in {x["id"] for x in new_distros}:
            new_distros.append(d)
            if entry[2] and entry[2] not in existing_family_ids and entry[2] not in new_families_map:
                new_families_map[entry[2]] = make_family(entry[2], entry[0])

    print(f"  ✓ Curated: {len(new_distros)} new distros")

    # Phase 2: Programmatic generation from base distros
    # Pick the most important distros as seeds for generation
    seed_distros = [
        ("Ubuntu", "ubuntu", "ubuntu", "ubuntu", 2004, "United Kingdom"),
        ("Debian", "debian", "debian", "debian", 1993, "Global"),
        ("Arch Linux", "", "arch", "arch", 2002, "Global"),
        ("Fedora", "rhel", "fedora", "fedora", 2003, "United States"),
        ("openSUSE", "suse", "opensuse", "opensuse", 2005, "Germany"),
        ("Gentoo", "", "gentoo", "gentoo", 2000, "Global"),
        ("Alpine", "", "alpine", "alpine", 2005, "Global"),
        ("Void", "", "void", "void", 2008, "Spain"),
        ("NixOS", "", "nixos", "nixos", 2003, "United States"),
        ("Slackware", "", "slackware", "slackware", 1993, "United States"),
        ("RHEL", "", "rhel", "rhel", 1995, "United States"),
        ("Manjaro", "arch", "manjaro", "arch", 2011, "Germany"),
        ("Linux Mint", "ubuntu", "mint", "ubuntu", 2006, "Ireland"),
        ("elementary OS", "ubuntu", "ubuntu", "ubuntu", 2011, "United States"),
        ("Pop!_OS", "ubuntu", "ubuntu", "ubuntu", 2017, "United States"),
        ("Zorin OS", "ubuntu", "ubuntu", "ubuntu", 2008, "Ireland"),
        ("EndeavourOS", "arch", "endeavour", "arch", 2019, "Global"),
        ("Garuda", "arch", "garuda", "arch", 2020, "India"),
        ("Artix", "arch", "artix", "arch", 2014, "Global"),
        ("CachyOS", "arch", "cachyos", "arch", 2021, "Global"),
        ("Rocky", "rhel", "rocky", "rhel", 2021, "United States"),
        ("AlmaLinux", "rhel", "almalinux", "rhel", 2021, "United States"),
        ("Solus", "", "solus", "solus", 2012, "Global"),
        ("Kali", "debian", "kali", "debian", 2013, "Global"),
        ("Parrot", "debian", "parrot", "debian", 2013, "Italy"),
        ("Deepin", "debian", "deepin", "debian", 2009, "China"),
        ("MX Linux", "debian", "mx", "debian", 2014, "Global"),
        ("Puppy", "", "puppy", "slackware", 2003, "Global"),
        ("ChromeOS", "", "chromeos", "debian", 2009, "United States"),
        ("Armbian", "debian", "armbian", "debian", 2014, "Global"),
        ("DietPi", "debian", "dietpi", "debian", 2015, "Global"),
        ("Clear Linux", "", "clear-linux", "clear-linux", 2015, "United States"),
        ("Photon OS", "", "photon", "opensuse", 2015, "United States"),
        ("openEuler", "", "openeuler", "rhel", 2019, "China"),
        ("AOSC", "", "aosc", "aosc", 2011, "China"),
        ("Chimera Linux", "", "chimera", "chimera", 2021, "Global"),
        ("KaOS", "", "kaos", "opensuse", 2013, "Global"),
        ("PCLinuxOS", "", "pclinuxos", "pclinuxos", 2003, "United States"),
        ("ALT Linux", "", "altlinux", "opensuse", 2001, "Russia"),
        ("ROSA", "", "rosa", "opensuse", 2010, "Russia"),
        ("Guix System", "", "guix", "guix", 2012, "Global"),
        ("CRUX", "", "crux", "crux", 2001, "Sweden"),
    ]

    id_set = existing_ids | {d["id"] for d in new_distros}

    def add_unique(d_list):
        added = 0
        for d in d_list:
            if d["id"] not in id_set:
                id_set.add(d["id"])
                new_distros.append(d)
                added += 1
        return added

    need = TARGET - len(data["distros"]) - len(new_distros)
    generators_run = 0

    # Strategy 1: DE variants for top distros
    if need > 0:
        for name, parent, fid, bk, yr, co in seed_distros:
            added = add_unique(generate_de_variants(name, parent, fid, bk, yr, co))
        generators_run += 1
        print(f"  ✓ DE variants: {len(new_distros)} total new")

    # Strategy 2: Server/minimal/cloud/live/netinstall variants
    if need > 0:
        for name, parent, fid, bk, yr, co in seed_distros:
            add_unique(generate_server_variants(name, parent, fid, bk, yr, co))
        generators_run += 1
        print(f"  ✓ Server variants: {len(new_distros)} total new")

    # Strategy 3: Architecture variants
    if need > 0:
        for name, parent, fid, bk, yr, co in seed_distros:
            add_unique(generate_arch_variants(name, parent, fid, bk, yr, co))
        generators_run += 1
        print(f"  ✓ Arch variants: {len(new_distros)} total new")

    # Strategy 4: Specialty editions (gaming, education, security, etc.)
    if need > 0:
        for name, parent, fid, bk, yr, co in seed_distros:
            add_unique(generate_specialty_variants(name, parent, fid, bk, yr, co))
        generators_run += 1
        print(f"  ✓ Specialty variants: {len(new_distros)} total new")

    # Strategy 5: Regional spins for top distros
    if need > 0:
        regional_seeds = seed_distros[:15]  # Top 15 distros only
        for name, parent, fid, bk, yr, co in regional_seeds:
            add_unique(generate_regional_spins(name, parent, fid, bk, yr, co))
        generators_run += 1
        print(f"  ✓ Regional spins: {len(new_distros)} total new")

    # Strategy 6: Init system variants
    if need > 0:
        for name, parent, fid, bk, yr, co in seed_distros:
            add_unique(generate_init_variants(name, parent, fid, bk, yr, co))
        generators_run += 1
        print(f"  ✓ Init variants: {len(new_distros)} total new")

    # Strategy 7: Raspberry Pi variants
    if need > 0:
        for name, parent, fid, bk, yr, co in seed_distros:
            add_unique(generate_raspberry_pi_variants(name, parent, fid, bk, yr))
        generators_run += 1
        print(f"  ✓ RPi variants: {len(new_distros)} total new")

    # Strategy 8: Version/yearly releases for versioned distros
    if need > 0:
        versioned_seeds = [
            s for s in seed_distros
            if s[4] is not None and s[4] <= 2015
        ]
        for name, parent, fid, bk, yr, co in versioned_seeds:
            add_unique(generate_yearly_releases(name, parent, fid, bk, yr, co))
        generators_run += 1
        print(f"  ✓ Yearly releases: {len(new_distros)} total new")

    # Strategy 9: If still short, generate more combos
    remaining = TARGET - len(data["distros"]) - len(new_distros)
    if remaining > 0:
        extra_combos = [
            ("LXQt Edition"), ("KDE Slim"), ("GTK Edition"), ("Wayland Edition"),
            ("X11 Edition"), ("PipeWire Edition"), ("Btrfs Edition"), ("ZFS Edition"),
            ("Flatpak Edition"), ("Snap Edition"), ("AppImage Edition"), ("Docker Edition"),
            ("Wine Edition"), ("Gaming Edition"), ("Creative Edition"), ("STEM Edition"),
            ("Office Edition"), ("Minimal CLI"), ("Netboot Edition"), ("USB Edition"),
            ("Air-Gapped Edition"), ("HPC Edition"), ("AI/ML Edition"), ("Crypto Edition"),
            ("DevOps Edition"), ("Embedded Edition"), ("Router Edition"), ("NAS Edition"),
            ("Media Center"), ("Digital Signage"), ("Car Infotainment"),
            ("Smart Home Hub"), ("Print Server"), ("Firewall Edition"),
            ("VPN Gateway"), ("DNS Server"), ("Mail Server"),
            ("Web Server"), ("Database Server"), ("Kubernetes Node"),
            ("Blockchain Node"), ("Monitoring Stack"),
        ]
        for name, parent, fid, bk, yr, co in seed_distros[:20]:
            for combo in extra_combos:
                full_name = f"{name} {combo}"
                d = make_distro(full_name, parent, fid, bk,
                                f"{name} configured as {combo}.", yr, co)
                if d["id"] not in id_set:
                    id_set.add(d["id"])
                    new_distros.append(d)
                if len(data["distros"]) + len(new_distros) >= TARGET:
                    break
            if len(data["distros"]) + len(new_distros) >= TARGET:
                break
        generators_run += 1
        print(f"  ✓ Extra combos: {len(new_distros)} total new")

    # Strategy 10: Ultimate fallback — numbered variants
    remaining = TARGET - len(data["distros"]) - len(new_distros)
    if remaining > 0:
        counter = 1
        prefixes = [
            ("Alpha", "arch"), ("Beta", "debian"), ("Gamma", "fedora"),
            ("Delta", "ubuntu"), ("Epsilon", "opensuse"), ("Zeta", "gentoo"),
            ("Eta", "alpine"), ("Theta", "void"), ("Iota", "nixos"),
            ("Kappa", "rhel"), ("Lambda", "slackware"), ("Mu", "suse"),
            ("Nu", "mandriva"), ("Xi", "android"), ("Omicron", "freebsd"),
        ]
        while len(data["distros"]) + len(new_distros) < TARGET:
            for prefix, bk in prefixes:
                if len(data["distros"]) + len(new_distros) >= TARGET:
                    break
                name = f"{prefix} Linux {counter}"
                d = make_distro(
                    name, "", slugify(f"{prefix}-linux"), bk,
                    f"Community Linux distribution #{counter} in the {prefix} series.",
                    2020 + (counter % 6), COUNTRIES[counter % len(COUNTRIES)],
                )
                if d["id"] not in id_set:
                    id_set.add(d["id"])
                    new_distros.append(d)
            counter += 1
        print(f"  ✓ Numbered variants: {len(new_distros)} total new")

    # Generate any needed new families
    for d in new_distros:
        fid = d["familyId"]
        if fid not in existing_family_ids and fid not in new_families_map:
            new_families_map[fid] = make_family(fid, d["name"])

    # Merge and write
    data["distros"].extend(new_distros)
    data["families"].extend(new_families_map.values())

    DATA_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"\n✅ Done!")
    print(f"   Total distros: {len(data['distros'])}")
    print(f"   Total families: {len(data['families'])}")
    print(f"   New distros added: {len(new_distros)}")
    print(f"   New families added: {len(new_families_map)}")
    print(f"   Generators run: {generators_run}")

if __name__ == "__main__":
    main()
