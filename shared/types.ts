/**
 * Core domain types shared between the frontend (SPA) and server (API).
 * The compiler reads these so a refactor here propagates everywhere.
 */

export type DistroStatus = 'active' | 'discontinued';
export type ReleaseModel = 'rolling' | 'fixed' | 'semi-rolling' | 'half-rolling' | 'lts' | 'static';

export interface SourceDistro {
  id: string;
  name: string;
  familyId: string;
  parent?: string;
  additionalParents?: string[];
  status: DistroStatus;
  founded?: number;
  country?: string;
  packageManager?: string;
  initSystem?: string;
  releaseModel?: ReleaseModel;
  license?: string;
  website?: string;
  wikipedia?: string;
  description?: string;
  statusNote?: string;
  discontinuedAt?: number;
}

export interface SourceFamily {
  id: string;
  name: string;
  color: string;
  colorSecondary?: string;
  description?: string;
  founded?: number;
  rootDistroId?: string;
}

export interface SourceData {
  families: SourceFamily[];
  distros: SourceDistro[];
}

export interface Distro {
  /** Stable slug used in URLs and graph IDs (e.g. "ubuntu", "linux-mint"). */
  id: string;
  /** Display name. */
  name: string;
  /** The family this distro belongs to (matches Family.id). */
  family: string;
  /** Optional parent distro id. If absent, this distro sits at the family root. */
  parent?: string;
  /** Optional additional parents (rare — e.g. distros derived from multiple parents). */
  additionalParents?: string[];
  status: DistroStatus;
  founded?: number;
  country?: string;
  packageManager?: string;
  initSystem?: string;
  releaseModel?: ReleaseModel;
  license?: string;
  website?: string;
  wikipedia?: string;
  description?: string;
  /** A relative-ship time string like "Active (rolling)" used in the side panel. */
  statusNote?: string;
  discontinuedAt?: number;
}

export interface Family {
  id: string;
  name: string;
  /** Brand color, hex. Used in node fill, legend, family filter pills. */
  color: string;
  /** Secondary tint used for gradients. */
  colorSecondary?: string;
  description?: string;
  /** Optional origin year (when the family was first introduced). */
  founded?: number;
}

export interface Edge {
  source: string;
  target: string;
}

export interface GraphData {
  families: Family[];
  distros: Distro[];
  /** Pre-computed adjacency: source -> targets[] */
  edges: Edge[];
  /** Built at build time. */
  meta: {
    generatedAt: string;
    totalDistros: number;
    active: number;
    discontinued: number;
    families: number;
  };
}

export interface FilterQuery {
  /** Free-text notes — matched against name, description, country, website. */
  text: string;
  /** key:value filters parsed from the search bar. */
  family?: string;
  init?: string;
  pkg?: string;
  status?: 'active' | 'discontinued' | 'all';
  country?: string;
  release?: ReleaseModel;
  license?: string;
}

export interface PathResult {
  from: string;
  to: string;
  path: string[];
  hops: number;
  found: boolean;
}

export interface StatsResponse {
  totalDistros: number;
  active: number;
  discontinued: number;
  families: number;
  topCountries: Array<{ country: string; count: number }>;
  topInitSystems: Array<{ init: string; count: number }>;
  topPackageManagers: Array<{ pkg: string; count: number }>;
  topLicenses: Array<{ license: string; count: number }>;
}

export interface SuggestPayload {
  /** Wikipedia page title, e.g. "Alpine_Linux". */
  topic: string;
  /** Free-text explanation by the submitter. */
  rationale?: string;
  submitter?: string;
}

export interface SuggestResponse {
 ok: boolean;
 id: string;
 validated: {
   title: string;
   description?: string;
   url: string;
 };
}

/* ======================================================================= */
/*  Discovery / Crawler Extended Types                                     */
/* ======================================================================= */

/** Architecture targets supported by a distro. */
export type DistroArch = 'x86_64' | 'i686' | 'aarch64' | 'armv7' | 'riscv64' | 'ppc64le' | 's390x' | 'mips' | 'sparc64' | 'loongarch64';

/** Desktop environment (or headless) identifiers. */
export type DistroDesktop =
  | 'GNOME' | 'KDE' | 'XFCE' | 'LXQt' | 'LXDE' | 'MATE' | 'Cinnamon'
  | 'Budgie' | 'Deepin' | 'Pantheon' | 'Sway' | 'i3' | 'Hyprland'
  | 'Openbox' | 'Fluxbox' | 'IceWM' | 'Enlightenment' | 'Razor-qt'
  | 'Sugar' | 'Phosh' | 'Plasma Mobile' | 'Headless'
  | 'None' | 'Custom' | 'Other';

/** Source type that a candidate was discovered from. */
export type DiscoverySource =
  | 'wikipedia'
  | 'distrowatch'
  | 'github'
  | 'gitlab'
  | 'rss-feed'
  | 'iso-mirror'
  | 'web-search'
  | 'community-announcement'
  | 'manual';

/** Distro base / upstream lineage. */
export type BaseDistro =
  | 'Debian'
  | 'Ubuntu'
  | 'Arch'
  | 'Fedora'
  | 'RHEL'
  | 'Slackware'
  | 'Gentoo'
  | 'Alpine'
  | 'Void'
  | 'NixOS'
  | 'OpenSUSE'
  | 'SUSE'
  | 'Mandriva'
  | 'PCLinuxOS'
  | 'CRUX'
  | 'Solus'
  | 'Android'
  | 'ChromeOS'
  | 'Independent'
  | 'Unknown';

/** Rich metadata for a discovered distro candidate. */
export interface DiscoveredDistro {
  /** Stable slug. */
  id: string;
  /** Display name. */
  name: string;
  /** Best-guess base/upstream lineage. */
  baseDistro?: BaseDistro;
  /** The family this belongs to (maps to SourceFamily.id). */
  familyId?: string;
  /** Direct parent distro ID. */
  parent?: string;
  /** Additional parent IDs. */
  additionalParents?: string[];
  status: DistroStatus;
  /** Latest known version string. */
  version?: string;
  /** Architecture targets. */
  architecture?: DistroArch[];
  /** Desktop environment(s) offered. */
  desktopEnvironments?: DistroDesktop[];
  /** When this version was released. */
  releaseDate?: string;
  /** Direct ISO download URL. */
  downloadUrl?: string;
  /** ISO checksum (SHA256). */
  isoChecksum?: string;
  founded?: number;
  country?: string;
  packageManager?: string;
  initSystem?: string;
  releaseModel?: ReleaseModel;
  license?: string;
  website?: string;
  wikipedia?: string;
  /** URL to documentation or wiki. */
  docUrl?: string;
  description?: string;
  statusNote?: string;
  discontinuedAt?: number;
  /** Which source(s) discovered this candidate. */
  discoverySources: DiscoverySource[];
  /** Title of the source page/repo that led to discovery. */
  sourceTitle?: string;
  /** URL of the source. */
  sourceUrl?: string;
  /** Confidence score (0–1). */
  confidence: number;
  /** Which source has the highest trust for this candidate. */
  bestSource?: DiscoverySource;
}

/** Trust record for a discovery source. */
export interface SourceTrustRecord {
  sourceId: string;
  sourceType: DiscoverySource;
  displayName: string;
  /** Number of successful discoveries from this source. */
  successes: number;
  /** Number of false-positive discoveries. */
  failures: number;
  /** Traffic-light cooldown state. */
  cooldownUntil: number | null;
  /** Last access timestamp. */
  lastAccessed: number;
  /** Adaptive trust score (0–1). */
  trustScore: number;
}

/** Search query generated by the query expander. */
export interface SearchQuery {
  query: string;
  /** Which source this query targets. */
  targetSources: DiscoverySource[];
  /** Why this query was generated (for traceability). */
  rationale: string;
  /** Priority (higher = run first). */
  priority: number;
  /** Keywords that should trigger query expansion. */
  expansionTriggers: string[];
}

/** Result from a crawl cycle. */
export interface CrawlReport {
  cycleId: string;
  startedAt: string;
  finishedAt: string;
  sourcesQueried: number;
  candidatesFound: number;
  candidatesAccepted: number;
  newFamilies: number;
  newDistros: number;
  duplicatesSkipped: number;
  errors: Array<{ source: string; message: string }>;
  /** Updated trust scores after this cycle. */
  trustScores: SourceTrustRecord[];
}
