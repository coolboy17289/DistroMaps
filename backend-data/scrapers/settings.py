"""
Scrapy settings for DistroMap scrapers.

Designed for polite, rate-limited crawling of Linux distro data sources.
"""

BOT_NAME = 'distromap'
SPIDER_MODULES = ['scrapers.spiders']
NEWSPIDER_MODULE = 'scrapers.spiders'

# Respect robots.txt
ROBOTSTXT_OBEY = True

# Rate limiting — be polite
DOWNLOAD_DELAY = 2.0
RANDOMIZE_DOWNLOAD_DELAY = True
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 2

# User agent rotation
USER_AGENT = 'DistroMap/1.0 (+https://distromap.io; research)'

# Retry configuration
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# Timeout
DOWNLOAD_TIMEOUT = 30

# Cache (reduces load on repeated development runs)
HTTPCACHE_ENABLED = True
HTTPCACHE_EXPIRATION_SECS = 3600
HTTPCACHE_DIR = '.scrapy/cache'

# Pipelines
ITEM_PIPELINES = {
    'scrapers.pipelines.ValidationPipeline': 100,
    'scrapers.pipelines.DeduplicationPipeline': 200,
    'scrapers.pipelines.DatabasePipeline': 300,
}

# Logging
LOG_LEVEL = 'INFO'
LOG_FORMAT = '%(asctime)s [%(name)s] %(levelname)s: %(message)s'

# Feed export
FEEDS = {
    'output/crawl_%(time)s.jsonl': {
        'format': 'jsonlines',
        'encoding': 'utf-8',
    },
}

# Playwright integration (for JavaScript-heavy sites)
DOWNLOAD_HANDLERS = {
    'http': 'scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler',
    'https': 'scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler',
}
TWISTED_REACTOR = 'twisted.internet.asyncioreactor.AsyncioSelectorReactor'

# Database connection (read from environment)
import os
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgres://distromap:changeme@localhost:5432/distromap')
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
API_INTERNAL_URL = os.environ.get('API_INTERNAL_URL', 'http://localhost:3001/api/internal')
