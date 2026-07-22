import { useMemo, useState } from 'react';
import type { Family, Distro } from '@shared/types';

interface LegendProps {
  families: Family[];
  distros: Distro[];
  filterFamilyId: string | null;
  setFilterFamilyId: (id: string | null) => void;
  showDisco: boolean;
  setShowDisco: (v: boolean) => void;
  onHoverFamily?: (id: string | null) => void;
  /** Sidebar collapsed state */
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Legend({
  families,
  distros,
  filterFamilyId,
  setFilterFamilyId,
  showDisco,
  setShowDisco,
  onHoverFamily,
  collapsed,
  onToggleCollapse,
}: LegendProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const counts = useMemo(() => {
    const m = new Map<string, { active: number; total: number }>();
    for (const d of distros) {
      const cur = m.get(d.family) ?? { active: 0, total: 0 };
      cur.total++;
      if (d.status !== 'discontinued') cur.active++;
      m.set(d.family, cur);
    }
    return m;
  }, [distros]);

  const sorted = useMemo(() => {
    return [...families]
      .filter((f) => {
        if (!showDisco) {
          const c = counts.get(f.id);
          return c && c.active > 0;
        }
        return true;
      })
      .sort((a, b) => (counts.get(b.id)?.total ?? 0) - (counts.get(a.id)?.total ?? 0))
      .filter((f) => {
        if (!searchQuery) return true;
        return f.name.toLowerCase().includes(searchQuery.toLowerCase());
      });
  }, [families, counts, showDisco, searchQuery]);

  const selectedCount = filterFamilyId
    ? counts.get(filterFamilyId)?.total ?? 0
    : distros.length;

  return (
    <aside className={`legend-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      {/* Sidebar header */}
      <div className="legend-sidebar-header">
        {!collapsed && (
          <>
            <div className="legend-sidebar-title-row">
              <h2 className="legend-sidebar-title">Families</h2>
              <span className="legend-sidebar-count">{families.length}</span>
            </div>
            <div className="legend-sidebar-search">
              <span className="legend-sidebar-search-icon">⌕</span>
              <input
                className="legend-sidebar-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter families…"
                aria-label="Filter families"
              />
            </div>
          </>
        )}
        <button
          className="legend-sidebar-toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand family sidebar' : 'Collapse family sidebar'}
          title={collapsed ? 'Show families' : 'Hide families'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Controls row */}
          <div className="legend-sidebar-controls">
            <button
              className={`legend-sidebar-btn ${filterFamilyId === null ? 'is-active' : ''}`}
              onClick={() => {
                onHoverFamily?.(null);
                setFilterFamilyId(null);
              }}
              title="Show all families"
            >
              All
            </button>
            <button
              className={`legend-sidebar-btn ${showDisco ? '' : 'is-active'}`}
              onClick={() => setShowDisco(!showDisco)}
              title={showDisco ? 'Hide discontinued distros' : 'Show discontinued distros'}
            >
              {showDisco ? 'Active + Disc.' : 'Active only'}
            </button>
            <span className="legend-sidebar-stats">
              {selectedCount} distros
            </span>
          </div>

          {/* Scrollable family list */}
          <div className="legend-sidebar-list">
            {sorted.map((f) => {
              const c = counts.get(f.id) ?? { active: 0, total: 0 };
              const isActive = filterFamilyId === f.id;
              return (
                <button
                  key={f.id}
                  className={`legend-sidebar-item ${isActive ? 'is-on' : ''}`}
                  onClick={() => {
                    onHoverFamily?.(null);
                    setFilterFamilyId(filterFamilyId === f.id ? null : f.id);
                  }}
                  onMouseEnter={() => onHoverFamily?.(f.id)}
                  onMouseLeave={() => onHoverFamily?.(null)}
                  style={{ ['--pill-color' as any]: f.color }}
                  title={`${f.name} — ${c.active} active, ${c.total - c.active} discontinued`}
                >
                  <span className="legend-sidebar-dot" />
                  <span className="legend-sidebar-name">{f.name}</span>
                  <span className="legend-sidebar-total">{c.total}</span>
                  {c.total - c.active > 0 && (
                    <span className="legend-sidebar-disco">{c.total - c.active} disc.</span>
                  )}
                </button>
              );
            })}
            {sorted.length === 0 && (
              <div className="legend-sidebar-empty">No families match your filter.</div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
