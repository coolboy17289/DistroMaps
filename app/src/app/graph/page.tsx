'use client';

/**
 * Graph page — Main 3D knowledge graph view.
 * Loads data, provides context, and renders the 3D scene + UI overlay.
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { GraphProvider } from '@/components/providers/GraphProvider';
import { SearchBar } from '@/components/ui/SearchBar';
import { SidePanel } from '@/components/ui/SidePanel';
import { Legend } from '@/components/ui/Legend';
import type { Distro, Family, Edge } from '@/types';

// Dynamic import for Three.js (no SSR)
const Scene = dynamic(
  () => import('@/components/graph/Scene').then(m => m.Scene),
  { ssr: false, loading: () => <LoadingScreen /> },
);

export default function GraphPage() {
  const [distros, setDistros] = useState<Distro[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/graph');
        if (!res.ok) throw new Error('Failed to load graph data');
        const data = await res.json();

        setDistros(data.distros ?? []);
        setFamilies(data.families ?? []);
        setEdges(data.edges ?? []);
      } catch {
        // Fallback: load from static data.json
        try {
          const res = await fetch('/data.json');
          if (res.ok) {
            const data = await res.json();
            setDistros(data.distros ?? []);
            setFamilies(data.families ?? []);
            setEdges(data.edges ?? []);
          } else {
            setError('Failed to load graph data');
          }
        } catch {
          setError('Failed to load graph data');
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <LoadingScreen />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🌌</div>
          <h1 className="text-2xl font-bold text-white mb-2">Failed to load</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <GraphProvider
      initialDistros={distros}
      initialFamilies={families}
      initialEdges={edges}
    >
      <div className="min-h-screen relative">
        {/* 3D Graph */}
        <div className="graph-canvas">
          <Scene />
        </div>

        {/* UI Overlay */}
        <div className="relative z-10 pointer-events-none">
          {/* Top bar */}
          <div className="fixed top-0 left-0 right-0 p-4 flex items-center gap-4 pointer-events-auto">
            {/* Logo */}
            <a href="/" className="flex items-center gap-2 px-3 py-2 rounded-lg glass">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-sm font-bold text-white">DistroMap</span>
            </a>

            {/* Search */}
            <SearchBar />

            {/* Stats */}
            <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
              <span>{distros.length} distros</span>
              <span>{families.length} families</span>
              <span>{edges.length} edges</span>
            </div>
          </div>

          {/* Side panel */}
          <SidePanel />

          {/* Legend */}
          <Legend />
        </div>
      </div>
    </GraphProvider>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" />
          <div className="absolute inset-2 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
        <h2 className="text-lg font-medium text-white mb-2">Loading the Linux universe</h2>
        <p className="text-sm text-gray-500">Mapping 500+ distributions...</p>
      </div>
    </div>
  );
}
