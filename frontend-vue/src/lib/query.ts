import type { Distro, FilterQuery } from '@shared/types';

const FILTER_REGEX = /(\w+):([^\s,]+)/g;

export interface ParsedQuery {
  filter: FilterQuery;
  free: string[];
}

export function parseSearch(q: string): ParsedQuery {
  const filter: FilterQuery = { text: '' };
  const free: string[] = [];
  const re = new RegExp(FILTER_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2];
    switch (key) {
      case 'family':
        filter.family = val.toLowerCase();
        break;
      case 'init':
        filter.init = val.toLowerCase();
        break;
      case 'pkg':
        filter.pkg = val.toLowerCase();
        break;
      case 'status':
        filter.status = val.toLowerCase() as FilterQuery['status'];
        break;
      case 'country':
        filter.country = val.toLowerCase();
        break;
      case 'release':
        filter.release = val.toLowerCase() as FilterQuery['release'];
        break;
      case 'license':
        filter.license = val.toLowerCase();
        break;
      default:
        free.push(m[0]);
    }
  }
  filter.text = q.replace(re, '').trim().toLowerCase();
  return { filter, free };
}

export function matches(distro: Distro, q: ParsedQuery): boolean {
  const f = q.filter;
  if (f.family && distro.family !== f.family) return false;
  if (f.init && (distro.initSystem ?? '').toLowerCase() !== f.init) return false;
  if (f.pkg) {
    const a = (distro.packageManager ?? '').toLowerCase().replace(/\s+/g, '');
    const b = f.pkg.replace(/\s+/g, '');
    if (!a.includes(b)) return false;
  }
  if (f.country && (distro.country ?? '').toLowerCase() !== f.country) return false;
  if (f.release && distro.releaseModel !== f.release) return false;
  if (f.license && (distro.license ?? '').toLowerCase() !== f.license) return false;
  if (f.status && f.status !== 'all' && distro.status !== f.status) return false;
  return true;
}

export function matchesFree(distro: Distro, terms: string[]): boolean {
  if (!terms.length) return true;
  const haystack = [distro.name, distro.id, distro.description, distro.country, distro.website, distro.packageManager, distro.initSystem]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

export function filterDistros(distros: Distro[], q: ParsedQuery): Distro[] {
  const terms = q.free.map((s) => s.toLowerCase());
  return distros.filter((d) => matches(d, q) && matchesFree(d, terms));
}