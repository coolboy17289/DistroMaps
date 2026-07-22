import { useCallback, useEffect, useMemo, useState } from 'react';
import { Graph } from '@/components/Graph';
import { SidePanel } from '@/components/SidePanel';
import { SearchBar } from '@/components/SearchBar';
import { Legend } from '@/components/Legend';
import { Brand, KeyboardHints } from '@/components/Chrome';
import { AddDistroForm } from '@/components/AddDistroForm';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useGraphData, useKeyboardShortcuts } from '@/hooks';
import { filterDistros, parseSearch } from '@/lib/query';
import type { Distro } from '@shared/types';

export function App() {
  const { data, error, reload } = useGraphData();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFamilyId, setFilterFamilyId] = useState<string | null>(null);
  const [showDisco, setShowDisco] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredFamilyId, setHoveredFamilyId] = useState<string | null>(null);
  const [kbdOpen, setKbdOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [requestSearchFocus, setRequestSearchFocus] = useState(0);

  const selectedDistro = data?.distros.find((d) => d.id === selectedId) ?? null;
  const selectedFamily = selectedDistro
    ? data?.families.find((f) => f.id === selectedDistro.family)
    : undefined;

  const parentDistro = selectedDistro?.parent
    ? data?.distros.find((d) => d.id === selectedDistro.parent)
    : undefined;
  const childrenDistros: Distro[] = useMemo(() => {
    if (!data || !selectedId) return [];
    return data.distros.filter(
      (d) => d.parent === selectedId || d.additionalParents?.includes(selectedId),
    );
  }, [data, selectedId]);

  const highlightIds = useMemo(() => {
    if (!data) return new Set<string>();
    const set = new Set<string>();
    if (selectedId) {
      set.add(selectedId);
      let cursor: Distro | undefined = data.distros.find((d) => d.id === selectedId);
      while (cursor?.parent) {
        set.add(cursor.parent);
        cursor = data.distros.find((d) => d.id === cursor!.parent);
      }
      const stack = [selectedId];
      const visited = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        data.distros
          .filter((d) => d.parent === id || d.additionalParents?.includes(id))
          .forEach((d) => {
            set.add(d.id);
            stack.push(d.id);
          });
      }
    }
    return set;
  }, [data, selectedId]);

  const visibleCount = useMemo(() => {
    if (!data) return 0;
    return data.distros.filter((d) => showDisco || d.status !== 'discontinued').length;
  }, [data, showDisco]);

  const parsedQuery = useMemo(() => parseSearch(searchQuery), [searchQuery]);
  const filteredResults = useMemo(() => {
    if (!data) return [];
    return filterDistros(data.distros, parsedQuery).slice(0, 80);
  }, [data, parsedQuery]);

  const [searchHoveredId, setSearchHoveredId] = useState<string | null>(null);
  const searchHighlightIds = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length < 2 || !searchHoveredId || !data)
      return new Set<string>();
    // Highlight the hovered search result and its immediate connections
    const set = new Set<string>();
    set.add(searchHoveredId);
    const hovered = data.distros.find((d) => d.id === searchHoveredId);
    if (hovered?.parent) set.add(hovered.parent);
    data.distros
      .filter((d) => d.parent === searchHoveredId || d.additionalParents?.includes(searchHoveredId))
      .forEach((d) => set.add(d.id));
    return set;
  }, [searchHoveredId, data, searchQuery]);

  const focusSearch = useCallback(() => setRequestSearchFocus((x) => x + 1), []);

  const walkDown = useCallback(() => {
    // Move into the first descendant (alphabetical order from data) — works well
    // enough as a "go deeper" gesture for the ↑/↓ keys.
    if (!data || !selectedId || childrenDistros.length === 0) return;
    setSelectedId(childrenDistros[0].id);
  }, [data, selectedId, childrenDistros]);

  const walkUp = useCallback(() => {
    if (!data || !selectedDistro?.parent) return;
    setSelectedId(selectedDistro.parent);
  }, [data, selectedDistro]);

  useKeyboardShortcuts({
    onSlash: focusSearch,
    onCmdK: focusSearch,
    onF: () => {
      if (selectedDistro) setFilterFamilyId(selectedDistro.family);
    },
    onEsc: () => {
      // Cascade: close panel -> clear search -> clear filter
      if (selectedId) setSelectedId(null);
      else if (searchQuery) setSearchQuery('');
      else if (filterFamilyId) setFilterFamilyId(null);
      else if (addOpen) setAddOpen(false);
      else if (kbdOpen) setKbdOpen(false);
    },
    onArrowDown: walkDown,
    onArrowUp: walkUp,
    onQuestion: () => setKbdOpen((v) => !v),
  });

  if (error) {
    return (
      <div className="fatal">
        <h1>Couldn't load the dataset.</h1>
        <p>{error}</p>
        <button onClick={reload}>Retry</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <div className="loading-skeleton">
          <div className="loading-skeleton-brand">
            <div className="skeleton-circle" />
            <div className="skeleton-lines">
              <div className="skeleton-line skeleton-line--short" />
              <div className="skeleton-line skeleton-line--long" />
            </div>
          </div>
          <div className="loading-skeleton-graph">
            <div className="skeleton-ring skeleton-ring--outer" />
            <div className="skeleton-ring skeleton-ring--mid" />
            <div className="skeleton-ring skeleton-ring--inner" />
            <div className="skeleton-center-dot" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-node"
                style={{
                  transform: `rotate(${i * 45}deg) translateY(-80px)`,
                }}
              />
            ))}
          </div>
          <p className="loading-skeleton-text">Loading the Linux knowledge graph…</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="app">
      <Brand data={data} />

      <div className="top-bar">          <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          results={filteredResults}
          onPick={(id) => setSelectedId(id)}
          onHoverResult={setSearchHoveredId}
          focusSignal={requestSearchFocus}
        />
        <button className="add-button" onClick={() => setAddOpen(true)}>
          <span className="add-button-plus">+</span>
          <span>Add distro</span>
        </button>
      </div>

      <Graph
        data={data}
        selectedId={selectedId}
        filterFamilyId={filterFamilyId}
        highlightIds={highlightIds}
        hoveredFamilyId={hoveredFamilyId}
        searchHighlightIds={searchHighlightIds}
        onSelect={setSelectedId}
        onHover={setHoveredId}
      />

      <div className="bottom-bar">
        <Legend
          families={data.families}
          distros={data.distros}
          filterFamilyId={filterFamilyId}
          setFilterFamilyId={setFilterFamilyId}
          showDisco={showDisco}
          setShowDisco={setShowDisco}
          onHoverFamily={setHoveredFamilyId}
        />

        <div className="bottom-bar-meta">
          <span>
            {hoveredId ? (
              <>{data.distros.find((d) => d.id === hoveredId)?.name ?? hoveredId}</>
            ) : (
              <><strong>{visibleCount}</strong> distros · <strong>{data.meta.families - 1}</strong> families</>
            )}
          </span>
        </div>
      </div>

      <KeyboardHints show={kbdOpen} onToggle={() => setKbdOpen((v) => !v)} />

      {selectedDistro && (
        <SidePanel
          distro={selectedDistro}
          family={selectedFamily}
          parent={parentDistro}
          children={childrenDistros}
          onClose={() => setSelectedId(null)}
          onSelect={(id) => setSelectedId(id)}
        />
      )}

      <AddDistroForm open={addOpen} onClose={() => setAddOpen(false)} onSubmitted={() => setAddOpen(false)} />
    </div>
    </ErrorBoundary>
  );
}
