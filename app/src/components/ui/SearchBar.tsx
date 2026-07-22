'use client';

/**
 * SearchBar — Advanced search with structured filters.
 * Supports free-text and key:value filter syntax.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useGraph } from '@/components/providers/GraphProvider';
import { parseQuery, searchDistros } from '@/lib/query';

export function SearchBar() {
  const { distros, setSearchResults, setSearchQuery, selectNode } = useGraph();
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const results = searchDistros(distros, parseQuery(input), 20);

  const handleSearch = useCallback((value: string) => {
    setInput(value);
    setSearchQuery(value);
    setSelectedIndex(-1);
    if (value.length > 0) {
      const query = parseQuery(value);
      const found = searchDistros(distros, query, 20);
      setSearchResults(found);
      setIsOpen(true);
    } else {
      setSearchResults([]);
      setIsOpen(false);
    }
  }, [distros, setSearchResults, setSearchQuery]);

  const handleSelect = useCallback((id: string) => {
    selectNode(id);
    setIsOpen(false);
    setInput('');
    setSearchResults([]);
  }, [selectNode, setSearchResults]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex].id);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setInput('');
      setSearchResults([]);
    }
  }, [results, selectedIndex, handleSelect, setSearchResults]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcut: / to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const familyColor = (family: string) => {
    const colors: Record<string, string> = {
      debian: '#c70036', ubuntu: '#e95420', arch: '#1793d1',
      fedora: '#294172', mint: '#86be41', alpine: '#0d597f',
    };
    return colors[family] ?? '#666';
  };

  return (
    <div className="relative w-full max-w-md" ref={resultsRef}>
      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => input && setIsOpen(true)}
          placeholder='Search distros... (e.g. "family:arch kde")'
          className="w-full px-4 py-3 pl-10 bg-gray-900/80 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:border-blue-500
                     focus:ring-1 focus:ring-blue-500 backdrop-blur-sm"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs
                        text-gray-500 bg-gray-800 border border-gray-700 rounded">
          /
        </kbd>
      </div>

      {/* Results dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900/95 border border-gray-700
                        rounded-lg shadow-2xl backdrop-blur-sm overflow-hidden z-50 max-h-96 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r.id)}
              className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors
                ${i === selectedIndex ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: familyColor(r.family) }}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{r.name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {r.family} · {r.status}
                  {r.description && ` · ${r.description.slice(0, 60)}`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {isOpen && input && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900/95 border border-gray-700
                        rounded-lg shadow-2xl backdrop-blur-sm p-4 text-center text-gray-500 text-sm z-50">
          No distros found for &quot;{input}&quot;
        </div>
      )}
    </div>
  );
}
