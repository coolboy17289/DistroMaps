/**
 * Search query parser for DistroMap.
 * Supports free-text search + key:value structured filters.
 *
 * Examples:
 *   "Arch based KDE distributions"         → text: "arch based kde distributions"
 *   "family:arch pkg:pacman"               → filters: { family: "arch", pkg: "pacman" }
 *   "Rolling release beginner friendly"    → text: "rolling release beginner friendly"
 *   "init:openrc"                          → filters: { init: "openrc" }
 */

import type { FilterQuery, Distro, SearchResult } from '@/types';

const VALID_FILTER_KEYS = new Set([
  'family', 'init', 'pkg', 'status', 'country', 'release', 'license',
]);

/**
 * Parse a search string into structured filters + free text.
 */
export function parseQuery(input: string): FilterQuery {
  const filters: Record<string, string> = {};
  const freeWords: string[] = [];

  const re = /(\w+):([^\s,]+)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(input)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2];
    if (VALID_FILTER_KEYS.has(key)) {
      filters[key] = val.toLowerCase();
    } else {
      freeWords.push(match[0]);
    }
  }

  const text = input.replace(re, '').trim().toLowerCase();

  return {
    text: text || freeWords.join(' ').trim(),
    family: filters.family,
    init: filters.init,
    pkg: filters.pkg,
    status: (filters.status as FilterQuery['status']) ?? 'all',
    country: filters.country,
    release: filters.release as FilterQuery['release'],
    license: filters.license,
  };
}

/**
 * Score a distro against a parsed query.
 * Higher score = better match.
 */
export function scoreDistro(d: Distro, query: FilterQuery): number {
  let score = 0;
  const dl = (d.description ?? '').toLowerCase();
  const nl = d.name.toLowerCase();
  const fields = `${nl} ${d.id} ${dl} ${d.country ?? ''} ${d.packageManager ?? ''} ${d.initSystem ?? ''} ${d.releaseModel ?? ''} ${d.license ?? ''}`.toLowerCase();

  // Structured filters (must match all)
  if (query.family && d.family !== query.family) return -1;
  if (query.init && d.initSystem?.toLowerCase() !== query.init) return -1;
  if (query.pkg && d.packageManager?.toLowerCase() !== query.pkg) return -1;
  if (query.status && query.status !== 'all' && d.status !== query.status) return -1;
  if (query.country && d.country?.toLowerCase() !== query.country) return -1;
  if (query.release && d.releaseModel !== query.release) return -1;
  if (query.license && d.license?.toLowerCase() !== query.license) return -1;

  // Free-text scoring
  if (query.text) {
    const words = query.text.split(/\s+/).filter(Boolean);
    for (const word of words) {
      // Exact name match (highest)
      if (nl === word) score += 10;
      // Name contains word
      else if (nl.includes(word)) score += 5;
      // ID match
      else if (d.id.includes(word)) score += 4;
      // Description match
      else if (dl.includes(word)) score += 2;
      // Field match
      else if (fields.includes(word)) score += 1;
    }
  } else {
    // No text query — base score for passing filters
    score = 1;
  }

  return score;
}

/**
 * Search distros with a parsed query.
 */
export function searchDistros(
  distros: Distro[],
  query: FilterQuery,
  limit: number = 80,
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const d of distros) {
    const score = scoreDistro(d, query);
    if (score <= 0) continue;
    results.push({
      id: d.id,
      name: d.name,
      family: d.family,
      status: d.status,
      description: d.description,
      score,
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
