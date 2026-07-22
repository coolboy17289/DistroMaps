import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchData } from '@/lib/api';
import { fetchFamilies } from '@/lib/api';
import type { GraphData } from '@shared/types';

export function useGraphData(): { data: GraphData | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    fetchData()
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload };
}

export function useFamilies() {
  const [families, setFamilies] = useState<{ id: string; name: string; color: string }[]>([]);
  useEffect(() => {
    fetchFamilies().then((f) => setFamilies(f));
  }, []);
  return families;
}

export interface ShortcutHandlers {
  onSlash?: () => void;
  onCmdK?: () => void;
  onF?: () => void;
  onEsc?: () => void;
  onArrowDown?: () => void;
  onArrowUp?: () => void;
  onQuestion?: () => void;
  onLiveRegion?: (msg: string) => void;
}

export function useKeyboardShortcuts(h: ShortcutHandlers) {
  const handlers = useRef(h);
  handlers.current = h;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable;
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          handlers.current.onCmdK?.();
          return;
        }
      }
      if (e.key === '/' && !isEditable) {
        e.preventDefault();
        handlers.current.onSlash?.();
        return;
      }
      if (e.key === 'f' && !isEditable) {
        e.preventDefault();
        handlers.current.onF?.();
        return;
      }
      if (e.key === 'Escape') {
        handlers.current.onEsc?.();
        return;
      }
      if (e.key === 'ArrowDown' && !isEditable) {
        handlers.current.onArrowDown?.();
        return;
      }
      if (e.key === 'ArrowUp' && !isEditable) {
        handlers.current.onArrowUp?.();
        return;
      }
      if (e.key === '?' && !isEditable) {
        handlers.current.onQuestion?.();
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
