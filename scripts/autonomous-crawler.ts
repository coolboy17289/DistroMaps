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
 *   --sources S1,S2    Comma-separated: wiki,distrowatch,gh,gitlab,rss,web (default: all)
 *   --min-score N      Minimum confidence threshold (default 0.65)
 *   --cron             Quiet mode for cron jobs (JSON report to stdout)
 *   --no-crawl         Pattern analysis only (skip crawl)
 *   --reset-trust      Reset all source trust scores to neutral
 *   --trust-path FILE  Override trust scores save path
 *   --output FILE      Override output JSON path
 *
 * ─── Scheduling Guide ───────────────────────────────────────────────────
 *
 * The crawler is designed for unattended cron or systemd operation.
 *
 * 1) CRON (recommended for simple setups):
 *
 *    # Run every 6 hours, auto-ingest high-confidence findings
 *    0 0,6,12,18 * * * cd /path/to/project && npx tsx scripts/autonomous-crawler.ts --cron --apply >> /var/log/crawler.log 2>&1
 *
 *    # Weekly full crawl with lower threshold (discovers more)
 *    0 3 * * 0 cd /path/to/project && npx tsx scripts/autonomous-crawler.ts --cron --apply --min-score 0.50 >> /var/log/crawler-weekly.log 2>&1
 *
 * 2) SYSTEMD TIMER (recommended for production):
 *
 *    # /etc/systemd/system/distromap-crawler.service
 *    [Unit]
 *    Description=DistroMap Autonomous Crawler
 *    After=network-online.target
 *    Wants=network-online.target
 *
 *    [Service]
 *    Type=oneshot
 *    WorkingDirectory=/path/to/project
 *    ExecStart=/usr/bin/npx tsx scripts/autonomous-crawler.ts --cron --apply
 *    StandardOutput=append:/var/log/distromap-crawler.log
 *    StandardError=append:/var/log/distromap-crawler.log
 *
 *    # /etc/systemd/system/distromap-crawler.timer
 *    [Unit]
 *    Description=Run DistroMap crawler every 6 hours
 *
 *    [Timer]
 *    OnCalendar=*-*-* 00,06,12,18:00:00
 *    Persistent=true
 *    RandomizedDelaySec=300
 *
 *    [Install]
 *    WantedBy=timers.target
 *
 *    # Enable: systemctl enable --now distromap-crawler.timer
 *    # Logs:   journalctl -u distromap-crawler.service
 *
 * 3) POST-CRAWL REBUILD:
 *
 *    After the crawler ingests new distros, rebuild the frontend data:
 *    npm run build:data && npm run validate:data
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  SourceData, SourceFamily, SourceDistro, DistroStatus,
  DiscoveredDistro, DiscoverySource, SourceTrustRecord,
  SearchQuery, BaseDistro, DistroArch, DistroDesktop,
  CrawlReport,
} from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_PATH = resolve(ROOT, 'data/distros.json');
const DEFAULT_OUTPUT = resolve(ROOT, 'data/crawl-results.json');
const TRUST_PATH = resolve(ROOT, 'data/source-trust.json');
const ISO_METADATA_PATH = resolve(ROOT, 'data/iso-metadata.json');
const UA = 'DistroMap/0.2 AutonomousCrawler (https://github.com/DistroMap; research)';

/** Rotating user-agent pool to avoid fingerprint blocking. */
const UA_POOL: string[] = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
];

function randomUA(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

/* ========================================================================= */
/*  Section 1: Source Registry & Trust Management                             */
/* ========================================================================= */

const DEFAULT_TRUST_RECORDS: SourceTrustRecord[] = [
  { sourceId: 'wikipedia',   sourceType: 'wikipedia',   displayName: 'Wikipedia API',          successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.95 },
  { sourceId: 'distrowatch', sourceType: 'distrowatch', displayName: 'DistroWatch',            successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.90 },
  { sourceId: 'github',      sourceType: 'github',      displayName: 'GitHub Search',           successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.55 },
  { sourceId: 'gitlab',      sourceType: 'gitlab',      displayName: 'GitLab Search',           successes: 0, failures: 0, cooldownUntil: null, lastAccessed: 0, trustScore: 0.50 },
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

/** Friendly aliases → sourceId prefixes for the --sources flag. */
const SOURCE_ALIASES: Record<string, string[]> = {
  wiki:       ['wikipedia'],
  wikipedia:  ['wikipedia'],
  dw:         ['distrowatch'],
  distrowatch:['distrowatch'],
  gh:         ['github'],
  github:     ['github'],
  gl:         ['gitlab'],
  gitlab:     ['gitlab'],
  rss:        ['rss-'],
  rssfeed:    ['rss-'],
  web:        ['web-search'],
  search:     ['web-search'],
};

function resolveSourceFilter(filter: string[]): string[] {
  const resolved = new Set<string>();
  for (const f of filter) {
    const key = f.toLowerCase().trim();
    const prefixes = SOURCE_ALIASES[key];
    if (prefixes) {
      for (const p of prefixes) resolved.add(p);
    } else {
      resolved.add(key); // fall through to exact match
    }
  }
  return [...resolved];
}

function getActiveSources(records: SourceTrustRecord[], filter?: string[]): SourceTrustRecord[] {
  const now = Date.now();
  let active = records.filter((r) => {
    if (r.cooldownUntil && r.cooldownUntil > now) return false;
    return r.trustScore >= 0.2;
  });
  if (filter && filter.length > 0) {
    const resolved = resolveSourceFilter(filter);
    active = active.filter((r) =>
      resolved.some((prefix) => r.sourceId.startsWith(prefix) || r.sourceType.startsWith(prefix)),
    );
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
  opts?: { accept?: string; rotateUA?: boolean; extraHeaders?: Record<string, string> },
): Promise<Response | null> {

  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const ua = opts?.rotateUA !== false ? randomUA() : UA;
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': opts?.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          ...opts?.extraHeaders,
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '10', 10);
        console.warn(`  ⏳ Rate limited (429). Waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (res.status === 403 || res.status === 406) {
        // Blocked or not acceptable — rotate UA and retry
        console.warn(`  🔒 HTTP ${res.status} for ${url.slice(0, 80)}, rotating UA and retrying...`);
        await sleep(delay * (i + 2));
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

/**
 * Fetch a page and attempt to extract download URLs and checksums.
 * Used by the ISO mirror scanner.
 */
async function fetchTextWithRetry(
  url: string,
  retries = 2,
  delay = 1500,
  timeout = 15000,
): Promise<string | null> {
  const res = await fetchWithRetry(url, retries, delay, timeout, { accept: 'text/html,*/*' });
  if (!res) return null;
  try {
    return await res.text();
  } catch { return null; }
}

/**
 * Parse concurrent source results, collecting candidates and errors.
 */
function settleResults(
  results: PromiseSettledResult<{ name: string; candidates: DiscoveredDistro[]; error?: string }>[],
  allCandidates: DiscoveredDistro[],
  errors: Array<{ source: string; message: string }>,
  cronMode: boolean,
): void {
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { name, candidates: cands, error } = r.value;
      allCandidates.push(...cands);
      if (error) errors.push({ source: name, message: error });
      if (!cronMode) console.log(`    📊 ${name}: ${cands.length} candidates`);
    } else {
      errors.push({ source: 'unknown', message: String(r.reason) });
    }
  }
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

      // Enrich with Wikipedia infobox data for higher-confidence candidates
      let infoboxMeta: Partial<DiscoveredDistro> | null = null;
      if (confidence >= 0.5) {
        infoboxMeta = await fetchWikiInfobox(p.title);
        await sleep(80);
      }

      const key = name.toLowerCase();
      if (!candidates.has(key) || candidates.get(key)!.confidence < confidence) {
        const status: DistroStatus = /discontinued|defunct|abandoned/i.test(dl) ? 'discontinued' : 'active';
        candidates.set(key, {
          ...guessed,
          ...guessFamily(name, extract, patterns),
          ...(infoboxMeta ?? {}),
          // These must come last to override any infobox/guessed values
          id: slug,
          name,
          status,
          discoverySources: ['wikipedia'],
          sourceTitle: `Wikipedia: ${cat.replace('Category:', '')}`,
          sourceUrl: summary?.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
          confidence,
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

  // DistroWatch pages with distro listings
  const urls = [
    'https://distrowatch.com/dwres.php?resource=popularity',
    'https://distrowatch.com/search.php?status=Active',
    'https://distrowatch.com/dwres.php?resource=database',
    'https://distrowatch.com/dwres.php?resource=recent',
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
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

async function crawlGitHub(
  knownNames: Set<string>,
  knownIds: Set<string>,
): Promise<DiscoveredDistro[]> {
  const candidates: DiscoveredDistro[] = [];

  console.log('\n  📡 [GitHub] Searching for Linux distribution repositories...');
  if (GITHUB_TOKEN) console.log('    🔑  Using authenticated GitHub API (5000 req/h)');

  // Search query variations for finding distro repos
  const queries = [
    'topic:linux-distribution',
    'topic:linux-distro',
    'linux distribution in:readme',
    '"Linux distribution" in:description',
    '"operating system" in:readme "based on"',
    'topic:linux-iso',
    'topic:immutable-linux',
    'linux os build in:readme',
  ];

  for (const query of queries) {
    const params = new URLSearchParams({
      q: query,
      sort: 'updated',
      per_page: '30',
      type: 'repositories',
    });

    const url = `${GITHUB_API}/search/repositories?${params}`;
    const ghOpts: Parameters<typeof fetchWithRetry>[4] = { rotateUA: true };
    if (GITHUB_TOKEN) ghOpts.extraHeaders = { 'Authorization': `token ${GITHUB_TOKEN}` };
    const res = await fetchWithRetry(url, 2, 2000, 10000, ghOpts);
    if (!res) {
      await sleep(1500);
      continue;
    }

    let json: any;
    try { json = await res.json(); } catch { await sleep(1500); continue; }
    if (json.message?.includes('API rate limit')) {
      console.warn('    ⏳  GitHub rate limit hit. Set GITHUB_TOKEN for higher limits.');
      await sleep(30_000);
      continue;
    }
    const repos = json.items ?? [];
    console.log(`    ✓ ${query.slice(0, 50)}... → ${repos.length} results`);

    for (const repo of repos) {
      const name = repo.name;
      const fullName = repo.full_name;
      const description = repo.description ?? '';
      const topics = repo.topics ?? [];
      const language = repo.language ?? '';

      // Must look like a Linux distribution — strict filter
      const isDistro =
        topics.some((t: string) => /^(linux|distro|distribution|operating-system)/i.test(t)) ||
        /(linux distribution|operating system|linux distro|custom linux|build linux|linux iso|linux image)/i.test(description) ||
        (/(based on|derivative of|fork of)/i.test(description) &&
         /(debian|ubuntu|arch|fedora|rhel|gentoo|alpine|nixos|void|suse|slackware)/i.test(description));

      if (!isDistro) continue;

      // Exclude non-distro repos (tools, configs, packages, assets, websites)
      const nl = name.toLowerCase();
      const slug = nl.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (knownNames.has(nl) || knownIds.has(slug) || candidates.some((c) => c.id === slug)) continue;
      if (/^(packages?|repo-main|\.github|website|welcome-app|branding|assets?|icon|config|dotfiles?|docs?|scripts?|tools?|notifier|recovery|build|distro|distro-match|linux-iso|iso-builder|archiso|archlinux-installer|termux-packages|immutable-linux-framework|puppy-linux-kernel-maker|distro-louder|loongarch-packages|ci|cd|docker|container|kubernetes|ansible|nixpkgs|home-manager|flakes?)$/i.test(nl)) continue;
      if (/-packages$|-assets$|-branding$|-website$|-docs$|-config$|-overlay$|-repo$|-channel$/i.test(nl)) continue;
      // Skip repos that are clearly tools/configs, not distros
      if (/\b(tool|script|config|dotfile|overlay|channel|mate|panel|compose|studio|youtube|mate|helper|wrapper|manager|utility|plugin|extension|theme|icon|font)\b/i.test(nl) && !/\b(linux|os|distro)\b/i.test(nl)) continue;

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
  let score = 0.2; // lower base — require stronger signal
  const dl = description.toLowerCase();

  // Strong signals
  if (topics.some((t) => /^(linux|distro|distribution|operating-system)$/i.test(t))) score += 0.25;
  if (/\b(linux distribution|operating system|linux distro)\b/i.test(dl)) score += 0.25;
  if (/\b(based on|derivative of|fork of)\b/i.test(dl)) score += 0.15;
  if (/\b(debian|ubuntu|arch|fedora|rhel|gentoo|slackware|alpine|nixos|void|suse)\b/i.test(dl)) score += 0.15;

  // Medium signals
  if (/(install|iso|build|release|download|calamares|installer)/i.test(dl)) score += 0.08;
  if (/(desktop environment|window manager|package manager|init system)/i.test(dl)) score += 0.05;
  if (description.length > 80) score += 0.05;

  // Penalties for non-distro patterns
  if (/^(config|dotfile|script|tool|package|asset|branding|website|docs)/i.test(name)) score -= 0.3;
  if (/(configuration|dotfiles|scripts|automation for|personal)/i.test(dl) && !/distribution|distro/i.test(dl)) score -= 0.2;
  if (description.length < 20) score -= 0.1;

  return Math.max(0, Math.min(score, 1));
}

/* ========================================================================= */
/*  Section 5b: GitLab Engine                                                */
/* ========================================================================= */

const GITLAB_API = 'https://gitlab.com/api/v4';

async function crawlGitLab(
  knownNames: Set<string>,
  knownIds: Set<string>,
): Promise<DiscoveredDistro[]> {
  const candidates: DiscoveredDistro[] = [];

  console.log('\n  📡 [GitLab] Searching for Linux distribution projects...');

  const queries = [
    'linux distribution',
    'linux distro',
    'linux operating system',
    'custom linux iso',
  ];

  for (const query of queries) {
    const params = new URLSearchParams({
      search: query,
      order_by: 'last_activity_at',
      per_page: '100',
      search_namespaces: 'true',
    });

    const url = `${GITLAB_API}/projects?${params}`;
    const res = await fetchWithRetry(url, 2, 2000, 12000, { accept: 'application/json' });
    if (!res) {
      await sleep(1500);
      continue;
    }

    let repos: any[];
    try {
      repos = (await res.json()) as any[];
    } catch {
      await sleep(1500);
      continue;
    }

    console.log(`    ✓ "${query}" → ${repos.length} results`);

    for (const repo of repos) {
      const name: string = repo.name ?? '';
      const description: string = repo.description ?? '';
      const topics: string[] = repo.topics ?? [];

      const isDistro =
        topics.some((t: string) => /^(linux|distro|distribution|operating-system)/i.test(t)) ||
        /(linux distribution|operating system|linux distro)/i.test(description) ||
        /(based on|derivative of)/i.test(description);

      if (!isDistro) continue;

      const nl = name.toLowerCase();
      const slug = nl.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (knownNames.has(nl) || knownIds.has(slug) || candidates.some((c) => c.id === slug)) continue;

      const guessed = guessMetadata(name, description);
      const confidence = scoreGitLabCandidate(name, description, topics);

      candidates.push({
        id: slug,
        name,
        status: 'active',
        description: description || undefined,
        website: repo.web_url ?? undefined,
        discoverySources: ['gitlab'],
        sourceTitle: repo.path_with_namespace ?? name,
        sourceUrl: repo.web_url ?? '',
        confidence,
        baseDistro: guessBaseDistro(description, topics),
        desktopEnvironments: guessDesktops(description, topics),
        packageManager: guessed.packageManager ?? undefined,
        initSystem: guessed.initSystem ?? undefined,
        country: guessed.country ?? undefined,
        ...guessFamily(name, description, {} as any),
      });
    }

    await sleep(1500);
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function scoreGitLabCandidate(name: string, description: string, topics: string[]): number {
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
/*  Section 5c: ISO Mirror Scanner                                           */
/* ========================================================================= */

interface IsoCandidate {
  downloadUrl: string;
  isoChecksum?: string;
  version?: string;
  architecture?: DistroArch[];
}

/**
 * Probe a distro's website for download pages and extract ISO URLs,
 * checksums, and architecture info.
 */
async function probeIsoMirrors(
  distroName: string,
  website: string,
): Promise<IsoCandidate | null> {
  if (!website || website.startsWith('https://github.com') || website.startsWith('https://gitlab.com')) return null;

  // Try common download page paths
  const downloadPaths = ['/download', '/downloads', '/get', '/releases', '/wiki/download'];

  for (const path of downloadPaths) {
    try {
      const base = website.replace(/\/$/, '');
      const url = `${base}${path}`;
      const html = await fetchTextWithRetry(url, 1, 2000, 12000);
      if (!html || html.length < 200) continue;

      // Extract ISO download URLs
      const isoLinks = html.match(/href=["']([^"']*\.iso["'])/gi) ?? [];

      // Also look for direct ISO URLs in text
      const isoUrls = html.match(/https?:\/\/[^\s"'<>]+\.iso/gi) ?? [];
      const shaHashes = html.match(/\b[A-Fa-f0-9]{32}\b|\b[A-Fa-f0-9]{64}\b|\b[A-Fa-f0-9]{128}\b/g) ?? [];

      if (isoLinks.length === 0 && isoUrls.length === 0) continue;

      const firstIsoLink = isoLinks.length > 0 ? isoLinks[0] : undefined;
      const matchedLink = firstIsoLink
        ? firstIsoLink.match(/href=["']([^"']+)/i)?.[1]
        : undefined;
      const downloadUrl = matchedLink ?? isoUrls[0];
      if (!downloadUrl) continue;

      // Detect architecture from ISO filename
      const archMatch = downloadUrl.toLowerCase();
      const architectures: DistroArch[] = [];
      if (/x86[_-]?64|amd64|64bit/i.test(archMatch)) architectures.push('x86_64');
      if (/aarch64|arm64/i.test(archMatch)) architectures.push('aarch64');
      if (/i[36]86|x86(?![_-]?64)|32bit/i.test(archMatch)) architectures.push('i686');
      if (/armhf|armv7/i.test(archMatch)) architectures.push('armv7');
      if (/riscv|risc-v/i.test(archMatch)) architectures.push('riscv64');

      // Extract version from filename
      const versionMatch = downloadUrl.match(/(\d+\.\d+(?:\.\d+)?(?:[-.]?(?:rc|beta|alpha)\d*)?)/i);
      const version = versionMatch?.[1];

      return {
        downloadUrl: downloadUrl.replace(/["']/g, ''),
        isoChecksum: shaHashes[0] ?? undefined,
        version: version ?? undefined,
        architecture: architectures.length > 0 ? architectures : undefined,
      };
    } catch {
      // try next path
    }
  }

  return null;
}

/* ========================================================================= */
/*  Section 5d: Wikipedia Infobox Parser                                     */
/* ========================================================================= */

/**
 * Fetch wikitext from a Wikipedia article's infobox section and extract
 * structured metadata: version, base distro, architecture, package manager,
 * desktop environments, etc.
 */
async function fetchWikiInfobox(
  title: string,
): Promise<Partial<DiscoveredDistro> | null> {
  const params = new URLSearchParams({
    action: 'query', format: 'json',
    prop: 'revisions',
    titles: title.replace(/ /g, '_'),
    rvprop: 'content',
    rvsection: '0',
    rvslots: 'main',
    origin: '*',
  });

  const res = await fetchWithRetry(`${WIKI_API}?${params}`, 2, 500, 10000, { accept: 'application/json', rotateUA: false });
  if (!res) return null;

  try {
    const json = (await res.json()) as any;
    const pages = json.query?.pages ?? {};
    const page = Object.values(pages)[0] as any;
    const wikitext: string = page?.revisions?.[0]?.slots?.main?.['*'] ?? '';
    if (!wikitext || wikitext.length < 100) return null;

    const meta: Partial<DiscoveredDistro> = {};

    // Extract infobox fields using regex on wikitext
    const field = (key: string): string | undefined => {
      const re = new RegExp(`(?:^|\n)\\s*\\|\\s*${key}\\s*=\\s*([^\n|]+)`, 'i');
      const m = wikitext.match(re);
      return m?.[1]?.trim().replace(/\[\[|\]\]/g, '').replace(/'''?/g, '') || undefined;
    };

    // Version
    const version = field('latest_release_version');
    if (version) meta.version = version;

    // Package manager
    const pkg = field('package_manager');
    if (pkg) {
      const pl = pkg.toLowerCase();
      if (/apt|dpkg/i.test(pl)) meta.packageManager = 'apt/dpkg';
      else if (/pacman/i.test(pl)) meta.packageManager = 'pacman';
      else if (/dnf|yum|rpm/i.test(pl)) meta.packageManager = 'dnf/rpm';
      else if (/portage/i.test(pl)) meta.packageManager = 'portage';
      else if (/nix/i.test(pl) && !/nixos/i.test(pl)) meta.packageManager = 'nix';
      else if (/snap/i.test(pl)) meta.packageManager = 'snap';
      else if (/flatpak/i.test(pl)) meta.packageManager = 'flatpak';
      else if (/xbps/i.test(pl)) meta.packageManager = 'xbps';
      else if (/eopkg/i.test(pl)) meta.packageManager = 'eopkg';
      else if (/guix/i.test(pl)) meta.packageManager = 'guix';
      else if (/slackpkg/i.test(pl)) meta.packageManager = 'slackpkg';
    }

    // Init system
    const init = field('init') ?? field('init_system');
    if (init) {
      if (/systemd/i.test(init)) meta.initSystem = 'systemd';
      else if (/openrc/i.test(init)) meta.initSystem = 'OpenRC';
      else if (/runit/i.test(init)) meta.initSystem = 'runit';
      else if (/s6/i.test(init)) meta.initSystem = 's6';
      else if (/sysvinit/i.test(init)) meta.initSystem = 'sysvinit';
      else if (/launchd/i.test(init)) meta.initSystem = 'launchd';
    }

    // Architecture
    const arch = field('architecture');
    if (arch) {
      const arches: DistroArch[] = [];
      const al = arch.toLowerCase();
      if (/x86[_-]?64|amd64/i.test(al)) arches.push('x86_64');
      if (/aarch64|arm64/i.test(al)) arches.push('aarch64');
      if (/i[36]86|x86(?![_-]?64)/i.test(al)) arches.push('i686');
      if (/armv7|armhf/i.test(al)) arches.push('armv7');
      if (/riscv|risc-v/i.test(al)) arches.push('riscv64');
      if (/ppc64|powerpc/i.test(al)) arches.push('ppc64le');
      if (/s390/i.test(al)) arches.push('s390x');
      if (arches.length > 0) meta.architecture = arches;
    }

    // Desktop environments
    const de = field('desktop') ?? field('desktop_environment');
    if (de) {
      const desktops = guessDesktops(de);
      if (desktops) meta.desktopEnvironments = desktops;
    }

    // License
    const license = field('license');
    if (license) {
      if (/gpl/i.test(license)) meta.license = license.includes('v3') ? 'GPLv3' : 'GPLv2/GPLv3';
      else if (/mit/i.test(license)) meta.license = 'MIT';
      else if (/apache/i.test(license)) meta.license = 'Apache';
      else if (/bsd/i.test(license)) meta.license = 'BSD';
      else meta.license = license.slice(0, 60);
    }

    // Country
    const country = field('country') ?? field('language');
    if (country && !meta.country) {
      const guessed = guessMetadata('', country);
      if (guessed.country) meta.country = guessed.country;
    }

    // Website
    const website = field('website');
    if (website && website.startsWith('http')) meta.website = website;

    // Release model
    const releaseModel = field('release_model') ?? field('update');
    if (releaseModel) {
      const rl = releaseModel.toLowerCase();
      if (/rolling/i.test(rl)) meta.releaseModel = 'rolling';
      else if (/fixed|point/i.test(rl)) meta.releaseModel = 'fixed';
      else if (/lts|long.term/i.test(rl)) meta.releaseModel = 'lts';
    }

    // Founded / first release
    const releaseDate = field('release_date') ?? field('first_release_date');
    if (releaseDate) {
      const yearMatch = releaseDate.match(/(\d{4})/);
      if (yearMatch) {
        const y = parseInt(yearMatch[1], 10);
        if (y >= 1991 && y <= 2026) meta.founded = y;
      }
    }

    return meta;
  } catch {
    return null;
  }
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
    let extractedCount = 0;

    if (abstract) {
      const extracted = extractFromAbstract(abstract, knownNames, knownIds);
      extractedCount += extracted.length;
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
      extractedCount += extracted.length;
      for (const d of extracted) {
        if (!candidates.some((c) => c.id === d.id)) {
          d.discoverySources = ['web-search'];
          d.sourceTitle = `Search: ${sq.query}`;
          d.confidence = Math.min(0.5, d.confidence);
          candidates.push(d);
        }
      }
    }

    // DuckDuckGo HTML fallback: scrape the HTML results page for more mentions
    if (extractedCount === 0 && results.length === 0) {
      try {
        const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(sq.query)}`;
        const htmlRes = await fetchWithRetry(htmlUrl, 1, 2000, 8000, { accept: 'text/html' });
        if (htmlRes) {
          const html = await htmlRes.text();
          // Extract result snippets from DuckDuckGo HTML
          const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
          let snippetMatch: RegExpExecArray | null;
          while ((snippetMatch = snippetRegex.exec(html)) !== null) {
            const snippet = snippetMatch[1].replace(/<[^>]+>/g, '').trim();
            const extracted = extractFromAbstract(snippet, knownNames, knownIds);
            for (const d of extracted) {
              if (!candidates.some((c) => c.id === d.id)) {
                d.discoverySources = ['web-search'];
                d.sourceTitle = `Search: ${sq.query}`;
                d.confidence = Math.min(0.45, d.confidence);
                candidates.push(d);
              }
            }
          }
        }
      } catch { /* ignore HTML fallback errors */ }
    }

    console.log(`    ✓ "${sq.query.slice(0, 50)}" → ${extractedCount + results.length} results`);
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

  // Pattern 1: "Name Linux/OS/Distribution"
  const distroMentions = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Linux|OS|Distribution)\b/g) ?? [];
  // Pattern 2: "Name Linux X.Y" (versioned)
  const versionedMentions = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Linux\s+\d+[\d.]*/g) ?? [];
  // Pattern 3: "based on X" / "derivative of X" where X is a distro name
  const basedOnMentions = text.match(/\bbased on ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g) ?? [];
  // Pattern 4: "X-based" or "X-derived" at word boundaries
  const basedPrefixes = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[-]based\b/gi) ?? [];

  const allMentions = [...distroMentions, ...versionedMentions, ...basedOnMentions, ...basedPrefixes];

  for (const mention of allMentions) {
    // Clean up: remove trailing "Linux", "OS", "based", etc.
    let name = mention
      .replace(/\s*(Linux|OS|Distribution)\s*(\d[\d.]*)?\s*$/i, '')
      .replace(/\s*(based|derived|fork)\s*$/i, '')
      .replace(/\s*-\s*based\s*$/i, '')
      .trim();

    if (name.length < 2 || name.length > 60) continue;

    const nl = name.toLowerCase();
    const slug = nl.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (knownNames.has(nl) || knownIds.has(slug) || results.some((r) => r.id === slug)) continue;

    // Filter out generic words
    if (/^(the|a|an|new|old|best|top|free|open|source|community|enterprise|server|desktop|minimal|light|heavy)/i.test(name)) continue;

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

  // --- Required fields ---
  if (!d.name || d.name.length < 2) errors.push('Name is too short or empty');
  if (!d.id || !VALID_ID_REGEX.test(d.id)) errors.push(`Invalid slug: "${d.id}"`);
  if (d.status !== 'active' && d.status !== 'discontinued') errors.push(`Invalid status: "${d.status}"`);

  // --- Confidence bounds ---
  if (d.confidence < 0 || d.confidence > 1) warnings.push(`Confidence out of range: ${d.confidence}`);
  if (d.confidence < 0.3) warnings.push(`Very low confidence: ${d.confidence}`);

  // --- Description checks ---
  if (d.description && d.description.length > 2000) warnings.push('Description exceeds 2000 chars');
  if (d.description && d.description.length < 10) warnings.push('Description is suspiciously short');
  // Reject if description doesn't mention Linux/distribution/OS at all
  if (d.description && !/(linux|distribution|distro|operating system|os|based on|derivative)/i.test(d.description)) {
    warnings.push('Description does not mention Linux/distribution/OS');
  }

  // --- Non-distro filters ---
  if (/^(linux|gnu|kernel|wayland|systemd|gnome|kde|xfce|lxde|lxqt|mate|cinnamon|budgie|sway|hyprland|i3|openbox)$/i.test(d.name.trim())) {
    errors.push('Name is a Linux component or DE, not a distro');
  }
  // Reject generic/tool names
  if (/^(ci|cd|docker|container|ansible|nixpkgs|home-manager|flakes?|packages?|repo-main|\.github|website|welcome-app|branding|assets?|icon|config|dotfiles?|docs?|scripts?|tools?|notifier|recovery|build|distro|distro-match|linux-iso|iso-builder|archiso|archlinux-installer|termux-packages|immutable-linux-framework|puppy-linux-kernel-maker|distro-louder|loongarch-packages|ci|cd)$/i.test(d.name.trim())) {
    errors.push('Name is a generic tool/config, not a distro');
  }

  // --- Schema field validation ---
  const VALID_ARCHS: DistroArch[] = ['x86_64', 'i686', 'aarch64', 'armv7', 'riscv64', 'ppc64le', 's390x', 'mips', 'sparc64', 'loongarch64'];
  if (d.architecture) {
    const invalid = d.architecture.filter((a) => !VALID_ARCHS.includes(a));
    if (invalid.length > 0) warnings.push(`Invalid architectures: ${invalid.join(', ')}`);
  }

  const VALID_DESKTOPS: DistroDesktop[] = ['GNOME', 'KDE', 'XFCE', 'LXQt', 'LXDE', 'MATE', 'Cinnamon', 'Budgie', 'Deepin', 'Pantheon', 'Sway', 'i3', 'Hyprland', 'Openbox', 'Fluxbox', 'IceWM', 'Enlightenment', 'Razor-qt', 'Sugar', 'Phosh', 'Plasma Mobile', 'Headless', 'None', 'Custom', 'Other'];
  if (d.desktopEnvironments) {
    const invalid = d.desktopEnvironments.filter((de) => !VALID_DESKTOPS.includes(de));
    if (invalid.length > 0) warnings.push(`Invalid desktop environments: ${invalid.join(', ')}`);
  }

  const VALID_MODELS: string[] = ['rolling', 'fixed', 'semi-rolling', 'half-rolling', 'lts', 'static'];
  if (d.releaseModel && !VALID_MODELS.includes(d.releaseModel)) {
    warnings.push(`Invalid releaseModel: ${d.releaseModel}`);
  }

  // --- URL format checks ---
  if (d.website && !/^https?:\/\//i.test(d.website)) {
    warnings.push(`Invalid website URL: ${d.website}`);
  }
  if (d.downloadUrl && !/^https?:\/\//i.test(d.downloadUrl)) {
    warnings.push(`Invalid downloadUrl: ${d.downloadUrl}`);
  }
  if (d.isoChecksum && !/^[A-Fa-f0-9]{32,128}$/.test(d.isoChecksum)) {
    warnings.push(`isoChecksum does not look like a valid hash`);
  }

  // --- Version format ---
  if (d.version && !/^\d/.test(d.version)) {
    warnings.push(`Version string does not start with a digit: ${d.version}`);
  }

  // --- Founded year range ---
  if (d.founded !== undefined && (d.founded < 1991 || d.founded > 2026)) {
    warnings.push(`Founded year out of range: ${d.founded}`);
  }

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
): { newFamilies: number; newDistros: number; updatedDistros: number; errors: Array<{ source: string; message: string }> } {
  const errors: Array<{ source: string; message: string }> = [];
  const newFamilies = new Map<string, SourceFamily>();
  let newDistros = 0;
  let updatedDistros = 0;

  for (const c of candidates) {
    const valid = validateDistro(c);
    if (!valid.passed) {
      errors.push({ source: c.id, message: valid.errors.join('; ') });
      for (const src of c.discoverySources) {
        const rec = trustRecords.find((r) => r.sourceId.startsWith(src));
        if (rec) recordFailure(trustRecords, rec.sourceId);
      }
      continue;
    }

    // Determine family
    let familyId = c.familyId;
    if (!familyId) {
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

    // === IDEMPOTENT UPSERT ===
    const existing = sourceData.distros.find((ex) => ex.id === c.id);

    if (existing) {
      // UPDATE: merge new data into existing record
      let wasUpdated = false;

      // Fill in missing scalar fields
      const scalarFields: Array<[keyof SourceDistro, unknown]> = [
        ['country', c.country],
        ['packageManager', c.packageManager],
        ['initSystem', c.initSystem],
        ['releaseModel', c.releaseModel],
        ['license', c.license],
        ['website', c.website],
        ['wikipedia', c.wikipedia],
        ['founded', c.founded],
        ['baseDistro', c.baseDistro],
        ['version', c.version],
        ['downloadUrl', c.downloadUrl],
        ['isoChecksum', c.isoChecksum],
      ];

      // Merge array fields (architecture, desktopEnvironments)
      if (c.architecture?.length) {
        const prev = existing.architecture ?? [];
        const merged = [...new Set([...prev, ...c.architecture])];
        if (merged.length > prev.length) { (existing as any).architecture = merged; wasUpdated = true; }
      }
      if (c.desktopEnvironments?.length) {
        const prevDE = existing.desktopEnvironments ?? [];
        const mergedDE = [...new Set([...prevDE, ...c.desktopEnvironments])];
        if (mergedDE.length > prevDE.length) { (existing as any).desktopEnvironments = mergedDE; wasUpdated = true; }
      }

      for (const [key, val] of scalarFields) {
        if (val && !(existing as any)[key]) {
          (existing as any)[key] = val;
          wasUpdated = true;
        }
      }

      // Enrich description if existing is shorter
      if (c.description && (!existing.description || c.description.length > existing.description.length + 20)) {
        existing.description = c.description.slice(0, 500);
        wasUpdated = true;
      }

      // Update status if discovered as discontinued
      if (c.status === 'discontinued' && existing.status === 'active') {
        existing.status = 'discontinued';
        if (c.discontinuedAt) existing.discontinuedAt = c.discontinuedAt;
        wasUpdated = true;
      }

      if (wasUpdated) {
        existing.lastUpdated = new Date().toISOString();
        updatedDistros++;
        console.log(`     🔄  Updated: ${c.name} (${c.id})`);
      }
    } else {
      // INSERT: create new record with timestamp
      sourceData.distros.push({
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
        baseDistro: c.baseDistro ?? undefined,
        version: c.version ?? undefined,
        architecture: c.architecture ?? undefined,
        desktopEnvironments: c.desktopEnvironments ?? undefined,
        downloadUrl: c.downloadUrl ?? undefined,
        isoChecksum: c.isoChecksum ?? undefined,
        lastUpdated: new Date().toISOString(),
      });
      newDistros++;
      console.log(`     🐧  ${c.name} (${c.id}) → ${familyId}`);
    }

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

  // Write back to distros.json
  writeFileSync(DATA_PATH, JSON.stringify(sourceData, null, 2) + '\n');

  return {
    newFamilies: newFamilies.size,
    newDistros,
    updatedDistros,
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
  ingestionStats?: { newFamilies: number; newDistros: number; updatedDistros: number },
): CrawlReport {
  const passing = candidates.filter((c) => c.confidence >= minScore);
  const report: CrawlReport = {
    cycleId,
    startedAt,
    finishedAt: new Date().toISOString(),
    sourcesQueried: trustRecords.filter((r) => r.lastAccessed > 0).length,
    candidatesFound: candidates.length,
    candidatesAccepted: passing.length,
    newFamilies: ingestionStats?.newFamilies ?? 0,
    newDistros: ingestionStats?.newDistros ?? 0,
    updatedDistros: ingestionStats?.updatedDistros ?? 0,
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
    if (sourceFilter) {
      console.log(`⏭  No active sources matched filter: ${sourceFilter.join(', ')}`);
      console.log('    Available: wiki, dw, gh, gl, rss, web\n');
    } else {
      console.log('⏭  All sources in cooldown. Run with --reset-trust to force.\n');
    }
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

    // === STEP 4: GitHub + GitLab crawl (concurrent) ===
    const codeHostingTasks: Promise<{ name: string; candidates: DiscoveredDistro[]; error?: string }>[] = [];

    if (activeSources.some((s) => s.sourceId === 'github')) {
      codeHostingTasks.push(
        crawlGitHub(knownNames, knownIds)
          .then((c) => ({ name: 'GitHub', candidates: c }))
          .catch((err) => ({ name: 'GitHub', candidates: [] as DiscoveredDistro[], error: `GitHub crawl failed: ${err.message}` })),
      );
    }

    if (activeSources.some((s) => s.sourceId === 'gitlab')) {
      codeHostingTasks.push(
        crawlGitLab(knownNames, knownIds)
          .then((c) => ({ name: 'GitLab', candidates: c }))
          .catch((err) => ({ name: 'GitLab', candidates: [] as DiscoveredDistro[], error: `GitLab crawl failed: ${err.message}` })),
      );
    }

    if (codeHostingTasks.length > 0) {
      const codeResults = await Promise.allSettled(codeHostingTasks);
      settleResults(codeResults, allCandidates, errors, cronMode);
      for (const r of codeResults) {
        if (r.status === 'fulfilled' && !r.value.error) {
          if (r.value.name === 'GitHub') recordSuccess(trustRecords, 'github');
          if (r.value.name === 'GitLab') recordSuccess(trustRecords, 'gitlab');
        } else {
          if (r.status === 'fulfilled' && r.value.name === 'GitHub') recordFailure(trustRecords, 'github');
          if (r.status === 'fulfilled' && r.value.name === 'GitLab') recordFailure(trustRecords, 'gitlab');
        }
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
  let ingestResult: { newFamilies: number; newDistros: number; updatedDistros: number; errors: Array<{ source: string; message: string }> } | undefined;
  if (applyFlag && accepted.length > 0) {
    if (!cronMode) console.log('\n✏️  Phase 4: Ingesting into distros.json...');
    ingestResult = ingestCandidates(accepted, sourceData, trustRecords);
    if (!cronMode) {
      console.log(`    ✅  Ingested ${ingestResult.newDistros} new distros, ${ingestResult.updatedDistros} updated, ${ingestResult.newFamilies} new families`);
    }
    errors.push(...ingestResult.errors);

    // === STEP 8b: Enrich high-confidence new distros with ISO probe ===
    if (!cronMode) console.log('\n🌐  Phase 4b: Probing download pages for ISO metadata...');
    const newlyAdded = sourceData.distros.filter((d) => {
      return accepted.some((a) => a.id === d.id) && d.website;
    });

    // Load existing ISO metadata (idempotent — merge, don't overwrite)
    let isoMetaMap: Record<string, { downloadUrl?: string; isoChecksum?: string; version?: string; architecture?: string[]; probedAt: string }> = {};
    try {
      if (existsSync(ISO_METADATA_PATH)) {
        isoMetaMap = JSON.parse(readFileSync(ISO_METADATA_PATH, 'utf-8'));
      }
    } catch { /* start fresh */ }

    let isoProbed = 0;
    let isoEnriched = 0;
    for (const d of newlyAdded.slice(0, 20)) {
      const iso = await probeIsoMirrors(d.name, d.website!);
      if (iso) {
        isoProbed++;
        if (!cronMode) console.log(`     📦  ${d.name}: ISO found at ${iso.downloadUrl.slice(0, 80)}`);

        // Store ISO metadata in dedicated file (not in description)
        isoMetaMap[d.id] = {
          downloadUrl: iso.downloadUrl,
          isoChecksum: iso.isoChecksum,
          version: iso.version,
          architecture: iso.architecture,
          probedAt: new Date().toISOString(),
        };
        isoEnriched++;
      }
      await sleep(800);
    }

    // Persist ISO metadata
    if (isoEnriched > 0) {
      mkdirSync(dirname(ISO_METADATA_PATH), { recursive: true });
      writeFileSync(ISO_METADATA_PATH, JSON.stringify(isoMetaMap, null, 2));
    }
    if (!cronMode && isoProbed > 0) console.log(`    ✓  Probed ${isoProbed} pages, stored ${isoEnriched} ISO metadata records`);
  }

  // Save trust records after cycle
  saveTrustRecords(trustRecords);

  // === STEP 9: Report ===
  const report = generateReport(
    accepted, sourceData, trustRecords, minScore, outputPath,
    cycleId, startedAt, errors,
    ingestResult ? { newFamilies: ingestResult.newFamilies, newDistros: ingestResult.newDistros, updatedDistros: ingestResult.updatedDistros } : undefined,
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
