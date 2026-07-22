'use client';

/**
 * Legend — Family color legend with filtering.
 * Shows all families as color-coded pills.
 */

import { useGraph } from '@/components/providers/GraphProvider';
import { useState } from 'react';

export function Legend() {
  const { families, highlightedFamily, highlightFamily, distros } = useGraph();
  const [showDiscontinued, setShowDiscontinued] = useState(true);

  const familyCounts = families.map(f => ({
    ...f,
    count: distros.filter(d => d.family === f.id).length,
  })).sort((a, b) => b.count - a.count);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-950/90 border-t border-gray-800
                    backdrop-blur-xl z-30 px-6 py-3">
      <div className="flex items-center gap-4 overflow-x-auto">
        {/* Label */}
        <span className="text-xs text-gray-500 font-medium flex-shrink-0">Families</span>

        {/* Family pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {familyCounts.map(f => (
            <button
              key={f.id}
              onClick={() => highlightFamily(highlightedFamily === f.id ? null : f.id)}
              onMouseEnter={() => highlightFamily(f.id)}
              onMouseLeave={() => highlightFamily(null)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
                         transition-all duration-200 flex-shrink-0
                         ${highlightedFamily === f.id
                           ? 'ring-2 ring-white/30 scale-105'
                           : highlightedFamily
                             ? 'opacity-40 hover:opacity-70'
                             : 'hover:scale-105'
                         }`}
              style={{
                backgroundColor: f.color + '22',
                color: f.color,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: f.color }}
              />
              {f.name}
              <span className="text-[10px] opacity-60">{f.count}</span>
            </button>
          ))}
        </div>

        {/* Toggle */}
        <label className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0 ml-auto">
          <input
            type="checkbox"
            checked={showDiscontinued}
            onChange={(e) => setShowDiscontinued(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800"
          />
          Include discontinued
        </label>
      </div>
    </div>
  );
}
