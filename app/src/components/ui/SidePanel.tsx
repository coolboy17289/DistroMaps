'use client';

/**
 * SidePanel — Distro detail panel shown when a node is selected.
 * Displays metadata, connections, and related distros.
 */

import { useGraph } from '@/components/providers/GraphProvider';
import { useMemo } from 'react';

export function SidePanel() {
  const { selectedNode, distros, families, edges, selectNode } = useGraph();

  const distro = useMemo(
    () => distros.find(d => d.id === selectedNode),
    [distros, selectedNode],
  );

  const family = useMemo(
    () => distro ? families.find(f => f.id === distro.family) : null,
    [families, distro],
  );

  const connections = useMemo(() => {
    if (!selectedNode) return [];
    return edges
      .filter(e => e.source === selectedNode || e.target === selectedNode)
      .map(e => {
        const otherId = e.source === selectedNode ? e.target : e.source;
        const other = distros.find(d => d.id === otherId);
        return {
          id: otherId,
          name: other?.name ?? otherId,
          direction: e.source === selectedNode ? 'parent' : 'child',
        };
      });
  }, [selectedNode, edges, distros]);

  const relatedDistros = useMemo(() => {
    if (!distro) return [];
    return distros
      .filter(d => d.family === distro.family && d.id !== distro.id)
      .slice(0, 5);
  }, [distros, distro]);

  if (!distro) return null;

  const statusColor = distro.status === 'active' ? 'text-green-400' : 'text-red-400';
  const statusDot = distro.status === 'active' ? 'bg-green-400' : 'bg-red-400';

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-gray-950/95 border-l border-gray-800
                    backdrop-blur-xl shadow-2xl z-40 overflow-y-auto">
      {/* Header */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">{distro.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${statusDot}`} />
              <span className={`text-sm ${statusColor}`}>
                {distro.status === 'active' ? 'Active' : 'Discontinued'}
              </span>
              {family && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: family.color + '33', color: family.color }}
                >
                  {family.name}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => selectNode(null)}
            className="p-1 text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Description */}
      {distro.description && (
        <div className="p-6 border-b border-gray-800">
          <p className="text-sm text-gray-400 leading-relaxed">{distro.description}</p>
        </div>
      )}

      {/* Attributes */}
      <div className="p-6 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Details</h3>
        <div className="space-y-2">
          {distro.founded && (
            <Row label="Founded" value={`${distro.founded}`} />
          )}
          {distro.country && (
            <Row label="Country" value={distro.country} />
          )}
          {distro.packageManager && (
            <Row label="Package Manager" value={distro.packageManager} />
          )}
          {distro.initSystem && (
            <Row label="Init System" value={distro.initSystem} />
          )}
          {distro.releaseModel && (
            <Row label="Release Model" value={distro.releaseModel} />
          )}
          {distro.license && (
            <Row label="License" value={distro.license} />
          )}
          {distro.baseDistro && (
            <Row label="Base" value={distro.baseDistro} />
          )}
        </div>
      </div>

      {/* Links */}
      <div className="p-6 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Links</h3>
        <div className="space-y-2">
          {distro.website && (
            <LinkRow label="Website" url={distro.website} />
          )}
          {distro.wikipedia && (
            <LinkRow label="Wikipedia" url={distro.wikipedia} />
          )}
        </div>
      </div>

      {/* Connections */}
      {connections.length > 0 && (
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Connections ({connections.length})
          </h3>
          <div className="space-y-1">
            {connections.map(c => (
              <button
                key={c.id}
                onClick={() => selectNode(c.id)}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white
                           hover:bg-gray-800/50 rounded-lg transition-colors flex items-center gap-2"
              >
                <span className="text-xs text-gray-600">
                  {c.direction === 'parent' ? '←' : '→'}
                </span>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Related Distros */}
      {relatedDistros.length > 0 && (
        <div className="p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Same Family
          </h3>
          <div className="space-y-1">
            {relatedDistros.map(d => (
              <button
                key={d.id}
                onClick={() => selectNode(d.id)}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white
                           hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
      {label}
    </a>
  );
}
