'use client';

/**
 * GraphProvider — React context for 3D graph state management.
 * Manages selection, filtering, camera, and search state.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { Distro, Family, Edge, FilterQuery, SearchResult } from '@/types';

interface GraphContextValue {
  // Data
  distros: Distro[];
  families: Family[];
  edges: Edge[];

  // Selection
  selectedNode: string | null;
  hoveredNode: string | null;
  selectNode: (id: string | null) => void;
  hoverNode: (id: string | null) => void;

  // Filtering
  highlightedFamily: string | null;
  highlightFamily: (familyId: string | null) => void;
  filters: FilterQuery;
  setFilters: (filters: FilterQuery) => void;

  // Search
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Camera
  cameraTarget: [number, number, number];
  setCameraTarget: (target: [number, number, number]) => void;
  zoom: number;
  setZoom: (zoom: number) => void;

  // Loading
  isLoaded: boolean;
  setIsLoaded: (loaded: boolean) => void;
}

const GraphContext = createContext<GraphContextValue | null>(null);

export function useGraph(): GraphContextValue {
  const ctx = useContext(GraphContext);
  if (!ctx) throw new Error('useGraph must be used within GraphProvider');
  return ctx;
}

interface Props {
  children: React.ReactNode;
  initialDistros?: Distro[];
  initialFamilies?: Family[];
  initialEdges?: Edge[];
}

export function GraphProvider({
  children,
  initialDistros = [],
  initialFamilies = [],
  initialEdges = [],
}: Props) {
  const [distros] = useState<Distro[]>(initialDistros);
  const [families] = useState<Family[]>(initialFamilies);
  const [edges] = useState<Edge[]>(initialEdges);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [highlightedFamily, setHighlightedFamily] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterQuery>({ text: '' });
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cameraTarget, setCameraTarget] = useState<[number, number, number]>([0, 0, 0]);
  const [zoom, setZoom] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNode(id);
  }, []);

  const hoverNode = useCallback((id: string | null) => {
    setHoveredNode(id);
  }, []);

  const highlightFamily = useCallback((familyId: string | null) => {
    setHighlightedFamily(familyId);
  }, []);

  const value = useMemo<GraphContextValue>(() => ({
    distros, families, edges,
    selectedNode, hoveredNode, selectNode, hoverNode,
    highlightedFamily, highlightFamily,
    filters, setFilters,
    searchResults, setSearchResults,
    searchQuery, setSearchQuery,
    cameraTarget, setCameraTarget,
    zoom, setZoom,
    isLoaded, setIsLoaded,
  }), [
    distros, families, edges,
    selectedNode, hoveredNode, selectNode, hoverNode,
    highlightedFamily, highlightFamily,
    filters, searchResults, searchQuery,
    cameraTarget, zoom, isLoaded,
  ]);

  return (
    <GraphContext.Provider value={value}>
      {children}
    </GraphContext.Provider>
  );
}
