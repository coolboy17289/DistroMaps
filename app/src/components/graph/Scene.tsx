'use client';

/**
 * Scene — Main React Three Fiber canvas for the 3D knowledge graph.
 * Renders nodes, edges, camera controls, and background effects.
 */

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useGraph } from '@/components/providers/GraphProvider';
import { DistroNode } from './DistroNode';
import { EdgeLine } from './EdgeLine';
import { computeLayout } from '@/lib/layout3d';

export function Scene() {
  const { distros, families, edges, setIsLoaded } = useGraph();

  const layout = useMemo(() => {
    if (distros.length === 0) return { nodes: [], edges: [] };
    return computeLayout(distros, families, edges);
  }, [distros, families, edges]);

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 800], fov: 60, near: 1, far: 5000 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        onCreated={() => setIsLoaded(true)}
      >
        <color attach="background" args={['#0a0a0f']} />

        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight position={[100, 100, 100]} intensity={0.6} />
          <pointLight position={[0, 0, 0]} intensity={0.3} color="#ffd166" />

          {/* Background stars */}
          <Stars
            radius={2000}
            depth={50}
            count={3000}
            factor={4}
            saturation={0}
            fade
            speed={0.5}
          />

          {/* Fog for depth */}
          <fog attach="fog" args={['#0a0a0f', 600, 2000]} />

          {/* Edges */}
          {layout.edges.map((edge, i) => (
            <EdgeLine key={`${edge.source}-${edge.target}-${i}`} edge={edge} />
          ))}

          {/* Nodes */}
          {layout.nodes.map((node) => (
            <DistroNode key={node.id} node={node} />
          ))}

          {/* Kernel label */}
          <Text
            position={[0, -20, 0]}
            fontSize={8}
            color="#ffd166"
            anchorX="center"
            anchorY="top"
          >
            Linux Kernel
          </Text>
        </Suspense>

        {/* Camera controls */}
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={100}
          maxDistance={2000}
          enablePan
          panSpeed={0.5}
          rotateSpeed={0.5}
          zoomSpeed={1.2}
        />
      </Canvas>
    </div>
  );
}
