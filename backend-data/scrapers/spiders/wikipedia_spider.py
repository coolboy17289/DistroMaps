"""
Wikipedia Spider — Scrapes Linux distribution data from Wikipedia.

Sources:
  - Linux distribution categories
  - Per-distro infobox data
  - Derivative relationships

Output: DistroItem objects passed through validation → dedup → database pipeline.
"""

import re
import scrapy
from scrapers.items import DistroItem


class WikipediaSpider(scrapy.Spider):
    name = 'wikipedia'
    allowed_domains = ['en.wikipedia.org']

    CATEGORIES = [
        'Category:Linux_distributions',
        'Category:Debian_derivatives',
        'Category:Ubuntu_derivatives',
        'Category:Arch_Linux_derivatives',
        'Category:Fedora_Linux_derivatives',
        'Category:Red_Hat_Enterprise_Linux_derivatives',
        'Category:Slackware-based_distributions',
        'Category:Gentoo-based_distributions',
        'Category:Rolling-release_Linux_distributions',
        'Category:Lightweight_Linux_distributions',
        'Category:Security-oriented_Linux_distributions',
        'Category:Source-based_Linux_distributions',
    ]

    start_urls = [
        f'https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle={cat}&cmlimit=500&cmtype=page&format=json&origin=*'
        for cat in CATEGORIES
    ]

    custom_settings = {
        'DOWNLOAD_DELAY': 0.5,
        'CONCURRENT_REQUESTS': 4,
    }

    def parse(self, response):
        """Parse Wikipedia category membership."""
        data = response.json()
        members = data.get('query', {}).get('categorymembers', [])

        for member in members:
            title = member.get('title', '')

            # Skip non-distro pages
            if any(skip in title.lower() for skip in [
                'category:', 'template:', 'portal:', 'wikipedia:',
                'list of', 'comparison of', 'usage share',
            ]):
                continue

            # Fetch the article page for infobox data
            article_url = (
                f'https://en.wikipedia.org/w/api.php?action=query'
                f'&titles={title.replace(" ", "_")}'
                f'&prop=revisions&rvprop=content&rvsection=0&rvslots=main'
                f'&format=json&origin=*'
            )

            yield scrapy.Request(
                url=article_url,
                callback=self.parse_article,
                meta={'title': title},
            )

        # Handle pagination
        continue_url = data.get('continue', {}).get('cmcontinue')
        if continue_url:
            yield scrapy.Request(
                url=response.url + f'&cmcontinue={continue_url}',
                callback=self.parse,
            )

    def parse_article(self, response):
        """Parse Wikipedia article infobox for distro metadata."""
        title = response.meta.get('title', '')
        data = response.json()

        pages = data.get('query', {}).get('pages', {})
        page = next(iter(pages.values()), {})
        revisions = page.get('revisions', [])

        if not revisions:
            return

        content = revisions[0].get('slots', {}).get('main', {}).get('*', '')

        if not content or len(content) < 100:
            return

        # Must look like a Linux distribution
        content_lower = content.lower()
        if not any(kw in content_lower for kw in [
            'linux', 'distribution', 'operating system', 'gnu/linux',
            'based on', 'derivative', 'fork',
        ]):
            return

        # Extract infobox fields
        name = title.replace('_', ' ').replace(' (operating system)', '').replace(' (OS)', '')
        description = self._extract_description(content)
        base_distro = self._extract_field(content, ['based_on', 'based', 'derivative'])
        package_manager = self._extract_field(content, ['package_manager', 'package manager'])
        init_system = self._extract_field(content, ['init', 'init_system'])
        release_model = self._extract_field(content, ['release_model', 'update'])
        license_val = self._extract_field(content, ['license'])
        country = self._extract_field(content, ['country', 'language'])
        website = self._extract_field(content, ['website'])
        founded = self._extract_year(content)

        # Build Wikipedia URL
        wiki_url = f'https://en.wikipedia.org/wiki/{title.replace(" ", "_")}'

        item = DistroItem(
            name=name,
            description=description[:500] if description else '',
            base_distro=self._normalize_base(base_distro) if base_distro else 'Independent',
            package_manager=self._normalize_package_manager(package_manager) if package_manager else '',
            init_system=self._normalize_init_system(init_system) if init_system else '',
            release_model=self._normalize_release_model(release_model) if release_model else '',
            license=license_val[:60] if license_val else '',
            country=self._normalize_country(country) if country else '',
            founded=founded,
            website=website if website and website.startswith('http') else '',
            wikipedia=wiki_url,
            source='wikipedia',
            source_url=wiki_url,
            confidence=0.8,
        )

        yield item

    def _extract_description(self, wikitext: str) -> str:
        """Extract first paragraph description from wikitext."""
        # Find text between first <ref> and second paragraph
        lines = wikitext.split('\n')
        desc_parts = []
        for line in lines:
            if line.startswith('|') or line.startswith('{') or line.startswith('}'):
                continue
            if line.strip():
                # Clean wikitext markup
                cleaned = re.sub(r'\[\[([^|\]]*\|)?([^\]]+)\]\]', r'\2', line)
                cleaned = re.sub(r'\{\{[^}]+\}\}', '', cleaned)
                cleaned = re.sub(r'<[^>]+>', '', cleaned)
                cleaned = re.sub(r"'''?", '', cleaned)
                cleaned = cleaned.strip()
                if cleaned and len(cleaned) > 20:
                    desc_parts.append(cleaned)
                    if len(' '.join(desc_parts)) > 300:
                        break
        return ' '.join(desc_parts)[:500]

    def _extract_field(self, wikitext: str, field_names: list) -> str:
        """Extract a field value from wikitext infobox."""
        for field in field_names:
            pattern = rf'\|\s*{re.escape(field)}\s*=\s*([^\n|]+)'
            match = re.search(pattern, wikitext, re.IGNORECASE)
            if match:
                value = match.group(1).strip()
                # Clean wikitext markup
                value = re.sub(r'\[\[([^|\]]*\|)?([^\]]+)\]\]', r'\2', value)
                value = re.sub(r'\{\{[^}]+\}\}', '', value)
                value = re.sub(r"'''?", '', value)
                return value.strip()
        return ''

    def _extract_year(self, wikitext: str) -> int:
        """Extract founding year from wikitext."""
        patterns = [
            r'release_date\s*=\s*\{\{(?:start)?\|(\d{4})',
            r'first_release_date\s*=\s*(\d{4})',
            r'release_date\s*=\s*(\d{4})',
        ]
        for pat in patterns:
            match = re.search(pat, wikitext, re.IGNORECASE)
            if match:
                year = int(match.group(1))
                if 1991 <= year <= 2026:
                    return year
        return 0

    def _normalize_base(self, base: str) -> str:
        """Normalize base distribution name."""
        base_lower = base.lower()
        mapping = {
            'debian': 'Debian', 'ubuntu': 'Ubuntu', 'arch': 'Arch',
            'fedora': 'Fedora', 'rhel': 'RHEL', 'red hat': 'RHEL',
            'gentoo': 'Gentoo', 'slackware': 'Slackware',
            'alpine': 'Alpine', 'suse': 'OpenSUSE', 'opensuse': 'OpenSUSE',
            'void': 'Void', 'nixos': 'NixOS', 'centos': 'RHEL',
            'mandriva': 'Mandriva', 'pclinuxos': 'PCLinuxOS',
            'crux': 'CRUX', 'solus': 'Solus',
        }
        for key, value in mapping.items():
            if key in base_lower:
                return value
        return 'Independent'

    def _normalize_package_manager(self, pm: str) -> str:
        """Normalize package manager name."""
        pm_lower = pm.lower()
        if 'apt' in pm_lower or 'dpkg' in pm_lower:
            return 'apt/dpkg'
        if 'pacman' in pm_lower:
            return 'pacman'
        if 'dnf' in pm_lower or 'yum' in pm_lower:
            return 'dnf/rpm'
        if 'portage' in pm_lower:
            return 'portage'
        if 'xbps' in pm_lower:
            return 'xbps'
        if 'slackpkg' in pm_lower:
            return 'slackpkg'
        if 'nix' in pm_lower:
            return 'nix'
        if 'eopkg' in pm_lower:
            return 'eopkg'
        if 'guix' in pm_lower:
            return 'guix'
        return pm[:50] if pm else ''

    def _normalize_init_system(self, init: str) -> str:
        """Normalize init system name."""
        init_lower = init.lower()
        if 'systemd' in init_lower:
            return 'systemd'
        if 'openrc' in init_lower:
            return 'OpenRC'
        if 'runit' in init_lower:
            return 'runit'
        if 's6' in init_lower:
            return 's6'
        if 'sysvinit' in init_lower:
            return 'sysvinit'
        return init[:30] if init else ''

    def _normalize_release_model(self, model: str) -> str:
        """Normalize release model."""
        model_lower = model.lower()
        if 'rolling' in model_lower:
            return 'rolling'
        if 'fixed' in model_lower or 'point' in model_lower:
            return 'fixed'
        if 'lts' in model_lower:
            return 'lts'
        if 'semi-rolling' in model_lower:
            return 'semi-rolling'
        return model[:30] if model else ''

    def _normalize_country(self, country: str) -> str:
        """Normalize country name."""
        country_lower = country.lower()
        mapping = {
            'chinese': 'China', 'japanese': 'Japan', 'russian': 'Russia',
            'german': 'Germany', 'french': 'France', 'italian': 'Italy',
            'spanish': 'Spain', 'indian': 'India', 'brazilian': 'Brazil',
            'dutch': 'Netherlands', 'polish': 'Poland', 'turkish': 'Turkey',
            'american': 'United States', 'british': 'United Kingdom',
            'czech': 'Czech Republic', 'swedish': 'Sweden', 'finnish': 'Finland',
            'canadian': 'Canada', 'australian': 'Australia',
        }
        for key, value in mapping.items():
            if key in country_lower:
                return value
        return country[:50] if country else ''
