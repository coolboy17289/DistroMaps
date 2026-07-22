import { useMemo } from 'react';
import type { Family, Distro } from '@shared/types';

interface LegendProps {
  families: Family[];
  distros: Distro[];
  filterFamilyId: string | null;
  setFilterFamilyId: (id: string | null) => void;
  showDisco: boolean;
  setShowDisco: (v: boolean) => void;
  onHoverFamily?: (id: string | null) => void;
}

export function Legend({ families, distros, filterFamilyId, setFilterFamilyId, showDisco, setShowDisco, onHoverFamily }: LegendProps) {
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
    return [...families].sort((a, b) => (counts.get(b.id)?.total ?? 0) - (counts.get(a.id)?.total ?? 0));
  }, [families, counts]);

  // Split into 3 columns to fit horizontally.
  const cols: Family[][] = [[], [], []];
  sorted.forEach((f, i) => cols[i % 3].push(f));

  return (
    <div className="legend">
      <div className="legend-header">
        <button
          className={`legend-toggle ${filterFamilyId === null ? 'is-on' : ''}`}
          onClick={() => setFilterFamilyId(null)}
        >
          All families
        </button>
        <button
          className={`legend-toggle ${showDisco ? 'is-on' : ''}`}
          onClick={() => setShowDisco(!showDisco)}
        >
          {showDisco ? 'Hide discontinued' : 'Show discontinued'}
        </button>
      </div>
      <div className="legend-columns">
        {cols.map((col, idx) => (
          <div key={idx} className="legend-col">
            {col.map((f) => {
              const c = counts.get(f.id) ?? { active: 0, total: 0 };
              return (
                <button
                  key={f.id}
                  className={`legend-pill ${filterFamilyId === f.id ? 'is-on' : ''}`}
                  onClick={() => {
                    onHoverFamily?.(null);
                    setFilterFamilyId(filterFamilyId === f.id ? null : f.id);
                  }}
                  onMouseEnter={() => onHoverFamily?.(f.id)}
                  onMouseLeave={() => onHoverFamily?.(null)}
                  style={{ ['--pill-color' as any]: f.color }}
                  title={`${f.name} — ${c.active} active, ${c.total - c.active} discontinued`}
                >
                  <span className="legend-dot" />
                  <span className="legend-name">{f.name}</span>
                  <span className="legend-count">{c.total}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
