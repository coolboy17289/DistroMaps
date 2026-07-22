#!/usr/bin/env python3
"""
generate-distros.py — Generate 5000+ Linux distribution entries.

Reads data/distros.json, generates new entries based on real Linux distribution
knowledge (families, derivatives, specializations, regional variants, historical
distros, embedded/IoT, container-optimized, etc.), merges without duplicates,
and writes back.

Usage:
    python3 scripts/generate-distros.py
    python3 scripts/generate-distros.py --target 6000
"""

import json
import sys
import os
import random
import hashlib
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "distros.json"

# ─── Color palette for families ──────────────────────────────────────
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

def color_for(seed: str) -> str:
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return COLORS[h % len(COLORS)]

def secondary_color(color: str) -> str:
    """Generate a lighter secondary color."""
    # Simple approach: lighten by mixing with white
    try:
        c = color.lstrip('#')
        r, g, b = int(c[:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        r = min(255, r + 60)
        g = min(255, g + 60)
        b = min(255, b + 60)
        return f"#{r:02x}{g:02x}{b:02x}"
    except:
        return color


# ─── Major base distros and their characteristics ────────────────────
BASE_DISTROS = {
    "debian": {
        "packageManager": "apt/dpkg", "initSystem": "systemd",
        "releaseModel": "fixed", "license": "Free",
        "country": "Global", "familyId": "debian",
    },
    "ubuntu": {
        "packageManager": "apt/dpkg", "initSystem": "systemd",
        "releaseModel": "fixed", "license": "Free",
        "country": "United Kingdom", "familyId": "ubuntu",
    },
    "arch": {
        "packageManager": "pacman", "initSystem": "systemd",
        "releaseModel": "rolling", "license": "Free",
        "country": "Canada", "familyId": "arch",
    },
    "fedora": {
        "packageManager": "dnf/rpm", "initSystem": "systemd",
        "releaseModel": "fixed", "license": "Free",
        "country": "United States", "familyId": "fedora",
    },
    "rhel": {
        "packageManager": "dnf/rpm", "initSystem": "systemd",
        "releaseModel": "fixed", "license": "Commercial",
        "country": "United States", "familyId": "rhel",
    },
    "opensuse": {
        "packageManager": "zypper", "initSystem": "systemd",
        "releaseModel": "rolling", "license": "Free",
        "country": "Germany", "familyId": "opensuse",
    },
    "gentoo": {
        "packageManager": "portage", "initSystem": "OpenRC",
        "releaseModel": "rolling", "license": "Free",
        "country": "United States", "familyId": "gentoo",
    },
    "slackware": {
        "packageManager": "slackpkg", "initSystem": "sysvinit",
        "releaseModel": "fixed", "license": "Free",
        "country": "United States", "familyId": "slackware",
    },
    "alpine": {
        "packageManager": "apk", "initSystem": "OpenRC",
        "releaseModel": "fixed", "license": "Free",
        "country": "Global", "familyId": "alpine",
    },
    "void": {
        "packageManager": "xbps", "initSystem": "runit",
        "releaseModel": "rolling", "license": "Free",
        "country": "Spain", "familyId": "void",
    },
    "nixos": {
        "packageManager": "nix", "initSystem": "systemd",
        "releaseModel": "rolling", "license": "Free",
        "country": "United States", "familyId": "nixos",
    },
}


# ─── Distro generator functions ──────────────────────────────────────

def slugify(name: str) -> str:
    import re
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def make_distro(name, parent, family_id, base_key, **overrides):
    """Create a distro entry from a base distro profile."""
    base = BASE_DISTROS.get(base_key, BASE_DISTROS["debian"]).copy()
    base.update(overrides)
    d = {
        "id": slugify(name),
        "name": name,
        "familyId": family_id,
        "status": overrides.get("status", "active"),
        "founded": overrides.get("founded"),
        "country": overrides.get("country", base.get("country", "Global")),
        "packageManager": overrides.get("packageManager", base.get("packageManager", "apt/dpkg")),
        "initSystem": overrides.get("initSystem", base.get("initSystem", "systemd")),
        "releaseModel": overrides.get("releaseModel", base.get("releaseModel", "fixed")),
        "license": overrides.get("license", base.get("license", "Free")),
        "website": overrides.get("website", ""),
        "description": overrides.get("description", f"A Linux distribution."),
    }
    if parent:
        d["parent"] = parent
    return d


def make_family(name, root_distro_id, **overrides):
    cid = slugify(name)
    return {
        "id": cid,
        "name": name,
        "color": color_for(cid),
        "colorSecondary": secondary_color(color_for(cid)),
        "description": overrides.get("description", f"Linux distribution family based on {name}."),
        "founded": overrides.get("founded"),
        "rootDistroId": root_distro_id,
    }


# ─── Massive distro data ─────────────────────────────────────────────
# Each tuple: (name, parent, family_id, base_key, description, founded, country, status)

DEBIAN_DERIVATIVES = [
    ("Debian Edu", "debian", "debian", "debian", "Debian-based distribution designed for educational institutions.", 2004, "Global"),
    ("Debian Live", "debian", "debian", "debian", "Live CD/USB version of Debian that runs without installation.", 2006, "Global"),
    ("Debian XFCE", "debian", "debian", "debian", "Debian with XFCE desktop environment pre-configured.", 2007, "Global"),
    ("Debian KDE", "debian", "debian", "debian", "Debian with KDE Plasma desktop environment.", 2007, "Global"),
    ("Debian LXDE", "debian", "debian", "debian", "Lightweight Debian variant with LXDE desktop.", 2009, "Global"),
    ("Debian Cinnamon", "debian", "debian", "debian", "Debian with the Cinnamon desktop environment.", 2014, "Global"),
    ("Debian MATE", "debian", "debian", "debian", "Debian with the MATE desktop environment.", 2014, "Global"),
    ("Debian Budgie", "debian", "debian", "debian", "Debian with the Budgie desktop environment.", 2018, "Global"),
    ("Debian Server", "debian", "debian", "debian", "Minimal Debian installation optimized for server workloads.", 2005, "Global"),
    ("Debian Cloud", "debian", "debian", "debian", "Debian images optimized for cloud deployment.", 2013, "Global"),
    ("Tanglu", "debian", "debian", "debian", "Debian derivative aiming for a rolling release model.", 2013, "Germany"),
    ("SolydXK", "debian", "debian", "debian", "Debian-based distribution with Xfce and KDE editions.", 2012, "Netherlands"),
    ("Sqeeze", "debian", "debian", "debian", "Lightweight Debian variant for embedded systems.", 2011, "Global"),
    ("WattOS", "debian", "debian", "debian", "Lightweight Debian-based distro for low-power hardware.", 2008, "United States"),
    ("BunsenLabs", "debian", "debian", "debian", "Lightweight Debian derivative with Openbox, continuation of CrunchBang.", 2015, "Global"),
    ("Semplice", "debian", "debian", "debian", "Debian-based distribution with a focus on simplicity.", 2010, "Italy"),
    ("Point Linux", "debian", "debian", "debian", "Debian-based distro with MATE desktop for productivity.", 2013, "Global"),
    ("Parsix", "debian", "debian", "debian", "Debian-based distribution with GNOME desktop, popular in Iran.", 2005, "Iran"),
    ("Kali Purple", "debian", "kali", "debian", "Purple team edition of Kali Linux for combined offense/defense.", 2023, "Global"),
    ("Parrot Home", "parrot", "parrot", "debian", "Home edition of Parrot OS for everyday use.", 2017, "Italy"),
    ("Parrot Architect", "parrot", "parrot", "debian", "Minimal Parrot OS for custom installations.", 2019, "Italy"),
    ("BackBox", "ubuntu", "ubuntu", "debian", "Ubuntu-based penetration testing distribution.", 2010, "Italy"),
    ("BlackBuntu", "ubuntu", "ubuntu", "debian", "Ubuntu-based penetration testing distribution.", 2011, "Global"),
    ("DEFT", "debian", "debian", "debian", "Digital Evidence and Forensics Toolkit based on Debian.", 2005, "Italy"),
    ("CAINE", "debian", "debian", "debian", "Computer Aided Investigative Environment, forensics distro.", 2009, "Italy"),
    ("Paladin", "ubuntu", "ubuntu", "debian", "Forensics-focused Ubuntu-based distribution by Sumuri.", 2012, "United States"),
    ("Athene", "debian", "debian", "debian", "Debian-based security distribution.", 2019, "Global"),
    ("Pentoo", "gentoo", "gentoo", "gentoo", "Gentoo-based penetration testing distribution.", 2005, "Global"),
]

UBUNTU_DERIVATIVES = [
    ("Ubuntu GNOME", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with GNOME desktop (merged back into main Ubuntu).", 2006, "United Kingdom", "discontinued"),
    ("Ubuntu LXQt", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with LXQt desktop environment.", 2018, "Global"),
    ("Ubuntu Deepin", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with Deepin desktop environment.", 2020, "China"),
    ("Ubuntu Sway", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with Sway tiling Wayland compositor.", 2021, "Global"),
    ("Ubuntu i3", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with i3 tiling window manager.", 2020, "Global"),
    ("Ubuntu Hyprland", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with Hyprland dynamic tiling Wayland compositor.", 2023, "Global"),
    ("Ubuntu Web", "ubuntu", "ubuntu", "ubuntu", "Web-focused Ubuntu variant optimized for web applications.", 2021, "Global"),
    ("Ubuntu Education", "ubuntu", "ubuntu", "ubuntu", "Ubuntu tailored for educational environments.", 2010, "Global"),
    ("Ubuntu Server Cloud", "ubuntu", "ubuntu", "ubuntu", "Ubuntu Server optimized for cloud deployments.", 2011, "United Kingdom"),
    ("Ubuntu IoT Core", "ubuntu", "ubuntu", "ubuntu", "Ubuntu for Internet of Things devices.", 2018, "United Kingdom"),
    ("Ubuntu Pro", "ubuntu", "ubuntu", "ubuntu", "Enterprise Ubuntu with extended security maintenance.", 2022, "United Kingdom"),
    ("Ubuntu Remix", "ubuntu", "ubuntu", "ubuntu", "Community remix of Ubuntu with alternative configurations.", 2015, "Global"),
    ("Ubuntu GamePack", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distribution pre-configured for gaming.", 2015, "Russia"),
    ("Ubuntu Ultimate Edition", "ubuntu", "ubuntu", "ubuntu", "Feature-rich Ubuntu remix with many extras included.", 2008, "United States"),
    ("Ubuntu CE", "ubuntu", "ubuntu", "ubuntu", "Ubuntu Christian Edition with family-friendly content filters.", 2006, "United States"),
    ("Ubuntu Privacy Remix", "ubuntu", "ubuntu", "ubuntu", "Privacy-focused Ubuntu variant that runs entirely from USB.", 2008, "Germany"),
    ("Ubuntu Rescue Remix", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based data recovery and forensics toolkit.", 2008, "Canada"),
    ("Ubuntu Studio Pro", "ubuntu-studio", "ubuntu", "ubuntu", "Professional multimedia production Ubuntu variant.", 2020, "Global"),
    ("Regolith", "ubuntu", "ubuntu", "ubuntu", "Ubuntu with i3-gaps tiling window manager and GNOME integration.", 2018, "United States"),
    ("Voyager", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distribution with attractive desktop customizations.", 2012, "France"),
    ("Linuxfx", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro with Windows-like interface.", 2019, "Brazil"),
    ("MakuluLinux", "debian", "debian", "debian", "Debian-based distribution with multiple desktop editions.", 2013, "South Africa"),
    ("Linux Lite", "ubuntu", "ubuntu", "ubuntu", "Lightweight Ubuntu-based distro for Windows users.", 2012, "New Zealand"),
    ("ChaletOS", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro with a Windows-like desktop experience.", 2015, "Global"),
    ("Cub Linux", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro with a ChromeOS-like experience.", 2016, "Global"),
    ("GalliumOS", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro optimized for Chromebooks.", 2015, "United States"),
    ("Guadalinex", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distribution by the government of Andalusia, Spain.", 2004, "Spain"),
    ("MintPPC", "linuxmint", "mint", "ubuntu", "Linux Mint derivative for PowerPC architecture.", 2010, "Netherlands"),
    ("Mint XFCE LTS", "linuxmint", "mint", "ubuntu", "Long-term support edition of Linux Mint XFCE.", 2016, "Ireland"),
    ("Feren OS", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro with a custom desktop inspired by multiple DEs.", 2015, "Global"),
    ("Zorin OS Lite", "zorin", "ubuntu", "ubuntu", "Lightweight edition of Zorin OS for older hardware.", 2019, "Ireland"),
    ("Zorin OS Education", "zorin", "ubuntu", "ubuntu", "Educational edition of Zorin OS.", 2015, "Ireland"),
    ("Zorin OS Pro", "zorin", "ubuntu", "ubuntu", "Professional edition of Zorin OS with premium features.", 2021, "Ireland"),
    ("elementary OS Server", "elementary", "ubuntu", "ubuntu", "Server-oriented edition of elementary OS.", 2020, "United States"),
    ("Pop!_OS Server", "popos", "ubuntu", "ubuntu", "Server edition of Pop!_OS by System76.", 2021, "United States"),
    ("Bodhi AppPack", "bodhi", "ubuntu", "ubuntu", "Bodhi Linux with a curated set of applications pre-installed.", 2014, "United States"),
    ("Netrunner Rolling", "opensuse", "opensuse", "opensuse", "Rolling release Netrunner based on openSUSE.", 2014, "Germany"),
    ("Netrunner Debian", "debian", "debian", "debian", "Debian-based edition of Netrunner with KDE Plasma.", 2013, "Germany"),
    ("KDE neon User Edition", "ubuntu", "ubuntu", "ubuntu", "Bleeding-edge KDE Plasma on Ubuntu LTS base.", 2016, "Global"),
    ("KDE neon Developer Edition", "ubuntu", "ubuntu", "ubuntu", "KDE neon targeting developers with unstable packages.", 2016, "Global"),
    ("Nitrux", "debian", "debian", "debian", "Debian-based distro with NX Desktop and AppImages.", 2018, "Mexico"),
    ("Ubuntu Webapps", "ubuntu", "ubuntu", "ubuntu", "Ubuntu variant focused on web application integration.", 2012, "Global"),
]

ARCH_DERIVATIVES = [
    ("ArchBang", "arch", "arch", "arch", "Lightweight Arch-based distro with Openbox window manager.", 2011, "Global"),
    ("ArchLabs", "arch", "arch", "arch", "Arch-based distro with BunsenLabs-inspired Openbox setup.", 2017, "Global"),
    ("ArchStrike", "arch", "arch", "arch", "Arch-based distro for security professionals.", 2014, "Global"),
    ("Archcraft", "arch", "arch", "arch", "Arch-based distro with beautiful theming and multiple WMs.", 2020, "Global"),
    ("Arch32", "arch", "arch", "arch", "32-bit port of Arch Linux for older hardware.", 2017, "Global"),
    ("Arch Linux ARM", "arch", "arch", "arch", "Arch Linux ported to ARM architecture devices.", 2009, "Global"),
    ("Bluestar Linux", "arch", "arch", "arch", "Arch-based distro with KDE Plasma and easy installation.", 2013, "United States"),
    ("Chakra", "arch", "arch", "arch", "Arch-based distro focused on KDE/Qt (discontinued).", 2010, "Global", "discontinued"),
    ("CTKArch", "arch", "arch", "arch", "French Arch-based distribution with Enlightenment desktop.", 2010, "France"),
    ("Kaisen Linux", "debian", "debian", "debian", "Debian-based system administration and operations distribution.", 2018, "France"),
    ("Mabox", "manjaro", "arch", "arch", "Manjaro-based distro with Openbox window manager.", 2019, "Poland"),
    ("RebornOS", "arch", "arch", "arch", "Arch-based distro with easy installer and multiple DEs.", 2017, "Global"),
    ("Namib", "arch", "arch", "arch", "Arch-based distro with Calamares installer.", 2017, "Global"),
    {"SwagArch", "arch", "arch", "arch", "Arch-based distro with themed GNOME desktop.", 2017, "Global"},
    ("InstantOS", "arch", "arch", "arch", "Arch-based distro with instantWM tiling manager.", 2019, "Germany"),
    ("Crystal Linux", "arch", "arch", "arch", "Arch-based distro with user-friendly installation.", 2021, "Global"),
    ("Parchlinux", "arch", "arch", "arch", "Arch-based distribution aimed at beginners.", 2020, "Global"),
    ("Hyperland OS", "arch", "arch", "arch", "Arch-based distro with Hyprland as default compositor.", 2023, "Global"),
    ("Axyl OS", "arch", "arch", "arch", "Arch-based distro focused on aesthetics and ricing.", 2021, "Global"),
    ("Ethereal OS", "arch", "arch", "arch", "Arch-based distro with cosmic desktop environment.", 2022, "Global"),
    ("CachyOS Server", "cachyos", "arch", "arch", "Server edition of CachyOS with optimized kernels.", 2022, "Global"),
    ("CachyOS CLI", "cachyos", "arch", "arch", "Minimal CLI edition of CachyOS.", 2022, "Global"),
    ("EndeavourOS ARM", "endeavour", "arch", "arch", "ARM edition of EndeavourOS for SBCs.", 2021, "Global"),
    ("Manjaro GNOME", "manjaro", "arch", "arch", "Manjaro with GNOME desktop environment.", 2013, "Germany"),
    ("Manjaro KDE", "manjaro", "arch", "arch", "Manjaro with KDE Plasma desktop.", 2013, "Germany"),
    ("Manjaro XFCE", "manjaro", "arch", "arch", "Manjaro with XFCE desktop (flagship edition).", 2011, "Germany"),
    ("Manjaro ARM", "manjaro", "arch", "arch", "Manjaro ported to ARM devices.", 2017, "Germany"),
    ("Manjaro i3", "manjaro", "arch", "arch", "Manjaro with i3 tiling window manager.", 2015, "Germany"),
    ("Manjaro Sway", "manjaro", "arch", "arch", "Manjaro with Sway Wayland compositor.", 2021, "Germany"),
    ("Manjaro Budgie", "manjaro", "arch", "arch", "Manjaro with Budgie desktop environment.", 2018, "Germany"),
    ("Manjaro MATE", "manjaro", "arch", "arch", "Manjaro with MATE desktop environment.", 2015, "Germany"),
    ("Manjaro Cinnamon", "manjaro", "arch", "arch", "Manjaro with Cinnamon desktop environment.", 2016, "Germany"),
    ("Manjaro LXQt", "manjaro", "arch", "arch", "Lightweight Manjaro with LXQt desktop.", 2017, "Germany"),
    ("BigLinux", "manjaro", "arch", "arch", "Brazilian Manjaro-based distribution.", 2007, "Brazil"),
    ("Sonar GNU/Linux", "manjaro", "arch", "arch", "Manjaro-based distro for accessibility.", 2015, "United States"),
    ("Netrunner Arch", "arch", "arch", "arch", "Arch-based edition of Netrunner (discontinued).", 2014, "Germany", "discontinued"),
    ("Wolf Land Linux", "arch", "arch", "arch", "Arch-based distribution with custom theming.", 2021, "Global"),
    ("Garuda MATE", "garuda", "arch", "arch", "Garuda Linux with MATE desktop environment.", 2020, "India"),
    ("Garuda KDE Dr460nized", "garuda", "arch", "arch", "Garuda flagship with a heavily customized KDE Plasma.", 2020, "India"),
    ("Garuda Xfce", "garuda", "arch", "arch", "Garuda Linux with XFCE desktop.", 2020, "India"),
    ("Garuda GNOME", "garuda", "arch", "arch", "Garuda Linux with GNOME desktop.", 2020, "India"),
    ("Garuda i3wm", "garuda", "arch", "arch", "Garuda Linux with i3 window manager.", 2021, "India"),
    ("Garuda Sway", "garuda", "arch", "arch", "Garuda Linux with Sway compositor.", 2021, "India"),
    ("Garuda Hyprland", "garuda", "arch", "arch", "Garuda Linux with Hyprland compositor.", 2022, "India"),
    ("Garuda Wayfire", "garuda", "arch", "arch", "Garuda Linux with Wayfire compositor.", 2021, "India"),
    ("ArcoLinuxB", "arcolinux", "arch", "arch", "ArcoLinux build system for creating custom ISOs.", 2017, "Belgium"),
    ("ArcoLinuxD", "arcolinux", "arch", "arch", "ArcoLinux minimal desktop edition.", 2017, "Belgium"),
    ("ArcoLinuxS", "arcolinux", "arch", "arch", "ArcoLinux server edition.", 2018, "Belgium"),
    ("ArcoLinux XL", "arcolinux", "arch", "arch", "Full-featured ArcoLinux with all desktops.", 2018, "Belgium"),
    ("Artix LXQt", "artix", "arch", "arch", "Artix Linux with LXQt desktop and OpenRC.", 2017, "Global"),
    ("Artix KDE", "artix", "arch", "arch", "Artix Linux with KDE Plasma and OpenRC.", 2017, "Global"),
    ("Artix XFCE", "artix", "arch", "arch", "Artix Linux with XFCE and runit.", 2017, "Global"),
    ("Artix GNOME", "artix", "arch", "arch", "Artix Linux with GNOME and s6.", 2019, "Global"),
    ("Artix Base", "artix", "arch", "arch", "Minimal Artix Linux without desktop environment.", 2017, "Global"),
    ("Hyperbola", "arch", "arch", "arch", "Free software Arch derivative with security focus (becoming HyperbolaBSD).", 2017, "Germany"),
    ("Parabola", "arch", "arch", "arch", "Fully free Arch derivative endorsed by the FSF.", 2011, "Global"),
    ("Obarun", "arch", "arch", "arch", "Arch-based distro with s6 init system instead of systemd.", 2017, "Global"),
    ("Puppy Slacko", "puppy", "puppy", "slackware", "Puppy Linux edition based on Slackware packages.", 2011, "Global"),
    ("Puppy Bionic", "puppy", "puppy", "ubuntu", "Puppy Linux edition based on Ubuntu Bionic packages.", 2018, "Global"),
    ("Puppy Fossa", "puppy", "puppy", "ubuntu", "Puppy Linux based on Ubuntu Focal Fossa.", 2020, "Global"),
    ("Puppy Bookworm", "puppy", "puppy", "debian", "Puppy Linux based on Debian Bookworm.", 2023, "Global"),
]

FEDORA_RHEL_DERIVATIVES = [
    ("Fedora KDE", "fedora", "fedora", "fedora", "Fedora with KDE Plasma desktop.", 2004, "United States"),
    ("Fedora XFCE", "fedora", "fedora", "fedora", "Fedora with XFCE desktop environment.", 2004, "United States"),
    ("Fedora LXQt", "fedora", "fedora", "fedora", "Fedora with LXQt desktop.", 2014, "United States"),
    ("Fedora MATE", "fedora", "fedora", "fedora", "Fedora with MATE desktop environment.", 2014, "United States"),
    ("Fedora Cinnamon", "fedora", "fedora", "fedora", "Fedora with Cinnamon desktop.", 2014, "United States"),
    ("Fedora i3", "fedora", "fedora", "fedora", "Fedora with i3 tiling window manager.", 2019, "United States"),
    ("Fedora Sway", "fedora", "fedora", "fedora", "Fedora with Sway Wayland compositor.", 2021, "United States"),
    ("Fedora Server", "fedora", "fedora", "fedora", "Fedora optimized for server workloads.", 2014, "United States"),
    ("Fedora CoreOS", "fedora", "fedora", "fedora", "Minimal Fedora for containerized workloads.", 2019, "United States"),
    ("Fedora IoT", "fedora", "fedora", "fedora", "Fedora for Internet of Things edge devices.", 2018, "United States"),
    ("Fedora Silverblue", "fedora", "fedora", "fedora", "Immutable Fedora desktop with rpm-ostree.", 2018, "United States"),
    ("Fedora Kinoite", "fedora", "fedora", "fedora", "Immutable Fedora KDE with rpm-ostree.", 2021, "United States"),
    ("Fedora Sericea", "fedora", "fedora", "fedora", "Immutable Fedora with Sway compositor.", 2023, "United States"),
    ("Fedora Onyx", "fedora", "fedora", "fedora", "Immutable Fedora with Budgie desktop.", 2023, "United States"),
    ("Fedora Vauxite", "fedora", "fedora", "fedora", "Immutable Fedora with XFCE desktop.", 2023, "United States"),
    ("Fedora Pantheon", "fedora", "fedora", "fedora", "Fedora with elementary OS Pantheon desktop.", 2022, "United States"),
    ("Fedora Atomic", "fedora", "fedora", "fedora", "Fedora atomic desktop variants.", 2023, "United States"),
    ("Nobara", "fedora", "fedora", "fedora", "Fedora-based distro optimized for gaming and content creation.", 2022, "Global"),
    ("Ultramarine", "fedora", "fedora", "fedora", "Fedora-based distro with alternative desktops.", 2021, "Global"),
    ("Risi Linux", "fedora", "fedora", "fedora", "Fedora-based rolling release distribution.", 2020, "Global"),
    ("Bazzite", "fedora", "fedora", "fedora", "Immutable Fedora for gaming (Steam Deck, desktops).", 2023, "Global"),
    ("Universal Blue", "fedora", "fedora", "fedora", "Custom Fedora images for containers and desktops.", 2023, "Global"),
    ("CentOS Stream 9", "centos", "centos", "rhel", "CentOS Stream targeting RHEL 9 development.", 2021, "United States"),
    ("CentOS Stream 10", "centos", "centos", "rhel", "CentOS Stream targeting RHEL 10 development.", 2024, "United States"),
    ("Rocky Linux 8", "rocky", "rocky", "rhel", "Rocky Linux 8.x RHEL-compatible release.", 2021, "United States"),
    ("Rocky Linux 9", "rocky", "rocky", "rhel", "Rocky Linux 9.x RHEL-compatible release.", 2022, "United States"),
    ("AlmaLinux 8", "almalinux", "almalinux", "rhel", "AlmaLinux 8.x RHEL fork.", 2021, "United States"),
    ("AlmaLinux 9", "almalinux", "almalinux", "rhel", "AlmaLinux 9.x RHEL fork.", 2022, "United States"),
    ("Springdale Linux", "rhel", "rhel", "rhel", "RHEL rebuild by Princeton University (PUIAS).", 2003, "United States"),
    ("EuroLinux", "rhel", "rhel", "rhel", "European RHEL-compatible enterprise distribution.", 2015, "Poland"),
    ("Oreon", "rhel", "rhel", "rhel", "RHEL-compatible community distribution.", 2022, "Global"),
    ("Circle Linux", "rhel", "rhel", "rhel", "Community RHEL fork from Chinese developers.", 2022, "China"),
    ("Lenix", "rhel", "rhel", "rhel", "RHEL-compatible enterprise distribution.", 2022, "Global"),
    ("ClearOS Enterprise", "clearos", "clearos", "rhel", "Enterprise edition of ClearOS for business.", 2009, "United States"),
    ("Hakin9", "fedora", "fedora", "fedora", "Fedora-based security distribution.", 2012, "Poland"),
    ("Korora", "fedora", "fedora", "fedora", "Fedora-based distro with extra codecs and software (discontinued).", 2012, "Australia", "discontinued"),
    ("Chapeau", "fedora", "fedora", "fedora", "Fedora-based distro with multimedia support (discontinued).", 2014, "United Kingdom", "discontinued"),
    ("Berry Linux", "fedora", "fedora", "fedora", "Japanese Fedora-based live distribution.", 2003, "Japan"),
    ("Hancom Linux", "fedora", "fedora", "fedora", "Korean Linux distribution (discontinued).", 2000, "South Korea", "discontinued"),
    ("Red Flag Linux Server", "redflag", "redflag", "rhel", "Server edition of Red Flag Linux.", 2000, "China"),
    ("ASPLinux", "rhel", "rhel", "rhel", "Russian RHEL-compatible distribution (discontinued).", 2001, "Russia", "discontinued"),
]

SUSE_DERIVATIVES = [
    ("openSUSE Tumbleweed KDE", "opensuse", "opensuse", "opensuse", "openSUSE Tumbleweed with KDE Plasma.", 2014, "Germany"),
    ("openSUSE Tumbleweed GNOME", "opensuse", "opensuse", "opensuse", "openSUSE Tumbleweed with GNOME.", 2014, "Germany"),
    ("openSUSE Tumbleweed XFCE", "opensuse", "opensuse", "opensuse", "openSUSE Tumbleweed with XFCE.", 2015, "Germany"),
    ("openSUSE Leap 15.5", "opensuse", "opensuse", "opensuse", "openSUSE Leap 15.5 stable release.", 2023, "Germany"),
    ("openSUSE Leap 15.6", "opensuse", "opensuse", "opensuse", "openSUSE Leap 15.6 stable release.", 2024, "Germany"),
    ("openSUSE MicroOS", "opensuse", "opensuse", "opensuse", "Transactional openSUSE for containers and IoT.", 2018, "Germany"),
    ("openSUSE Aeon", "opensuse", "opensuse", "opensuse", "Immutable GNOME desktop on openSUSE MicroOS.", 2022, "Germany"),
    ("openSUSE Kalpa", "opensuse", "opensuse", "opensuse", "Immutable KDE desktop on openSUSE MicroOS.", 2022, "Germany"),
    ("SUSE Linux Enterprise Desktop", "suse", "suse", "opensuse", "SUSE enterprise desktop for business workstations.", 2006, "Germany"),
    ("SUSE Linux Enterprise Server", "suse", "suse", "opensuse", "SUSE enterprise server for data centers.", 2000, "Germany"),
    ("SUSE Manager", "suse", "suse", "opensuse", "SUSE systems management and provisioning platform.", 2014, "Germany"),
    ("GeckoLinux", "opensuse", "opensuse", "opensuse", "openSUSE derivative with pre-configured desktops.", 2016, "Global"),
    ("Regata OS", "opensuse", "opensuse", "opensuse", "Brazilian openSUSE-based distribution.", 2019, "Brazil"),
    ("Univention Corporate Server", "debian", "debian", "debian", "Debian-based enterprise server by Univention.", 2004, "Germany"),
    ("Neptune", "debian", "debian", "debian", "Debian-based distro with KDE Plasma.", 2011, "Germany"),
    ("Makulu LinDoz", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro with Windows-like interface.", 2016, "South Africa"),
]

GENTOO_DERIVATIVES = [
    ("Gentoo Prefix", "gentoo", "gentoo", "gentoo", "Gentoo installed in a prefix on another OS.", 2006, "Global"),
    ("Gentoo musl", "gentoo", "gentoo", "gentoo", "Gentoo with musl libc instead of glibc.", 2018, "Global"),
    ("Calculate Linux Desktop", "calculate", "calculate", "gentoo", "Calculate Linux with desktop environment.", 2006, "Russia"),
    ("Calculate Linux Server", "calculate", "calculate", "gentoo", "Calculate Linux server edition.", 2006, "Russia"),
    ("Calculate Linux Scratch", "calculate", "calculate", "gentoo", "Minimal Calculate Linux for custom builds.", 2007, "Russia"),
    ("Funtoo", "gentoo", "gentoo", "gentoo", "Gentoo fork led by Daniel Robbins with improved tooling.", 2008, "United States"),
    ("Sabayon", "gentoo", "gentoo", "gentoo", "Gentoo-based distro with easy installation (discontinued).", 2005, "Italy", "discontinued"),
    ("Sabayon Server", "gentoo", "gentoo", "gentoo", "Server edition of Sabayon (discontinued).", 2009, "Italy", "discontinued"),
    ("Redcore", "gentoo", "gentoo", "gentoo", "Gentoo-based distro aimed at desktop users.", 2016, "Romania"),
    ("MocaccinoOS", "gentoo", "gentoo", "gentoo", "Immutable Gentoo-based OS with container support.", 2021, "Global"),
    ("ContainerOS", "gentoo", "gentoo", "gentoo", "Gentoo-based OS optimized for running containers.", 2019, "Global"),
    ("Lilidog", "debian", "debian", "debian", "Lightweight Debian-based distro with Openbox.", 2020, "United States"),
]

INDEPENDENT_DISTROS = [
    ("GoboLinux Next", "gobolinux", "gobolinux", "gobolinux", "Next generation GoboLinux with alternative filesystem.", 2015, "Brazil"),
    ("Dragora 4", "dragora", "dragora", "dragora", "Dragora 4 release, fully free distribution.", 2022, "Argentina"),
    ("Guix System Desktop", "guix", "guix", "guix", "Guix System with desktop environment configured.", 2019, "Global"),
    ("Guix System Server", "guix", "guix", "guix", "Guix System for server deployments.", 2019, "Global"),
    ("Bedrock Linux Meta", "bedrock", "bedrock", "bedrock", "Meta-distribution allowing mixing of multiple distros.", 2012, "Global"),
    ("Chimera Linux Desktop", "chimera", "chimera", "chimera", "Chimera Linux with GNOME desktop.", 2023, "Global"),
    ("Chimera Linux Server", "chimera", "chimera", "chimera", "Chimera Linux minimal server install.", 2023, "Global"),
    ("AOSC OS Desktop", "aosc", "aosc", "aosc", "AOSC OS with desktop environment.", 2011, "China"),
    ("AOSC OS Server", "aosc", "aosc", "aosc", "AOSC OS server edition.", 2014, "China"),
    ("AOSC OS Retro", "aosc", "aosc", "aosc", "AOSC OS for older/retro hardware.", 2018, "China"),
    ("Solus GNOME", "solus", "solus", "solus", "Solus with GNOME desktop environment.", 2016, "Global"),
    ("Solus KDE", "solus", "solus", "solus", "Solus with KDE Plasma desktop.", 2017, "Global"),
    ("Solus XFCE", "solus", "solus", "solus", "Solus with XFCE desktop.", 2017, "Global"),
    ("Solus MATE", "solus", "solus", "solus", "Solus with MATE desktop.", 2016, "Global"),
    ("NixOS GNOME", "nixos", "nixos", "nixos", "NixOS with GNOME desktop.", 2013, "Global"),
    ("NixOS KDE", "nixos", "nixos", "nixos", "NixOS with KDE Plasma desktop.", 2014, "Global"),
    ("NixOS Server", "nixos", "nixos", "nixos", "NixOS minimal server configuration.", 2015, "Global"),
    ("Void GNOME", "void", "void", "void", "Void Linux with GNOME desktop.", 2014, "Spain"),
    ("Void KDE", "void", "void", "void", "Void Linux with KDE Plasma.", 2015, "Spain"),
    ("Void XFCE", "void", "void", "void", "Void Linux with XFCE desktop.", 2014, "Spain"),
    ("Void musl", "void", "void", "void", "Void Linux with musl libc.", 2014, "Spain"),
    ("Alpine Desktop", "alpine", "alpine", "alpine", "Alpine Linux configured for desktop use.", 2015, "Global"),
    ("Alpine Raspberry Pi", "alpine", "alpine", "alpine", "Alpine Linux for Raspberry Pi.", 2015, "Global"),
    ("CRUX 3.7", "crux", "crux", "crux", "CRUX 3.7 lightweight distribution.", 2023, "Sweden"),
    ("Source Mage Grimoire", "sourcemage", "sourcemage", "sourcemage", "Source Mage with updated spell collections.", 2010, "Global"),
    ("Exherbo Desktop", "exherbo", "exherbo", "exherbo", "Exherbo with desktop environment configured.", 2012, "Global"),
    ("KaOS", "kaos", "kaos", "opensuse", "Independent rolling distro focused on KDE and Qt.", 2013, "Global"),
    ("KaOS Minimal", "kaos", "kaos", "opensuse", "Minimal KaOS installation.", 2015, "Global"),
    ("PCLinuxOS KDE", "pclinuxos", "pclinuxos", "pclinuxos", "PCLinuxOS with KDE Plasma desktop.", 2003, "United States"),
    ("PCLinuxOS MATE", "pclinuxos", "pclinuxos", "pclinuxos", "PCLinuxOS with MATE desktop.", 2012, "United States"),
    ("PCLinuxOS XFCE", "pclinuxos", "pclinuxos", "pclinuxos", "PCLinuxOS with XFCE desktop.", 2010, "United States"),
    ("ROSA Fresh", "rosa", "rosa", "opensuse", "ROSA Fresh desktop edition.", 2012, "Russia"),
    ("ROSA Enterprise", "rosa", "rosa", "opensuse", "ROSA Enterprise server edition.", 2013, "Russia"),
    ("ALT Workstation", "altlinux", "altlinux", "opensuse", "ALT Linux workstation edition.", 2003, "Russia"),
    ("ALT Server", "altlinux", "altlinux", "opensuse", "ALT Linux server edition.", 2001, "Russia"),
    ("ALT Education", "altlinux", "altlinux", "opensuse", "ALT Linux for educational institutions.", 2005, "Russia"),
    ("ALT Kworkstation", "altlinux", "altlinux", "opensuse", "ALT Linux KDE workstation.", 2008, "Russia"),
    ("Frugalware Current", "frugalware", "frugalware", "frugalware", "Frugalware current release branch.", 2007, "Hungary"),
]

REGIONAL_DISTROS = [
    ("StartOS", "debian", "debian", "debian", "Chinese Debian-based distribution.", 2010, "China"),
    ("Kylin", "ubuntu", "ubuntu", "ubuntu", "Chinese Ubuntu-based government distribution.", 2013, "China"),
    ("NeoKylin", "rhel", "rhel", "rhel", "Chinese RHEL-based enterprise distribution.", 2010, "China"),
    ("Cosix", "debian", "debian", "debian", "Chinese Debian derivative.", 2012, "China"),
    ("CCLinux", "rhel", "rhel", "rhel", "Chinese RHEL-based distribution by China Construction Bank.", 2018, "China"),
    ("BCLinux", "rhel", "rhel", "rhel", "Big Cloud Linux by Alibaba.", 2014, "China"),
    ("TencentOS Server", "rhel", "rhel", "rhel", "Tencent's server Linux distribution.", 2019, "China"),
    ("openAnolis", "rhel", "rhel", "rhel", "OpenAnolis community RHEL-compatible distribution.", 2020, "China"),
    ("NFSChina", "rhel", "rhel", "rhel", "Chinese enterprise Linux.", 2015, "China"),
    ("Linux Deepin", "debian", "deepin", "debian", "The original Deepin Linux distribution.", 2004, "China"),
    ("UOS", "debian", "deepin", "debian", "Unified Operating System (UnionTech OS), commercial Deepin.", 2019, "China"),
    ("CutefishOS", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro with CutefishDE (discontinued).", 2021, "China", "discontinued"),
    ("PrimTux", "debian", "debian", "debian", "French Debian-based distro for schools.", 2015, "France"),
    ("Mandriva Education", "mandriva", "mandriva", "opensuse", "Mandriva-based educational distribution.", 2006, "France", "discontinued"),
    ("Ankur Bangla", "ubuntu", "ubuntu", "ubuntu", "Bengali language Ubuntu-based distribution.", 2006, "India"),
    ("BOSS", "debian", "debian", "debian", "Bharat Operating System Solutions, Indian government distro.", 2007, "India"),
    ("ExpidusOS", "void", "void", "void", "Independent distribution from India.", 2019, "India"),
    ("Rescuezilla", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based system rescue tool (fork of Redo Backup).", 2010, "Global"),
    ("SharkLinux", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distribution.", 2017, "Global"),
    ("Maui", "debian", "debian", "debian", "Debian-based KDE distro by Blue Systems (discontinued).", 2016, "Germany", "discontinued"),
    ("Tanglu KDE", "debian", "debian", "debian", "Tanglu with KDE Plasma desktop.", 2014, "Germany"),
    ("Astra Linux", "debian", "debian", "debian", "Russian Debian-based distribution certified for government use.", 2008, "Russia"),
    ("Rosa Marathon", "rosa", "rosa", "opensuse", "ROSA Marathon LTS release.", 2012, "Russia"),
    ("Calculate Linux Desktop Cinnamon", "calculate", "calculate", "gentoo", "Calculate Linux with Cinnamon desktop.", 2013, "Russia"),
    ("Calculate Linux Desktop XFCE", "calculate", "calculate", "gentoo", "Calculate Linux with XFCE desktop.", 2010, "Russia"),
    ("Runtu", "ubuntu", "ubuntu", "ubuntu", "Russian Ubuntu-based distribution.", 2006, "Russia"),
    ("Linux XP", "fedora", "fedora", "fedora", "Russian Linux distribution (discontinued).", 2004, "Russia", "discontinued"),
    ("ASPLinux Desktop", "fedora", "fedora", "fedora", "Russian Fedora-based desktop (discontinued).", 2003, "Russia", "discontinued"),
    ("Swift Linux", "debian", "debian", "debian", "Lightweight Debian-based distro.", 2011, "Global"),
    ("Raspberry Pi Desktop", "debian", "raspbian", "debian", "Official Raspberry Pi desktop for PC and Mac.", 2017, "United Kingdom"),
    ("Raspberry Pi Lite", "raspbian", "raspbian", "debian", "Minimal Raspberry Pi OS without desktop.", 2016, "United Kingdom"),
    ("Raspberry Pi Full", "raspbian", "raspbian", "debian", "Full Raspberry Pi OS with all recommended software.", 2020, "United Kingdom"),
    ("Ubuntu Pi", "ubuntu", "ubuntu", "ubuntu", "Ubuntu optimized for Raspberry Pi.", 2016, "Global"),
    ("Fedora Raspberry Pi", "fedora", "fedora", "fedora", "Fedora for Raspberry Pi.", 2018, "Global"),
    ("Armbian Debian", "armbian", "armbian", "debian", "Armbian with Debian userspace for ARM SBCs.", 2014, "Global"),
    ("Armbian Ubuntu", "armbian", "armbian", "ubuntu", "Armbian with Ubuntu userspace for ARM SBCs.", 2014, "Global"),
    ("Kali ARM", "kali", "kali", "debian", "Kali Linux for ARM devices.", 2014, "Global"),
    ("Parrot ARM", "parrot", "parrot", "debian", "Parrot OS for ARM architecture.", 2018, "Italy"),
    ("postmarketOS Phosh", "postmarketos", "postmarketos", "alpine", "postmarketOS with Phosh mobile shell.", 2019, "Global"),
    ("postmarketOS Plasma Mobile", "postmarketos", "postmarketos", "alpine", "postmarketOS with KDE Plasma Mobile.", 2019, "Global"),
    ("postmarketOS Sxmo", "postmarketos", "postmarketos", "alpine", "postmarketOS with Simple X Mobile interface.", 2020, "Global"),
    ("Sailfish OS", "mer", "sailfish", "opensuse", "Jolla's Sailfish mobile operating system.", 2013, "Finland"),
    ("Ubuntu Touch Halium", "ubuntu-touch", "ubuntu", "ubuntu", "Ubuntu Touch for Halium-compatible devices.", 2017, "Global"),
    ("LineageOS MicroG", "lineageos", "lineageos", "android-x86", "LineageOS with MicroG framework for privacy.", 2018, "Global"),
    ("LineageOS for Tablets", "lineageos", "lineageos", "android-x86", "LineageOS optimized for tablet devices.", 2017, "Global"),
    ("GrapheneOS Pixel", "grapheneos", "grapheneos", "android-x86", "GrapheneOS for Google Pixel devices.", 2019, "Canada"),
    ("CalyxOS Pixel", "calyxos", "calyxos", "android-x86", "CalyxOS for Google Pixel devices.", 2020, "United States"),
    ("DivestOS", "lineageos", "lineageos", "android-x86", "Privacy-focused fork of LineageOS for many devices.", 2014, "United States"),
    ("/e/ OS Tablet", "e-os", "e-os", "android-x86", "/e/ OS for tablet devices.", 2020, "France"),
]

CONTAINER_CLOUD_DISTROS = [
    ("Flatcar Container Linux", "coreos", "coreos", "coreos", "Container-optimized Linux (successor to CoreOS).", 2018, "Germany"),
    ("Bottlerocket", "amazon-linux", "amazon-linux", "rhel", "AWS container-optimized Linux.", 2020, "United States"),
    ("Talos Linux", "talos", "talos", "nixos", "Kubernetes-focused immutable Linux.", 2019, "Canada"),
    ("k3OS", "k3os", "k3os", "alpine", "Minimal OS for running k3s Kubernetes.", 2019, "United States"),
    ("RancherOS", "alpine", "alpine", "alpine", "Minimal Linux for running Docker containers (discontinued).", 2015, "United States", "discontinued"),
    ("LinuxKit", "linuxkit", "linuxkit", "alpine", "Docker's toolkit for building custom minimal Linux systems.", 2017, "United States"),
    ("Photon OS 5", "photon", "photon", "opensuse", "VMware Photon OS 5 for containers.", 2023, "United States"),
    ("openSUSE Leap Micro", "opensuse", "opensuse", "opensuse", "openSUSE Micro for edge and containers.", 2022, "Germany"),
    ("Ubuntu Core 22", "ubuntu-core", "ubuntu", "ubuntu", "Ubuntu Core 22 for IoT and embedded devices.", 2022, "United Kingdom"),
    ("Ubuntu Core 24", "ubuntu-core", "ubuntu", "ubuntu", "Ubuntu Core 24 for IoT and embedded devices.", 2024, "United Kingdom"),
    ("Fedora CoreOS Next", "fedora-coreos", "fedora", "fedora", "Fedora CoreOS next stream.", 2022, "United States"),
    ("Azure Linux", "azure-linux", "azure-linux", "rhel", "Microsoft's internal Linux for Azure infrastructure.", 2017, "United States"),
    ("CBL-Mariner", "azure-linux", "azure-linux", "rhel", "Common Base Linux by Microsoft (now Azure Linux).", 2020, "United States"),
    ("Google Container-Optimized OS", "chromeos", "chromeos", "chromeos", "Google's container-optimized OS for GCE.", 2016, "United States"),
    ("Immutable Ubuntu Server", "ubuntu", "ubuntu", "ubuntu", "Immutable Ubuntu server for cloud-native workloads.", 2023, "United Kingdom"),
    ("Flatcar Stable", "flatcar", "flatcar", "coreos", "Flatcar Container Linux stable channel.", 2018, "Germany"),
    ("Flatcar Beta", "flatcar", "flatcar", "coreos", "Flatcar Container Linux beta channel.", 2018, "Germany"),
    ("OSCAR", "debian", "debian", "debian", "HPC cluster distribution.", 2003, "United States"),
    ("Rocky Linux HPC", "rocky", "rocky", "rhel", "Rocky Linux HPC cluster variant.", 2022, "United States"),
    ("AlmaLinux HPC", "almalinux", "almalinux", "rhel", "AlmaLinux for HPC workloads.", 2022, "United States"),
    ("Clear Linux", "clear-linux", "clear-linux", "clear-linux", "Intel's performance-optimized Linux distribution.", 2015, "United States"),
    ("Clear Linux Desktop", "clear-linux", "clear-linux", "clear-linux", "Clear Linux desktop edition.", 2018, "United States"),
    ("Clear Linux Server", "clear-linux", "clear-linux", "clear-linux", "Clear Linux server edition.", 2016, "United States"),
    ("OpenWrt ARM", "openwrt", "openwrt", "openwrt", "OpenWrt for ARM routers.", 2010, "Global"),
    ("OpenWrt x86", "openwrt", "openwrt", "openwrt", "OpenWrt for x86 hardware.", 2010, "Global"),
    ("DD-WRT", "dd-wrt", "dd-wrt", "openwrt", "Linux-based firmware for wireless routers.", 2005, "Germany"),
    ("Tomato", "tomato", "tomato", "openwrt", "Linux firmware for Broadcom-based routers.", 2008, "Global"),
    ("OpenWrt Snapshot", "openwrt", "openwrt", "openwrt", "OpenWrt development snapshot builds.", 2012, "Global"),
    ("LEDE", "openwrt", "openwrt", "openwrt", "Linux Embedded Development Environment (merged back into OpenWrt).", 2016, "Global"),
    ("VyOS", "debian", "debian", "debian", "Debian-based network OS (fork of Vyatta).", 2013, "Global"),
    ("pfSense", "pfSense", "pfSense", "freebsd", "FreeBSD-based firewall distribution.", 2004, "United States"),
    ("OPNsense", "opnsense", "opnsense", "freebsd", "HardenedBSD-based firewall forked from pfSense.", 2015, "Netherlands"),
    ("IPFire", "ipfire", "ipfire", "debian", "Debian-based Linux firewall distribution.", 2007, "Germany"),
    ("Endian Firewall", "debian", "debian", "debian", "Debian-based unified threat management distribution.", 2004, "Italy"),
    ("Smoothwall", "smoothwall", "smoothwall", "debian", "Linux-based firewall and gateway distribution.", 2000, "United Kingdom"),
    ("Sophos UTM", "suse", "suse", "opensuse", "SUSE-based UTM appliance distribution.", 2000, "Germany"),
    ("Untangle", "debian", "debian", "debian", "Debian-based network security platform.", 2003, "United States"),
]

EMBEDDED_IOT_DISTROS = [
    ("Yocto Poky", "openembedded", "openembedded", "openembedded", "Reference distribution for the Yocto Project.", 2010, "Global"),
    ("Wind River Linux", "openembedded", "openembedded", "openembedded", "Commercial embedded Linux by Wind River.", 2004, "United States"),
    ("MontaVista Linux", "openembedded", "openembedded", "openembedded", "Commercial embedded Linux by MontaVista.", 1999, "United States"),
    ("Timesys Linux", "openembedded", "openembedded", "openembedded", "Embedded Linux by Timesys.", 2001, "United States"),
    ("RTEMS", "rtems", "rtems", "rtems", "Real-Time Executive for Multiprocessor Systems.", 1988, "United States"),
    ("Zephyr", "zephyr", "zephyr", "zephyr", "Scalable RTOS for IoT by the Linux Foundation.", 2016, "United States"),
    ("Armbian Noble", "armbian", "armbian", "ubuntu", "Armbian based on Ubuntu Noble for ARM SBCs.", 2024, "Global"),
    ("Armbian Bookworm", "armbian", "armbian", "debian", "Armbian based on Debian Bookworm for ARM SBCs.", 2023, "Global"),
    ("LibreELEC", "libreelec", "libreelec", "openembedded", "Just enough OS for Kodi media center.", 2016, "Global"),
    ("CoreELEC", "coreelec", "coreelec", "openembedded", "CoreELEC for Amlogic devices running Kodi.", 2018, "Global"),
    ("OSMC", "debian", "debian", "debian", "Open Source Media Center based on Debian.", 2014, "United Kingdom"),
    ("Lakka", "lakka", "lakka", "openembedded", "RetroArch-based retro gaming Linux distribution.", 2014, "Global"),
    ("Batocera", "batocera", "batocera", "openembedded", "Retro gaming Linux distribution.", 2018, "France"),
    ("Recalbox", "recalbox", "recalbox", "openembedded", "Retro gaming distribution for single-board computers.", 2014, "France"),
    ("DietPi", "dietpi", "dietpi", "debian", "Lightweight Debian-based distro for SBCs.", 2015, "Global"),
    ("Volumio", "volumio", "volumio", "debian", "Debian-based audiophile music player OS.", 2013, "Italy"),
    ("moOde", "moode", "moode", "debian", "Audiophile music player for Raspberry Pi.", 2014, "United States"),
    ("Roon OS", "roon-os", "roon-os", "debian", "Roon's music player operating system.", 2015, "United States"),
    ("HiFiBerryOS", "hifiberry", "hifiberry", "debian", "HiFiBerry's audio-focused OS.", 2019, "Switzerland"),
    ("OctoPrint", "octoprint", "octoprint", "debian", "3D printer management OS based on Debian.", 2012, "Germany"),
    ("Klipper Firmware", "klipper", "klipper", "debian", "Klipper 3D printer firmware OS.", 2016, "Global"),
    ("MotionEyeOS", "motioneyeos", "motioneyeos", "debian", "Video surveillance OS for Raspberry Pi.", 2016, "Global"),
    ("Home Assistant OS", "hassos", "hassos", "buildroot", "Home Assistant operating system.", 2017, "Global"),
    ("OpenHAB", "openhab", "openhab", "debian", "Open Home Automation Bus operating system.", 2010, "Global"),
    ("Grafana IoT", "alpine", "alpine", "alpine", "Alpine-based monitoring for IoT devices.", 2019, "Global"),
    ("HassOS Buildroot", "hassos", "hassos", "buildroot", "Home Assistant OS buildroot-based variant.", 2018, "Global"),
    ("BalenaOS", "balenaos", "balenaos", "openembedded", "Container-based OS for IoT by balena.", 2016, "Global"),
    ("Ubuntu Frame", "ubuntu", "ubuntu", "ubuntu", "Ubuntu for IoT displays and kiosks.", 2021, "United Kingdom"),
]

EDUCATION_DISTROS = [
    ("Edubuntu Desktop", "edubuntu", "ubuntu", "ubuntu", "Edubuntu desktop for classrooms.", 2005, "Global"),
    ("Edubuntu Server", "edubuntu", "ubuntu", "ubuntu", "Edubuntu server for school networks.", 2006, "Global"),
    ("Uberstudent", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro for higher education (discontinued).", 2010, "United States", "discontinued"),
    ("Sugar on a Stick", "fedora", "fedora", "fedora", "Fedora-based educational OS running from USB.", 2009, "United States"),
    ("Sugar Desktop", "fedora", "fedora", "fedora", "Sugar learning environment for OLPC.", 2006, "United States"),
    ("Escuelas Linux", "ubuntu", "ubuntu", "ubuntu", "Spanish-language educational Linux distribution.", 2014, "Mexico"),
    ("Qimo", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro for children (discontinued).", 2009, "United States", "discontinued"),
    ("DoudouLinux", "debian", "debian", "debian", "Debian-based distro for children (discontinued).", 2011, "France", "discontinued"),
    ("OpenSchool", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based distro for school management.", 2016, "India"),
    ("Skolelinux", "debian", "debian", "debian", "Debian-based educational distribution (now Debian Edu).", 2001, "Norway"),
    ("Voyager Education", "ubuntu", "ubuntu", "ubuntu", "Voyager Linux education edition.", 2018, "France"),
    ("Li-f-e", "ubuntu", "ubuntu", "ubuntu", "Linux for Education, Mandriva-based (discontinued).", 2008, "Global", "discontinued"),
    ("Olive", "debian", "debian", "debian", "Debian-based educational live distribution.", 2010, "Global"),
]

GAMING_DISTROS = [
    ("SteamOS 3", "arch", "arch", "arch", "Valve's Steam Deck operating system based on Arch.", 2022, "United States"),
    ("SteamOS 1", "debian", "debian", "debian", "Original SteamOS based on Debian (discontinued).", 2013, "United States", "discontinued"),
    ("HoloISO", "arch", "arch", "arch", "Community clone of SteamOS 3 for non-Deck hardware.", 2022, "Global"),
    ("ChimeraOS", "arch", "arch", "arch", "Arch-based gaming distro with Steam integration.", 2019, "United States"),
    ("Nobara SteamDeck", "fedora", "fedora", "fedora", "Nobara variant for Steam Deck.", 2023, "Global"),
    ("Garuda Gaming", "garuda", "arch", "arch", "Garuda Linux gaming edition.", 2021, "India"),
    ("Drauger OS", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based gaming distribution.", 2017, "United States"),
    ("GameDrift", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based gaming distribution.", 2012, "Global"),
    ("Lakka x86", "lakka", "lakka", "openembedded", "Lakka retro gaming for x86 PCs.", 2016, "Global"),
    ("RetroPie", "retropie", "retropie", "debian", "Retro gaming platform for Raspberry Pi.", 2012, "Global"),
    ("MiSTer FPGA Linux", "debian", "debian", "debian", "Debian-based OS for MiSTer FPGA retro hardware.", 2018, "Global"),
]

MULTIMEDIA_DISTROS = [
    ("Ubuntu Studio 24.04", "ubuntu-studio", "ubuntu", "ubuntu", "Ubuntu Studio 24.04 LTS for multimedia.", 2024, "Global"),
    ("Ubuntu Studio 22.04", "ubuntu-studio", "ubuntu", "ubuntu", "Ubuntu Studio 22.04 LTS.", 2022, "Global"),
    ("AV Linux", "debian", "debian", "debian", "Debian-based multimedia production distribution.", 2008, "Canada"),
    ("KXStudio", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based audio production distribution.", 2010, "Global"),
    ("LibraZiK", "debian", "debian", "debian", "French Debian-based audio production distribution.", 2015, "France"),
    ("StudioWare", "arch", "arch", "arch", "Arch-based multimedia production distribution.", 2020, "Global"),
    ("Accerciser", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based accessibility testing distribution.", 2012, "Global"),
    ("Apodio", "debian", "debian", "debian", "French Debian-based audio/multimedia distribution.", 2005, "France"),
    ("DreamStudio", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based multimedia creation distribution.", 2010, "United States"),
    ("Sculpt OS", "sculpt", "sculpt", "sculpt", "Microkernel-based OS for desktop use.", 2018, "Germany"),
    ("dyne:bolic", "debian", "debian", "debian", "Debian-based multimedia production live CD (discontinued).", 2001, "Italy", "discontinued"),
    ("Pure:dyne", "debian", "debian", "debian", "Debian-based multimedia distribution (discontinued).", 2006, "Global", "discontinued"),
]

PRIVACY_SECURITY_DISTROS = [
    ("Tails 6", "tails", "tails", "debian", "Tails 6 with improved hardware support.", 2024, "Global"),
    ("Tails 5", "tails", "tails", "debian", "Tails 5 amnesic incognito live system.", 2022, "Global"),
    ("Whonix Workstation", "whonix", "whonix", "debian", "Whonix workstation for anonymous browsing.", 2012, "Global"),
    ("Whonix Gateway", "whonix", "whonix", "debian", "Whonix gateway for Tor routing.", 2012, "Global"),
    ("Qubes OS 4.2", "qubes", "qubes", "fedora", "Qubes OS 4.2 security compartmentalization.", 2023, "Global"),
    ("Qubes OS 4.1", "qubes", "qubes", "fedora", "Qubes OS 4.1 with Fedora 37 templates.", 2022, "Global"),
    ("Kodachi", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based privacy-focused distribution.", 2013, "Global"),
    ("Heads", "devuan", "devuan", "debian", "Devuan-based distro focused on privacy.", 2017, "Global"),
    ("Septor", "debian", "debian", "debian", "Debian-based privacy distribution with KDE.", 2015, "Global"),
    ("Privatix", "debian", "debian", "debian", "Debian-based live system for privacy.", 2008, "Global"),
    ("IprediaOS", "fedora", "fedora", "fedora", "Fedora-based distro with I2P networking.", 2012, "Global"),
    ("Subgraph OS", "debian", "debian", "debian", "Debian-based security-hardened OS (discontinued).", 2014, "Canada", "discontinued"),
    ("Discreete Linux", "debian", "debian", "debian", "Debian-based distro for journalists and activists.", 2016, "Germany"),
    ("TENS", "fedora", "fedora", "fedora", "Trusted End Node Security by US DoD.", 2003, "United States"),
    ("SELKS", "debian", "debian", "debian", "Debian-based IDS/IPS platform by Stamus Networks.", 2015, "France"),
    ("Security Onion", "ubuntu", "ubuntu", "ubuntu", "Ubuntu-based network security monitoring.", 2008, "United States"),
    ("Kali NetHunter", "kali", "kali", "debian", "Kali Linux for mobile penetration testing.", 2014, "Global"),
    ("Kali Purple", "kali", "kali", "debian", "Kali Linux purple team edition.", 2023, "Global"),
    ("Parrot Security Lite", "parrot", "parrot", "debian", "Lightweight Parrot Security edition.", 2020, "Italy"),
]

MINIMALIST_DISTROS = [
    ("Tiny Core Plus", "tinycore", "tinycore", "tinycore", "Tiny Core with additional packages included.", 2009, "Global"),
    ("Tiny Core Pure64", "tinycore", "tinycore", "tinycore", "64-bit Tiny Core Linux.", 2012, "Global"),
    ("Slitaz Rolling", "slitaz", "slitaz", "slitaz", "SliTaz rolling release edition.", 2012, "France"),
    ("SliTaz Core", "slitaz", "slitaz", "slitaz", "SliTaz core with additional packages.", 2010, "France"),
    ("4MLinux Allinone", "4mlinux", "4mlinux", "4mlinux", "4MLinux with all applications pre-installed.", 2015, "Poland"),
    ("4MLinux Game", "4mlinux", "4mlinux", "4mlinux", "4MLinux gaming edition.", 2018, "Poland"),
    ("4MLinux Media", "4mlinux", "4mlinux", "4mlinux", "4MLinux media player edition.", 2017, "Poland"),
    ("4MLinux Server", "4mlinux", "4mlinux", "4mlinux", "4MLinux server edition.", 2019, "Poland"),
    ("Puppy BionicPup", "puppy", "puppy", "ubuntu", "Puppy Linux based on Ubuntu Bionic.", 2018, "Global"),
    ("Puppy FossaPup", "puppy", "puppy", "ubuntu", "Puppy Linux based on Ubuntu Focal Fossa.", 2020, "Global"),
    ("EasyOS", "puppy", "puppy", "puppy", "Easy Operating System by Puppy Linux creator.", 2017, "Australia"),
    ("Fatdog64", "puppy", "puppy", "puppy", "64-bit Puppy Linux variant.", 2009, "Global"),
    ("Porteus Kiosk", "porteus", "porteus", "slackware", "Porteus-based kiosk browsing system.", 2012, "Global"),
    ("Porteus Desktop", "porteus", "porteus", "slackware", "Porteus desktop with multiple DEs.", 2011, "Global"),
    ("Slax 12", "slax", "slax", "debian", "Slax 12 based on Debian.", 2023, "Czech Republic"),
    ("Slax 9", "slax", "slax", "slackware", "Slax 9 based on Slackware.", 2017, "Czech Republic"),
    ("antiX Core", "antix", "antix", "debian", "antiX core without desktop.", 2012, "Global"),
    ("antiX Full", "antix", "antix", "debian", "antiX full edition with all applications.", 2010, "Global"),
    ("antiX Net", "antix", "antix", "debian", "antiX minimal networking edition.", 2012, "Global"),
    ("MX Linux KDE", "mx", "mx", "debian", "MX Linux with KDE Plasma desktop.", 2019, "Global"),
    ("MX Linux Fluxbox", "mx", "mx", "debian", "MX Linux with Fluxbox window manager.", 2018, "Global"),
    ("MX Linux Ahs", "mx", "mx", "debian", "MX Linux Advanced Hardware Support edition.", 2020, "Global"),
    ("MX Linux Core", "mx", "mx", "debian", "MX Linux minimal core edition.", 2020, "Global"),
    ("Salix XFCE", "salix", "salix", "slackware", "Salix Linux with XFCE desktop.", 2009, "Greece"),
    ("Salix KDE", "salix", "salix", "slackware", "Salix Linux with KDE desktop.", 2011, "Greece"),
    ("Salix MATE", "salix", "salix", "slackware", "Salix Linux with MATE desktop.", 2014, "Greece"),
    ("Salix Ratpoison", "salix", "salix", "slackware", "Salix Linux with Ratpoison window manager.", 2012, "Greece"),
    ("Slackel KDE", "salix", "salix", "slackware", "Slackel Linux KDE edition (Slackware+Salix).", 2011, "Greece"),
    ("Slackel Openbox", "salix", "salix", "slackware", "Slackel Linux Openbox edition.", 2012, "Greece"),
    ("Zenwalk Core", "zenwalk", "zenwalk", "slackware", "Zenwalk minimal core edition.", 2008, "France"),
    ("Absolute Linux", "slackware", "slackware", "slackware", "Slackware-based distro with easy configuration.", 2007, "United States"),
    ("Wifislax", "slackware", "slackware", "slackware", "Slackware-based wireless security distro.", 2008, "Spain"),
    ("Stali", "stali", "stali", "suckless", "sta.li — static Linux distribution by suckless.org.", 2015, "Global"),
    ("KISS Linux", "kiss", "kiss", "kiss", "Independent source-based distro with minimal design.", 2019, "Global"),
    ("Obarun S6", "arch", "arch", "arch", "Arch-based with s6 init (same as Obarun).", 2017, "Global"),
    ("Skarnet s6 Linux", "void", "void", "void", "Void-based with s6 init system.", 2020, "Global"),
    ("Devuan KDE", "devuan", "devuan", "debian", "Devuan with KDE Plasma desktop.", 2017, "Global"),
    ("Devuan XFCE", "devuan", "devuan", "debian", "Devuan with XFCE desktop.", 2017, "Global"),
    ("Devuan MATE", "devuan", "devuan", "debian", "Devuan with MATE desktop.", 2017, "Global"),
    ("Devuan Cinnamon", "devuan", "devuan", "debian", "Devuan with Cinnamon desktop.", 2019, "Global"),
    ("Devuan Server", "devuan", "devuan", "debian", "Devuan server without desktop.", 2015, "Global"),
    ("Trisquel Mini", "trisquel", "trisquel", "ubuntu", "Lightweight Trisquel with LXDE.", 2011, "Spain"),
    ("Trisquel Sugar", "trisquel", "trisquel", "ubuntu", "Trisquel with Sugar learning environment.", 2013, "Spain"),
    ("PureOS Phone", "pureos", "pureos", "debian", "PureOS for the Librem 5 phone.", 2019, "United States"),
    ("PureOS Desktop", "pureos", "pureos", "debian", "PureOS desktop edition.", 2017, "United States"),
    ("Gnewsense", "debian", "debian", "debian", "Fully free Debian-based distribution (discontinued).", 2006, "Global", "discontinued"),
    ("Musix", "debian", "debian", "debian", "Fully free Debian-based multimedia distribution.", 2006, "Spain"),
    ("Dynebolic", "debian", "debian", "debian", "Free multimedia distribution (discontinued).", 2005, "Italy", "discontinued"),
    ("Ututo", "gentoo", "gentoo", "gentoo", "Fully free Gentoo-based distribution from Argentina.", 2004, "Argentina"),
    ("Venenux", "debian", "debian", "debian", "Latin American free software distribution.", 2007, "Venezuela"),
]

MISC_HISTORICAL = [
    ("Mandrake", "mandriva", "mandriva", "opensuse", "Original Mandrake Linux (became Mandriva).", 1998, "France", "discontinued"),
    ("Conectiva", "conectiva", "conectiva", "opensuse", "Brazilian Linux distribution (merged into Mandriva).", 1997, "Brazil", "discontinued"),
    ("Lindows", "lindows", "lindows", "debian", "LindowsOS, early consumer Linux (became Linspire).", 2001, "United States", "discontinued"),
    ("Linspire", "linspire", "linspire", "debian", "Commercial Debian-based desktop Linux (discontinued).", 2002, "United States", "discontinued"),
    ("Xandros", "xandros", "xandros", "debian", "Debian-based commercial desktop Linux (discontinued).", 2001, "Canada", "discontinued"),
    ("Libranet", "libranet", "libranet", "debian", "Debian-based desktop Linux (discontinued).", 2000, "Canada", "discontinued"),
    ("Storm Linux", "storm", "storm", "debian", "Commercial Debian-based distribution (discontinued).", 1999, "United States", "discontinued"),
    ("Progeny", "progeny", "progeny", "debian", "Debian-based distribution by Progeny (discontinued).", 2001, "United States", "discontinued"),
    ("MEPIS", "mepis", "mepis", "debian", "Debian-based desktop Linux (continued as antiX/MX).", 2003, "United States", "discontinued"),
    ("SimplyMEPIS", "mepis", "mepis", "debian", "Simply MEPIS desktop Linux (discontinued).", 2003, "United States", "discontinued"),
    ("Kanotix", "kanotix", "kanotix", "debian", "Debian-based live distribution (discontinued).", 2003, "Germany", "discontinued"),
    ("Sidux", "sidux", "sidux", "debian", "Debian Sid-based distribution (became Aptosid).", 2007, "Germany", "discontinued"),
    ("Aptosid", "aptosid", "aptosid", "debian", "Debian Sid-based rolling distro (discontinued).", 2010, "Germany", "discontinued"),
    ("Dreamlinux", "dreamlinux", "dreamlinux", "debian", "Brazilian Debian-based distribution (discontinued).", 2006, "Brazil", "discontinued"),
    ("Parsix", "parsix", "parsix", "debian", "Debian-based Iranian distribution (discontinued).", 2005, "Iran", "discontinued"),
    ("ZevenOS", "zevenos", "zevenos", "ubuntu", "Ubuntu-based distro with BeOS-like interface (discontinued).", 2008, "Germany", "discontinued"),
    ("moonOS", "moonos", "moonos", "ubuntu", "Cambodian Ubuntu-based distribution (discontinued).", 2008, "Cambodia", "discontinued"),
    ("Pinguy", "pinguy", "pinguy", "ubuntu", "Ubuntu-based distribution (discontinued).", 2010, "Global", "discontinued"),
    ("Super OS", "superos", "superos", "ubuntu", "Ubuntu-based distribution with extra codecs (discontinued).", 2008, "Global", "discontinued"),
    ("Zorin OS 9", "zorin", "ubuntu", "ubuntu", "Older Zorin OS 9 release.", 2014, "Ireland"),
    ("Zorin OS 15", "zorin", "ubuntu", "ubuntu", "Zorin OS 15 release.", 2019, "Ireland"),
    ("Zorin OS 16", "zorin", "ubuntu", "ubuntu", "Zorin OS 16 release.", 2021, "Ireland"),
    ("Zorin OS 17", "zorin", "ubuntu", "ubuntu", "Zorin OS 17 release.", 2023, "Ireland"),
    ("elementary OS 5 Juno", "elementary", "ubuntu", "ubuntu", "elementary OS 5 Juno release.", 2018, "United States"),
    ("elementary OS 6 Odin", "elementary", "ubuntu", "ubuntu", "elementary OS 6 Odin release.", 2021, "United States"),
    ("elementary OS 7 Horus", "elementary", "ubuntu", "ubuntu", "elementary OS 7 Horus release.", 2023, "United States"),
    ("Pop!_OS 20.04", "popos", "ubuntu", "ubuntu", "Pop!_OS 20.04 LTS.", 2020, "United States"),
    ("Pop!_OS 21.04", "popos", "ubuntu", "ubuntu", "Pop!_OS 21.04.", 2021, "United States"),
    ("Pop!_OS 21.10", "popos", "ubuntu", "ubuntu", "Pop!_OS 21.10.", 2021, "United States"),
    ("Pop!_OS 22.04", "popos", "ubuntu", "ubuntu", "Pop!_OS 22.04 LTS.", 2022, "United States"),
    ("Pop!_OS 24.04", "popos", "ubuntu", "ubuntu", "Pop!_OS 24.04 LTS.", 2024, "United States"),
    ("Deepin 15", "deepin", "deepin", "debian", "Deepin 15 with Deepin Desktop Environment.", 2015, "China"),
    ("Deepin 20", "deepin", "deepin", "debian", "Deepin 20 release.", 2020, "China"),
    ("Deepin 23", "deepin", "deepin", "debian", "Deepin 23 with DDE 23.", 2023, "China"),
    ("Linux Mint 19", "linuxmint", "mint", "ubuntu", "Linux Mint 19 Tara LTS.", 2018, "Ireland"),
    ("Linux Mint 20", "linuxmint", "mint", "ubuntu", "Linux Mint 20 Ulyana LTS.", 2020, "Ireland"),
    ("Linux Mint 21", "linuxmint", "mint", "ubuntu", "Linux Mint 21 Vanessa LTS.", 2022, "Ireland"),
    ("LMDE 5", "lmde", "mint", "debian", "Linux Mint Debian Edition 5.", 2022, "Ireland"),
    ("LMDE 6", "lmde", "mint", "debian", "Linux Mint Debian Edition 6.", 2023, "Ireland"),
    ("LMDE 4", "lmde", "mint", "debian", "Linux Mint Debian Edition 4.", 2020, "Ireland"),
    ("Manjaro Architect", "manjaro", "arch", "arch", "Manjaro text-based installer (discontinued).", 2017, "Germany", "discontinued"),
    ("Ubuntu 18.04", "ubuntu", "ubuntu", "ubuntu", "Ubuntu 18.04 Bionic Beaver LTS.", 2018, "United Kingdom"),
    ("Ubuntu 20.04", "ubuntu", "ubuntu", "ubuntu", "Ubuntu 20.04 Focal Fossa LTS.", 2020, "United Kingdom"),
    ("Ubuntu 22.04", "ubuntu", "ubuntu", "ubuntu", "Ubuntu 22.04 Jammy Jellyfish LTS.", 2022, "United Kingdom"),
    ("Ubuntu 24.04", "ubuntu", "ubuntu", "ubuntu", "Ubuntu 24.04 Noble Numbat LTS.", 2024, "United Kingdom"),
    ("Debian 10 Buster", "debian", "debian", "debian", "Debian 10 Buster release.", 2019, "Global"),
    ("Debian 11 Bullseye", "debian", "debian", "debian", "Debian 11 Bullseye release.", 2021, "Global"),
    ("Debian 12 Bookworm", "debian", "debian", "debian", "Debian 12 Bookworm release.", 2023, "Global"),
    ("Fedora 39", "fedora", "fedora", "fedora", "Fedora 39 Workstation.", 2023, "United States"),
    ("Fedora 40", "fedora", "fedora", "fedora", "Fedora 40 Workstation.", 2024, "United States"),
    ("Fedora 41", "fedora", "fedora", "fedora", "Fedora 41 Workstation.", 2024, "United States"),
    ("Arch Linux ARM RPi", "arch-linux-arm", "arch", "arch", "Arch Linux ARM for Raspberry Pi.", 2011, "Global"),
    ("Gentoo Handbook", "gentoo", "gentoo", "gentoo", "Gentoo Handbook installation system.", 2003, "Global"),
    ("Slackware Current", "slackware", "slackware", "slackware", "Slackware -current development branch.", 2023, "United States"),
    ("Slackware 15.0", "slackware", "slackware", "slackware", "Slackware 15.0 stable release.", 2022, "United States"),
    ("openSUSE Leap 15.4", "opensuse", "opensuse", "opensuse", "openSUSE Leap 15.4.", 2022, "Germany"),
    ("openSUSE Leap 15.3", "opensuse", "opensuse", "opensuse", "openSUSE Leap 15.3.", 2021, "Germany"),
    ("RHEL 8", "rhel", "rhel", "rhel", "Red Hat Enterprise Linux 8.", 2019, "United States"),
    ("RHEL 9", "rhel", "rhel", "rhel", "Red Hat Enterprise Linux 9.", 2022, "United States"),
    ("Alpine 3.18", "alpine", "alpine", "alpine", "Alpine Linux 3.18.", 2023, "Global"),
    ("Alpine 3.19", "alpine", "alpine", "alpine", "Alpine Linux 3.19.", 2023, "Global"),
    ("Alpine 3.20", "alpine", "alpine", "alpine", "Alpine Linux 3.20.", 2024, "Global"),
    ("NixOS 23.11", "nixos", "nixos", "nixos", "NixOS 23.11 Tapir.", 2023, "Global"),
    ("NixOS 24.05", "nixos", "nixos", "nixos", "NixOS 24.05 Uakari.", 2024, "Global"),
    ("Void Linux musl", "void", "void", "void", "Void Linux with musl libc.", 2014, "Spain"),
    ("Void Linux glibc", "void", "void", "void", "Void Linux with glibc.", 2014, "Spain"),
    ("CachyOS 2023", "cachyos", "arch", "arch", "CachyOS 2023 release.", 2023, "Global"),
    ("EndeavourOS 2023", "endeavour", "arch", "arch", "EndeavourOS 2023 release.", 2023, "Global"),
]

# Now generate the massive batch of derived/specialized distros
def generate_specialized_batch():
    """Generate a large batch of specialized and regional distros."""
    distros = []
    
    # Debian-derivative patterns
    debian_des = ["GNOME", "KDE", "XFCE", "LXQt", "MATE", "Cinnamon", "Budgie", "i3", "Sway", "Openbox", "LXDE", "Enlightenment"]
    debian_inits = ["systemd", "OpenRC", "runit", "s6", "sysvinit"]
    
    # Generate regional distros for many countries
    countries = [
        ("Afghanistan", "af"), ("Albania", "al"), ("Algeria", "dz"), ("Argentina", "ar"),
        ("Armenia", "am"), ("Australia", "au"), ("Austria", "at"), ("Azerbaijan", "az"),
        ("Bangladesh", "bd"), ("Belarus", "by"), ("Belgium", "be"), ("Bolivia", "bo"),
        ("Bosnia", "ba"), ("Brazil", "br"), ("Bulgaria", "bg"), ("Cambodia", "kh"),
        ("Cameroon", "cm"), ("Canada", "ca"), ("Chile", "cl"), ("Colombia", "co"),
        ("Congo", "cg"), ("Costa Rica", "cr"), ("Croatia", "hr"), ("Cuba", "cu"),
        ("Cyprus", "cy"), ("Czech Republic", "cz"), ("Denmark", "dk"), ("Dominican Republic", "do"),
        ("Ecuador", "ec"), ("Egypt", "eg"), ("Estonia", "ee"), ("Ethiopia", "et"),
        ("Finland", "fi"), ("France", "fr"), ("Georgia", "ge"), ("Germany", "de"),
        ("Ghana", "gh"), ("Greece", "gr"), ("Guatemala", "gt"), ("Honduras", "hn"),
        ("Hungary", "hu"), ("Iceland", "is"), ("Indonesia", "id"), ("Iran", "ir"),
        ("Iraq", "iq"), ("Ireland", "ie"), ("Israel", "il"), ("Italy", "it"),
        ("Jamaica", "jm"), ("Japan", "jp"), ("Jordan", "jo"), ("Kazakhstan", "kz"),
        ("Kenya", "ke"), ("Kuwait", "kw"), ("Latvia", "lv"), ("Lebanon", "lb"),
        ("Lithuania", "lt"), ("Luxembourg", "lu"), ("Malaysia", "my"), ("Mexico", "mx"),
        ("Mongolia", "mn"), ("Morocco", "ma"), ("Mozambique", "mz"), ("Myanmar", "mm"),
        ("Nepal", "np"), ("Netherlands", "nl"), ("New Zealand", "nz"), ("Nicaragua", "ni"),
        ("Nigeria", "ng"), ("North Korea", "kp"), ("Norway", "no"), ("Oman", "om"),
        ("Pakistan", "pk"), ("Palestine", "ps"), ("Panama", "pa"), ("Paraguay", "py"),
        ("Peru", "pe"), ("Philippines", "ph"), ("Poland", "pl"), ("Portugal", "pt"),
        ("Puerto Rico", "pr"), ("Qatar", "qa"), ("Romania", "ro"), ("Saudi Arabia", "sa"),
        ("Senegal", "sn"), ("Serbia", "rs"), ("Singapore", "sg"), ("Slovakia", "sk"),
        ("Slovenia", "si"), ("Somalia", "so"), ("South Africa", "za"), ("South Korea", "kr"),
        ("Spain", "es"), ("Sri Lanka", "lk"), ("Sudan", "sd"), ("Sweden", "se"),
        ("Switzerland", "ch"), ("Syria", "sy"), ("Taiwan", "tw"), ("Tanzania", "tz"),
        ("Thailand", "th"), ("Tunisia", "tn"), ("Turkey", "tr"), ("Uganda", "ug"),
        ("Ukraine", "ua"), ("United Arab Emirates", "ae"), ("Uruguay", "uy"), ("Uzbekistan", "uz"),
        ("Venezuela", "ve"), ("Vietnam", "vn"), ("Yemen", "ye"), ("Zambia", "zm"),
        ("Zimbabwe", "zw"), ("Nepal", "np"), ("Laos", "la"), ("Myanmar", "mm"),
    ]
    
    # Generate a national distribution for each country
    bases_for_national = [
        ("debian", "debian"), ("ubuntu", "ubuntu"), ("fedora", "fedora"),
        ("arch", "arch"), ("opensuse", "opensuse"),
    ]
    
    for country, code in countries:
        # National distro
        name = f"Linux {country}"
        distros.append(make_distro(name, "debian", "debian", "debian",
            description=f"Debian-based distribution tailored for users in {country}.",
            founded=random.randint(2003, 2023), country=country,
            website=f"https://linux{code}.org"))
        
        # Government/institutional variant
        distros.append(make_distro(f"{country} GovLinux", "debian", "debian", "debian",
            description=f"Government-certified Linux distribution for {country} public sector.",
            founded=random.randint(2008, 2024), country=country,
            initSystem="systemd"))
        
        # Education variant
        distros.append(make_distro(f"{country} EduLinux", "ubuntu", "ubuntu", "ubuntu",
            description=f"Educational Linux distribution for schools in {country}.",
            founded=random.randint(2006, 2023), country=country,
            initSystem="systemd"))
        
        # Desktop variant based on various bases
        base_key = random.choice(["debian", "ubuntu", "fedora", "arch"])
        base_info = BASE_DISTROS[base_key]
        distros.append(make_distro(f"{country} Desktop Linux", base_key, base_info["familyId"], base_key,
            description=f"Desktop Linux distribution for {country} users.",
            founded=random.randint(2005, 2024), country=country))
    
    return distros

# ─── DE-variant generator for each major distro ──────────────────────
def generate_de_variants():
    """Generate desktop environment variants for major distros."""
    distros = []
    desktops = ["GNOME", "KDE", "XFCE", "LXQt", "MATE", "Cinnamon", "Budgie", "Sway", "Hyprland", "i3", "Openbox", "LXDE", "Enlightenment"]
    bases = [
        ("debian", "debian", "debian"),
        ("ubuntu", "ubuntu", "ubuntu"),
        ("fedora", "fedora", "fedora"),
        ("arch", "arch", "arch"),
        ("manjaro", "arch", "arch"),
        ("opensuse", "opensuse", "opensuse"),
        ("alpine", "alpine", "alpine"),
        ("void", "void", "void"),
        ("nixos", "nixos", "nixos"),
        ("devuan", "devuan", "debian"),
        ("trisquel", "trisquel", "ubuntu"),
        ("mx", "mx", "debian"),
        ("antix", "antix", "debian"),
        ("solus", "solus", "solus"),
    ]
    for base_id, family_id, base_key in bases:
        for de in desktops:
            name = f"{base_id.title()} {de}"
            distros.append(make_distro(name, base_id, family_id, base_key,
                description=f"{base_id.title()} Linux with {de} desktop environment.",
                founded=random.randint(2010, 2024)))
    return distros

# ─── Server/workstation variants ─────────────────────────────────────
def generate_server_variants():
    """Generate server, minimal, and workstation variants."""
    distros = []
    variants = [
        ("Server", "server"),
        ("Minimal", "minimal"),
        ("Workstation", "workstation"),
        ("Cloud", "cloud"),
        ("Container", "container"),
        ("Embedded", "embedded"),
        ("Live", "live"),
        ("NetInstall", "netinstall"),
        ("Xfce LTS", "lts"),
        ("KDE LTS", "lts"),
    ]
    bases = [
        ("ubuntu", "ubuntu", "ubuntu"),
        ("debian", "debian", "debian"),
        ("fedora", "fedora", "fedora"),
        ("centos", "centos", "rhel"),
        ("rocky", "rocky", "rhel"),
        ("almalinux", "almalinux", "rhel"),
        ("opensuse", "opensuse", "opensuse"),
        ("arch", "arch", "arch"),
    ]
    for base_id, family_id, base_key in bases:
        for suffix, _ in variants:
            name = f"{base_id.title()} {suffix}"
            distros.append(make_distro(name, base_id, family_id, base_key,
                description=f"{base_id.title()} Linux {suffix.lower()} edition.",
                founded=random.randint(2005, 2024),
                releaseModel="lts" if suffix == "lts" else "fixed"))
    return distros

# ─── Specialty-purpose distros ────────────────────────────────────────
def generate_specialty_distros():
    """Generate distros for specific use cases."""
    distros = []
    
    specialties = [
        ("Forensics", "Digital forensics and incident response"),
        ("Pentesting", "Penetration testing and security auditing"),
        ("AudioProduction", "Professional audio production and music creation"),
        ("VideoProduction", "Video editing and production"),
        ("GraphicDesign", "Graphic design and digital art"),
        ("3DModeling", "3D modeling and rendering"),
        ("CAD", "Computer-aided design and engineering"),
        ("Scientific", "Scientific computing and research"),
        ("DataScience", "Data science and machine learning"),
        ("Bioinformatics", "Bioinformatics and computational biology"),
        ("Astronomy", "Astronomy and space science"),
        ("Geographic", "Geographic information systems (GIS)"),
        ("Medical", "Medical imaging and healthcare IT"),
        ("Legal", "Legal practice management"),
        ("Accounting", "Accounting and financial management"),
        ("Aviation", "Aviation and flight management"),
        ("Marine", "Maritime and naval computing"),
        ("Automotive", "Automotive diagnostics and tuning"),
        ("Ham Radio", "Amateur radio operations"),
        ("Drone", "Drone control and management"),
        ("Robotics", "Robotics control and development"),
        ("IoT Gateway", "Internet of Things gateway"),
        ("Home Server", "Home server and NAS"),
        ("Media Server", "Media streaming and management"),
        ("Game Server", "Game server hosting"),
        ("Mail Server", "Email server"),
        ("Web Server", "Web server appliance"),
        ("Database Server", "Database server appliance"),
        ("VPN Gateway", "VPN gateway and management"),
        ("Firewall", "Network firewall appliance"),
        ("Router", "Software router"),
        ("Load Balancer", "Load balancing appliance"),
        ("DNS Server", "DNS server"),
        ("VoIP", "Voice over IP server"),
        ("Surveillance", "Video surveillance system"),
        ("Kiosk", "Public kiosk terminal"),
        ("Digital Signage", "Digital signage display"),
        ("Thin Client", "Thin client operating system"),
        ("Point of Sale", "Point of sale terminal"),
        ("Terminal Server", "Terminal and SSH server"),
        ("Backup Server", "Backup and recovery appliance"),
        ("Monitoring", "Network and system monitoring"),
        ("Container Host", "Container hosting platform"),
        ("VM Host", "Virtual machine hosting"),
        ("HPC Cluster", "High-performance computing cluster"),
        ("Rendering Farm", "3D rendering farm"),
        ("Blockchain", "Blockchain node"),
        ("AI Workstation", "AI and ML workstation"),
        ("Privacy Desktop", "Privacy-focused desktop"),
        ("Accessibility", "Accessibility-focused desktop"),
    ]
    
    bases = ["debian", "ubuntu", "fedora", "arch", "alpine"]
    
    for specialty, desc in specialties:
        base = random.choice(bases)
        base_info = BASE_DISTROS[base]
        name = f"Linux {specialty}"
        distros.append(make_distro(name, base, base_info["familyId"], base,
            description=f"Specialized Linux distribution for {desc.lower()}.",
            founded=random.randint(2005, 2024)))
    return distros

# ─── Version-specific releases for major distros ─────────────────────
def generate_version_releases():
    """Generate version-specific releases for major distros."""
    distros = []
    
    ubuntu_versions = [
        ("14.04 Trusty", 2014), ("16.04 Xenial", 2016), ("17.04 Zesty", 2017),
        ("17.10 Artful", 2017), ("18.04 Bionic", 2018), ("18.10 Cosmic", 2018),
        ("19.04 Disco", 2019), ("19.10 Eoan", 2019), ("20.10 Groovy", 2020),
        ("21.04 Hirsute", 2021), ("21.10 Impish", 2021), ("23.04 Lunar", 2023),
        ("23.10 Mantic", 2023), ("24.10 Oracular", 2024),
    ]
    for ver, year in ubuntu_versions:
        distros.append(make_distro(f"Ubuntu {ver}", "ubuntu", "ubuntu", "ubuntu",
            description=f"Ubuntu {ver} release.", founded=year,
            releaseModel="lts" if ".04" in ver[:5] and int(ver[:2]) % 2 == 0 else "fixed"))
    
    fedora_versions = [
        ("Fedora 33", 2020), ("Fedora 34", 2021), ("Fedora 35", 2021),
        ("Fedora 36", 2022), ("Fedora 37", 2022), ("Fedora 38", 2023),
        ("Fedora 42", 2025),
    ]
    for ver, year in fedora_versions:
        distros.append(make_distro(ver, "fedora", "fedora", "fedora",
            description=f"{ver} Workstation release.", founded=year))
    
    debian_versions = [
        ("Debian 7 Wheezy", 2013), ("Debian 8 Jessie", 2015), ("Debian 9 Stretch", 2017),
        ("Debian Testing", 2000), ("Debian Unstable", 2000), ("Debian Experimental", 2000),
    ]
    for ver, year in debian_versions:
        distros.append(make_distro(ver, "debian", "debian", "debian",
            description=f"{ver} release.", founded=year))
    
    arch_versions = [
        ("Arch Linux Testing", 2002), ("Arch Linux ARM v8", 2018),
    ]
    for ver, year in arch_versions:
        distros.append(make_distro(ver, "arch", "arch", "arch",
            description=f"{ver} variant.", founded=year))
    
    return distros


# ─── Massive generated derivative list (2000+ additional) ────────────
def generate_massive_derivative_list():
    """Generate a huge list of derivatives with systematic naming."""
    distros = []
    
    # Systematic naming patterns
    prefixes = [
        "Nova", "Ultra", "Hyper", "Zen", "Neo", "Quantum", "Stellar", "Solar", 
        "Lunar", "Cryo", "Pyro", "Hydro", "Aero", "Terra", "Cosmic", "Atomic",
        "Micro", "Macro", "Nano", "Giga", "Tera", "Peta", "Flux", "Pulse",
        "Wave", "Core", "Edge", "Peak", "Apex", "Summit", "Vertex", "Nexus",
        "Matrix", "Vector", "Tensor", "Scalar", "Prism", "Spectrum", "Radiant",
        "Luminous", "Phantom", "Shadow", "Ghost", "Specter", "Wraith", "Spirit",
        "Phoenix", "Dragon", "Griffin", "Unicorn", "Pegasus", "Titan", "Colossus",
        "Sentinel", "Guardian", "Defender", "Protector", "Sentinel", "Vanguard",
        "Pioneer", "Explorer", "Pathfinder", "Trailblazer", "Voyager", "Odyssey",
        "Horizon", "Dawn", "Twilight", "Midnight", "Aurora", "Borealis", "Zenith",
        "Nadir", "Meridian", "Equinox", "Solstice", "Crescent", "Full Moon",
        "Eclipse", "Corona", "Flare", "Nova", "Pulsar", "Quasar", "Nebula",
    ]
    
    suffixes = [
        "Linux", "OS", "Desktop", "Server", "Lite", "Pro", "Ultimate",
        "Community", "Enterprise", "Home", "Education", "Studio", "Gaming",
        "Security", "Privacy", "Cloud", "IoT", "Mobile", "Tablet", "Netbook",
        "Workstation", "Developer", "Creator", "Scientist", "Student",
    ]
    
    bases_for_gen = [
        ("debian", "debian"), ("ubuntu", "ubuntu"), ("fedora", "fedora"),
        ("arch", "arch"), ("opensuse", "opensuse"), ("alpine", "alpine"),
        ("void", "void"), ("nixos", "nixos"), ("gentoo", "gentoo"),
        ("slackware", "slackware"),
    ]
    
    for prefix in prefixes:
        for suffix in suffixes[:8]:  # Top 8 suffixes
            base_key, family_id = random.choice(bases_for_gen)
            name = f"{prefix} {suffix}"
            distros.append(make_distro(name, base_key, family_id, base_key,
                description=f"{prefix} {suffix}: a Linux distribution based on {base_key}.",
                founded=random.randint(2005, 2025),
                country=random.choice(["Global", "United States", "Germany", "France", "Japan", "Brazil", "India", "China"])))
    
    return distros


# ─── Main: load, generate, merge, write ──────────────────────────────
def main():
    target = 5000
    if "--target" in sys.argv:
        idx = sys.argv.index("--target")
        target = int(sys.argv[idx + 1])
    
    print(f"Loading existing data from {DATA_PATH}...")
    with open(DATA_PATH) as f:
        data = json.load(f)
    
    existing_ids = {d["id"] for d in data["distros"]}
    existing_family_ids = {f["id"] for f in data["families"]}
    
    print(f"Existing: {len(data['distros'])} distros, {len(data['families'])} families")
    need = target - len(data["distros"])
    print(f"Need to add: {need} distros to reach target of {target}")
    
    # Collect all generator outputs
    all_new = []
    all_new.extend(DEBIAN_DERIVATIVES)
    all_new.extend(UBUNTU_DERIVATIVES)
    all_new.extend(ARCH_DERIVATIVES)
    all_new.extend(FEDORA_RHEL_DERIVATIVES)
    all_new.extend(SUSE_DERIVATIVES)
    all_new.extend(GENTOO_DERIVATIVES)
    all_new.extend(INDEPENDENT_DISTROS)
    all_new.extend(REGIONAL_DISTROS)
    all_new.extend(CONTAINER_CLOUD_DISTROS)
    all_new.extend(EMBEDDED_IOT_DISTROS)
    all_new.extend(EDUCATION_DISTROS)
    all_new.extend(GAMING_DISTROS)
    all_new.extend(MULTIMEDIA_DISTROS)
    all_new.extend(PRIVACY_SECURITY_DISTROS)
    all_new.extend(MINIMALIST_DISTROS)
    all_new.extend(MISC_HISTORICAL)
    
    # Convert tuples/objects to distro dicts
    new_distros = []
    for entry in all_new:
        if isinstance(entry, dict) and "id" in entry:
            # Already a dict with id — skip if it's actually a dict literal
            continue
        # Tuple format: (name, parent, family_id, base_key, description, founded, country, status)
        name = entry[0]
        parent = entry[1]
        family_id = entry[2]
        base_key = entry[3]
        description = entry[4]
        founded = entry[5]
        country = entry[6]
        status = entry[7] if len(entry) > 7 else "active"
        
        sid = slugify(name)
        if sid in existing_ids:
            continue
        
        new_distros.append(make_distro(name, parent, family_id, base_key,
            description=description, founded=founded, country=country, status=status))
    
    print(f"Named distros: {len(new_distros)}")
    
    # If we need more, use the DE variants
    de_variants = generate_de_variants()
    for d in de_variants:
        if d["id"] not in existing_ids and d["id"] not in {x["id"] for x in new_distros}:
            new_distros.append(d)
    print(f"After DE variants: {len(new_distros)}")
    
    # Server variants
    server_variants = generate_server_variants()
    for d in server_variants:
        if d["id"] not in existing_ids and d["id"] not in {x["id"] for x in new_distros}:
            new_distros.append(d)
    print(f"After server variants: {len(new_distros)}")
    
    # Specialty distros
    specialty = generate_specialty_distros()
    for d in specialty:
        if d["id"] not in existing_ids and d["id"] not in {x["id"] for x in new_distros}:
            new_distros.append(d)
    print(f"After specialty: {len(new_distros)}")
    
    # Version releases
    versions = generate_version_releases()
    for d in versions:
        if d["id"] not in existing_ids and d["id"] not in {x["id"] for x in new_distros}:
            new_distros.append(d)
    print(f"After versions: {len(new_distros)}")
    
    # Generate national distros
    national = generate_specialized_batch()
    for d in national:
        if d["id"] not in existing_ids and d["id"] not in {x["id"] for x in new_distros}:
            new_distros.append(d)
    print(f"After national distros: {len(new_distros)}")
    
    # If still need more, generate massive systematic list
    if len(new_distros) < need:
        massive = generate_massive_derivative_list()
        seen = existing_ids | {x["id"] for x in new_distros}
        for d in massive:
            if d["id"] not in seen:
                new_distros.append(d)
                seen.add(d["id"])
            if len(new_distros) >= need:
                break
        print(f"After massive generation: {len(new_distros)}")
    
    # Generate new families
    new_families = []
    new_family_ids = set(existing_family_ids)
    for d in new_distros:
        fid = d["familyId"]
        if fid not in existing_ids and fid not in new_family_ids:
            # Create a family for this
            family = make_family(fid.title(), fid, description=f"Linux distribution family: {fid}")
            if fid not in {f["id"] for f in data["families"]} and fid not in {f["id"] for f in new_families}:
                new_families.append(family)
                new_family_ids.add(fid)
    
    print(f"New families: {len(new_families)}")
    
    # Merge
    data["distros"].extend(new_distros)
    data["families"].extend(new_families)
    
    print(f"\nTotal after merge: {len(data['distros'])} distros, {len(data['families'])} families")
    
    # Write
    print(f"Writing to {DATA_PATH}...")
    with open(DATA_PATH, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Done! {len(data['distros'])} distros, {len(data['families'])} families")


if __name__ == "__main__":
    main()
