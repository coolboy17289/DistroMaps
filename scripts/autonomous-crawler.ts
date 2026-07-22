#!/usr/bin/env tsx
/**
 * autonomous-crawler.ts — Autonomous, self-learning Linux distro discovery engine.
 *
 * Pipeline:
 *   Pattern Learning → Query Expansion → Multi-Source Crawl →
 *   Metadata Extraction → Validation & Dedup → Ingestion → Report
 *
 * Sources:
 *   - Wikipedia API (Linux distro categories)
 *   - DistroWatch (weekly/current distribution lists)
 *   - GitHub search (readme-based distro detection)
 *   - RSS/Atom feeds (Linux news & release announcements)
 *   - Generic web search (DuckDuckGo instant answers)
 *
 * Usage:
 *   npx tsx scripts/autonomous-crawler.ts                   # dry-run
 *   npx tsx scripts/autonomous-crawler.ts --apply           # auto-ingest
 *   npx tsx scripts/autonomous-crawler.ts --sources wiki,gh  # limit sources
 *   npx tsx scripts/autonomous-crawler.ts --cron            # cron-friendly mode
 *   npx tsx scripts/autonomous-crawler.ts --reset-trust     # reset trust scores
 *
 * Flags:
 *   --apply            Auto-merge high-confidence findings into data/distros.json
 *   --sources S1,S2    Comma-separated: wiki,distrowatch,gh,rss,web (default: all)
 *   --min-score N      Minimum confidence threshold (default 0.65)
 *   --cron             Quiet mode for cron jobs (JSON report to stdout)
 *   --no-crawl         Pattern analysis only (skip crawl)
 *   --reset-trust      Reset all source trust scores to neutral
 *   --trust-path FILE  Override trust scores save path
 *   --output FILE      Override output JSON path
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  SourceData, SourceFamily, SourceDistro,
  DiscoveredDistro, DiscoverySource, SourceTrustRecord,
  SearchQuery, BaseDistro, DistroArch, DistroDesktop,
  CrawlReport,
} from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_PATH = resolve(ROOT, 'data/distros.json');
const DEFAULT_OUTPUT = resolve(ROOT, 'data/crawl-results.json');
const TRUST_PATH = resolve(ROOT, 'data/source-trust.json');
const UA = 'DistroMap/0.2 AutonomousCrawler (https://github.com/DistroMap; research)';

/* ========================================================================= */
/*  Section 1: Source Registry & Trust Management                             */
/* ========================================================================= */

const DEFAULT_TRUST_RECORDS: SourceTrustRecord[] = [
  { sourceId: 'wikipedia',   sourceType: 'wikipedia',   displayName: 'Wikipedia API',          successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.95 },
  { sourceId: 'distrowatch', sourceType: 'distrowatch', displayName: 'DistroWatch',            successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.90 },
  { sourceId: 'github',      sourceType: 'github',      displayName: 'GitHub Search',           successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.55 },
  { sourceId: 'gitlab',      sourceType: 'gitlab',      displayName: 'GitLab Explore',          successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.50 },
  { sourceId: 'rss-distrowatch', sourceType: 'rss-feed', displayName: 'DistroWatch RSS',        successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.85 },
  { sourceId: 'rss-phoronix', sourceType: 'rss-feed',   displayName: 'Phoronix RSS',            successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.70 },
  { sourceId: 'rss-omgubuntu', sourceType: 'rss-feed',  displayName: 'OMG! Ubuntu RSS',         successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.60 },
  { sourceId: 'web-search',  sourceType: 'web-search',  displayName: 'DuckDuckGo Web Search',   successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.40 },
];

function loadTrustRecords(): SourceTrustRecord[] {
  try {
    if (existsSync(TRUST_PATH)) {
      return JSON.parse(readFileSync(TRUST_PATH, 'utf-8')) as SourceTrustRecord[];
    }
  } catch { /* ignore */ }
  return DEFAULT_TRUST_RECORDS.map((r) => ({ ...r }));
}

function saveTrustRecords(records: SourceTrustRecord[]): void {
  mkdirSync(dirname(TRUST_PATH), { recursive: true });
  writeFileSync(TRUST_PATH, JSON.stringify(records, null, 2));
}

function recordSuccess(records: SourceTrustRecord[], sourceId: string): void {
  const rec = records.find((r) => r.sourceId === sourceId);
  if (!rec) return;
  rec.successes++;
  rec.lastAccessed = Date.now();
  rec.trustScore = Math.min(1, rec.trustScore + 0.02);
}

function recordFailure(records: SourceTrustRecord[], sourceId: string): void {
  const rec = records.find((r) => r.sourceId === sourceId);
  if (!rec) return;
  rec.failures++;
  rec.lastAccessed = Date.now();
  rec.trustScore = Math.max(0.05, rec.trustScore - 0.08);
  if (rec.failures > 3 && rec.trustScore < 0.2) {
    rec.cooldownUntil = Date.now() + 3600_000; // 1 hour cooldown
  }
}

function getActiveSources(records: SourceTrustRecord[], filter?: string[]): SourceTrustRecord[] {
  const now = Date.now();
  let active = records.filter((r) => {
    if (r.cooldownUntil && r.cooldownUntil > now) return false;
    return r.trustScore >= 0.2;
  });
  if (filter && filter.length > 0) {
    active = active.filter((r) => filter.includes(r.sourceId));
  }
  return active.sort((a, b) => b.trustScore - a.trustScore);
}

/* ========================================================================= */
/*  Section 2: HTTP Utilities                                                 */
/* ========================================================================= */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  retries = 3,
  delay = 1000,
  timeout = 15000,
): Promise<Response | null> {

  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '10', 10);
        console.warn(`  ⏳ Rate limited (429). Waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (res.status >= 400 && res.status < 500) return res;
      console.warn(`  ⚠️  HTTP ${res.status} for ${url.slice(0, 80)}, retry ${i + 1}/${retries}`);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.warn(`  ⏰ Timeout for ${url.slice(0, 80)}`);
        continue;
      }
      console.warn(`  ⚠️  Network error for ${url.slice(0, 80)}, retry ${i + 1}/${retries}`);
    }
    await sleep(delay * (i + 1));
  }
  return null;
}

/* ========================================================================= */
/*  Section 3: Wikipedia Engine                                              */
/* ========================================================================= */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary';

const WIKI_CATEGORIES = [
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
  'Category:RPM-based Linux distributions',
  'Category:Rolling-release Linux distributions',
  'Category:Penetration testing Linux distributions',
  'Category:Source-based Linux distributions',
  'Category:Chinese Linux distributions',
  'Category:Indian Linux distributions',
];

interface WikiPage {
  title: string;
  pageid: number;
}

async function fetchWikiCategory(category: string): Promise<WikiPage[]> {
  const pages: WikiPage[] = [];
  let cmcontinue: string | undefined;

  while (true) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', list: 'categorymembers',
      cmtitle: category, cmlimit: 'max', cmtype: 'page', origin: '*',
    });
    if (cmcontinue) params.set('cmcontinue', cmcontinue);

    const res = await fetchWithRetry(`${WIKI_API}?${params}`);
    if (!res) break;

    const json = (await res.json()) as any;
    const members = json.query?.categorymembers ?? [];
    for (const m of members) {
      if (/^(Category:|Template:|Portal:|Wikipedia:|List of|Comparison of)/.test(m.title)) continue;
      pages.push(m);
    }

    cmcontinue = json.continue?.cmcontinue;
    if (!cmcontinue) break;
    await sleep(150);
  }
  return pages;
}

async function fetchWikiSummary(title: string): Promise<{ description?: string; extract?: string; url?: string } | null> {
  const url = `${WIKI_REST}/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const res = await fetchWithRetry(url, 2, 500);  // positional: retries=2, delay=500
  if (!res) return null;
  try {
    const json = (await res.json()) as any;
    if (!json.title) return null;
    return {
      description: json.description,
      extract: json.extract,
      url: json.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    };
  } catch { return null; }
}

async function crawlWikipedia(
  knownNames: Set<string>,
  knownIds: Set<string>,
  patterns: any,
): Promise<DiscoveredDistro[]> {
  const candidates: Map<string, DiscoveredDistro> = new Map();

  console.log('\n  📡 [Wikipedia] Crawling categories...');

  for (const cat of WIKI_CATEGORIES) {
    console.log(`    📂 ${cat.replace('Category:', '')}`);
    const pages = await fetchWikiCategory(cat);
    console.log(`       → ${pages.length} pages`);

    for (const p of pages) {
      const name = p.title.replace(/_/g, ' ').replace(/ \(operating system\)$/, '').replace(/ \(OS\)$/, '');
      const nl = name.toLowerCase();

      // Skip non-distro pages
      if (/^(linux|gnu|kernel|wayland|systemd|gnome|kde|xfce)/i.test(nl)) continue;
      // Skip known distros
      if (knownNames.has(nl)) continue;
      const slug = nl.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (knownIds.has(slug)) continue;

      const summary = await fetchWikiSummary(p.title);
      await sleep(80);

      const extract = summary?.extract ?? summary?.description ?? '';
      const dl = extract.toLowerCase();

      // Must look like a Linux distro
      if (!/(operating system|distribution|linux|gnu\/linux)/i.test(extract) &&
          !/(based on|derivative|fork of) (debian|ubuntu|arch|fedora|rhel|slackware|gentoo)/i.test(extract)) {
        continue;
      }

      const guessed = guessMetadata(name, extract);
      const confidence = scoreWikiCandidate(name, extract, patterns);

      if (confidence < 0.4) continue;

      const key = name.toLowerCase();
      if (!candidates.has(key) || candidates.get(key)!.confidence < confidence) {
        candidates.set(key, {
          id: slug,
          name,
          status: /discontinued|defunct|abandoned/i.test(dl) ? 'discontinued' : 'active',
          discoverySources: ['wikipedia'],
          sourceTitle: `Wikipedia: ${cat.replace('Category:', '')}`,
          sourceUrl: summary?.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
          confidence,
          ...guessed,
          ...guessFamily(name, extract, patterns),
        });
      }
    }
    await sleep(300);
  }

  return [...candidates.values()].sort((a, b) => b.confidence - a.confidence);
}

function scoreWikiCandidate(name: string, description: string, _patterns: any): number {
  let score = 0.3; // base

  const toks = name.toLowerCase().split(/[\s/-]+/).filter(Boolean);
  const dl = description.toLowerCase();

  // Has "Linux" or "OS" in name
  if (/\b(linux|os|nix|ux)\b/i.test(name)) score += 0.15;
  // Has a known base mention in description
  if (/(based on|derivative|fork of)/i.test(dl)) score += 0.15;
  if (/\b(debian|ubuntu|arch|fedora|rhel|slackware|gentoo|suse|alpine)\b/i.test(dl)) score += 0.1;
  if (/\b(rolling|fixed|release|package manager|desktop environment)\b/i.test(dl)) score += 0.1;
  // Description is substantive
  if (description.length > 100) score += 0.1;
  if (description.length > 300) score += 0.1;
  // Penalize very short descriptions
  if (description.length < 30) score *= 0.6;

  return Math.min(score, 1);
}

/* ========================================================================= */
/*  Section 4: DistroWatch Engine                                            */
/* ========================================================================= */

async function crawlDistroWatch(
  knownNames: Set<string>,
  knownIds: Set<string>,
): Promise<DiscoveredDistro[]> {
  const candidates: DiscoveredDistro[] = [];

  console.log('\n  📡 [DistroWatch] Fetching distribution lists...');

  // DistroWatch has a simple text-based distribution directory
  const urls = [
    'https://distrowatch.com/dwres.php?resource=popularity',
    'https://distrowatch.com/search.php?status=Active',
  ];

  for (const url of urls) {
    const res = await fetchWithRetry(url, 3, 2000, 20000);
    if (!res) continue;

    const html = await res.text();
    await sleep(800);

    // Extract distro names from DistroWatch HTML tables
    // Pattern: <a href="/?issue=...">Distro Name</a>
    const linkRegex = /<a\s+href="\/\?issue=[^"]*"[^>]*>([^<]+)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      const name = match[1].trim();
      // Filter out non-distro links
      if (/^(Distribution|News|Reviews|Search|About)/i.test(name)) continue;
      const nl = name.toLowerCase().trim();
      const slug = nl.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

      if (knownNames.has(nl) || knownIds.has(slug)) continue;
      if (candidates.some((c) => c.id === slug)) continue;

      // Try to get a description snippet from the page context
      const descMatch = html.slice(Math.max(0, match.index - 200), match.index + 200);
      const desc = extractDistroWatchDesc(descMatch);

      // Determine status from context
      const context = html.slice(Math.max(0, match.index - 300), match.index + 50);
      const isDisco = /discontinued|defunct|abandoned/i.test(context);

      candidates.push({
        id: slug,
        name,
        status: isDisco ? 'discontinued' : 'active',
        description: desc || undefined,
        discoverySources: ['distrowatch'],
        sourceTitle: 'DistroWatch',
        sourceUrl: 'https://distrowatch.com',
        confidence: 0.55 + (desc ? 0.1 : 0),
        website: `https://${slug}.org`,
      });
    }
  }

  // Dedup and score
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  }).sort((a, b) => b.confidence - a.confidence);
}

function extractDistroWatchDesc(context: string): string | null {
  // Try to find description in nearby <td> or <p> elements
  const tdMatch = /<td[^>]*class="[^"]*"[^>]*>\s*([A-Z].*?)\s*<\/td>/i.exec(context);
  if (tdMatch && tdMatch[1].length > 10) return tdMatch[1].slice(0, 300);

  const pMatch = /<p[^>]*>\s*([A-Z].*?(?:\.|!|\?))\s*<\/p>/i.exec(context);
  if (pMatch && pMatch[1].length > 15) return pMatch[1].slice(0, 300);

  return null;
}

/* ========================================================================= */
/*  Section 5: GitHub Engine                                                 */
/* ========================================================================= */

const GITHUB_API = 'https://api.github.com';

async function crawlGitHub(
  knownNames: Set<string>,
  knownIds: Set<string>,
): Promise<DiscoveredDistro[]> {
  const candidates: DiscoveredDistro[] = [];

  console.log('\n  📡 [GitHub] Searching for Linux distribution repositories...');

  // Search query variations for finding distro repos
  const queries = [
    'topic:linux-distribution',
    'topic:linux-distro',
    'linux distribution in:readme',
    '"Linux distribution" in:description',
    '"operating system" in:readme "based on"',
  ];

  for (const query of queries) {
    const params = new URLSearchParams({
      q: query,
      sort: 'updated',
      per_page: '25',
      type: 'repositories',
    });

    const url = `${GITHUB_API}/search/repositories?${params}`;
    const res = await fetchWithRetry(url, 2, 2000, 10000);
    if (!res) {
      await sleep(1500);
      continue;
    }

    const json = (await res.json()) as any;
    const repos = json.items ?? [];
    console.log(`    ✓ ${query.slice(0, 50)}... → ${repos.length} results`);

    for (const repo of repos) {
      const name = repo.name;
      const fullName = repo.full_name;
      const description = repo.description ?? '';
      const topics = repo.topics ?? [];
      const language = repo.language ?? '';

      // Must look like a Linux distribution
      const isDistro =
        topics.some((t: string) => /^(linux|distro|distribution|operating-system)/i.test(t)) ||
        /(linux distribution|operating system|linux distro)/i.test(description) ||
        /(based on|derivative of)/i.test(description) ||
        (language === 'Shell' || language === 'C' || language === 'Python') &&
        /install|iso|build|image/i.test(description);

      if (!isDistro) continue;

      const nl = name.toLowerCase();
      const slug = nl.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (knownNames.has(nl) || knownIds.has(slug) || candidates.some((c) => c.id === slug)) continue;

      const guessed = guessMetadata(name, description);
      const confidence = scoreGitHubCandidate(name, description, topics);

      candidates.push({
        id: slug,
        name: repo.name,
        status: 'active',
        description: description || undefined,
        website: repo.html_url ? `https://${slug}.org` : undefined,
        discoverySources: ['github'],
        sourceTitle: repo.full_name,
        sourceUrl: repo.html_url,
        confidence,
        baseDistro: guessBaseDistro(description, topics),
        desktopEnvironments: guessDesktops(description, topics),
        packageManager: guessed.packageManager ?? undefined,
        initSystem: guessed.initSystem ?? undefined,
        country: guessed.country ?? undefined,
        ...guessFamily(name, description, {} as any),
      });
    }

    await sleep(1200);
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function scoreGitHubCandidate(name: string, description: string, topics: string[]): number {
  let score = 0.3;
  const dl = description.toLowerCase();

  if (topics.some((t) => /linux|distro|distribution|os/i.test(t))) score += 0.2;
  if (/\b(linux distribution|operating system|linux distro|based on)\b/i.test(dl)) score += 0.2;
  if (/\b(debian|ubuntu|arch|fedora|rhel|gentoo|slackware|alpine)\b/i.test(dl)) score += 0.15;
  if (/(install|iso|build|release|download)/i.test(dl)) score += 0.1;
  if (description.length > 50) score += 0.05;

  return Math.min(score, 1);
}

/* ========================================================================= */
/*  Section 6: RSS Feed Engine                                               */
/* ========================================================================= */

interface RssFeed {
  id: string;
  name: string;
  url: string;
}

const RSS_FEEDS: RssFeed[] = [
  { id: 'distrowatch-rss',  name: 'DistroWatch Weekly',          url: 'https://distrowatch.com/news/dw.xml' },
  { id: 'phoronix',         name: 'Phoronix',                    url: 'https://www.phoronix.com/rss.php' },
  { id: 'omg-ubuntu',       name: 'OMG! Ubuntu',                url: 'https://www.omgubuntu.co.uk/feed' },
  { id: 'linux-news',       name: 'Linux News (lwn.net)',        url: 'https://lwn.net/headlines/newrss' },
  { id: 'itsfoss',          name: 'It\'s FOSS News',             url: 'https://news.itsfoss.com/feed/' },
];

async function crawlRssFeeds(
  knownNames: Set<string>,
  knownIds: Set<string>,
): Promise<DiscoveredDistro[]> {
  const candidates: DiscoveredDistro[] = [];

  console.log('\n  📡 [RSS Feeds] Scanning Linux news feeds...');

  for (const feed of RSS_FEEDS) {
    const res = await fetchWithRetry(feed.url, 2, 2000, 10000);
    if (!res) {
      await sleep(500);
      continue;
    }

    const xml = await res.text();
    await sleep(500);

    // Parse RSS items looking for distro announcements
    const itemRegex = /<item>[\s\S]*?<\/item>/gi;
    let itemMatch: RegExpExecArray | null;

    let itemsFound = 0;
    while ((itemMatch = itemRegex.exec(xml)) !== null) {
      const item = itemMatch[0];

      // Extract title and description
      const titleMatch = /<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i.exec(item);
      const descMatch = /<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/i.exec(item);
      const linkMatch = /<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/i.exec(item);

      const title = titleMatch ? titleMatch[1].trim() : '';
      const description = descMatch ? descMatch[1].trim() : '';
      const link = linkMatch ? linkMatch[1].trim() : '';

      // Look for distro release announcements
      const distroKeywords = /(released|announces|launches|version |now available)\s*(officially\s*)?(.*?)(linux|os|distribution|distro)/i;
      const keywordMatch = distroKeywords.exec(title + ' ' + description);

      if (!keywordMatch) continue;

      // Extract distro name from context
      const candidateName = extractDistroName(title, description);
      if (!candidateName) continue;

      const nl = candidateName.toLowerCase().trim();
      const slug = nl.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (knownNames.has(nl) || knownIds.has(slug) || candidates.some((c) => c.id === slug)) continue;

      itemsFound++;
      const guessed = guessMetadata(candidateName, description);
      const confidence = computeRssConfidence(candidateName, description);

      candidates.push({
        id: slug,
        name: candidateName,
        status: 'active',
        description: description.slice(0, 400) || undefined,
        discoverySources: ['rss-feed'],
        sourceTitle: feed.name,
        sourceUrl: link || feed.url,
        confidence,
        ...guessed,
        ...guessFamily(candidateName, description, {} as any),
      });
    }

    console.log(`    ✓ ${feed.name.padEnd(20)} → ${itemsFound} candidates`);
    await sleep(800);
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function extractDistroName(title: string, description: string): string | null {
  const text = `${title} ${description}`;

  // Pattern: "DistroName X.Y released" or "DistroName Linux X.Y released"
  const patterns = [
    /(.+?)\s+(\d+[\d.]*\d)\s+(?:released|announced|launches|now available)/i,
    /(.+?)\s+(?:Linux|OS|Distribution)\s+(\d+[\d.]*\d)\s+(?:released|announced)/i,
    /(?:New|Updated)\s+(.+?)\s+(?:release|version|edition)/i,
  ];

  for (const pat of patterns) {
    const m = pat.exec(text);
    if (m) {
      const name = m[1].trim();
      // Filter out noise
      if (name.length > 2 && name.length < 60 && !/^(the|a|an|new|updated|latest)/i.test(name)) {
        return name;
      }
    }
  }

  return null;
}

function computeRssConfidence(name: string, description: string): number {
  let score = 0.3;
  const dl = description.toLowerCase();
  const nl = name.toLowerCase();

  if (/\b(linux|distro|distribution|os)\b/i.test(name)) score += 0.2;
  if (/\b(released|announces|launches|now available)\b/i.test(dl)) score += 0.15;
  if (/(version|release|update|install|download)/i.test(dl)) score += 0.1;
  if (/\b(debian|ubuntu|arch|fedora|gentoo)\b/i.test(dl)) score += 0.1;
  if (description.length > 50) score += 0.05;

  // Penalize ads/sponsored content
  if (/sponsored|advertisement|ad\s/i.test(dl)) score *= 0.5;

  return Math.min(score, 1);
}

/* ========================================================================= */
/*  Section 7: Web Search Engine                                             */
/* ========================================================================= */

async function crawlWebSearch(
  knownNames: Set<string>,
  knownIds: Set<string>,
  queries: SearchQuery[],
): Promise<DiscoveredDistro[]> {
  const candidates: DiscoveredDistro[] = [];

  console.log('\n  📡 [Web Search] Running query expansion searches...');

  for (const sq of queries) {
    // Use DuckDuckGo instant answer API (no API key needed)
    const params = new URLSearchParams({
      q: sq.query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    });

    const url = `https://api.duckduckgo.com/?${params}`;
    const res = await fetchWithRetry(url, 2, 2000, 8000);
    if (!res) {
      await sleep(500);
      continue;
    }

    const json = (await res.json()) as any;
    const abstract = json.AbstractText ?? '';
    const results = json.RelatedTopics ?? [];
    const source = json.Source ?? 'DuckDuckGo';

    if (abstract) {
      const extracted = extractFromAbstract(abstract, knownNames, knownIds);
      for (const d of extracted) {
        if (!candidates.some((c) => c.id === d.id)) {
          d.discoverySources = ['web-search'];
          d.sourceTitle = `Search: ${sq.query}`;
          d.sourceUrl = json.AbstractURL ?? '';
          d.confidence = Math.min(0.65, d.confidence);
          candidates.push(d);
        }
      }
    }

    // Process related topics
    for (const topic of results.slice(0, 8)) {
      const text = typeof topic === 'string' ? topic : (topic.Text ?? topic.Result ?? '');
      const extracted = extractFromAbstract(text, knownNames, knownIds);
      for (const d of extracted) {
        if (!candidates.some((c) => c.id === d.id)) {
          d.discoverySources = ['web-search'];
          d.sourceTitle = `Search: ${sq.query}`;
          d.confidence = Math.min(0.5, d.confidence);
          candidates.push(d);
        }
      }
    }

    console.log(`    ✓ "${sq.query.slice(0, 50)}" → ${extractFromAbstract(abstract, knownNames, knownIds).length + results.length} results`);
    await sleep(1200);
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function extractFromAbstract(
  text: string,
  knownNames: Set<string>,
  knownIds: Set<string>,
): DiscoveredDistro[] {
  const results: DiscoveredDistro[] = [];
  if (!text || text.length < 10) return results;

  // Look for mentions of Linux distributions
  const distroMentions = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Linux|OS|Distribution)\b/g) ?? [];

  for (const mention of distroMentions) {
    const name = mention.trim();
    const nl = name.toLowerCase();
    const slug = nl.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (knownNames.has(nl) || knownIds.has(slug) || results.some((r) => r.id === slug)) continue;

    results.push({
      id: slug,
      name,
      status: 'active',
      description: text.slice(0, 300),
      discoverySources: ['web-search'],
      confidence: 0.45,
    });
  }

  return results;
}

/* ========================================================================= */
/*  Section 8: Query Expansion Engine                                        */
/* ========================================================================= */

function generateQueries(
  sourceData: SourceData,
  knownFamilies: Map<string, SourceFamily>,
): SearchQuery[] {
  const queries: SearchQuery[] = [];

  // 1. Follow known family chains — find missing derivatives
  for (const [fid, fam] of knownFamilies) {
    if (fid === 'linux-kernel') continue;
    queries.push({
      query: `${fam.name} derivative Linux distribution`,
      targetSources: ['web-search', 'wikipedia'],
      rationale: `Find derivatives of ${fam.name} family`,
      priority: 5,
      expansionTriggers: [fam.name.toLowerCase(), 'derivative', 'based on'],
    });
  }

  // 2. Generate queries from keywords discovered in existing distro descriptions
  const keywordFreq = new Map<string, number>();
  for (const d of sourceData.distros) {
    if (!d.description) continue;
    const words = d.description.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    for (const w of words) {
      keywordFreq.set(w, (keywordFreq.get(w) ?? 0) + 1);
    }
  }

  const topKeywords = [...keywordFreq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word]) => word);

  // 3. Country/language-specific queries
  const countries = new Set(sourceData.distros.map((d) => d.country).filter(Boolean) as string[]);
  for (const country of [...countries].slice(0, 15)) {
    if (country === 'Global' || country === 'International') continue;
    queries.push({
      query: `Linux distribution from ${country}`,
      targetSources: ['web-search', 'wikipedia'],
      rationale: `Find distros from ${country} (known source country)`,
      priority: 3,
      expansionTriggers: [country.toLowerCase()],
    });
  }

  // 4. Package-manager-specific queries
  const pkgManagers = new Set(sourceData.distros.map((d) => d.packageManager).filter(Boolean) as string[]);
  for (const pm of [...pkgManagers].slice(0, 8)) {
    queries.push({
      query: `${pm} based Linux distribution`,
      targetSources: ['web-search', 'wikipedia'],
      rationale: `Find distros using ${pm} package manager`,
      priority: 4,
      expansionTriggers: [pm.toLowerCase()],
    });
  }

  // 5. Init-system-specific queries
  const initSystems = new Set(sourceData.distros.map((d) => d.initSystem).filter(Boolean) as string[]);
  for (const init of [...initSystems].slice(0, 5)) {
    if (init === 'systemd') continue; // too many results
    queries.push({
      query: `Linux distribution with ${init} init`,
      targetSources: ['web-search', 'wikipedia'],
      rationale: `Find distros using ${init} init system`,
      priority: 4,
      expansionTriggers: [init.toLowerCase()],
    });
  }

  // 6. Niche queries from top keywords
  for (const kw of topKeywords.slice(0, 10)) {
    queries.push({
      query: `Linux distribution ${kw}`,
      targetSources: ['web-search'],
      rationale: `Keyword expansion from existing distro descriptions: "${kw}"`,
      priority: 2,
      expansionTriggers: [kw],
    });
  }

  // 7. Architecture-specific queries
  const archQueries = ['ARM', 'RISC-V', 'MIPS', 'PowerPC', 'LoongArch'];
  for (const arch of archQueries) {
    queries.push({
      query: `Linux distribution for ${arch}`,
      targetSources: ['web-search', 'wikipedia', 'github'],
      rationale: `Find Linux distros targeting ${arch} architecture`,
      priority: 3,
      expansionTriggers: [arch.toLowerCase()],
    });
  }

  // 8. Niche / purpose-specific queries
  const nicheQueries = [
    'forensics Linux distribution',
    'audio production Linux distribution',
    'lightweight Linux distribution',
    'gaming Linux distribution',
    'privacy focused Linux distribution',
    'immutable Linux distribution',
    'container Linux distribution',
    'IoT Linux distribution',
    'router Linux distribution',
    'cloud Linux distribution',
  ];
  for (const nq of nicheQueries) {
    queries.push({
      query: nq,
      targetSources: ['web-search', 'wikipedia'],
      rationale: `Niche purpose expansion: "${nq}"`,
      priority: 2,
      expansionTriggers: [nq.split(' ')[0]],
    });
  }

  return queries.sort((a, b) => b.priority - a.priority);
}

/* ========================================================================= */
/*  Section 9: Metadata Helpers                                              */
/* ========================================================================= */

function guessMetadata(
  name: string,
  description: string,
): Partial<DiscoveredDistro> {
  const dl = description.toLowerCase();
  const nl = name.toLowerCase();
  const meta: Partial<DiscoveredDistro> = {};

  // Country
  const countryMap: Array<[RegExp, string]> = [
    [/german|germany/i, 'Germany'], [/french|france/i, 'France'],
    [/italian|italy/i, 'Italy'], [/spanish|spain/i, 'Spain'],
    [/russian|russia/i, 'Russia'], [/chinese|china/i, 'China'],
    [/indian|india/i, 'India'], [/brazilian|brazil/i, 'Brazil'],
    [/japanese|japan/i, 'Japan'], [/dutch|netherlands/i, 'Netherlands'],
    [/polish|poland/i, 'Poland'], [/turkish|turkey/i, 'Turkey'],
    [/american|united states/i, 'United States'], [/british|uk\b/i, 'United Kingdom'],
    [/canadian|canada/i, 'Canada'], [/australian|australia/i, 'Australia'],
    [/swedish|sweden/i, 'Sweden'], [/finnish|finland/i, 'Finland'],
  ];
  for (const [re, country] of countryMap) {
    if (re.test(dl) || re.test(nl)) { meta.country = country; break; }
  }

  // Package manager
  const pkgMap: Array<[RegExp, string]> = [
    [/apt(\/dpkg)?|dpkg\b/i, 'apt/dpkg'], [/pacman\b/i, 'pacman'],
    [/dnf\b|yum\b/i, 'dnf/rpm'], [/portage\b/i, 'portage'],
    [/slackpkg\b/i, 'slackpkg'], [/nix\b(?!os)/i, 'nix'],
    [/snap\b/i, 'snap'], [/flatpak\b/i, 'flatpak'],
    [/guix\b/i, 'guix'], [/pkg\s+\w+/i, 'pkg'],
  ];
  for (const [re, pm] of pkgMap) {
    if (re.test(dl)) { meta.packageManager = pm; break; }
  }

  // Init system
  if (/\bsystemd\b/i.test(dl)) meta.initSystem = 'systemd';
  else if (/\bopenrc\b/i.test(dl)) meta.initSystem = 'OpenRC';
  else if (/\brunit\b/i.test(dl)) meta.initSystem = 'runit';
  else if (/\bs6\b/i.test(dl)) meta.initSystem = 's6';
  else if (/\bsysvinit|init\.d\b/i.test(dl)) meta.initSystem = 'sysvinit';

  // Release model
  if (/\brolling\s+release\b/i.test(dl)) meta.releaseModel = 'rolling';
  else if (/\bfixed\s+release\b|stable\s+release/i.test(dl)) meta.releaseModel = 'fixed';
  else if (/\blts\b/i.test(dl)) meta.releaseModel = 'lts';
  else if (/\bsemi-rolling|half-rolling/i.test(dl)) meta.releaseModel = 'semi-rolling';

  // Founded year
  const yearMatch = dl.match(/\b(?:founded|created|first\s+released|started|established)\s+in\s+(19[9]\d|20[0-2]\d)\b/i);
  if (yearMatch) { const y = parseInt(yearMatch[1], 10); if (y >= 1991 && y <= 2026) meta.founded = y; }

  // Version
  const verMatch = nl.match(/(\d+[.]?\d*(?:\.\d+)?)\s*(?:released|announced|linux|os)/i);
  if (verMatch) meta.version = verMatch[1];

  return meta;
}

function guessBaseDistro(description: string, topics?: string[]): BaseDistro | undefined {
  const dl = description.toLowerCase();
  if (topics?.some((t) => /debian/i.test(t)) || /\bdebian\b/i.test(dl) && /based|derivative/i.test(dl)) return 'Debian';
  if (topics?.some((t) => /ubuntu/i.test(t)) || /\bubuntu\b/i.test(dl) && /based|derivative/i.test(dl)) return 'Ubuntu';
  if (topics?.some((t) => /arch/i.test(t)) || /\barch\b/i.test(dl) && /based|derivative/i.test(dl)) return 'Arch';
  if (topics?.some((t) => /fedora/i.test(t)) || /\bfedora\b/i.test(dl) && /based|derivative/i.test(dl)) return 'Fedora';
  if (topics?.some((t) => /rhel|red.?hat/i.test(t)) || /\brhel\b/i.test(dl) || /\bred.?hat\b/i.test(dl)) return 'RHEL';
  if (topics?.some((t) => /gentoo/i.test(t)) || /\bgentoo\b/i.test(dl) && /based|derivative/i.test(dl)) return 'Gentoo';
  if (topics?.some((t) => /slackware/i.test(t)) || /\bslackware\b/i.test(dl)) return 'Slackware';
  if (topics?.some((t) => /alpine/i.test(t)) || /\balpine\b/i.test(dl) && /based|derivative/i.test(dl)) return 'Alpine';
  if (/\b(suse|opensuse)\b/i.test(dl)) return 'OpenSUSE';
  if (/\bvoid\s*linux\b/i.test(dl)) return 'Void';
  if (/\bnixos\b/i.test(dl)) return 'NixOS';
  if (/\b(solus|independent)\b/i.test(dl) && /based|derivative/i.test(dl)) return 'Independent';
  return undefined;
}

function guessDesktops(description: string, topics?: string[]): DistroDesktop[] | undefined {
  const desktops: DistroDesktop[] = [];
  const dl = description.toLowerCase();
  const allTopics = [...(topics ?? []), dl];

  const desktopMap: Array<[RegExp, DistroDesktop]> = [
    [/gnome/i, 'GNOME'], [/kde\s*(plasma)?/i, 'KDE'], [/xfce/i, 'XFCE'],
    [/lxqt/i, 'LXQt'], [/lxde/i, 'LXDE'], [/mate\b(?!\s+desktop)/i, 'MATE'],
    [/cinnamon/i, 'Cinnamon'], [/budgie/i, 'Budgie'], [/deepin\s*(de|desktop)/i, 'Deepin'],
    [/pantheon/i, 'Pantheon'], [/sway\b/i, 'Sway'], [/hyprland/i, 'Hyprland'],
    [/openbox/i, 'Openbox'], [/i3\b(?!\s+\d)/i, 'i3'], [/phosh/i, 'Phosh'],
    [/enlightenment/i, 'Enlightenment'], [/headless|server|cli\b/i, 'Headless'],
  ];

  for (const [re, desktop] of desktopMap) {
    if (allTopics.some((t) => re.test(t)) && !desktops.includes(desktop)) {
      desktops.push(desktop);
    }
  }

  return desktops.length > 0 ? desktops : undefined;
}

function guessFamily(
  name: string,
  description: string,
  _patterns: any,
): { familyId?: string; parent?: string } {
  const combined = `${name.toLowerCase()} ${description.toLowerCase()}`;

  // Check for known family mentions
  const familyMap: Array<[RegExp, string, string?]> = [
    [/\bdebian\b/i, 'debian', 'debian'],
    [/\bubuntu\b/i, 'ubuntu', 'ubuntu'],
    [/\barch\b.*\b(linux|based)/i, 'arch', 'arch'],
    [/\bmanjaro\b/i, 'manjaro', 'manjaro'],
    [/\bfedora\b/i, 'fedora', 'fedora'],
    [/\brhel\b/i, 'rhel', 'rhel'],
    [/\bred.?hat\b/i, 'rhel', 'rhel'],
    [/\bgentoo\b/i, 'gentoo', 'gentoo'],
    [/\balpine\b/i, 'alpine', 'alpine'],
    [/\b(slackware|salix|porteus)\b/i, 'slackware', 'slackware'],
    [/\b(suse|opensuse)\b/i, 'opensuse', 'opensuse'],
    [/\bvoid\s*linux\b/i, 'void', 'void'],
    [/\bnixos\b/i, 'nixos', 'nixos'],
    [/\bmint\b.*\b(linux)/i, 'mint', 'linuxmint'],
    [/\bkali\b.*\b(linux)/i, 'kali', 'kali'],
    [/\bdeepin\b/i, 'deepin', 'deepin'],
  ];

  for (const [re, familyId, parentId] of familyMap) {
    if (re.test(combined)) {
      return { familyId, parent: parentId };
    }
  }

  return {};
}

/* ========================================================================= */
/*  Section 10: Validator & Deduplicator                                     */
/* ========================================================================= */

interface ValidationResult {
  distro: DiscoveredDistro;
  errors: string[];
  warnings: string[];
  passed: boolean;
}

const VALID_ID_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function validateDistro(d: DiscoveredDistro): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!d.name || d.name.length < 2) errors.push('Name is too short or empty');
  if (!d.id || !VALID_ID_REGEX.test(d.id)) errors.push(`Invalid slug: "${d.id}"`);
  if (d.status !== 'active' && d.status !== 'discontinued') errors.push(`Invalid status: "${d.status}"`);
  if (d.confidence < 0 || d.confidence > 1) warnings.push(`Confidence out of range: ${d.confidence}`);
  if (d.description && d.description.length > 2000) warnings.push('Description exceeds 2000 chars');

  // Check for non-distro patterns
  if (/^(linux|gnu|kernel|wayland|systemd)/i.test(d.name)) errors.push('Name is a Linux component, not a distro');

  return {
    distro: d,
    errors,
    warnings,
    passed: errors.length === 0,
  };
}

function deduplicate(
  candidates: DiscoveredDistro[],
  knownNames: Set<string>,
  knownIds: Set<string>,
): { accepted: DiscoveredDistro[]; rejected: DiscoveredDistro[]; duplicates: number } {
  const accepted: DiscoveredDistro[] = [];
  const rejected: DiscoveredDistro[] = [];
  const seenIds = new Set<string>(knownIds);
  let duplicates = 0;

  for (const c of candidates) {
    const nl = c.name.toLowerCase().trim();
    const exactNameMatch = knownNames.has(nl);

    if (exactNameMatch) {
      rejected.push(c);
      duplicates++;
      continue;
    }

    if (seenIds.has(c.id)) {
      // Merge confidence: keep higher confidence version
      const existing = accepted.find((a) => a.id === c.id);
      if (existing && c.confidence > existing.confidence) {
        Object.assign(existing, c);
        existing.discoverySources = [...new Set([...existing.discoverySources, ...c.discoverySources])];
      }
      duplicates++;
      continue;
    }

    // Fuzzy name dedup: check for very similar names
    const similar = accepted.find((a) => levenshteinRatio(a.name.toLowerCase(), nl) > 0.85);
    if (similar) {
      if (c.confidence > similar.confidence) {
        // Replace with higher confidence version
        Object.assign(similar, c);
      }
      duplicates++;
      continue;
    }

    seenIds.add(c.id);
    accepted.push(c);
  }

  return { accepted, rejected, duplicates };
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0) return 0;
  if (b.length === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const dist = matrix[b.length][a.length];
  return 1 - dist / Math.max(a.length, b.length);
}

/* ========================================================================= */
/*  Section 11: Ingester (Upsert into distros.json)                          */
/* ========================================================================= */

function ingestCandidates(
  candidates: DiscoveredDistro[],
  sourceData: SourceData,
  trustRecords: SourceTrustRecord[],
): { newFamilies: number; newDistros: number; errors: Array<{ source: string; message: string }> } {
  const errors: Array<{ source: string; message: string }> = [];
  const newFamilies = new Map<string, SourceFamily>();
  const newDistros: SourceDistro[] = [];

  for (const c of candidates) {
    const valid = validateDistro(c);
    if (!valid.passed) {
      errors.push({ source: c.id, message: valid.errors.join('; ') });
      // Record failure for this candidate's source
      for (const src of c.discoverySources) {
        const rec = trustRecords.find((r) => r.sourceId.startsWith(src));
        if (rec) recordFailure(trustRecords, rec.sourceId);
      }
      continue;
    }

    // Determine family
    let familyId = c.familyId;
    if (!familyId) {
      // Auto-create a family
      const familySlug = c.id;
      const familyName = c.name.replace(/( Linux| OS| Distribution)$/i, '').trim() || c.name;
      if (!sourceData.families.find((f) => f.id === familySlug)) {
        const color = generateColor(familySlug);
        newFamilies.set(familySlug, {
          id: familySlug,
          name: familyName,
          color,
          description: `Auto-discovered family for ${c.name}`,
          founded: c.founded ?? undefined,
          rootDistroId: c.id,
        });
      }
      familyId = familySlug;
    }

    // Build parent chain
    const parent = c.parent ?? sourceData.families.find((f) => f.id === familyId)?.rootDistroId;

    newDistros.push({
      id: c.id,
      name: c.name,
      familyId: familyId!,
      parent,
      status: c.status,
      founded: c.founded ?? undefined,
      country: c.country ?? undefined,
      packageManager: c.packageManager ?? undefined,
      initSystem: c.initSystem ?? undefined,
      releaseModel: c.releaseModel ?? undefined,
      license: c.license ?? undefined,
      website: c.website ?? undefined,
      wikipedia: c.wikipedia ?? undefined,
      description: c.description?.slice(0, 500) ?? undefined,
    });

    // Record success for each contributing source
    for (const src of c.discoverySources) {
      const rec = trustRecords.find((r) => r.sourceId.startsWith(src));
      if (rec) recordSuccess(trustRecords, rec.sourceId);
    }
  }

  // Apply new families
  for (const [, fam] of newFamilies) {
    if (!sourceData.families.find((f) => f.id === fam.id)) {
      sourceData.families.push(fam);
      console.log(`     🏠  New family: ${fam.name} (${fam.id})`);
    }
  }

  // Apply new distros
  for (const d of newDistros) {
    if (!sourceData.distros.find((ex) => ex.id === d.id)) {
      sourceData.distros.push(d);
      console.log(`     🐧  ${d.name} (${d.id}) → ${d.familyId}`);
    }
  }

  // Write back to distros.json
  writeFileSync(DATA_PATH, JSON.stringify(sourceData, null, 2) + '\n');

  return {
    newFamilies: newFamilies.size,
    newDistros: newDistros.length,
    errors,
  };
}

/* ========================================================================= */
/*  Section 12: Report Engine                                                */
/* ========================================================================= */

function generateReport(
  candidates: DiscoveredDistro[],
  sourceData: SourceData,
  trustRecords: SourceTrustRecord[],
  minScore: number,
  outputPath: string,
  cycleId: string,
  startedAt: string,
  errors: Array<{ source: string; message: string }>,
): CrawlReport {
  const passing = candidates.filter((c) => c.confidence >= minScore);
  const report: CrawlReport = {
    cycleId,
    startedAt,
    finishedAt: new Date().toISOString(),
    sourcesQueried: trustRecords.filter((r) => r.lastAccessed > 0).length,
    candidatesFound: candidates.length,
    candidatesAccepted: passing.length,
    newFamilies: 0,
    newDistros: 0,
    duplicatesSkipped: 0,
    errors,
    trustScores: trustRecords,
  };

  // Print report
  console.log('\n' + '='.repeat(80));
  console.log('  🧠  AUTONOMOUS CRAWLER — DISCOVERY REPORT');
  console.log('='.repeat(80));

  console.log(`\n  📊 Overview:`);
  console.log(`     Cycle ID:          ${cycleId}`);
  console.log(`     Sources queried:   ${report.sourcesQueried}`);
  console.log(`     Candidates found:  ${candidates.length}`);
  console.log(`     High confidence (≥${minScore}):  ${passing.length}`);

  // Source trust scores
  console.log(`\n  🔒  Source Trust Scores:`);
  console.log(`  ${'-'.repeat(60)}`);
  for (const tr of trustRecords) {
    const status = tr.cooldownUntil && tr.cooldownUntil > Date.now() ? '🧊' : '✓';
    const scorePct = (tr.trustScore * 100).toFixed(0);
    const successRate = tr.successes + tr.failures > 0
      ? ((tr.successes / (tr.successes + tr.failures)) * 100).toFixed(0)
      : '—';
    console.log(`     ${status} ${tr.displayName.padEnd(22)} ${scorePct}% trust  (${tr.successes}✓/${tr.failures}✗) ${successRate}% success`);
  }

  // Top candidates
  if (passing.length > 0) {
    console.log(`\n  🟢  TOP CANDIDATES (confidence ≥ ${minScore})`);
    console.log(`  ${'-'.repeat(76)}`);
    for (const c of passing.slice(0, 20)) {
      const pct = (c.confidence * 100).toFixed(1);
      const source = c.bestSource ?? c.discoverySources[0] ?? '?';
      const family = c.familyId ?? 'unsure';
      console.log(`     ${pct}%  ${c.name.padEnd(35)} → ${family.padEnd(18)} 📡${source}`);
      if (c.description) {
        console.log(`         ${c.description.slice(0, 100)}`);
      }
    }
    if (passing.length > 20) {
      console.log(`     ... and ${passing.length - 20} more`);
    }
  }

  // Errors
  if (errors.length > 0) {
    console.log(`\n  ⚠️  Errors encountered (${errors.length}):`);
    for (const e of errors.slice(0, 10)) {
      console.log(`     ❌ ${e.source}: ${e.message}`);
    }
  }

  // Save output
  const output = {
    report,
    candidates: passing.map((c) => ({
      ...c,
      description: c.description?.slice(0, 400),
    })),
    allCandidates: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      confidence: c.confidence,
      source: c.discoverySources[0],
      familyId: c.familyId,
    })),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n  💾  Full report saved to ${outputPath.replace(ROOT, '.')}`);
  console.log(`  📈  Updated trust scores saved to ${TRUST_PATH.replace(ROOT, '.')}`);

  return report;
}

const COLOR_PALETTE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff',
  '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1',
  '#000075', '#a9a9a9', '#e6beff', '#ff6f00', '#00bfff', '#ff1493',
  '#00fa9a', '#8a2be2', '#dc143c', '#00ced1', '#ff8c00', '#adff2f',
];

function generateColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

/* ========================================================================= */
/*  Section 13: Main Entry Point                                             */
/* ========================================================================= */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const applyFlag = args.includes('--apply');
  const noCrawl = args.includes('--no-crawl');
  const cronMode = args.includes('--cron');
  const resetTrust = args.includes('--reset-trust');
  const minScoreIdx = args.indexOf('--min-score');
  const minScore = minScoreIdx >= 0 ? parseFloat(args[minScoreIdx + 1]) : 0.65;
  const sourcesIdx = args.indexOf('--sources');
  const sourceFilter = sourcesIdx >= 0 ? args[sourcesIdx + 1].split(',').map((s) => s.trim()) : undefined;
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 ? resolve(process.cwd(), args[outputIdx + 1]) : DEFAULT_OUTPUT;
  const cycleId = `crawl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = new Date().toISOString();

  if (!cronMode) {
    console.log('🧠  AUTONOMOUS LINUX DISTRO CRAWLER');
    console.log('    Self-learning multi-source discovery engine\n');
  }

  // Load data
  if (!existsSync(DATA_PATH)) {
    console.error(`❌  Data file not found at ${DATA_PATH}`);
    process.exit(1);
  }
  const sourceData = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as SourceData;

  // Load or reset trust records
  let trustRecords = loadTrustRecords();
  if (resetTrust) {
    trustRecords = DEFAULT_TRUST_RECORDS.map((r) => ({ ...r }));
    saveTrustRecords(trustRecords);
    console.log('  🔄  Trust scores reset to defaults.\n');
  }

  const knownNames = new Set(sourceData.distros.map((d) => d.name.toLowerCase()));
  const knownIds = new Set(sourceData.distros.map((d) => d.id));

  // Family lookup
  const familiesById = new Map(sourceData.families.map((f) => [f.id, f]));

  if (!cronMode) {
    console.log(`📚  Loaded ${sourceData.distros.length} distros across ${sourceData.families.length} families`);
    console.log(`🎯  Min confidence: ${minScore}  |  Sources: ${sourceFilter?.join(', ') ?? 'all'}\n`);
  }

  const allCandidates: DiscoveredDistro[] = [];
  const errors: Array<{ source: string; message: string }> = [];
  const activeSources = getActiveSources(trustRecords, sourceFilter);

  if (noCrawl) {
    console.log('⏭  Skipping crawl (--no-crawl).\n');
  } else if (activeSources.length === 0) {
    console.log('⏭  All sources in cooldown. Run with --reset-trust to force.\n');
  } else {
    // === STEP 1: Query Expansion ===
    if (!cronMode) console.log('\n🔬  Phase 1: Generating expansion queries...');
    const queries = generateQueries(sourceData, familiesById);
    if (!cronMode) console.log(`    ✓  Generated ${queries.length} expansion queries\n`);

    // === STEP 2: Wikipedia crawl ===
    if (activeSources.some((s) => s.sourceId === 'wikipedia')) {
      try {
        const wikiCandidates = await crawlWikipedia(knownNames, knownIds, {});
        allCandidates.push(...wikiCandidates);
        if (!cronMode) console.log(`    📊 Wikipedia: ${wikiCandidates.length} candidates`);
      } catch (err) {
        const msg = `Wikipedia crawl failed: ${(err as Error).message}`;
        errors.push({ source: 'wikipedia', message: msg });
        recordFailure(trustRecords, 'wikipedia');
        console.error(`    ❌ ${msg}`);
      }
    }

    // === STEP 3: DistroWatch crawl ===
    if (activeSources.some((s) => s.sourceId === 'distrowatch')) {
      try {
        const dwCandidates = await crawlDistroWatch(knownNames, knownIds);
        allCandidates.push(...dwCandidates);
        if (!cronMode) console.log(`    📊 DistroWatch: ${dwCandidates.length} candidates`);
        recordSuccess(trustRecords, 'distrowatch');
      } catch (err) {
        const msg = `DistroWatch crawl failed: ${(err as Error).message}`;
        errors.push({ source: 'distrowatch', message: msg });
        recordFailure(trustRecords, 'distrowatch');
        console.error(`    ❌ ${msg}`);
      }
    }

    // === STEP 4: GitHub crawl ===
    if (activeSources.some((s) => s.sourceId === 'github')) {
      try {
        const ghCandidates = await crawlGitHub(knownNames, knownIds);
        allCandidates.push(...ghCandidates);
        if (!cronMode) console.log(`    📊 GitHub: ${ghCandidates.length} candidates`);
        recordSuccess(trustRecords, 'github');
      } catch (err) {
        const msg = `GitHub crawl failed: ${(err as Error).message}`;
        errors.push({ source: 'github', message: msg });
        recordFailure(trustRecords, 'github');
        console.error(`    ❌ ${msg}`);
      }
    }

    // === STEP 5: RSS Feed crawl ===
    if (activeSources.some((s) => s.sourceType === 'rss-feed')) {
      try {
        const rssCandidates = await crawlRssFeeds(knownNames, knownIds);
        allCandidates.push(...rssCandidates);
        if (!cronMode) console.log(`    📊 RSS: ${rssCandidates.length} candidates`);
        for (const feed of RSS_FEEDS) {
          recordSuccess(trustRecords, feed.id);
        }
      } catch (err) {
        const msg = `RSS crawl failed: ${(err as Error).message}`;
        errors.push({ source: 'rss-feed', message: msg });
        for (const feed of RSS_FEEDS) recordFailure(trustRecords, feed.id);
        console.error(`    ❌ ${msg}`);
      }
    }

    // === STEP 6: Web Search crawl ===
    if (activeSources.some((s) => s.sourceType === 'web-search')) {
      try {
        const webCandidates = await crawlWebSearch(knownNames, knownIds, queries);
        allCandidates.push(...webCandidates);
        if (!cronMode) console.log(`    📊 Web Search: ${webCandidates.length} candidates`);
      } catch (err) {
        const msg = `Web search failed: ${(err as Error).message}`;
        errors.push({ source: 'web-search', message: msg });
        console.error(`    ❌ ${msg}`);
      }
    }
  }

  // === STEP 7: Validate & Deduplicate ===
  if (!cronMode) console.log('\n🔍  Phase 3: Validating and deduplicating...');

  const validated = allCandidates.map((c) => validateDistro(c));
  const passValidated = validated.filter((v) => v.passed).map((v) => v.distro);

  const { accepted, duplicates } = deduplicate(passValidated, knownNames, knownIds);

  if (!cronMode) {
    console.log(`    ✓  Passed validation: ${passValidated.length}/${allCandidates.length}`);
    console.log(`    ✓  Unique candidates: ${accepted.length} (${duplicates} duplicates removed)`);
  }

  // === STEP 8: Apply (if --apply flag) ===
  if (applyFlag && accepted.length > 0) {
    if (!cronMode) console.log('\n✏️  Phase 4: Ingesting into distros.json...');
    const ingestResult = ingestCandidates(accepted, sourceData, trustRecords);
    if (!cronMode) {
      console.log(`    ✅  Ingested ${ingestResult.newDistros} new distros, ${ingestResult.newFamilies} new families`);
    }
    errors.push(...ingestResult.errors);
  }

  // Save trust records after cycle
  saveTrustRecords(trustRecords);

  // === STEP 9: Report ===
  const report = generateReport(
    accepted, sourceData, trustRecords, minScore, outputPath,
    cycleId, startedAt, errors,
  );

  // Cron mode: JSON report to stdout
  if (cronMode) {
    const jsonReport = JSON.stringify({
      cycleId: report.cycleId,
      candidatesFound: report.candidatesFound,
      candidatesAccepted: report.candidatesAccepted,
      newDistros: report.newDistros,
      newFamilies: report.newFamilies,
      errors: report.errors.length,
      duration: new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime(),
    });
    console.log(jsonReport);
  }

  // Self-learning prompt
  if (!cronMode) {
    console.log('\n🔄  Self-learning cycle complete.');
    console.log('    Each run improves trust scores → smarter source selection → better discoveries.');
    console.log('    Run with --apply to auto-ingest high-confidence findings.');
    console.log('    Schedule: `npx tsx scripts/autonomous-crawler.ts --cron --apply`\n');
  }
}

main().catch((err) => {
  console.error('❌  Fatal error:', err);
  process.exit(1);
});
