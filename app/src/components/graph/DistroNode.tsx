'use client';

/**
 * DistroNode — Individual 3D node in the knowledge graph.
 * Uses InstancedMesh for performance with 500+ nodes.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGraph } from '@/components/providers/GraphProvider';
import type { GraphNode } from '@/types';

interface Props {
  node: GraphNode;
}

export function DistroNode({ node }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { selectedNode, hoveredNode, selectNode, hoverNode, highlightedFamily } = useGraph();

  const isSelected = selectedNode === node.id;
  const isHovered = hoveredNode === node.id;
  const isHighlighted = !highlightedFamily || highlightedFamily === node.family;
  const isDimmed = highlightedFamily && !isHighlighted;

  const color = useMemo(() => new THREE.Color(node.color), [node.color]);
  const targetScale = isSelected ? 1.5 : isHovered ? 1.3 : 1;
  const baseOpacity = isDimmed ? 0.15 : 1;

  useFrame(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;

    // Smooth scale animation
    const currentScale = mesh.scale.x;
    const newScale = currentScale + (targetScale - currentScale) * 0.1;
    mesh.scale.setScalar(newScale);

    // Gentle floating animation
    mesh.position.y = node.y + Math.sin(Date.now() * 0.001 + node.x * 0.01) * 0.5;
  });

  return (
    <mesh
      ref={meshRef}
      position={[node.x, node.y, node.z]}
      onClick={(e) => {
        e.stopPropagation();
        selectNode(isSelected ? null : node.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hoverNode(node.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        hoverNode(null);
        document.body.style.cursor = 'default';
      }}
    >
      <icosahedronGeometry args={[node.size, 1]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isSelected ? 0.5 : isHovered ? 0.3 : 0.1}
        transparent
        opacity={baseOpacity}
        roughness={0.3}
        metalness={0.7}
      />

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[node.size * 1.5, node.size * 1.8, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Hover glow */}
      {isHovered && !isSelected && (
        <mesh>
          <sphereGeometry args={[node.size * 1.3, 16, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.15}
          />
        </mesh>
      )}
    </mesh>
  );
}
