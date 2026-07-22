import type { Distro, Family } from '@shared/types';
import { ogUrl } from '@/lib/api';
import { getFaviconUrl, getLargeFaviconUrl } from '@/lib/favicon';

interface SidePanelProps {
  distro: Distro;
  family?: Family;
  parent?: Distro;
  children: Distro[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function SidePanel({ distro, family, parent, children, onClose, onSelect }: SidePanelProps) {
  const accent = family?.color ?? 'var(--accent)';
  const isDisco = distro.status === 'discontinued';
  return (
    <aside className="side-panel" role="dialog" aria-label={`Details for ${distro.name}`}>
      <header className="sp-header">
        <div className="sp-header-icon-name">
          {getLargeFaviconUrl(distro.website) ? (
            <img src={getLargeFaviconUrl(distro.website)!} alt="" className="sp-favicon" width="48" height="48" />
          ) : (
            <div className="sp-favicon sp-favicon--placeholder" />
          )}
          <div className="sp-titles">
            <span className="sp-family">{family?.name ?? distro.family}</span>
            <h2 className="sp-name">{distro.name}</h2>
          </div>
        </div>
        <button className="sp-close" onClick={onClose} aria-label="Close panel">×</button>
      </header>

      <div className="sp-status-row">
        <span className={`sp-status ${isDisco ? 'sp-status--disco' : 'sp-status--active'}`}>
          {isDisco ? 'Discontinued' : 'Active'}
        </span>
        {distro.founded && <span className="sp-meta-pill">founded {distro.founded}{distro.status === 'discontinued' && distro.discontinuedAt ? `–${distro.discontinuedAt}` : distro.status === 'active' ? '–present' : ''}</span>}
        {distro.country && <span className="sp-meta-pill">{distro.country}</span>}
      </div>

      {distro.description && <p className="sp-description">{distro.description}</p>}

      <div className="sp-grid">
        <MetaCell label="Package manager" value={distro.packageManager} />
        <MetaCell label="Init system" value={distro.initSystem} />
        <MetaCell label="Release model" value={distro.releaseModel} />
        <MetaCell label="License" value={distro.license} />
      </div>

      {(distro.website || distro.wikipedia) && (
        <div className="sp-links">
          {distro.website && (
            <a href={distro.website} target="_blank" rel="noreferrer" className="sp-link">
              Website ↗
            </a>
          )}
          {distro.wikipedia && (
            <a href={distro.wikipedia} target="_blank" rel="noreferrer" className="sp-link">
              Wikipedia ↗
            </a>
          )}
        </div>
      )}

      <div className="sp-section">
        <h3 className="sp-section-title">Connections</h3>
        <div className="sp-conns">
          {parent ? (
            <button className="sp-conn sp-conn--parent" onClick={() => onSelect(parent.id)}>
              <span className="sp-conn-label">based on</span>
              <span className="sp-conn-name">{parent.name}</span>
            </button>
          ) : (
            <span className="sp-conn sp-conn--root">
              <span className="sp-conn-label">root distro</span>
              <span className="sp-conn-name">{distro.name}</span>
            </span>
          )}
          {children.length > 0 && (
            <div className="sp-children">
              <span className="sp-conn-label">descendants ({children.length})</span>
              <ul className="sp-child-list">
                {children.slice(0, 12).map((c) => (
                  <li key={c.id}>
                    <button onClick={() => onSelect(c.id)} className="sp-child-link">
                      {c.name}
                      {c.status === 'discontinued' && <span className="sp-discontinued-dot" aria-label="discontinued" />}
                    </button>
                  </li>
                ))}
                {children.length > 12 && <li className="sp-child-more">+ {children.length - 12} more</li>}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="sp-section sp-og">
        <h3 className="sp-section-title">Social card</h3>
        <p className="sp-section-sub">Auto-generated share image for social media:</p>
        <img src={ogUrl(distro.id)} alt={`Open Graph card for ${distro.name}`} className="sp-og-img" loading="lazy" />
        <a href={ogUrl(distro.id)} target="_blank" rel="noreferrer" className="sp-link sp-link--muted">
          Open full size ↗
        </a>
      </div>
    </aside>
  );
}

function MetaCell({ label, value }: { label: string; value?: string }) {
  return (
    <div className="sp-cell">
      <span className="sp-cell-label">{label}</span>
      <span className="sp-cell-value">{value ?? '—'}</span>
    </div>
  );
}
