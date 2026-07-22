import { ref, computed, shallowRef } from 'vue';
import type { Distro, GraphData } from '@shared/types';
import { fetchData } from '@/lib/api';
import { buildLayout3D, type Layout3D } from '@/lib/layout3d';
import { filterDistros, parseSearch } from '@/lib/query';

/**
 * App-wide reactive store (module singleton). Holds the loaded dataset, the
 * memoized 3D layout, and the interaction state mirrored from the React app
 * (selectedId, hoveredId, hoveredFamilyId, filterFamilyId, searchQuery, theme,
 * legend visibility, and the computed ancestry highlight set).
 */

export type Theme = 'dark' | 'light';

const data = shallowRef<GraphData | null>(null);
const layout = shallowRef<Layout3D | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

const searchQuery = ref('');
const filterFamilyId = ref<string | null>(null);
const showDisco = ref(true);
const selectedId = ref<string | null>(null);
const hoveredId = ref<string | null>(null);
const hoveredFamilyId = ref<string | null>(null);
const searchHoveredId = ref<string | null>(null);
const kbdOpen = ref(false);
const legendOpen = ref(true);
const requestSearchFocus = ref(0);

const theme = ref<Theme>((() => {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('distromap-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
})());

const parsedQuery = computed(() => parseSearch(searchQuery.value));

const filteredResults = computed(() => {
  if (!data.value) return [];
  return filterDistros(data.value.distros, parsedQuery.value).slice(0, 80);
});

const selectedDistro = computed<Distro | null>(() =>
  data.value?.distros.find((d) => d.id === selectedId.value) ?? null,
);

const selectedFamily = computed(() =>
  selectedDistro.value ? data.value?.families.find((f) => f.id === selectedDistro.value!.family) : undefined,
);

const parentDistro = computed<Distro | undefined>(() =>
  selectedDistro.value?.parent ? data.value?.distros.find((d) => d.id === selectedDistro.value!.parent) : undefined,
);

const childrenDistros = computed<Distro[]>(() => {
  if (!data.value || !selectedId.value) return [];
  return data.value.distros.filter(
    (d) => d.parent === selectedId.value || d.additionalParents?.includes(selectedId.value!),
  );
});

/** Ancestry + descendants of the selected node — highlighted on the canvas. */
const highlightIds = computed<Set<string>>(() => {
  const set = new Set<string>();
  if (!data.value || !selectedId.value) return set;
  set.add(selectedId.value);
  let cursor = data.value.distros.find((d) => d.id === selectedId.value);
  while (cursor?.parent) {
    set.add(cursor.parent);
    cursor = data.value.distros.find((d) => d.id === cursor!.parent);
  }
  const stack = [selectedId.value];
  const visited = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    data.value.distros
      .filter((d) => d.parent === id || d.additionalParents?.includes(id))
      .forEach((d) => {
        set.add(d.id);
        stack.push(d.id);
      });
  }
  return set;
});

const searchHighlightIds = computed<Set<string>>(() => {
  if (!searchQuery.value || searchQuery.value.trim().length < 2 || !searchHoveredId.value || !data.value) {
    return new Set<string>();
  }
  const set = new Set<string>([searchHoveredId.value]);
  const hovered = data.value.distros.find((d) => d.id === searchHoveredId.value);
  if (hovered?.parent) set.add(hovered.parent);
  data.value.distros
    .filter((d) => d.parent === searchHoveredId.value || d.additionalParents?.includes(searchHoveredId.value!))
    .forEach((d) => set.add(d.id));
  return set;
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const d = await fetchData();
    data.value = d;
    layout.value = buildLayout3D(d);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function setTheme(t: Theme) {
  theme.value = t;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('light-theme', t === 'light');
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem('distromap-theme', t);
}

function toggleTheme() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark');
}

function focusSearch() {
  requestSearchFocus.value++;
}

function walkDown() {
  if (!data.value || !selectedId.value || childrenDistros.value.length === 0) return;
  selectedId.value = childrenDistros.value[0].id;
}

function walkUp() {
  if (!selectedDistro.value?.parent) return;
  selectedId.value = selectedDistro.value.parent;
}

function clearEscapeCascade() {
  if (selectedId.value) selectedId.value = null;
  else if (searchQuery.value) searchQuery.value = '';
  else if (filterFamilyId.value) filterFamilyId.value = null;
  else if (kbdOpen.value) kbdOpen.value = false;
}

export function useGraph() {
  return {
    // state
    data, layout, error, loading,
    searchQuery, filterFamilyId, showDisco, selectedId, hoveredId, hoveredFamilyId,
    searchHoveredId, kbdOpen, legendOpen, requestSearchFocus, theme,
    // computed
    parsedQuery, filteredResults, selectedDistro, selectedFamily, parentDistro,
    childrenDistros, highlightIds, searchHighlightIds,
    // actions
    load, setTheme, toggleTheme, focusSearch, walkDown, walkUp, clearEscapeCascade,
  };
}