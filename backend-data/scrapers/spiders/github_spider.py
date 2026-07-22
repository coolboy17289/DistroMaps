"""
GitHub Spider — Scrapes Linux distribution repositories from GitHub.

Sources:
  - topic:linux-distribution repos
  - README-based distro detection
  - Release/tag monitoring

Output: DistroItem objects passed through validation → dedup → database pipeline.
"""

import os
import re
import scrapy
from scrapers.items import DistroItem


class GitHubSpider(scrapy.Spider):
    name = 'github'
    allowed_domains = ['api.github.com', 'github.com']

    GITHUB_API = 'https://api.github.com'

    QUERIES = [
        'topic:linux-distribution',
        'topic:linux-distro',
        'linux distribution in:readme',
        '"Linux distribution" in:description',
        '"operating system" in:readme "based on"',
        'topic:linux-iso',
        'topic:immutable-linux',
    ]

    # Names that are clearly not distros
    EXCLUDE_NAMES = {
        'packages', 'repo-main', '.github', 'website', 'welcome-app',
        'branding', 'assets', 'icon', 'config', 'dotfiles', 'docs',
        'scripts', 'tools', 'notifier', 'recovery', 'build', 'distro',
        'distro-match', 'linux-iso', 'iso-builder', 'archiso',
        'archlinux-installer', 'termux-packages', 'ci', 'cd',
        'docker', 'container', 'kubernetes', 'ansible',
    }

    custom_settings = {
        'DOWNLOAD_DELAY': 2,
        'CONCURRENT_REQUESTS': 2,
    }

    def start_requests(self):
        """Generate API search requests."""
        token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
        headers = {'Accept': 'application/vnd.github.v3+json'}
        if token:
            headers['Authorization'] = f'token {token}'

        for query in self.QUERIES:
            url = (
                f'{self.GITHUB_API}/search/repositories'
                f'?q={query}&sort=updated&per_page=30&type=repositories'
            )
            yield scrapy.Request(
                url=url,
                headers=headers,
                callback=self.parse_search,
                meta={'query': query},
            )

    def parse_search(self, response):
        """Parse GitHub search results."""
        if response.status == 403:
            self.logger.warning('GitHub rate limit hit')
            return

        try:
            data = response.json()
        except Exception:
            return

        items = data.get('items', [])
        self.logger.info(f'Query "{response.meta["query"]}" returned {len(items)} results')

        for repo in items:
            name = repo.get('name', '')
            description = repo.get('description', '') or ''
            topics = repo.get('topics', [])
            language = repo.get('language', '') or ''

            # Must look like a Linux distribution
            if not self._is_likely_distro(name, description, topics):
                continue

            # Exclude known non-distro names
            name_lower = name.lower()
            if name_lower in self.EXCLUDE_NAMES:
                continue
            if re.search(r'(-packages|-assets|-branding|-website|-docs|-config|-overlay)$', name_lower):
                continue

            slug = re.sub(r'[^a-z0-9]+', '-', name_lower).strip('-')

            # Extract metadata from description
            base_distro = self._guess_base(description, topics)
            package_manager = self._guess_package_manager(description)
            init_system = self._guess_init_system(description)
            desktops = self._guess_desktops(description, topics)

            item = DistroItem(
                name=name,
                description=description[:500],
                base_distro=base_distro,
                package_manager=package_manager,
                init_system=init_system,
                website=repo.get('html_url', ''),
                git_repository=repo.get('html_url', ''),
                source='github',
                source_url=repo.get('html_url', ''),
                confidence=self._score_candidate(name, description, topics),
                desktop_environments=desktops,
            )

            yield item

    def _is_likely_distro(self, name: str, description: str, topics: list) -> bool:
        """Check if a repo is likely a Linux distribution."""
        desc_lower = description.lower()

        # Strong signals
        if any(t in topics for t in ['linux', 'distro', 'distribution', 'operating-system']):
            return True
        if any(phrase in desc_lower for phrase in [
            'linux distribution', 'operating system', 'linux distro',
            'custom linux', 'build linux', 'linux iso',
        ]):
            return True

        # Based on a known distro
        if re.search(r'(based on|derivative of|fork of)', desc_lower):
            if re.search(r'(debian|ubuntu|arch|fedora|rhel|gentoo|alpine|nixos|void|suse|slackware)', desc_lower):
                return True

        return False

    def _score_candidate(self, name: str, description: str, topics: list) -> float:
        """Score a candidate's likelihood of being a real distro."""
        score = 0.2
        desc_lower = description.lower()

        # Strong signals
        if any(t in topics for t in ['linux', 'distro', 'distribution', 'operating-system']):
            score += 0.25
        if re.search(r'(linux distribution|operating system|linux distro)', desc_lower):
            score += 0.25
        if re.search(r'(based on|derivative of|fork of)', desc_lower):
            score += 0.15
        if re.search(r'(debian|ubuntu|arch|fedora|rhel|gentoo|slackware|alpine|nixos|void|suse)', desc_lower):
            score += 0.15

        # Medium signals
        if re.search(r'(install|iso|build|release|download|calamares|installer)', desc_lower):
            score += 0.08
        if re.search(r'(desktop environment|window manager|package manager|init system)', desc_lower):
            score += 0.05
        if len(description) > 80:
            score += 0.05

        return min(score, 1.0)

    def _guess_base(self, description: str, topics: list) -> str:
        """Guess base distribution from description and topics."""
        desc_lower = description.lower()
        all_text = desc_lower + ' ' + ' '.join(topics)

        bases = [
            ('debian', 'Debian'), ('ubuntu', 'Ubuntu'), ('arch', 'Arch'),
            ('fedora', 'Fedora'), ('rhel', 'RHEL'), ('red hat', 'RHEL'),
            ('gentoo', 'Gentoo'), ('slackware', 'Slackware'),
            ('alpine', 'Alpine'), ('suse', 'OpenSUSE'), ('opensuse', 'OpenSUSE'),
            ('void', 'Void'), ('nixos', 'NixOS'), ('centos', 'RHEL'),
        ]
        for keyword, base in bases:
            if keyword in all_text:
                return base
        return 'Independent'

    def _guess_package_manager(self, description: str) -> str:
        """Guess package manager from description."""
        desc_lower = description.lower()
        if 'apt' in desc_lower or 'dpkg' in desc_lower:
            return 'apt/dpkg'
        if 'pacman' in desc_lower:
            return 'pacman'
        if 'dnf' in desc_lower or 'yum' in desc_lower:
            return 'dnf/rpm'
        if 'portage' in desc_lower:
            return 'portage'
        if 'xbps' in desc_lower:
            return 'xbps'
        if 'nix' in desc_lower:
            return 'nix'
        return ''

    def _guess_init_system(self, description: str) -> str:
        """Guess init system from description."""
        desc_lower = description.lower()
        if 'systemd' in desc_lower:
            return 'systemd'
        if 'openrc' in desc_lower:
            return 'OpenRC'
        if 'runit' in desc_lower:
            return 'runit'
        if 's6' in desc_lower:
            return 's6'
        return ''

    def _guess_desktops(self, description: str, topics: list) -> list:
        """Guess desktop environments from description and topics."""
        all_text = description.lower() + ' ' + ' '.join(topics)
        desktops = []
        de_map = [
            ('gnome', 'GNOME'), ('kde', 'KDE'), ('xfce', 'XFCE'),
            ('lxqt', 'LXQt'), ('lxde', 'LXDE'), ('mate', 'MATE'),
            ('cinnamon', 'Cinnamon'), ('budgie', 'Budgie'),
            ('deepin', 'Deepin'), ('pantheon', 'Pantheon'),
            ('sway', 'Sway'), ('hyprland', 'Hyprland'),
            ('i3', 'i3'), ('openbox', 'Openbox'),
        ]
        for keyword, de in de_map:
            if keyword in all_text:
                desktops.append(de)
        return desktops
