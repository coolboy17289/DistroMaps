/**
 * DistroMap — Consolidated type definitions
 * Ported from shared/types.ts with additions for the Next.js app.
 */

// ─── Enums / Union Types ─────────────────────────────────────────────

export type DistroStatus = 'active' | 'discontinued';
export type ReleaseModel = 'rolling' | 'fixed' | 'semi-rolling' | 'half-rolling' | 'lts' | 'static';

export type DistroArch =
  | 'x86_64' | 'i686' | 'aarch64' | 'armv7' | 'riscv64'
  | 'ppc64le' | 's390x' | 'mips' | 'sparc64' | 'loongarch64';

export type DistroDesktop =
  | 'GNOME' | 'KDE' | 'XFCE' | 'LXQt' | 'LXDE' | 'MATE' | 'Cinnamon'
  | 'Budgie' | 'Deepin' | 'Pantheon' | 'Sway' | 'i3' | 'Hyprland'
  | 'Openbox' | 'Fluxbox' | 'IceWM' | 'Enlightenment' | 'Razor-qt'
  | 'Sugar' | 'Phosh' | 'Plasma Mobile' | 'Headless'
  | 'None' | 'Custom' | 'Other';

export type BaseDistro =
  | 'Debian' | 'Ubuntu' | 'Arch' | 'Fedora' | 'RHEL' | 'Slackware'
  | 'Gentoo' | 'Alpine' | 'Void' | 'NixOS' | 'OpenSUSE' | 'SUSE'
  | 'Mandriva' | 'PCLinuxOS' | 'CRUX' | 'Solus'
  | 'Android' | 'ChromeOS' | 'Independent' | 'Unknown';

export type EntityType =
  | 'distro' | 'family' | 'company' | 'maintainer' | 'technology'
  | 'package_manager' | 'desktop_environment' | 'init_system'
  | 'architecture' | 'repository' | 'documentation' | 'mirror';

export type EdgeType =
  | 'based_on' | 'belongs_to_family' | 'uses_package_mgr'
  | 'uses_desktop' | 'uses_init' | 'supports_arch'
  | 'maintained_by' | 'developed_by' | 'documented_at'
  | 'mirrored_at' | 'hosted_at' | 'succeeded_by' | 'derivative_of';

// ─── Core Domain Types ───────────────────────────────────────────────

export interface Family {
  id: string;
  name: string;
  color: string;
  colorSecondary?: string;
  description?: string;
  founded?: number;
}

export interface Distro {
  id: string;
  name: string;
  family: string;
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
  baseDistro?: string;
  lastUpdated?: string;
}

export interface Edge {
  source: string;
  target: string;
}

export interface GraphData {
  families: Family[];
  distros: Distro[];
  edges: Edge[];
  meta: {
    generatedAt: string;
    totalDistros: number;
    active: number;
    discontinued: number;
    families: number;
  };
}

// ─── API Types ───────────────────────────────────────────────────────

export interface FilterQuery {
  text: string;
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

export interface SearchResult {
  id: string;
  name: string;
  family: string;
  status: DistroStatus;
  description?: string;
  score: number;
}

export interface CompareResult {
  distros: Distro[];
  attributes: string[];
  differences: Record<string, Record<string, string | undefined>>;
}

export interface RecommendResult {
  distro: Distro;
  recommendations: Array<{
    distro: Distro;
    score: number;
    reason: string;
  }>;
}

// ─── Graph Visualization Types ───────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  family: string;
  status: DistroStatus;
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  depth: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  color: string;
}

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: string | null;
  hoveredNode: string | null;
  highlightedFamily: string | null;
  searchResults: SearchResult[];
  filters: FilterQuery;
  cameraTarget: [number, number, number];
  zoom: number;
}
