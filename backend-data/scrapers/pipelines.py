"""
Scrapy pipelines for DistroMap data processing.

Pipeline chain:
  ValidationPipeline  → ensures required fields, normalizes values
  DeduplicationPipeline → checks against existing database
  DatabasePipeline    → upserts into PostgreSQL via the backend API
"""

import os
import re
import json
import logging
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

API_INTERNAL_URL = os.environ.get('API_INTERNAL_URL', 'http://localhost:3001/api/internal')


def slugify(name: str) -> str:
    """Convert a display name to a stable slug."""
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = s.strip('-')
    return s


class ValidationPipeline:
    """Validate and normalize scraped items."""

    # Required fields for a valid distro
    REQUIRED = ('name',)
    # Fields that must be non-empty strings
    STRING_FIELDS = ('name', 'description', 'country', 'license', 'website', 'wikipedia')
    # Known enum values
    STATUS_VALUES = {'active', 'discontinued'}
    RELEASE_VALUES = {'rolling', 'fixed', 'semi-rolling', 'half-rolling', 'lts', 'static'}

    def process_item(self, item, spider):
        # Auto-generate id if missing
        if not item.get('id'):
            item['id'] = slugify(item['name'])

        # Validate required fields
        for field in self.REQUIRED:
            if not item.get(field):
                raise ValueError(f"Missing required field: {field}")

        # Validate id format
        if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$', item['id']):
            raise ValueError(f"Invalid slug format: {item['id']}")

        # Normalize status
        status = (item.get('status') or 'active').lower().strip()
        if status not in self.STATUS_VALUES:
            status = 'active'
        item['status'] = status

        # Normalize release_model
        if item.get('release_model'):
            rm = item['release_model'].lower().strip()
            if rm in self.RELEASE_VALUES:
                item['release_model'] = rm
            else:
                item['release_model'] = None

        # Normalize architecture to list
        arch = item.get('architecture')
        if isinstance(arch, str):
            item['architecture'] = [a.strip() for a in arch.split(',') if a.strip()]
        elif not isinstance(arch, list):
            item['architecture'] = []

        # Normalize desktop_environments to list
        de = item.get('desktop_environments')
        if isinstance(de, str):
            item['desktop_environments'] = [d.strip() for d in de.split(',') if d.strip()]
        elif not isinstance(de, list):
            item['desktop_environments'] = []

        # Set confidence default
        if not item.get('confidence'):
            item['confidence'] = 0.7

        # Set provenance
        if not item.get('source'):
            item['source'] = spider.name

        return item


class DeduplicationPipeline:
    """Check if the distro already exists in the database."""

    def __init__(self):
        self.seen = set()

    def open_spider(self, spider):
        # Load existing IDs from the API
        try:
            resp = requests.get(f"{API_INTERNAL_URL.replace('/internal', '')}/api/graph", timeout=30)
            if resp.ok:
                data = resp.json()
                for node in data.get('nodes', []):
                    self.seen.add(node['id'])
                logger.info(f"Loaded {len(self.seen)} existing entity IDs")
        except Exception as e:
            logger.warning(f"Could not load existing IDs: {e}")

    def process_item(self, item, spider):
        item_id = item['id']

        if item_id in self.seen:
            logger.debug(f"Duplicate: {item_id} — will update")
            item['_is_update'] = True
        else:
            item['_is_update'] = False
            self.seen.add(item_id)

        return item


class DatabasePipeline:
    """Upsert items into PostgreSQL via the backend API."""

    def open_spider(self, spider):
        self.stats = {'inserted': 0, 'updated': 0, 'errors': 0}

    def close_spider(self, spider):
        logger.info(f"Pipeline stats: {self.stats}")

    def process_item(self, item, spider):
        payload = {
            'id': item['id'],
            'name': item['name'],
            'description': item.get('description'),
            'website': item.get('website'),
            'wikipedia': item.get('wikipedia'),
            'status': item.get('status', 'active'),
            'founded': item.get('founded'),
            'country': item.get('country'),
            'version': item.get('version'),
            'releaseModel': item.get('release_model'),
            'license': item.get('license'),
            'downloadUrl': item.get('download_url'),
            'isoChecksum': item.get('iso_checksum'),
            'parent': item.get('base_distro'),
            'familyId': item.get('family_id'),
            'confidence': item.get('confidence', 0.7),
            'metadata': {
                'source': item.get('source'),
                'source_url': item.get('source_url'),
                'git_repository': item.get('git_repository'),
                'doc_url': item.get('doc_url'),
                'architecture': item.get('architecture', []),
                'desktop_environments': item.get('desktop_environments', []),
            },
        }

        try:
            resp = requests.post(
                f"{API_INTERNAL_URL}/ingest",
                json=payload,
                timeout=15,
            )
            if resp.ok:
                if item.get('_is_update'):
                    self.stats['updated'] += 1
                else:
                    self.stats['inserted'] += 1
            else:
                logger.error(f"Ingest failed for {item['id']}: {resp.status_code} {resp.text[:200]}")
                self.stats['errors'] += 1
        except Exception as e:
            logger.error(f"Ingest error for {item['id']}: {e}")
            self.stats['errors'] += 1

        return item
