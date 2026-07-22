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
