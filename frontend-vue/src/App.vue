<template>
  <div class="app" :class="legendOpen ? 'legend-open' : 'legend-closed'">
    <Brand />

    <div class="top-bar">
      <SearchBar />
      <button class="add-button" @click="addOpen = true">
        <span class="add-button-plus">+</span>
        <span>Add distro</span>
      </button>
    </div>

    <Legend />

    <BrainGraph />

    <KeyboardHints />

    <div class="graph-status">
      <template v-if="hoveredId">{{ hoveredName }}</template>
      <template v-else>{{ data?.meta.totalDistros ?? 0 }} distros · {{ Math.max(0, (data?.meta.families ?? 1) - 1) }} families</template>
    </div>

    <SidePanel v-if="selectedDistro" />

    <ThemeToggle />

    <!-- Add-distro modal (kept simple — posts a suggestion to the API) -->
    <AddDistroForm v-if="addOpen" @close="addOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent, h } from 'vue';
// BrainGraph pulls in Three.js (~640 KB). Load it as a separate async chunk so
// the chrome / search / legend paint first and the 3D engine streams in
// afterward, keeping the initial JS payload small and cacheable on its own.
const BrainGraph = defineAsyncComponent({
  loader: () => import('@/components/BrainGraph.vue'),
  loadingComponent: () => h(
    'div',
    { style: 'position:absolute;inset:60px 0 0;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;z-index:20;' },
    'Loading the Linux knowledge graph…',
  ),
  delay: 0,
});
import SearchBar from '@/components/SearchBar.vue';
import Legend from '@/components/Legend.vue';
import SidePanel from '@/components/SidePanel.vue';
import AddDistroForm from '@/components/AddDistroForm.vue';
import Brand, { KeyboardHints, ThemeToggle } from '@/components/Chrome.vue';
import { useGraph } from '@/composables/useGraph';
import { useKeyboard } from '@/composables/useKeyboard';

const g = useGraph();
const { data, legendOpen, hoveredId, selectedDistro } = g;

const addOpen = ref(false);

const hoveredName = computed(
  () => data.value?.distros.find((d) => d.id === hoveredId.value)?.name ?? hoveredId.value ?? '',
);

useKeyboard();

onMounted(async () => {
  // Apply persisted theme before children paint.
  document.documentElement.classList.toggle('light-theme', g.theme.value === 'light');
  if (!data.value) await g.load();
});
</script>