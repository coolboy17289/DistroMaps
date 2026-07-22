import { useRef } from 'react';
import type { GraphData } from '@shared/types';

interface BrandProps {
  data: GraphData;
}

export function Brand({ data }: BrandProps) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        <span className="brand-mark-dot" />
      </span>
      <div className="brand-text">
        <span className="brand-title">DistroMap</span>
        <span className="brand-sub">the Linux knowledge graph</span>
      </div>
      <div className="brand-stats">
        <div className="brand-stat">
          <strong>{data.meta.active}</strong>
          <span>active</span>
        </div>
        <div className="brand-stat">
          <strong>{data.meta.discontinued}</strong>
          <span>disc.</span>
        </div>
        <div className="brand-stat">
          <strong>{data.meta.families - 1}</strong>
          <span>families</span>
        </div>
      </div>
    </div>
  );
}

interface KeyboardHintsProps {
  show: boolean;
  onToggle: () => void;
}

const SHORTCUTS = [
  { keys: ['/'], label: 'Search' },
  { keys: ['⌘', 'K'], label: 'Search (any field)' },
  { keys: ['F'], label: 'Filter to selected family' },
  { keys: ['↑', '↓'], label: 'Walk ancestors / descendants' },
  { keys: ['Esc'], label: 'Close panel / clear filter' },
  { keys: ['T'], label: 'Toggle theme' },
  { keys: ['?'], label: 'Toggle this list' },
];

/* ===== Theme Toggle ===== */

export function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  const spinning = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    if (spinning.current) return;
    spinning.current = true;
    onToggle();
    const el = btnRef.current;
    if (el) {
      el.classList.add('theme-toggle--anim');
      setTimeout(() => {
        el.classList.remove('theme-toggle--anim');
        spinning.current = false;
      }, 500);
    }
  };

  return (
    <button
      ref={btnRef}
      className="theme-toggle"
      onClick={handleToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <span className="theme-toggle-icon">
        {theme === 'dark' ? '☀' : '☾'}
      </span>
    </button>
  );
}

export function KeyboardHints({ show, onToggle }: KeyboardHintsProps) {
  return (
    <div className={`kbd-hints ${show ? 'is-open' : ''}`}>
      <button className="kbd-hints-toggle" onClick={onToggle} aria-label="Toggle keyboard shortcuts">
        <span className="kbd-hints-toggle-key">?</span>
      </button>
      <div className="kbd-hints-panel">
        <h3>Keyboard shortcuts</h3>
        <ul>
          {SHORTCUTS.map((s) => (
            <li key={s.label}>
              <span className="kbd-keys">
                {s.keys.map((k, idx) => (
                  <kbd key={idx}>{k}</kbd>
                ))}
              </span>
              <span className="kbd-label">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
