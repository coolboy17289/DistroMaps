import { useEffect, useMemo, useRef, useState } from 'react';
import type { Distro } from '@shared/types';
import { parseSearch } from '@/lib/query';
import { fetchSearch } from '@/lib/api';

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  results: Distro[];
  onPick: (id: string) => void;
  onHoverResult?: (id: string | null) => void;
  focusSignal?: number;
}

export function SearchBar({ value, onChange, results, onPick, onHoverResult, focusSignal }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [remoteResults, setRemoteResults] = useState<Distro[] | null>(null);

  // Focus the input whenever the external focusSignal changes (triggered by keyboard shortcuts)
  useEffect(() => {
    if (focusSignal !== undefined) {
      inputRef.current?.focus();
    }
  }, [focusSignal]);

  const parsed = useMemo(() => parseSearch(value), [value]);

  // When the user types a non-trivial query, prefetch suggestions.
  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setRemoteResults(null);
      return;
    }
    const handle = setTimeout(() => {
      fetchSearch(value).then(setRemoteResults).catch(() => setRemoteResults(null));
    }, 180);
    return () => clearTimeout(handle);
  }, [value]);

  const suggestions = (remoteResults ?? results).slice(0, 6);

  const chips: string[] = [];
  if (parsed.filter.family) chips.push(`family: ${parsed.filter.family}`);
  if (parsed.filter.init) chips.push(`init: ${parsed.filter.init}`);
  if (parsed.filter.pkg) chips.push(`pkg: ${parsed.filter.pkg}`);
  if (parsed.filter.country) chips.push(`country: ${parsed.filter.country}`);
  if (parsed.filter.status) chips.push(`status: ${parsed.filter.status}`);
  if (parsed.filter.release) chips.push(`release: ${parsed.filter.release}`);
  if (parsed.filter.license) chips.push(`license: ${parsed.filter.license}`);

  return (
    <div className={`search-bar ${open ? 'is-open' : ''}`}>
      <div className="search-input-wrap">
        <span className="search-icon" aria-hidden>⌕</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder='Search distros or "family: debian" / "init: openrc" / "country: Germany"'
          className="search-input"
          aria-label="Search distros"
        />
        <button className="search-kbd" aria-label="Keyboard shortcut">/</button>
      </div>

      {chips.length > 0 && (
        <div className="search-chips">
          {chips.map((c) => (
            <span key={c} className="search-chip">
              {c}
            </span>
          ))}
        </div>
      )}

      {open && suggestions.length > 0 && (
        <div className="search-dropdown" role="listbox">
          {suggestions.map((s) => (
            <button
              key={s.id}
              className="search-result"
              onClick={() => onPick(s.id)}
              onMouseEnter={() => onHoverResult?.(s.id)}
              onMouseLeave={() => onHoverResult?.(null)}
            >
              <span className="search-result-name">{s.name}</span>
              <span className="search-result-meta">
                {s.packageManager && <span>pkg: {s.packageManager}</span>}
                {s.initSystem && <span>init: {s.initSystem}</span>}
                {s.country && <span>{s.country}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && value.length >= 2 && suggestions.length === 0 && (
        <div className="search-empty">No matches for “{value}”.</div>
      )}

      {value && (
        <button className="search-clear" onClick={() => onChange('')} aria-label="Clear search">
          Clear
        </button>
      )}
    </div>
  );
}
