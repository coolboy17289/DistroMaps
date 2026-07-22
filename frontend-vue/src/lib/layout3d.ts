import type { GraphData } from '@shared/types';

/**
 * 3D brain-map layout — a port/extension of the React app's 2D radial
 * `buildMindMap` (frontend/src/lib/graph.ts) lifted into three dimensions.
 *
 *   - Linux kernel sits at the origin (0,0,0).
 *   - Every non-kernel family is assigned a deterministic direction on the
 *     unit sphere via a Fibonacci-sphere distribution (even, deterministic,
 *     no clustering at the poles).
 *   - Distros radiate outward along their family's direction. Depth bands the
 *     radius (family root, distro, sub-distro, deep). Siblings at the same
 *     depth + parent are spread across a small cone (spherical cap) around
 *     the family direction, with a small id-hash jitter for organic placement.
 *
 * The result is a pure function of GraphData and is memoized per dataset in
 * the `useGraph` composable.
 */

export interface LayoutNode {
  id: string;
  name: string;
  family: string;
  familyColor: string;
  status: 'active' | 'discontinued';
  parent?: string;
  website?: string;
  /** 0 = kernel, 1 = family root, 2 = distro, 3+ = sub-distro. */
  depth: number;
  x: number;
  y: number;
  z: number;
  /** Distance from the origin. */
  radius: number;
}

export interface LayoutLink {
  source: string;
  target: string;
}

export interface Layout3D {
  nodes: LayoutNode[];
  links: LayoutLink[];
  /** Bounding sphere radius — used for initial camera framing. */
  extent: number;
}

// Radial bands by depth (match the 2D app's bands so the structure reads the
// same way, just unrolled onto a sphere).
const FAMILY_R = 260;
const DISTRO_R = 380;
const SUB_R = 500;
const DEEP_R = 620;

/**
 * Deterministic, even distribution of `n` points on the unit sphere using
 * the Fibonacci-sphere method. Returns unit direction vectors.
 */
function fibonacciSphere(n: number): Array<{ x: number; y: number; z: number }> {
  const out: Array<{ x: number; y: number; z: number }> = [];
  const golden = Math.PI * (3 - Math.sqrt(5)); // ~2.39996
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n; // avoid exact poles
    const y = 1 - 2 * t;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }
  return out;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function radiusForDepth(depth: number): number {
  if (depth <= 1) return FAMILY_R;
  if (depth === 2) return DISTRO_R;
  if (depth === 3) return SUB_R;
  return DEEP_R;
}

/**
 * Spread `count` points across a cone of half-angle `coneAngle` (radians)
 * around `dir`. Returns the i-th point's offset direction (unit vector).
 * Uses a small Fibonacci spiral inside the cap for even coverage.
 */
function coneOffset(dir: { x: number; y: number; z: number }, i: number, count: number, coneAngle: number): { x: number; y: number; z: number } {
  if (count <= 1) return { x: 0, y: 0, z: 0 };
  const t = (i + 0.5) / count; // 0..1
  const phi = Math.acos(1 - t * (1 - Math.cos(coneAngle))); // polar angle from dir
  const theta = Math.PI * (1 + Math.sqrt(5)) * i; // golden azimuth
  // Build a local frame around `dir`.
  const ax = Math.abs(dir.y) < 0.9 ? { x: -dir.y, y: dir.x, z: 0 } : { x: 1, y: 0, z: 0 };
  const len = Math.hypot(ax.x, ax.y, ax.z) || 1;
  ax.x /= len; ax.y /= len; ax.z /= len;
  const bx = {
    x: dir.y * ax.z - dir.z * ax.y,
    y: dir.z * ax.x - dir.x * ax.z,
    z: dir.x * ax.y - dir.y * ax.x,
  };
  const sinPhi = Math.sin(phi);
  const off = {
    x: dir.x * Math.cos(phi) + (ax.x * Math.cos(theta) + bx.x * Math.sin(theta)) * sinPhi,
    y: dir.y * Math.cos(phi) + (ax.y * Math.cos(theta) + bx.y * Math.sin(theta)) * sinPhi,
    z: dir.z * Math.cos(phi) + (ax.z * Math.cos(theta) + bx.z * Math.sin(theta)) * sinPhi,
  };
  // Normalize then scale by jitter-free cone — caller adds radius.
  const n = Math.hypot(off.x, off.y, off.z) || 1;
  return { x: off.x / n, y: off.y / n, z: off.z / n };
}

export function buildLayout3D(data: GraphData): Layout3D {
  const familyColors = new Map(data.families.map((f) => [f.id, f.color]));

  // --- 1. Compute depth for every node (BFS from kernel) ---
  const depthMap = new Map<string, number>();
  const childrenOf = new Map<string, string[]>();
  for (const d of data.distros) childrenOf.set(d.id, []);
  for (const d of data.distros) {
    if (d.parent) {
      if (!childrenOf.has(d.parent)) childrenOf.set(d.parent, []);
      childrenOf.get(d.parent)!.push(d.id);
    }
  }

  const queue: string[] = ['linux-kernel'];
  const visited = new Set<string>(['linux-kernel']);
  depthMap.set('linux-kernel', 0);
  let qi = 0;
  while (qi < queue.length) {
    const id = queue[qi++];
    const depth = depthMap.get(id) ?? 0;
    for (const child of childrenOf.get(id) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        depthMap.set(child, depth + 1);
        queue.push(child);
      }
    }
  }

  // --- 2. Assign each family a deterministic direction on the sphere ---
  const familyList = data.families.filter((f) => f.id !== 'linux-kernel');
  const dirs = fibonacciSphere(familyList.length);
  const familyDir = new Map<string, { x: number; y: number; z: number }>();
  familyList.forEach((f, i) => {
    familyDir.set(f.id, dirs[i] ?? { x: 0, y: 0, z: 1 });
  });

  // --- 3. Group siblings by (family, parent, depth) for cone spreading ---
  const groups = new Map<string, string[]>(); // key -> [ids]
  for (const d of data.distros) {
    if (d.id === 'linux-kernel' || !depthMap.has(d.id)) continue;
    const depth = depthMap.get(d.id)!;
    const key = `${d.family}|${d.parent ?? ''}|${depth}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d.id);
  }
  const indexInGroup = new Map<string, { i: number; count: number }>();
  for (const [, ids] of groups) {
    ids.sort(); // deterministic
    ids.forEach((id, i) => indexInGroup.set(id, { i, count: ids.length }));
  }

  // --- 4. Compute positions ---
  let maxRadius = FAMILY_R;
  const nodes: LayoutNode[] = [];
  for (const d of data.distros) {
    if (!depthMap.has(d.id)) continue;
    const depth = depthMap.get(d.id)!;
    const color = familyColors.get(d.family) ?? '#888888';

    let x = 0, y = 0, z = 0, radius = 0;
    if (d.id === 'linux-kernel') {
      x = y = z = 0;
      radius = 0;
    } else {
      const dir = familyDir.get(d.family) ?? { x: 0, y: 0, z: 1 };
      radius = radiusForDepth(depth);
      const g = indexInGroup.get(d.id);
      if (g && g.count > 1) {
        // Spread within a cone. Larger families get wider cones (capped).
        const coneAngle = Math.min(0.45, 0.05 + 0.3 / Math.sqrt(g.count));
        const off = coneOffset(dir, g.i, g.count, coneAngle);
        x = off.x * radius;
        y = off.y * radius;
        z = off.z * radius;
      } else {
        x = dir.x * radius;
        y = dir.y * radius;
        z = dir.z * radius;
      }
      // Organic jitter so siblings don't sit on a perfect sphere shell.
      const j = (hashString(d.id) % 60) - 30;
      radius += j;
      const nlen = Math.hypot(x, y, z) || 1;
      x = (x / nlen) * radius;
      y = (y / nlen) * radius;
      z = (z / nlen) * radius;
      if (radius > maxRadius) maxRadius = radius;
    }

    nodes.push({
      id: d.id,
      name: d.name,
      family: d.family,
      familyColor: color,
      status: d.status,
      parent: d.parent,
      website: d.website,
      depth,
      x,
      y,
      z,
      radius,
    });
  }

  const links: LayoutLink[] = data.edges
    .filter((e) => depthMap.has(e.source) && depthMap.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  return { nodes, links, extent: maxRadius };
}