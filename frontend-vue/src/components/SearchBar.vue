<template>
  <div class="search-bar" :class="{ 'is-open': open }">
    <div class="search-input-wrap">
      <span class="search-icon" aria-hidden>⌕</span>
      <input
        ref="inputEl"
        v-model="g.searchQuery.value"
        class="search-input"
        placeholder='Search 280+ distros or "family: debian" / "init: openrc" / "country: Germany"'
        aria-label="Search distros"
        @focus="open = true"
        @blur="onBlur"
      />
      <button class="search-kbd" aria-label="Keyboard shortcut">/</button>
    </div>

    <div v-if="chips.length" class="search-chips">
      <span v-for="c in chips" :key="c" class="search-chip">{{ c }}</span>
    </div>

    <div v-if="open && suggestions.length" class="search-dropdown" role="listbox">
      <button
        v-for="s in suggestions"
        :key="s.id"
        class="search-result"
        @mousedown.prevent="pick(s.id)"
        @mouseenter="g.searchHoveredId.value = s.id"
        @mouseleave="g.searchHoveredId.value = null"
      >
        <span class="search-result-name">{{ s.name }}</span>
        <span class="search-result-meta">
          <span v-if="s.packageManager">pkg: {{ s.packageManager }}</span>
          <span v-if="s.initSystem">init: {{ s.initSystem }}</span>
          <span v-if="s.country">{{ s.country }}</span>
        </span>
      </button>
    </div>

    <div v-if="open && g.searchQuery.value.length >= 2 && !suggestions.length" class="search-empty">
      No matches for “{{ g.searchQuery.value }}”.
    </div>

    <button v-if="g.searchQuery.value" class="search-clear" @click="g.searchQuery.value = ''" aria-label="Clear search">
      Clear
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useGraph } from '@/composables/useGraph';

const g = useGraph();
const inputEl = ref<HTMLInputElement | null>(null);
const open = ref(false);

const suggestions = computed(() => g.filteredResults.value.slice(0, 6));

const chips = computed<string[]>(() => {
  const f = g.parsedQuery.value.filter;
  const out: string[] = [];
  if (f.family) out.push(`family: ${f.family}`);
  if (f.init) out.push(`init: ${f.init}`);
  if (f.pkg) out.push(`pkg: ${f.pkg}`);
  if (f.country) out.push(`country: ${f.country}`);
  if (f.status) out.push(`status: ${f.status}`);
  if (f.release) out.push(`release: ${f.release}`);
  if (f.license) out.push(`license: ${f.license}`);
  return out;
});

function pick(id: string) {
  g.selectedId.value = id;
  open.value = false;
}

function onBlur() {
  setTimeout(() => (open.value = false), 120);
}

// Focus when the focus signal changes (keyboard shortcut).
watch(() => g.requestSearchFocus.value, () => inputEl.value?.focus());
onMounted(() => inputEl.value?.focus());
</script>