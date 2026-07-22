"""
Wikipedia spider — discovers Linux distributions via MediaWiki API.

Crawls Wikipedia categories to find distro pages, then extracts
structured metadata from infobox wikitext.
"""

import re
import scrapy
from scrapers.items import DistroItem, slugify


WIKI_API = 'https://en.wikipedia.org/w/api.php'

CATEGORIES = [
    'Category:Linux distributions',
    'Category:Debian derivatives',
    'Category:Ubuntu derivatives',
    'Category:Arch Linux derivatives',
    'Category:Fedora Linux derivatives',
    'Category:Red Hat Enterprise Linux derivatives',
    'Category:Slackware-based distributions',
    'Category:Gentoo-based distributions',
    'Category:Mobile operating systems',
    'Category:Embedded Linux distributions',
    'Category:Lightweight Linux distributions',
    'Category:Security-oriented Linux distributions',
    'Category:Rolling-release Linux distributions',
]


class WikipediaSpider(scrapy.Spider):
    name = 'wikipedia'
    allowed_domains = ['en.wikipedia.org']

    custom_settings = {
        'DOWNLOAD_DELAY': 1.5,
        'CONCURRENT_REQUESTS_PER_DOMAIN': 2,
    }

    def start_requests(self):
        for category in CATEGORIES:
            url = (
                f"{WIKI_API}?action=query&format=json"
                f"&list=categorymembers&cmtitle={category}"
                f"&cmlimit=max&cmtype=page&origin=*"
            )
            yield scrapy.Request(url, callback=self.parse_category, meta={'category': category})

    def parse_category(self, response):
        """Parse category member list and follow each page."""
        import json
        data = json.loads(response.text)
        members = data.get('query', {}).get('categorymembers', [])

        for m in members:
            title = m.get('title', '')
            if re.match(r'^(Category:|Template:|Portal:|Wikipedia:|List of|Comparison of)', title):
                continue
            # Fetch wikitext for infobox extraction
            wikitext_url = (
                f"{WIKI_API}?action=query&format=json"
                f"&prop=revisions&titles={title.replace(' ', '_')}"
                f"&rvprop=content&rvsection=0&rvslots=main&origin=*"
            )
            yield scrapy.Request(
                wikitext_url,
                callback=self.parse_wikitext,
                meta={'title': title, 'category': response.meta['category']},
            )

    def parse_wikitext(self, response):
        """Extract distro metadata from Wikipedia infobox wikitext."""
        import json
        data = json.loads(response.text)
        pages = data.get('query', {}).get('pages', {})
        page = next(iter(pages.values()), {})
        wikitext = page.get('revisions', [{}])[0].get('slots', {}).get('main', {}).get('*', '')

        if not wikitext or len(wikitext) < 100:
            return

        title = response.meta['title']

        # Must look like a Linux distro
        if not re.search(r'(operating system|distribution|linux|gnu/linux)', wikitext, re.I):
            if not re.search(r'(based on|derivative|fork of).*(debian|ubuntu|arch|fedora|rhel|slackware|gentoo)', wikitext, re.I):
                return

        item = DistroItem()
        item['name'] = title.replace('_', ' ')
        # Clean up common Wikipedia title suffixes
        item['name'] = re.sub(r'\s*\(operating system\)\s*$', '', item['name'])
        item['name'] = re.sub(r'\s*\(OS\)\s*$', '', item['name'])
        item['id'] = slugify(item['name'])
        item['source'] = 'wikipedia'
        item['source_url'] = f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}"
        item['confidence'] = 0.65

        # Extract fields from wikitext infobox
        def field(key):
            m = re.search(rf'(?:^|\n)\s*\|\s*{key}\s*=\s*([^\n|]+)', wikitext, re.I)
            if m:
                return m.group(1).strip().replace('[[', '').replace(']]', '').replace("'''", '')
            return None

        # Version
        version = field('latest_release_version')
        if version:
            item['version'] = version

        # Package manager
        pkg = field('package_manager')
        if pkg:
            item['package_manager'] = pkg

        # Init system
        init = field('init') or field('init_system')
        if init:
            item['init_system'] = init

        # Architecture
        arch = field('architecture')
        if arch:
            item['architecture'] = [a.strip() for a in re.split(r'[,;]', arch) if a.strip()]

        # Desktop environments
        de = field('desktop') or field('desktop_environment')
        if de:
            item['desktop_environments'] = [d.strip() for d in re.split(r'[,;/]', de) if d.strip()]

        # License
        license_val = field('license')
        if license_val:
            item['license'] = license_val[:60]

        # Website
        website = field('website')
        if website and website.startswith('http'):
            item['website'] = website

        # Country
        country = field('country')
        if country:
            item['country'] = country

        # Release model
        release = field('release_model') or field('update')
        if release:
            if re.search(r'rolling', release, re.I):
                item['release_model'] = 'rolling'
            elif re.search(r'fixed|point', release, re.I):
                item['release_model'] = 'fixed'
            elif re.search(r'lts|long.term', release, re.I):
                item['release_model'] = 'lts'

        # Founded
        release_date = field('release_date') or field('first_release_date')
        if release_date:
            year_match = re.search(r'(\d{4})', release_date)
            if year_match:
                y = int(year_match.group(1))
                if 1991 <= y <= 2026:
                    item['founded'] = y

        # Based on
        base = field('based_on')
        if base:
            item['base_distro'] = base

        # Wikipedia link
        item['wikipedia'] = item['source_url']

        # Status
        if re.search(r'discontinued|defunct|abandoned', wikitext, re.I):
            item['status'] = 'discontinued'
        else:
            item['status'] = 'active'

        yield item
