"""
DistroWatch Spider — Scrapes distribution data from distrowatch.com.

Sources:
  - Distribution directory (name, status, base, package manager)
  - Recently added distros
  - Weekly news for new releases

Output: DistroItem objects passed through validation → dedup → database pipeline.
"""

import re
import scrapy
from scrapers.items import DistroItem


class DistroWatchSpider(scrapy.Spider):
    name = 'distrowatch'
    allowed_domains = ['distrowatch.com']
    start_urls = [
        'https://distrowatch.com/dwres.php?resource=popularity',
        'https://distrowatch.com/search.php?status=Active',
        'https://distrowatch.com/dwres.php?resource=database',
        'https://distrowatch.com/dwres.php?resource=recent',
    ]

    custom_settings = {
        'DOWNLOAD_DELAY': 3,
        'CONCURRENT_REQUESTS_PER_DOMAIN': 2,
    }

    def parse(self, response):
        """Parse DistroWatch pages for distro listings."""
        # Extract distro links from table rows
        for link in response.css('a[href*="distro="]'):
            name = link.css('::text').get('').strip()
            href = link.attrib.get('href', '')

            if not name or len(name) < 2:
                continue

            # Skip navigation/header links
            if name.lower() in ('distribution', 'news', 'reviews', 'search', 'about', 'home'):
                continue

            # Build distro detail URL
            detail_url = response.urljoin(href)

            yield scrapy.Request(
                url=detail_url,
                callback=self.parse_distro_detail,
                meta={'name': name},
                dont_filter=True,
            )

        # Also extract from table rows directly
        for row in response.css('tr'):
            cells = row.css('td')
            if len(cells) >= 3:
                name_cell = cells[0]
                name_link = name_cell.css('a::text').get('').strip()
                if name_link and len(name_link) > 2:
                    detail_url = response.urljoin(
                        name_cell.css('a::attr(href)').get('')
                    )
                    if detail_url and 'distrowatch.com' in detail_url:
                        yield scrapy.Request(
                            url=detail_url,
                            callback=self.parse_distro_detail,
                            meta={'name': name_link},
                            dont_filter=True,
                        )

    def parse_distro_detail(self, response):
        """Parse individual distro page for metadata."""
        name = response.meta.get('name', '')

        # Extract description from page
        description = ''
        desc_el = response.css('div.text p::text').get('')
        if desc_el:
            description = desc_el.strip()[:500]

        # Try to extract from meta description
        if not description:
            description = response.css('meta[name="description"]::attr(content)').get('')

        # Extract homepage link
        website = ''
        for link in response.css('a'):
            href = link.attrib.get('href', '')
            text = link.css('::text').get('').strip().lower()
            if text in ('homepage', 'website', 'official site'):
                website = href
                break

        # Extract status
        status = 'active'
        page_text = response.css('body').get('').lower()
        if any(w in page_text for w in ('discontinued', 'defunct', 'abandoned', 'no longer maintained')):
            status = 'discontinued'

        # Extract base distribution from description
        base_distro = self._guess_base(description + ' ' + name)

        # Extract package manager
        package_manager = self._guess_package_manager(page_text)

        # Extract init system
        init_system = self._guess_init_system(page_text)

        # Extract release model
        release_model = self._guess_release_model(page_text)

        # Extract country
        country = self._guess_country(page_text, name)

        item = DistroItem(
            name=name,
            description=description[:500] if description else '',
            website=website,
            status=status,
            base_distro=base_distro,
            package_manager=package_manager,
            init_system=init_system,
            release_model=release_model,
            country=country,
            source='distrowatch',
            source_url=response.url,
            confidence=0.7,
        )

        yield item

    def _guess_base(self, text: str) -> str:
        """Guess base distribution from text."""
        text = text.lower()
        bases = [
            ('debian', 'Debian'), ('ubuntu', 'Ubuntu'), ('arch', 'Arch'),
            ('fedora', 'Fedora'), ('rhel', 'RHEL'), ('red hat', 'RHEL'),
            ('gentoo', 'Gentoo'), ('slackware', 'Slackware'),
            ('alpine', 'Alpine'), ('suse', 'OpenSUSE'), ('opensuse', 'OpenSUSE'),
            ('void', 'Void'), ('nixos', 'NixOS'), ('centos', 'RHEL'),
        ]
        for keyword, base in bases:
            if keyword in text and ('based on' in text or 'derivative' in text or 'fork' in text):
                return base
        return 'Independent'

    def _guess_package_manager(self, text: str) -> str:
        """Guess package manager from text."""
        if 'apt' in text or 'dpkg' in text:
            return 'apt/dpkg'
        if 'pacman' in text:
            return 'pacman'
        if 'dnf' in text or 'yum' in text or 'rpm' in text:
            return 'dnf/rpm'
        if 'portage' in text:
            return 'portage'
        if 'xbps' in text:
            return 'xbps'
        if 'slackpkg' in text:
            return 'slackpkg'
        if 'nix' in text:
            return 'nix'
        return ''

    def _guess_init_system(self, text: str) -> str:
        """Guess init system from text."""
        if 'systemd' in text:
            return 'systemd'
        if 'openrc' in text:
            return 'OpenRC'
        if 'runit' in text:
            return 'runit'
        if 's6' in text:
            return 's6'
        if 'sysvinit' in text or 'init.d' in text:
            return 'sysvinit'
        return ''

    def _guess_release_model(self, text: str) -> str:
        """Guess release model from text."""
        if 'rolling release' in text or 'rolling-release' in text:
            return 'rolling'
        if 'fixed release' in text or 'point release' in text:
            return 'fixed'
        if 'lts' in text or 'long-term' in text:
            return 'lts'
        if 'semi-rolling' in text or 'half-rolling' in text:
            return 'semi-rolling'
        return ''

    def _guess_country(self, text: str, name: str) -> str:
        """Guess country from text or name."""
        countries = [
            ('chinese', 'China'), ('japanese', 'Japan'), ('russian', 'Russia'),
            ('german', 'Germany'), ('french', 'France'), ('italian', 'Italy'),
            ('spanish', 'Spain'), ('indian', 'India'), ('brazilian', 'Brazil'),
            ('dutch', 'Netherlands'), ('polish', 'Poland'), ('turkish', 'Turkey'),
            ('american', 'United States'), ('british', 'United Kingdom'),
            ('czech', 'Czech Republic'), ('swedish', 'Sweden'), ('finnish', 'Finland'),
        ]
        combined = (text + ' ' + name.lower())
        for keyword, country in countries:
            if keyword in combined:
                return country
        return ''
