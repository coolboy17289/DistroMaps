#!/usr/bin/env tsx
/**
 * discover-distros.ts — A self-learning distro discovery engine.
 *
 * How it works:
 * 1. LEARN — Analyze all 408 existing distros for patterns:
 *    - Name n-grams (prefixes, suffixes, infixes)
 *    - Family-specific naming conventions
 *    - Description keywords → family associations
 *    - Package manager → family correlations
 *    - Country → family correlations
 *
 * 2. DISCOVER — Use Wikipedia's API to find new distros:
 *    - Crawl "Category:Linux distributions" and its subcategories
 *    - Crawl per-family categories (e.g. "Category:Debian derivatives")
 *    - Score each candidate against learned patterns
 *
 * 3. REPORT — Output with confidence scores, suggested families, and smart metadata
 *
 * Self-learning loop: as you accept suggestions (adding them to distros.json),
 * re-running the script produces smarter, more confident results.
 *
 * Usage:
 *   npx tsx scripts/discover-distros.ts              # dry-run: report only
 *   npx tsx scripts/discover-distros.ts --apply      # auto-add high-confidence finds
 *   npx tsx scripts/discover-distros.ts --min-score 0.6  # lower confidence threshold
 *   npx tsx scripts/discover-distros.ts --category "Category:Arch Linux derivatives"
 *
 * Flags:
 *   --apply         Auto-merge findings with score >= threshold into data/distros.json
 *   --min-score N   Minimum confidence score (default 0.75, range 0–1)
 *   --no-crawl      Skip Wikipedia crawling, just analyze patterns from existing data
 *   --category CAT  Only crawl a specific Wikipedia category
 *   --output FILE   Write suggestions JSON to a specific path
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceData, SourceFamily, SourceDistro } from '../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_PATH = resolve(ROOT, 'data/distros.json');
const DEFAULT_OUTPUT = resolve(ROOT, 'data/discoveries.json');

/* ========================================================================= */
/*  Types                                                                    */
/* ========================================================================= */

interface NamePatterns {
  /** How often each word token appears across all distro names */
  tokens: Map<string, TokenStat>;
  /** How often each 2-gram appears  (e.g. "arch linux", "ubuntu server") */
  bigrams: Map<string, number>;
  /** How often each prefix (first 3-8 chars) appears */
  prefixes: Map<string, number>;
  /** How often each suffix (last 3-8 chars) appears */
  suffixes: Map<string, number>;
}

interface TokenStat {
  count: number;
  families: Set<string>;
}

interface LearnedPatterns {
  names: NamePatterns;
  /** For each family, the most common description keywords and their weights */
  familyKeywords: Map<string, Map<string, number>>;
  /** For each family, the most common package managers and their weights */
  familyPkgManagers: Map<string, Map<string, number>>;
  /** For each family, the most common countries/distribution */
  familyCountries: Map<string, Map<string, number>>;
  /** For each family, the most common init systems */
  familyInitSystems: Map<string, Set<string>>;
  /** For each family, release model frequencies */
  familyReleaseModels: Map<string, Map<string, number>>;
  /** For each family, typical years active (for guessing founded) */
  familyFoundedRange: Map<string, { min: number; max: number; median: number }>;
  /** Keywords that strongly suggest specific families */
  keywordToFamily: Map<string, Map<string, number>>;
  /** Token-to-family associations (e.g. "ubuntu" → ubuntu family) */
  tokenToFamily: Map<string, Map<string, number>>;
  /** All known distro names (for dedup) */
  knownNames: Set<string>;
  /** All known distro IDs (for dedup) */
  knownIds: Set<string>;
  /** Family color palette for new families */
  familyColors: Map<string, { primary: string; secondary: string }>;
}

interface DiscoveryCandidate {
  name: string;
  wikipediaTitle: string;
  wikipediaUrl: string;
  wikipediaSummary: string;
  suggestedFamilyId: string | null;
  suggestedFamilyName: string | null;
  status: 'active' | 'discontinued';
  confidence: number;
  confidenceBreakdown: {
    nameMatch: number;
    descriptionMatch: number;
    categoryMatch: number;
    familyConsistency: number;
    pageQuality: number;
  };
  guessedMetadata: {
    country: string | null;
    packageManager: string | null;
    initSystem: string | null;
    releaseModel: string | null;
    founded: number | null;
  };
  matchingSignals: string[];
  sourceCategories: string[];
  existingMatch: string | null; // ID of matching existing distro if duplicate
}

interface CategoryPage {
  title: string;
  pageid: number;
}

/* ========================================================================= */
/*  Pattern Learning                                                         */
/* ========================================================================= */

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, '')
    .split(/[\s/-]+/)
    .filter((t) => t.length > 0);
}

function extractPrefixes(name: string): string[] {
  const n = name.toLowerCase();
  const prefixes: string[] = [];
  for (let len = 3; len <= Math.min(8, n.length); len++) {
    prefixes.push(n.slice(0, len));
  }
  return prefixes;
}

function extractSuffixes(name: string): string[] {
  const n = name.toLowerCase();
  const suffixes: string[] = [];
  for (let len = 3; len <= Math.min(8, n.length); len++) {
    suffixes.push(n.slice(-len));
  }
  return suffixes;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'for', 'in', 'on', 'with', 'is',
    'based', 'that', 'this', 'its', 'are', 'was', 'has', 'been', 'from',
    'to', 'by', 'as', 'at', 'it', 'os', 'linux',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stopWords.has(t));
}

function learnPatterns(source: SourceData): LearnedPatterns {
  const knownNames = new Set<string>();
  const knownIds = new Set<string>();

  // Name patterns
  const tokens = new Map<string, TokenStat>();
  const bigrams = new Map<string, number>();
  const prefixes = new Map<string, number>();
  const suffixes = new Map<string, number>();

  // Family pattern stores
  const familyKeywords = new Map<string, Map<string, number>>();
  const familyPkgManagers = new Map<string, Map<string, number>>();
  const familyCountries = new Map<string, Map<string, number>>();
  const familyInitSystems = new Map<string, Set<string>>();
  const familyReleaseModels = new Map<string, Map<string, number>>();
  const familyFoundedRange = new Map<string, { min: number; max: number; median: number }>();
  const keywordToFamily = new Map<string, Map<string, number>>();
  const tokenToFamily = new Map<string, Map<string, number>>();
  const familyColors = new Map<string, { primary: string; secondary: string }>();

  // Collect all family IDs (from families array AND from distros referencing them)
  const allFamilyIds = new Set(source.families.map((f) => f.id));
  for (const d of source.distros) {
    if (d.familyId) allFamilyIds.add(d.familyId);
  }

  // Initialize family stores
  for (const fid of allFamilyIds) {
    if (!familyKeywords.has(fid)) familyKeywords.set(fid, new Map());
    if (!familyPkgManagers.has(fid)) familyPkgManagers.set(fid, new Map());
    if (!familyCountries.has(fid)) familyCountries.set(fid, new Map());
    if (!familyInitSystems.has(fid)) familyInitSystems.set(fid, new Set());
    if (!familyReleaseModels.has(fid)) familyReleaseModels.set(fid, new Map());
    const fam = source.families.find((f) => f.id === fid);
    familyColors.set(fid, {
      primary: fam?.color ?? generateColor(fid),
      secondary: fam?.colorSecondary ?? fam?.color ?? generateColor(fid),
    });
  }

  // Process each distro
  const familyYearLists = new Map<string, number[]>();

  for (const d of source.distros) {
    knownNames.add(d.name.toLowerCase());
    knownIds.add(d.id);

    const toks = tokenize(d.name);
    const descTokens = d.description ? extractKeywords(d.description) : [];

    // Name n-grams
    for (const t of toks) {
      if (!tokens.has(t)) tokens.set(t, { count: 0, families: new Set() });
      const ts = tokens.get(t)!;
      ts.count++;
      if (d.familyId) ts.families.add(d.familyId);

      // Token → family association
      if (!tokenToFamily.has(t)) tokenToFamily.set(t, new Map());
      const tf = tokenToFamily.get(t)!;
      tf.set(d.familyId, (tf.get(d.familyId) ?? 0) + 1);
    }

    for (let i = 0; i < toks.length - 1; i++) {
      const bg = `${toks[i]} ${toks[i + 1]}`;
      bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
    }

    for (const p of extractPrefixes(d.name)) {
      prefixes.set(p, (prefixes.get(p) ?? 0) + 1);
    }
    for (const s of extractSuffixes(d.name)) {
      suffixes.set(s, (suffixes.get(s) ?? 0) + 1);
    }

    // Description keywords → family
    if (d.familyId) {
      const fk = familyKeywords.get(d.familyId)!;
      for (const k of descTokens) {
        fk.set(k, (fk.get(k) ?? 0) + 1);

        // Reverse: keyword → family
        if (!keywordToFamily.has(k)) keywordToFamily.set(k, new Map());
        const kf = keywordToFamily.get(k)!;
        kf.set(d.familyId, (kf.get(d.familyId) ?? 0) + 1);
      }

      // Package manager → family
      if (d.packageManager) {
        const pmKey = d.packageManager.toLowerCase().replace(/[/\s]+/g, '_');
        const fpm = familyPkgManagers.get(d.familyId)!;
        fpm.set(pmKey, (fpm.get(pmKey) ?? 0) + 1);
      }

      // Country → family
      if (d.country) {
        const fc = familyCountries.get(d.familyId)!;
        fc.set(d.country, (fc.get(d.country) ?? 0) + 1);
      }

      // Init system
      if (d.initSystem) {
        familyInitSystems.get(d.familyId)!.add(d.initSystem.toLowerCase());
      }

      // Release model
      if (d.releaseModel) {
        const fr = familyReleaseModels.get(d.familyId)!;
        fr.set(d.releaseModel, (fr.get(d.releaseModel) ?? 0) + 1);
      }

      // Founded year
      if (d.founded) {
        if (!familyYearLists.has(d.familyId)) familyYearLists.set(d.familyId, []);
        familyYearLists.get(d.familyId)!.push(d.founded);
      }
    }
  }

  // Compute year ranges per family
  for (const [fid, years] of familyYearLists) {
    if (years.length > 0) {
      years.sort((a, b) => a - b);
      familyFoundedRange.set(fid, {
        min: years[0],
        max: years[years.length - 1],
        median: years[Math.floor(years.length / 2)],
      });
    }
  }

  return {
    names: { tokens, bigrams, prefixes, suffixes },
    familyKeywords,
    familyPkgManagers,
    familyCountries,
    familyInitSystems,
    familyReleaseModels,
    familyFoundedRange,
    keywordToFamily,
    tokenToFamily,
    knownNames,
    knownIds,
    familyColors,
  };
}

/* ========================================================================= */
/*  Wikipedia Crawling                                                       */
/* ========================================================================= */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const UA = 'DistroMap/0.1 (https://github.com/DistroMap; self-learning-discovery)';

/** Known Linux distro Wikipedia categories to crawl */
const LINUX_CATEGORIES = [
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
  'Category:Linux distributions for Raspberry Pi',
  'Category:Lightweight Linux distributions',
  'Category:Security-oriented Linux distributions',
  'Category:Linux distributions for enterprise',
  'Category:Linux distributions without systemd',
  'Category:RPM-based Linux distributions',
  'Category:Linux distributions that run from RAM',
  'Category:Linux live USB distributions',
  'Category:Penetration testing Linux distributions',
  'Category:Source-based Linux distributions',
  'Category:Rolling-release Linux distributions',
  'Category:Chinese Linux distributions',
  'Category:Indian Linux distributions',
  'Category:Russian Linux distributions',
  'Category:South American Linux distributions',
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  retries = 3,
  delay = 1000,
): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return res;
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
        console.warn(`  ⏳ Rate limited (429). Waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (res.status >= 400 && res.status < 500) return res; // won't succeed
      console.warn(`  ⚠️  HTTP ${res.status} for ${url}, retry ${i + 1}/${retries}`);
    } catch {
      console.warn(`  ⚠️  Network error for ${url}, retry ${i + 1}/${retries}`);
    }
    await sleep(delay * (i + 1));
  }
  return null;
}

async function fetchCategoryMembers(
  category: string,
  limit = 'max',
): Promise<CategoryPage[]> {
  const pages: CategoryPage[] = [];
  let cmcontinue: string | undefined;

  while (true) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      list: 'categorymembers',
      cmtitle: category,
      cmlimit: limit,
      cmtype: 'page',
      origin: '*',
    });
    if (cmcontinue) params.set('cmcontinue', cmcontinue);

    const url = `${WIKI_API}?${params}`;
    const res = await fetchWithRetry(url);
    if (!res) break;

    const json = (await res.json()) as {
      query?: { categorymembers?: Array<{ title: string; pageid: number }> };
      continue?: { cmcontinue?: string };
    };

    const members = json.query?.categorymembers ?? [];
    for (const m of members) {
      // Filter out non-distro pages
      if (
        m.title.startsWith('Category:') ||
        m.title.startsWith('Template:') ||
        m.title.startsWith('Portal:') ||
        m.title.startsWith('Wikipedia:') ||
        m.title.startsWith('List of') ||
        m.title.startsWith('Comparison of') ||
        m.title.startsWith('List_of') ||
        m.title.startsWith('Usage share')
      ) {
        continue;
      }
      pages.push(m);
    }

    cmcontinue = json.continue?.cmcontinue;
    if (!cmcontinue) break;
    await sleep(150); // rate limit
  }

  return pages;
}

async function fetchSubcategories(category: string): Promise<CategoryPage[]> {
  const subs: CategoryPage[] = [];
  let cmcontinue: string | undefined;

  while (true) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      list: 'categorymembers',
      cmtitle: category,
      cmlimit: 'max',
      cmtype: 'subcat',
      origin: '*',
    });
    if (cmcontinue) params.set('cmcontinue', cmcontinue);

    const url = `${WIKI_API}?${params}`;
    const res = await fetchWithRetry(url);
    if (!res) break;

    const json = (await res.json()) as {
      query?: { categorymembers?: Array<{ title: string; pageid: number }> };
      continue?: { cmcontinue?: string };
    };

    const members = json.query?.categorymembers ?? [];
    for (const m of members) {
      if (m.title.startsWith('Category:')) {
        subs.push(m);
      }
    }

    cmcontinue = json.continue?.cmcontinue;
    if (!cmcontinue) break;
    await sleep(150);
  }

  return subs;
}

async function fetchPageSummary(
  title: string,
): Promise<{ description?: string; extract?: string; url?: string } | null> {
  const url = `${WIKI_REST}/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const res = await fetchWithRetry(url, 2, 500);
  if (!res) return null;

  try {
    const json = (await res.json()) as {
      title?: string;
      description?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (!json.title) return null;
    return {
      description: json.description,
      extract: json.extract,
      url:
        json.content_urls?.desktop?.page ??
        `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    };
  } catch {
    return null;
  }
}

async function crawlWikipedia(
  patterns: LearnedPatterns,
  specificCategory?: string,
): Promise<DiscoveryCandidate[]> {
  const categories = specificCategory ? [specificCategory] : LINUX_CATEGORIES;
  const candidates: Map<string, DiscoveryCandidate> = new Map();

  console.log(`\n📡 Crawling ${categories.length} Wikipedia categories (with subcategories)...`);

  // Phase 1: collect all page titles from all categories and subcategories
  const allPages: Map<string, Set<string>> = new Map(); // title → categories

  for (const cat of categories) {
    console.log(`  📂 ${cat}`);
    const pages = await fetchCategoryMembers(cat);
    for (const p of pages) {
      if (!allPages.has(p.title)) allPages.set(p.title, new Set());
      allPages.get(p.title)!.add(cat);
    }

    // Fetch subcategories recursively
    const subs = await fetchSubcategories(cat);
    for (const sub of subs) {
      console.log(`    📁 ${sub.title}`);
      const subPages = await fetchCategoryMembers(sub.title);
      for (const p of subPages) {
        if (!allPages.has(p.title)) allPages.set(p.title, new Set());
        allPages.get(p.title)!.add(cat);
        allPages.get(p.title)!.add(sub.title);
      }
      await sleep(200);
    }
    await sleep(300);
  }

  console.log(`\n  📄 Found ${allPages.size} unique candidate pages. Fetching summaries...`);

  // Phase 2: fetch summaries and score candidates
  let processed = 0;
  for (const [title, cats] of allPages) {
    processed++;
    if (processed % 10 === 0) {
      process.stdout.write(`    ${processed}/${allPages.size}...\r`);
    }

    const summary = await fetchPageSummary(title);
    await sleep(100); // rate limit

    const name = title.replace(/_/g, ' ').replace(/ \(operating system\)$/, '').replace(/ \(OS\)$/, '');

    // Check if already known
    const existingMatch = findExistingMatch(name, patterns);

    const candidate = scoreCandidate(
      name,
      title,
      summary?.extract ?? summary?.description ?? '',
      [...cats],
      patterns,
      existingMatch,
    );

    if (candidate) {
      candidate.wikipediaUrl =
        summary?.url ??
        `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
      candidate.wikipediaSummary = (summary?.description ?? summary?.extract ?? '').slice(0, 300);

      const key = title.toLowerCase();
      if (!candidates.has(key) || (candidates.get(key)?.confidence ?? 0) < candidate.confidence) {
        candidates.set(key, candidate);
      }
    }
  }

  process.stdout.write(`    ${processed}/${allPages.size} done.\n`);
  return [...candidates.values()].sort((a, b) => b.confidence - a.confidence);
}

function findExistingMatch(
  name: string,
  patterns: LearnedPatterns,
): string | null {
  const nl = name.toLowerCase().trim();

  // Exact match on name
  if (patterns.knownNames.has(nl)) return nl;

  // Partial match: check if name contains a known distro or vice versa
  for (const known of patterns.knownNames) {
    if (nl.includes(known) || known.includes(nl)) {
      // Only match if it's a substantial overlap (avoid "Linux" matching everything)
      if (nl.length >= 6 && known.length >= 6) return known;
    }
  }

  // Match by ID normalization
  const id = nl.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (patterns.knownIds.has(id)) return id;

  return null;
}

/* ========================================================================= */
/*  Scoring Engine                                                           */
/* ========================================================================= */

function scoreCandidate(
  name: string,
  wikipediaTitle: string,
  description: string,
  categories: string[],
  patterns: LearnedPatterns,
  existingMatch: string | null,
): DiscoveryCandidate | null {
  const toks = tokenize(name);
  const descTokens = extractKeywords(description);
  const descFull = description.toLowerCase();

  // Skip if existing match is exact
  if (existingMatch && patterns.knownNames.has(existingMatch)) {
    return null; // Already in dataset
  }

  // Skip common non-distro pages that slip through
  const skipPatterns = [
    /^linux$/i, /^gnu$/i, /^kernel/i, /^xfree86/i, /^x\.org/i,
    /^wayland/i, /^systemd/i, /^gnome/i, /^kde/i, /^xfce/i,
    /^lxqt/i, /^linux .* user.* group/i, /^linux foundation/i,
    /^linux .* conference/i, /^linux .* history/i, /^linux .* kernel/i,
    /^linux .* adoption/i, /^linux .* trademark/i, /^linux .* lawsuit/i,
    /^linux .* criticism/i, /^linux .* magazine/i, /^linux .* distribution/i,
    /^allwinner/i, /^linux.*software/i, /^timeline.*linux/i,
  ];
  for (const sp of skipPatterns) {
    if (sp.test(name)) return null;
  }

  // ---- Scoring components ----

  // 1. Name match score (0-1): how much does the name look like a real distro?
  let nameScore = 0;

  // Check if name tokens match known distro tokens
  let matchedTokens = 0;
  for (const t of toks) {
    if (patterns.names.tokens.has(t)) {
      matchedTokens++;
    }
  }
  nameScore += (toks.length > 0 ? matchedTokens / toks.length : 0) * 0.4;

  // Check if name prefixes/suffixes match known patterns
  let matchedPrefixes = 0;
  let totalPrefixes = 0;
  for (const p of extractPrefixes(name)) {
    totalPrefixes++;
    if ((patterns.names.prefixes.get(p) ?? 0) > 1) matchedPrefixes++;
  }
  nameScore += (totalPrefixes > 0 ? matchedPrefixes / totalPrefixes : 0) * 0.2;

  let matchedSuffixes = 0;
  let totalSuffixes = 0;
  for (const s of extractSuffixes(name)) {
    totalSuffixes++;
    if ((patterns.names.suffixes.get(s) ?? 0) > 1) matchedSuffixes++;
  }
  nameScore += (totalSuffixes > 0 ? matchedSuffixes / totalSuffixes : 0) * 0.2;
  // Boost for having "Linux" or "OS" in the name
  if (/\b(linux|os|nix|ux)\b/i.test(name)) nameScore += 0.15;
  // Boost for having known distro-family token
  if (toks.some((t) => (patterns.tokenToFamily.get(t)?.size ?? 0) > 0)) nameScore += 0.05;

  nameScore = Math.min(nameScore, 1);

  // 2. Description match score (0-1): does the description sound like a real distro?
  let descScore = 0;
  const linuxKeywords = [
    'distribution', 'operating system', 'linux', 'gnu/linux', 'desktop',
    'server', 'based on', 'derivative', 'fork of', 'package manager',
  ];
  const distroHints = [
    'debian', 'ubuntu', 'arch', 'fedora', 'rhel', 'suse', 'gentoo',
    'slackware', 'repository', 'installer', 'live cd', 'rolling release',
    'window manager', 'desktop environment', 'kernel', 'open source',
  ];

  for (const kw of linuxKeywords) {
    if (descFull.includes(kw)) descScore += 0.08;
  }
  for (const kw of distroHints) {
    if (descFull.includes(kw)) descScore += 0.04;
  }
  descScore = Math.min(descScore, 1);

  // 3. Category match score (0-1): what categories was it found in?
  let catScore = 0;
  const primaryCatHints = [
    'linux distributions', 'debian derivatives', 'ubuntu derivatives',
    'arch linux derivatives', 'fedora derivatives', 'rhel derivatives',
    'gentoo-based', 'slackware-based', 'mobile operating systems',
    'embedded linux', 'rpm-based', 'source-based', 'rolling-release',
    'security-oriented', 'lightweight', 'penetration testing',
  ];
  for (const cat of categories) {
    for (const hint of primaryCatHints) {
      if (cat.toLowerCase().includes(hint)) {
        catScore += 0.15;
        break;
      }
    }
  }
  catScore = Math.min(catScore, 1);

  // 4. Family consistency score (0-1): does the name suggest a known family?
  let familyScore = 0;
  const familyHits = new Map<string, number>();

  for (const t of toks) {
    const famMap = patterns.tokenToFamily.get(t);
    if (famMap) {
      for (const [fid, count] of famMap) {
        familyHits.set(fid, (familyHits.get(fid) ?? 0) + count);
      }
    }
  }

  // Check description for family keywords
  for (const dt of descTokens) {
    const famMap = patterns.keywordToFamily.get(dt);
    if (famMap) {
      for (const [fid, count] of famMap) {
        familyHits.set(fid, (familyHits.get(fid) ?? 0) + count * 0.5);
      }
    }
  }

  // Check for "based on" family patterns in description
  for (const [fid, _fk] of patterns.familyKeywords) {
    const familyName = fid;
    if (descFull.includes(familyName.toLowerCase())) {
      familyHits.set(fid, (familyHits.get(fid) ?? 0) + 3);
    }
  }

  if (familyHits.size > 0) {
    familyScore = Math.min(Math.max(...familyHits.values()) / 5, 1);
  }

  // 5. Page quality score (0-1): does the Wikipedia page look legitimate?
  let pageScore = 0;
  if (description) pageScore += 0.3;
  if (description.length > 100) pageScore += 0.3;
  if (description.length > 300) pageScore += 0.2;
  // Penalize very stub-like descriptions
  if (description.length < 30) pageScore *= 0.5;
  // Boost for having multiple source categories
  if (categories.length > 0) pageScore += 0.1;
  if (categories.length > 1) pageScore += 0.1;
  pageScore = Math.min(pageScore, 1);

  // ---- Combined confidence ----
  const confidence =
    nameScore * 0.30 +
    descScore * 0.20 +
    catScore * 0.15 +
    familyScore * 0.20 +
    pageScore * 0.15;

  if (confidence < 0.15) return null; // Too low to consider

  // ---- Determine best family ----
  let bestFamilyId: string | null = null;
  let bestFamilyScore = 0;

  // Check name-based family suggestions
  for (const t of toks) {
    const famMap = patterns.tokenToFamily.get(t);
    if (famMap) {
      for (const [fid, count] of famMap) {
        if (count > bestFamilyScore) {
          bestFamilyScore = count;
          bestFamilyId = fid;
        }
      }
    }
  }

  // Check description-based family suggestions
  for (const dt of descTokens) {
    const famMap = patterns.keywordToFamily.get(dt);
    if (famMap) {
      for (const [fid, count] of famMap) {
        if (count * 1.5 > bestFamilyScore) {
          bestFamilyScore = count * 1.5;
          bestFamilyId = fid;
        }
      }
    }
  }

  // Check for explicit "based on" or "derivative of" mentions
  for (const [fid, _fk] of patterns.familyKeywords) {
    const familyName = fid;
    if (descFull.includes(familyName.toLowerCase())) {
      bestFamilyId = fid;
      bestFamilyScore = 10;
      break;
    }
  }

  // ---- Guess metadata ----
  const guessedMetadata = guessMetadata(bestFamilyId, description, patterns);

  // ---- Build signal list ----
  const signals: string[] = [];
  if (nameScore > 0.5) signals.push(`name matches known distro patterns (${(nameScore * 100).toFixed(0)}%)`);
  if (descScore > 0.3) signals.push(`description mentions Linux/distro keywords`);
  if (catScore > 0.3) signals.push(`found in ${categories.length} relevant Wikipedia categories`);
  if (familyScore > 0.4) signals.push(`strongly associated with "${bestFamilyId ?? 'unknown'}" family`);
  if (pageScore > 0.7) signals.push(`Wikipedia page has rich content`);
  if (toks.some((t) => t === 'linux')) signals.push(`name contains "Linux"`);
  if (/(based|derived|fork)/i.test(description)) signals.push(`description mentions derivation`);
  if (/\b(apt|pacman|dnf|rpm|portage|slackpkg|pkg)\b/i.test(description)) signals.push(`description mentions package manager`);
  if (/\b(systemd|openrc|runit|s6|sysvinit)\b/i.test(description)) signals.push(`description mentions init system`);

  // Determine status
  let status: 'active' | 'discontinued' = 'active';
  if (descFull.includes('discontinued') || descFull.includes('defunct') || descFull.includes('abandoned')) {
    status = 'discontinued';
  }

  return {
    name,
    wikipediaTitle,
    wikipediaUrl: '',
    wikipediaSummary: description.slice(0, 300),
    suggestedFamilyId: bestFamilyId,
    suggestedFamilyName: bestFamilyId, // resolved in output via source.families lookup
    status,
    confidence,
    confidenceBreakdown: {
      nameMatch: Math.round(nameScore * 100) / 100,
      descriptionMatch: Math.round(descScore * 100) / 100,
      categoryMatch: Math.round(catScore * 100) / 100,
      familyConsistency: Math.round(familyScore * 100) / 100,
      pageQuality: Math.round(pageScore * 100) / 100,
    },
    guessedMetadata,
    matchingSignals: signals,
    sourceCategories: categories,
    existingMatch,
  };
}

function guessMetadata(
  familyId: string | null,
  description: string,
  patterns: LearnedPatterns,
): DiscoveryCandidate['guessedMetadata'] {
  const dl = description.toLowerCase();
  const meta: DiscoveryCandidate['guessedMetadata'] = {
    country: null,
    packageManager: null,
    initSystem: null,
    releaseModel: null,
    founded: null,
  };

  // Package manager guess from description
  const pkgPatterns: Array<[RegExp, string]> = [
    [/\bapt\b/i, 'apt'], [/\bdpkg\b/i, 'dpkg'], [/apt-dpkg|apt\/dpkg/i, 'apt/dpkg'],
    [/\bpacman\b/i, 'pacman'], [/\bdnf\b/i, 'dnf'], [/\byum\b/i, 'yum'],
    [/\brpm\b/i, 'rpm'], [/\bportage\b/i, 'portage'], [/\bslackpkg\b/i, 'slackpkg'],
    [/\bsnap\b/i, 'snap'], [/\bflatpak\b/i, 'flatpak'], [/\bnix\b/i, 'nix'],
    [/\bguix\b/i, 'guix'], [/\bpkg\s+\w+\b/i, 'pkg'],
  ];
  for (const [re, pm] of pkgPatterns) {
    if (re.test(dl) && dl.includes(pm)) {
      meta.packageManager = pm;
      break;
    }
  }

  // Fallback: package manager from family
  if (!meta.packageManager && familyId) {
    const famPkgs = patterns.familyPkgManagers.get(familyId);
    if (famPkgs && famPkgs.size > 0) {
      const top = [...famPkgs.entries()].sort((a, b) => b[1] - a[1])[0][0];
      meta.packageManager = top.replace(/_/g, '/');
    }
  }

  // Init system guess
  const initPatterns: Array<[RegExp, string]> = [
    [/\bsystemd\b/i, 'systemd'], [/\bopenrc\b/i, 'OpenRC'], [/\brunit\b/i, 'runit'],
    [/\bs6\b/i, 's6'], [/\bsysvinit\b/i, 'sysvinit'], [/\binit\.d\b/i, 'sysvinit'],
  ];
  for (const [re, init] of initPatterns) {
    if (re.test(dl)) {
      meta.initSystem = init;
      break;
    }
  }

  // Release model guess
  if (/\brolling\s+release\b/i.test(dl)) meta.releaseModel = 'rolling';
  else if (/\bsemi-rolling\b|\bhalf-rolling\b/i.test(dl)) meta.releaseModel = 'semi-rolling';
  else if (/\bfixed\s+release\b|\bstable\s+release\b/i.test(dl)) meta.releaseModel = 'fixed';
  else if (/\blts\b/i.test(dl)) meta.releaseModel = 'lts';

  // Country guess
  const countryPatterns: Array<[RegExp, string]> = [
    [/\bchinese\b/i, 'China'], [/\bjapanese\b/i, 'Japan'], [/\brussian\b/i, 'Russia'],
    [/\bgerman\b/i, 'Germany'], [/\bfrench\b/i, 'France'], [/\bitalian\b/i, 'Italy'],
    [/\bspanish\b/i, 'Spain'], [/\bindian\b/i, 'India'], [/\bbrazilian\b/i, 'Brazil'],
    [/\bdutch\b/i, 'Netherlands'], [/\bpolish\b/i, 'Poland'], [/\bturkish\b/i, 'Turkey'],
    [/\bamerican\b/i, 'United States'], [/\bbritish\b/i, 'United Kingdom'],
    [/\bczech\b/i, 'Czech Republic'], [/\bswedish\b/i, 'Sweden'], [/\bfinnish\b/i, 'Finland'],
    [/\bcanadian\b/i, 'Canada'], [/\baustralian\b/i, 'Australia'],
  ];
  for (const [re, country] of countryPatterns) {
    if (re.test(dl)) {
      meta.country = country;
      break;
    }
  }

  // Founded year guess from description
  const yearMatch = dl.match(/\b(?:founded|created|first\s+released|started|established)\s+in\s+(\d{4})\b/i) ??
                    dl.match(/\b(?:since|from)\s+(\d{4})\b/i);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (y >= 1991 && y <= 2026) meta.founded = y;
  }

  // Fallback: founded year from family median
  if (!meta.founded && familyId) {
    const range = patterns.familyFoundedRange.get(familyId);
    if (range) meta.founded = range.median;
  }

  return meta;
}

/* ========================================================================= */
/*  Report & Apply                                                           */
/* ========================================================================= */

function printReport(
  candidates: DiscoveryCandidate[],
  source: SourceData,
  patterns: LearnedPatterns,
  minScore: number,
  outputPath: string,
): void {
  const passing = candidates.filter((c) => c.confidence >= minScore);
  const high = candidates.filter((c) => c.confidence >= 0.85);
  const medium = candidates.filter((c) => c.confidence >= minScore && c.confidence < 0.85);
  const low = candidates.filter((c) => c.confidence < minScore);

  console.log('\n' + '='.repeat(80));
  console.log('  🧠  DISTRO DISCOVERY ENGINE — REPORT');
  console.log('='.repeat(80));
  console.log(`\n  📊 Pattern Analysis Summary:`);
  console.log(`     Known tokens:     ✓  ${patterns.names.tokens.size} unique name tokens`);
  console.log(`     Known families:   ${source.families.length}`);
  console.log(`     Known distros:    ${source.distros.length}`);
  console.log(`     Token→family associations:  ${patterns.tokenToFamily.size}`);

  console.log(`\n  🎯  Discovery Results:`);
  console.log(`     Total candidates found:  ${candidates.length}`);
  console.log(`     High confidence (≥0.85):  ${high.length}`);
  console.log(`     Medium confidence (≥${minScore}):  ${medium.length}`);
  console.log(`     Low confidence (<${minScore}):  ${low.length}`);

  if (high.length > 0) {
    console.log(`\n  🟢  HIGH CONFIDENCE CANDIDATES (auto-apply ready)`);
    console.log('  ' + '-'.repeat(76));
    for (const c of high) {
      const pct = (c.confidence * 100).toFixed(1);
      const family = c.suggestedFamilyName
        ? (source.families.find((f) => f.id === c.suggestedFamilyName)?.name ?? c.suggestedFamilyName)
        : 'unsure';
      console.log(`     ${pct}%  ${c.name.padEnd(35)} → ${family}`);
      if (c.matchingSignals.length > 0) {
        console.log(`         📌 ${c.matchingSignals.slice(0, 2).join(' • ')}`);
      }
    }
  }

  if (medium.length > 0) {
    console.log(`\n  🟡  MEDIUM CONFIDENCE CANDIDATES (review recommended)`);
    console.log('  ' + '-'.repeat(76));
    for (const c of medium) {
      const pct = (c.confidence * 100).toFixed(1);
      const family = c.suggestedFamilyName
        ? (source.families.find((f) => f.id === c.suggestedFamilyName)?.name ?? c.suggestedFamilyName)
        : 'unsure';
      const breakdown = Object.values(c.confidenceBreakdown).map((v) => (v * 100).toFixed(0)).join('/');
      console.log(`     ${pct}%  ${c.name.padEnd(35)} → ${family.padEnd(20)} [${breakdown}]`);
    }
  }

  if (low.length > 0) {
    console.log(`\n  🔴  LOW CONFIDENCE (${low.length} candidates — may need manual review)`);
  }

  // Save JSON output
  const output = {
    generatedAt: new Date().toISOString(),
    metadata: {
      totalKnownDistros: source.distros.length,
      totalKnownFamilies: source.families.length,
      candidatesFound: candidates.length,
      highConfidence: high.length,
      mediumConfidence: medium.length,
      lowConfidence: low.length,
      minScore,
    },
    highConfidence: high.map((c) => serialize(c)),
    mediumConfidence: medium.map((c) => serialize(c)),
    lowConfidence: low.map((c) => serialize(c)),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n  💾  Full report saved to ${outputPath.replace(ROOT, '.')}`);
  console.log('');
}

function serialize(c: DiscoveryCandidate) {
  return {
    name: c.name,
    wikipediaTitle: c.wikipediaTitle,
    wikipediaUrl: c.wikipediaUrl,
    summary: c.wikipediaSummary.slice(0, 200),
    suggestedFamilyId: c.suggestedFamilyId,
    confidence: Math.round(c.confidence * 100) / 100,
    confidenceBreakdown: c.confidenceBreakdown,
    guessedMetadata: c.guessedMetadata,
    matchingSignals: c.matchingSignals.slice(0, 5),
    sourceCategories: c.sourceCategories,
  };
}

async function applyFindings(
  candidates: DiscoveryCandidate[],
  source: SourceData,
  minScore: number,
): Promise<void> {
  const toAdd = candidates.filter((c) => c.confidence >= minScore && !c.existingMatch);
  if (toAdd.length === 0) {
    console.log('\n  ℹ️  No high-confidence candidates to apply.');
    return;
  }

  console.log(`\n  ✏️  Applying ${toAdd.length} discoveries to data/distros.json...`);

  const newFamilies = new Map<string, SourceFamily>();
  const newDistros: SourceDistro[] = [];

  for (const c of toAdd) {
    const id = c.wikipediaTitle
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Determine if we need a new family
    let familyId = c.suggestedFamilyId;
    if (!familyId) {
      // Create a new family for this orphan
      const familySlug = id;
      const familyName = c.name.replace(/ Linux.*$| OS.*$| operating system.*$/i, '').trim() || c.name;
      if (!source.families.find((f) => f.id === familySlug)) {
        newFamilies.set(familySlug, {
          id: familySlug,
          name: familyName,
          color: generateColor(familySlug),
          description: `Auto-discovered family for ${c.name}`,
          founded: c.guessedMetadata.founded ?? undefined,
          rootDistroId: id,
        });
      }
      familyId = familySlug;
    }

    // For new families, don't set parent — build-data.ts auto-links roots to linux-kernel
    const isNewFamily = !c.suggestedFamilyId;
    const parent = isNewFamily
      ? undefined
      : source.families.find((f) => f.id === familyId)?.rootDistroId ?? undefined;

    newDistros.push({
      id,
      name: c.name,
      familyId: familyId!,
      parent,
      status: c.status,
      founded: c.guessedMetadata.founded ?? undefined,
      country: c.guessedMetadata.country ?? undefined,
      packageManager: c.guessedMetadata.packageManager ?? undefined,
      initSystem: c.guessedMetadata.initSystem ?? undefined,
      releaseModel: (c.guessedMetadata.releaseModel as SourceDistro['releaseModel']) ?? undefined,
      website: c.wikipediaUrl,
      wikipedia: c.wikipediaUrl,
      description: c.wikipediaSummary.slice(0, 400),
    });
  }

  // Apply new families first
  for (const [, fam] of newFamilies) {
    if (!source.families.find((f) => f.id === fam.id)) {
      source.families.push(fam);
      console.log(`     🏠  New family: ${fam.name} (${fam.id})`);
    }
  }

  // Apply new distros
  for (const d of newDistros) {
    if (!source.distros.find((ex) => ex.id === d.id)) {
      source.distros.push(d);
      console.log(`     🐧  ${d.name} (${d.id}) → ${d.familyId}`);
    }
  }

  // Write back
  writeFileSync(DATA_PATH, JSON.stringify(source, null, 2) + '\n');
  console.log(`\n  ✅  Applied ${newDistros.length} new distros and ${newFamilies.size} new families to ${DATA_PATH.replace(ROOT, '.')}`);
  console.log(`  📈  Run again for even smarter discoveries (self-learning loop enabled!)`);
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
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

/* ========================================================================= */
/*  Main                                                                     */
/* ========================================================================= */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const applyFlag = args.includes('--apply');
  const noCrawl = args.includes('--no-crawl');
  const minScoreIdx = args.indexOf('--min-score');
  const minScore = minScoreIdx >= 0 ? parseFloat(args[minScoreIdx + 1]) : 0.75;
  const categoryIdx = args.indexOf('--category');
  const specificCategory = categoryIdx >= 0 ? args[categoryIdx + 1] : undefined;
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 ? resolve(process.cwd(), args[outputIdx + 1]) : DEFAULT_OUTPUT;

  console.log('🧠  DISTRO DISCOVERY ENGINE');
  console.log('    Self-learning keyword-based distro finder\n');

  // Load existing data
  if (!existsSync(DATA_PATH)) {
    console.error(`❌  Data file not found at ${DATA_PATH}`);
    console.error('    Run "npm run build:data" first to generate the dataset.');
    process.exit(1);
  }

  const source = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as SourceData;
  console.log(`📚  Loaded ${source.distros.length} distros across ${source.families.length} families`);

  // Phase 1: Learn patterns
  console.log('\n🔬  Phase 1: Learning patterns from existing data...');
  const patterns = learnPatterns(source);
  console.log(`    ✓  Extracted ${patterns.names.tokens.size} unique name tokens`);
  console.log(`    ✓  Mapped ${patterns.familyKeywords.size} family keyword profiles`);
  console.log(`    ✓  Built ${patterns.keywordToFamily.size} keyword→family associations`);

  // Phase 2: Discover
  let candidates: DiscoveryCandidate[] = [];

  if (noCrawl) {
    console.log('\n⏭   Skipping Wikipedia crawl (--no-crawl). Using existing patterns only.');
  } else {
    console.log('\n🔍  Phase 2: Discovering new distros via Wikipedia...');
    candidates = await crawlWikipedia(patterns, specificCategory);
    console.log(`    ✓  Found ${candidates.length} candidate distros`);
  }

  // Phase 3: Report
  printReport(candidates, source, patterns, minScore, outputPath);

  // Phase 4: Apply (if flag set)
  if (applyFlag) {
    if (candidates.length === 0) {
      console.log('\n⚠️   No candidates to apply. Run without --no-crawl to discover new distros.');
    } else {
      await applyFindings(candidates, source, minScore);
    }
  } else {
    console.log('\n💡  Tip: Re-run with --apply to auto-add high-confidence discoveries.');
    console.log('    Or pipe the report JSON into your own review pipeline.');
  }

  // Self-learning summary
  console.log('\n🔄  Self-learning cycle:');
  console.log('    Pattern analysis → Wikipedia crawl → Score → Report → Apply → Richer patterns');
  console.log('    Each run makes the engine smarter. More data = better discoveries.');
  console.log('');
}

main().catch((err) => {
  console.error('❌  Fatal error:', err);
  process.exit(1);
});
