import { onMounted, onBeforeUnmount } from 'vue';
import { useGraph } from './useGraph';

/**
 * Global keyboard shortcuts (mirrors the React app's `useKeyboardShortcuts`):
 *   / or ⌘K  focus search
 *   F         filter to the selected node's family
 *   ↑ / ↓     walk ancestors / first descendant
 *   Esc       cascade-clear (selection → search → filter → kbd panel)
 *   T         toggle theme
 *   ?         toggle the keyboard-hints panel
 */
export function useKeyboard() {
  const g = useGraph();

  const isTyping = (el: EventTarget | null) =>
    el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

  const onKey = (e: KeyboardEvent) => {
    // Allow Escape even while typing (to blur/clear the search input).
    if (e.key === 'Escape') {
      g.clearEscapeCascade();
      return;
    }
    if (isTyping(e.target)) return;

    if (e.key === '/' || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      g.focusSearch();
    } else if (e.key === 'f' || e.key === 'F') {
      if (g.selectedDistro.value) g.filterFamilyId.value = g.selectedDistro.value.family;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      g.walkDown();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      g.walkUp();
    } else if (e.key === 't' || e.key === 'T') {
      g.toggleTheme();
    } else if (e.key === '?') {
      g.kbdOpen.value = !g.kbdOpen.value;
    }
  };

  onMounted(() => window.addEventListener('keydown', onKey));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
}