"""
RSS Spider — Scrapes Linux news feeds for distro announcements.

Sources:
  - DistroWatch Weekly
  - Phoronix
  - LWN.net
  - It's FOSS News

Output: DistroItem objects passed through validation → dedup → database pipeline.
"""

import re
import scrapy
from scrapers.items import DistroItem


class RssSpider(scrapy.Spider):
    name = 'rss'
    allowed_domains = [
        'distrowatch.com', 'phoronix.com', 'lwn.net', 'news.itsfoss.com',
    ]

    FEEDS = [
        ('DistroWatch Weekly', 'https://distrowatch.com/news/dw.xml'),
        ('Phoronix', 'https://www.phoronix.com/rss.php'),
        ('LWN.net', 'https://lwn.net/headlines/newrss'),
        ("It's FOSS News", 'https://news.itsfoss.com/feed/'),
    ]

    custom_settings = {
        'DOWNLOAD_DELAY': 2,
        'CONCURRENT_REQUESTS': 2,
    }

    def start_requests(self):
        """Generate requests for RSS feeds."""
        for name, url in self.FEEDS:
            yield scrapy.Request(
                url=url,
                callback=self.parse_rss,
                meta={'feed_name': name},
            )

    def parse_rss(self, response):
        """Parse RSS/Atom feed for distro announcements."""
        feed_name = response.meta.get('feed_name', '')
        xml_text = response.text

        # Extract items from RSS XML
        items = re.findall(r'<item>[\s\S]*?</item>', xml_text, re.IGNORECASE)

        for item_xml in items:
            title = self._extract_tag(item_xml, 'title')
            description = self._extract_tag(item_xml, 'description')
            link = self._extract_tag(item_xml, 'link')

            if not title:
                continue

            combined_text = f'{title} {description}'

            # Look for distro release announcements
            distro_name = self._extract_distro_name(combined_text)
            if not distro_name:
                continue

            # Skip known false positives
            if len(distro_name) < 3 or len(distro_name) > 60:
                continue
            if distro_name.lower() in ('the', 'a', 'an', 'new', 'updated', 'latest'):
                continue

            slug = re.sub(r'[^a-z0-9]+', '-', distro_name.lower()).strip('-')

            item = DistroItem(
                name=distro_name,
                description=description[:500] if description else '',
                source='rss-feed',
                source_url=link or response.url,
                confidence=self._score_rss_candidate(distro_name, combined_text),
            )

            yield item

    def _extract_tag(self, xml: str, tag: str) -> str:
        """Extract content from an XML tag, handling CDATA."""
        pattern = rf'<{tag}[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{tag}>'
        match = re.search(pattern, xml, re.IGNORECASE | re.DOTALL)
        if match:
            content = match.group(1).strip()
            # Strip HTML tags
            content = re.sub(r'<[^>]+>', '', content)
            return content
        return ''

    def _extract_distro_name(self, text: str) -> str:
        """Extract distro name from announcement text."""
        patterns = [
            r'(.+?)\s+\d+[\d.]*\s+(?:released|announced|launches|now available)',
            r'(.+?)\s+(?:Linux|OS|Distribution)\s+\d+[\d.]*\s+(?:released|announced)',
            r'(?:New|Updated)\s+(.+?)\s+(?:release|version|edition)',
            r'(.+?)\s+(?:Linux|OS)\s+(?:distribution|distro)\s+(?:released|launches)',
        ]
        for pat in patterns:
            match = re.search(pat, text, re.IGNORECASE)
            if match:
                name = match.group(1).strip()
                # Clean up
                name = re.sub(r'^(the|a|an|new|updated|latest)\s+', '', name, flags=re.IGNORECASE)
                if 3 < len(name) < 60:
                    return name
        return ''

    def _score_rss_candidate(self, name: str, text: str) -> float:
        """Score an RSS candidate."""
        score = 0.3
        text_lower = text.lower()

        if re.search(r'\b(linux|distro|distribution|os)\b', name, re.IGNORECASE):
            score += 0.2
        if re.search(r'\b(released|announces|launches|now available)\b', text_lower):
            score += 0.15
        if re.search(r'(version|release|update|install|download)', text_lower):
            score += 0.1
        if re.search(r'\b(debian|ubuntu|arch|fedora|gentoo)\b', text_lower):
            score += 0.1

        return min(score, 1.0)
