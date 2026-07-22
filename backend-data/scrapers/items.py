"""
Scrapy items for DistroMap data collection.

Each item represents a normalized distro record that passes through
validation → deduplication → database insertion.
"""

import scrapy


class DistroItem(scrapy.Item):
    """A Linux distribution discovered by a scraper."""

    # Identity
    id = scrapy.Field()              # stable slug: "ubuntu", "fedora"
    name = scrapy.Field()            # display name: "Ubuntu", "Fedora Linux"
    description = scrapy.Field()     # short description

    # Lineage
    base_distro = scrapy.Field()     # "Debian", "Arch", "Independent"
    family_id = scrapy.Field()       # maps to entities table

    # Status
    status = scrapy.Field()          # "active" or "discontinued"
    founded = scrapy.Field()         # year: 2004
    discontinued_at = scrapy.Field() # year
    country = scrapy.Field()

    # Technical
    package_manager = scrapy.Field() # "apt/dpkg", "pacman"
    init_system = scrapy.Field()     # "systemd", "OpenRC"
    release_model = scrapy.Field()   # "rolling", "fixed", "lts"
    license = scrapy.Field()
    version = scrapy.Field()         # "24.04"
    architecture = scrapy.Field()    # ["x86_64", "aarch64"]
    desktop_environments = scrapy.Field()  # ["GNOME", "KDE"]

    # Links
    website = scrapy.Field()
    wikipedia = scrapy.Field()
    download_url = scrapy.Field()
    iso_checksum = scrapy.Field()
    git_repository = scrapy.Field()
    doc_url = scrapy.Field()

    # Provenance
    source = scrapy.Field()          # "distrowatch", "wikipedia", "github"
    source_url = scrapy.Field()
    confidence = scrapy.Field()      # 0.0 - 1.0
