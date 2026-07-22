import { useCallback, useEffect, useMemo, useState } from 'react';
import { Graph } from '@/components/Graph';
import { SidePanel } from '@/components/SidePanel';
import { SearchBar } from '@/components/SearchBar';
import { Legend } from '@/components/Legend';
import { Brand, KeyboardHints, ThemeToggle } from '@/components/Chrome';
import { AddDistroForm } from '@/components/AddDistroForm';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
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
  const [submissionNotice, setSubmissionNotice] = useState<{ id: string; title: string } | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('distromap-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
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

  // Sync theme to document
  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', theme === 'light');
    localStorage.setItem('distromap-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

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
    onT: toggleTheme,
    onQuestion: () => setKbdOpen((v) => !v),
  });

  useEffect(() => {
    if (!submissionNotice) return;
    const timer = setTimeout(() => setSubmissionNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [submissionNotice]);

  return (
    <ErrorBoundary>
      {error ? (
        <div className="fatal">
          <h1>Couldn't load the dataset.</h1>
          <p>{error}</p>
          <button onClick={reload}>Retry</button>
        </div>
      ) : !data ? (
        <LoadingSkeleton />
      ) : (
        <div className={`app ${legendOpen ? 'legend-open' : 'legend-closed'}`}>
          <Brand data={data} />

          <div className="top-bar">
            <SearchBar
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

          <Legend
            families={data.families}
            distros={data.distros}
            filterFamilyId={filterFamilyId}
            setFilterFamilyId={setFilterFamilyId}
            showDisco={showDisco}
            setShowDisco={setShowDisco}
            onHoverFamily={setHoveredFamilyId}
            collapsed={!legendOpen}
            onToggleCollapse={() => setLegendOpen((v) => !v)}
          />

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

          <KeyboardHints show={kbdOpen} onToggle={() => setKbdOpen((v) => !v)} />

          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          <div className="graph-status">
            {hoveredId ? (
              <>{data.distros.find((d) => d.id === hoveredId)?.name ?? hoveredId}</>
            ) : (
              <>{data.meta.totalDistros} distros · {data.meta.families - 1} families</>
            )}
          </div>

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

          {submissionNotice && (
            <div className="toast toast--success" role="status" aria-live="polite">
              <span>Suggestion <strong>{submissionNotice.title}</strong> queued (id: <code>{submissionNotice.id}</code>).</span>
              <button className="toast-close" onClick={() => setSubmissionNotice(null)} aria-label="Dismiss suggestion notice">×</button>
            </div>
          )}

          <AddDistroForm
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onSubmitted={({ id, title }) => {
              setSubmissionNotice({ id, title });
              setAddOpen(false);
            }}
          />
        </div>
      )}
    </ErrorBoundary>
  );
}
