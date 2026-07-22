'use client';

/**
 * EdgeLine — Animated connection between two nodes in the 3D graph.
 * Uses Three.js Line with geometry for edge rendering.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useGraph } from '@/components/providers/GraphProvider';
import type { GraphEdge } from '@/types';

interface Props {
  edge: GraphEdge;
}

export function EdgeLine({ edge }: Props) {
  const { selectedNode } = useGraph();

  const isRelevant = selectedNode === edge.source || selectedNode === edge.target;
  const isSelected = isRelevant;
  const isDimmed = selectedNode !== null && !isSelected;

  const lineObj = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      ...edge.sourcePos,
      ...edge.targetPos,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const color = new THREE.Color(edge.color);
    const opacity = isDimmed ? 0.03 : isSelected ? 0.6 : 0.15;
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    });

    return new THREE.Line(geometry, material);
  }, [edge.sourcePos, edge.targetPos, edge.color, isDimmed, isSelected]);

  return <primitive object={lineObj} />;
}
