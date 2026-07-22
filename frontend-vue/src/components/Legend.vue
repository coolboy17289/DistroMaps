<template>
  <aside class="legend-sidebar" :class="{ 'is-collapsed': !g.legendOpen.value }">
    <div class="legend-sidebar-header">
      <template v-if="g.legendOpen.value">
        <div class="legend-sidebar-title-row">
          <h2 class="legend-sidebar-title">Families</h2>
          <span class="legend-sidebar-count">{{ g.data.value?.families.length ?? 0 }}</span>
        </div>
        <div class="legend-sidebar-search">
          <span class="legend-sidebar-search-icon">⌕</span>
          <input
            v-model="search"
            class="legend-sidebar-search-input"
            placeholder="Filter families…"
            aria-label="Filter families"
          />
        </div>
      </template>
      <button
        class="legend-sidebar-toggle"
        :aria-label="g.legendOpen.value ? 'Collapse family sidebar' : 'Expand family sidebar'"
        :title="g.legendOpen.value ? 'Hide families' : 'Show families'"
        @click="g.legendOpen.value = !g.legendOpen.value"
      >{{ g.legendOpen.value ? '◀' : '▶' }}</button>
    </div>

    <template v-if="g.legendOpen.value">
      <div class="legend-sidebar-controls">
        <button
          class="legend-sidebar-btn"
          :class="{ 'is-active': g.filterFamilyId.value === null }"
          title="Show all families"
          @click="clearFilter"
        >All</button>
        <button
          class="legend-sidebar-btn"
          :class="{ 'is-active': !g.showDisco.value }"
          :title="g.showDisco.value ? 'Hide discontinued distros' : 'Show discontinued distros'"
          @click="g.showDisco.value = !g.showDisco.value"
        >{{ g.showDisco.value ? 'Active + Disc.' : 'Active only' }}</button>
        <span class="legend-sidebar-stats">{{ selectedCount }} distros</span>
      </div>

      <div class="legend-sidebar-list">
        <button
          v-for="f in sorted"
          :key="f.id"
          class="legend-sidebar-item"
          :class="{ 'is-on': g.filterFamilyId.value === f.id }"
          :style="{ '--item-color': f.color }"
          :title="`${f.name} — ${counts.get(f.id)?.active ?? 0} active, ${(counts.get(f.id)?.total ?? 0) - (counts.get(f.id)?.active ?? 0)} discontinued`"
          @click="toggleFamily(f.id)"
          @mouseenter="g.hoveredFamilyId.value = f.id"
          @mouseleave="g.hoveredFamilyId.value = null"
        >
          <span class="legend-sidebar-dot" />
          <span class="legend-sidebar-name">{{ f.name }}</span>
          <span class="legend-sidebar-total">{{ counts.get(f.id)?.total ?? 0 }}</span>
          <span v-if="(counts.get(f.id)?.total ?? 0) - (counts.get(f.id)?.active ?? 0) > 0" class="legend-sidebar-disco">
            {{ (counts.get(f.id)?.total ?? 0) - (counts.get(f.id)?.active ?? 0) }} disc.
          </span>
        </button>
        <div v-if="!sorted.length" class="legend-sidebar-empty">No families match your filter.</div>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGraph } from '@/composables/useGraph';
import type { Family } from '@shared/types';

const g = useGraph();
const search = ref('');

const counts = computed(() => {
  const m = new Map<string, { active: number; total: number }>();
  for (const d of g.data.value?.distros ?? []) {
    const cur = m.get(d.family) ?? { active: 0, total: 0 };
    cur.total++;
    if (d.status !== 'discontinued') cur.active++;
    m.set(d.family, cur);
  }
  return m;
});

const sorted = computed<Family[]>(() => {
  const fams = g.data.value?.families ?? [];
  return [...fams]
    .filter((f) => {
      if (!g.showDisco.value) {
        const c = counts.value.get(f.id);
        return c && c.active > 0;
      }
      return true;
    })
    .filter((f) => f.id !== 'linux-kernel')
    .sort((a, b) => (counts.value.get(b.id)?.total ?? 0) - (counts.value.get(a.id)?.total ?? 0))
    .filter((f) => (search.value ? f.name.toLowerCase().includes(search.value.toLowerCase()) : true));
});

const selectedCount = computed(() =>
  g.filterFamilyId.value ? counts.value.get(g.filterFamilyId.value)?.total ?? 0 : g.data.value?.distros.length ?? 0,
);

function toggleFamily(id: string) {
  g.hoveredFamilyId.value = null;
  g.filterFamilyId.value = g.filterFamilyId.value === id ? null : id;
}
function clearFilter() {
  g.hoveredFamilyId.value = null;
  g.filterFamilyId.value = null;
}
</script>