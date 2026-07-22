/**
 * 3D Force-Directed Layout for DistroMap.
 * Ported from frontend-vue/src/lib/layout3d.ts with enhancements.
 *
 * Uses Fibonacci sphere for family distribution,
 * radial depth bands for hierarchy, and
 * spherical cap spreading for siblings.
 */

import type { Distro, Family, Edge, GraphNode, GraphEdge } from '@/types';

// ─── Constants ───────────────────────────────────────────────────────

const FAMILY_RADIUS = 260;
const DISTRO_RADIUS = 380;
const SUB_DISTRO_RADIUS = 500;
const FAMILY_NODE_SIZE = 12;
const DISTRO_NODE_SIZE = 6;
const SUB_NODE_SIZE = 4;

// ─── Helpers ─────────────────────────────────────────────────────────

/** Simple hash for deterministic jitter. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = id.charCodeAt(i) + ((h << 5) - h);
  }
  return (h & 0x7fffffff) / 0x7fffffff;
}

/** Fibonacci sphere point distribution. */
function fibonacciSphere(index: number, total: number): [number, number, number] {
  const phi = Math.acos(1 - (2 * (index + 0.5)) / total);
  const theta = Math.PI * (1 + Math.sqrt(5)) * index;
  return [
    Math.cos(theta) * Math.sin(phi),
    Math.sin(theta) * Math.sin(phi),
    Math.cos(phi),
  ];
}

/** Spherical cap point for spreading siblings. */
function sphericalCapPoint(
  direction: [number, number, number],
  index: number,
  total: number,
  spreadAngle: number = 0.3,
): [number, number, number] {
  if (total <= 1) return direction;

  const angle = spreadAngle * (index / (total - 1) - 0.5);
  const perpAngle = ((index * 2.39996) % (2 * Math.PI)) * spreadAngle * 0.5;

  const [dx, dy, dz] = direction;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const nx = dx / len, ny = dy / len, nz = dz / len;

  // Create perpendicular vectors
  const up: [number, number, number] = Math.abs(nz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const px = up[1] * nz - up[2] * ny;
  const py = up[2] * nx - up[0] * nz;
  const pz = up[0] * ny - up[1] * nx;
  const plen = Math.sqrt(px * px + py * py + pz * pz) || 1;
  const bx = px / plen, by = py / plen, bz = pz / plen;

  const cx = ny * bz - nz * by;
  const cy = nz * bx - nx * bz;
  const cz = nx * by - ny * bx;

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosB = Math.cos(perpAngle);
  const sinB = Math.sin(perpAngle);

  return [
    nx * cosA + (bx * cosB + cx * sinB) * sinA,
    ny * cosA + (by * cosB + cy * sinB) * sinA,
    nz * cosA + (bz * cosB + cz * sinB) * sinA,
  ];
}

// ─── Main Layout Function ────────────────────────────────────────────

export interface LayoutResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Compute 3D positions for all nodes and edges.
 */
export function computeLayout(
  distros: Distro[],
  families: Family[],
  edges: Edge[],
): LayoutResult {
  const nodes: GraphNode[] = [];
  const edgeMap = new Map<string, GraphEdge>();
  const nodeMap = new Map<string, GraphNode>();
  const familyDirections = new Map<string, [number, number, number]>();

  // 1. Add Linux kernel at origin
  const kernel: GraphNode = {
    id: 'linux-kernel',
    name: 'Linux Kernel',
    family: 'linux-kernel',
    status: 'active',
    x: 0, y: 0, z: 0,
    size: FAMILY_NODE_SIZE * 1.5,
    color: '#ffd166',
    depth: 0,
  };
  nodes.push(kernel);
  nodeMap.set(kernel.id, kernel);

  // 2. Distribute families on Fibonacci sphere
  const activeFamilies = families.filter(f => f.id !== 'linux-kernel');
  activeFamilies.forEach((family, i) => {
    const dir = fibonacciSphere(i, activeFamilies.length);
    familyDirections.set(family.id, dir);

    const node: GraphNode = {
      id: family.id,
      name: family.name,
      family: family.id,
      status: 'active',
      x: dir[0] * FAMILY_RADIUS,
      y: dir[1] * FAMILY_RADIUS,
      z: dir[2] * FAMILY_RADIUS,
      size: FAMILY_NODE_SIZE,
      color: family.color,
      depth: 1,
    };
    nodes.push(node);
    nodeMap.set(family.id, node);
  });

  // 3. Distribute distros within their family's direction
  const familyDistros = new Map<string, Distro[]>();
  for (const d of distros) {
    const list = familyDistros.get(d.family) ?? [];
    list.push(d);
    familyDistros.set(d.family, list);
  }

  for (const [familyId, familyDistroList] of familyDistros) {
    const dir = familyDirections.get(familyId);
    if (!dir) continue;

    familyDistroList.forEach((distro, i) => {
      const jitter = hashId(distro.id);
      const depth = distro.parent && distro.parent !== 'linux-kernel' ? 3 : 2;
      const radius = depth === 2 ? DISTRO_RADIUS : SUB_DISTRO_RADIUS;

      const spread = sphericalCapPoint(dir, i, familyDistroList.length, 0.4);
      const jitterOffset = (jitter - 0.5) * 20;

      const node: GraphNode = {
        id: distro.id,
        name: distro.name,
        family: distro.family,
        status: distro.status,
        x: spread[0] * radius + jitterOffset,
        y: spread[1] * radius + jitterOffset * 0.5,
        z: spread[2] * radius + jitterOffset * 0.3,
        size: depth === 2 ? DISTRO_NODE_SIZE : SUB_NODE_SIZE,
        color: nodeMap.get(familyId)?.color ?? '#888',
        depth,
      };
      nodes.push(node);
      nodeMap.set(distro.id, node);
    });
  }

  // 4. Compute edges
  const familyColor = (familyId: string) =>
    nodeMap.get(familyId)?.color ?? '#555';

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const key = `${edge.source}->${edge.target}`;
    if (edgeMap.has(key)) continue;

    edgeMap.set(key, {
      source: edge.source,
      target: edge.target,
      sourcePos: [sourceNode.x, sourceNode.y, sourceNode.z],
      targetPos: [targetNode.x, targetNode.y, targetNode.z],
      color: familyColor(targetNode.family),
    });
  }

  return {
    nodes,
    edges: [...edgeMap.values()],
  };
}
