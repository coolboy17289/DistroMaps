import type { GraphData } from '@shared/types';

export interface GraphNode {
  id: string;
  name: string;
  family: string;
  familyColor: string;
  status: 'active' | 'discontinued';
  parent?: string;
  website?: string;
  depth: number;        // 0 = kernel, 1 = family root, 2 = distro, 3+ = sub-distro
  angle: number;        // radian angle from center for this node's family wedge
  x: number;
  y: number;
  /** How far from center this node sits */
  radius: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface MindMapLayout {
  nodes: GraphNode[];
  links: GraphLink[];
  /** Pre-computed arc segments for each family (startAngle, endAngle, radius) */
  familyArcs: Map<string, { startAngle: number; endAngle: number; r: number }>;
}

const KERNEL_R = 40;
const FAMILY_R = 260;
const DISTRO_R = 380;
const SUB_R = 500;
const DEEP_R = 600;

/**
 * Build a mind map layout:
 *   - Linux kernel at center
 *   - Each family gets an angular wedge
 *   - Distros radiate outward along their family's angle at increasing depth
 */
export function buildMindMap(data: GraphData): MindMapLayout {
  const familiesById = new Map(data.families.map((f) => [f.id, f]));
  const familyColors = new Map(data.families.map((f) => [f.id, f.color]));

  // --- 1. Compute depth for every node (distance from kernel via BFS) ---
  const depthMap = new Map<string, number>();
  const childrenOf = new Map<string, string[]>();
  for (const d of data.distros) {
    if (!childrenOf.has(d.id)) childrenOf.set(d.id, []);
  }
  for (const d of data.distros) {
    if (d.parent) {
      if (!childrenOf.has(d.parent)) childrenOf.set(d.parent, []);
      childrenOf.get(d.parent)!.push(d.id);
    }
  }

  // BFS from kernel
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

  // --- 2. Assign each family an angular wedge ---
  const familyList = data.families.filter((f) => f.id !== 'linux-kernel');
  const n = familyList.length;
  const familyArcs = new Map<string, { startAngle: number; endAngle: number; r: number }>();
  familyList.forEach((f, i) => {
    // Spread families evenly, leaving a small gap
    const arcSize = (Math.PI * 2) / n - 0.04;
    const startAngle = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.02;
    familyArcs.set(f.id, {
      startAngle,
      endAngle: startAngle + arcSize,
      r: FAMILY_R,
    });
  });

  // --- 3. Compute positions ---
  const nodes: GraphNode[] = data.distros
    .filter((d) => depthMap.has(d.id))
    .map((d) => {
      const depth = depthMap.get(d.id) ?? 0;
      const family = familiesById.get(d.family);
      const color = familyColors.get(d.family) ?? '#888888';

      let angle = 0;
      let radius = 0;

      if (d.id === 'linux-kernel') {
        angle = 0;
        radius = 0;
      } else {
        // Get the family arc
        const arc = familyArcs.get(d.family);
        if (arc) {
          // Determine radial distance based on depth
          if (depth <= 1) radius = FAMILY_R;
          else if (depth === 2) radius = DISTRO_R;
          else if (depth === 3) radius = SUB_R;
          else radius = DEEP_R;

          // Spread children along the arc — find siblings at same depth
          const siblings = data.distros.filter(
            (s) => s.id !== d.id && s.family === d.family && (depthMap.get(s.id) ?? 0) === depth && (s.parent === d.parent || (!s.parent && !d.parent)),
          );
          // Include self in count
          const allAtDepth = siblings.length + 1;
          const myIdx = siblings.filter((s) => s.id < d.id).length;
          const t = allAtDepth <= 1 ? 0.5 : (myIdx + 0.5) / allAtDepth;
          angle = arc.startAngle + (arc.endAngle - arc.startAngle) * t;

          // Add small individual offset based on id hash to avoid perfect alignment
          const jitter = (hashString(d.id) % 40) - 20;
          radius += jitter;
        }
      }

      return {
        id: d.id,
        name: d.name,
        family: d.family,
        familyColor: color,
        status: d.status,
        parent: d.parent,
        website: d.website,
        depth,
        angle,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        radius,
      };
    });

  const links: GraphLink[] = data.edges
    .filter((e) => depthMap.has(e.source) && depthMap.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  return { nodes, links, familyArcs };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
