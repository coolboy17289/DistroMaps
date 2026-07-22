<template>
  <aside class="side-panel" role="dialog" :aria-label="`Details for ${distro.name}`">
    <header class="sp-header">
      <div class="sp-header-icon-name">
        <div class="sp-favicon sp-favicon--placeholder" :style="{ background: accent }" />
        <div class="sp-titles">
          <span class="sp-family">{{ family?.name ?? distro.family }}</span>
          <h2 class="sp-name">{{ distro.name }}</h2>
        </div>
      </div>
      <button class="sp-close" aria-label="Close panel" @click="g.selectedId.value = null">×</button>
    </header>

    <div class="sp-status-row">
      <span class="sp-status" :class="isDisco ? 'sp-status--disco' : 'sp-status--active'">
        {{ isDisco ? 'Discontinued' : 'Active' }}
      </span>
      <span v-if="distro.founded" class="sp-meta-pill">
        founded {{ distro.founded }}{{ foundedSuffix }}
      </span>
      <span v-if="distro.country" class="sp-meta-pill">{{ distro.country }}</span>
    </div>

    <p v-if="distro.description" class="sp-description">{{ distro.description }}</p>

    <div class="sp-grid">
      <MetaCell label="Package manager" :value="distro.packageManager" />
      <MetaCell label="Init system" :value="distro.initSystem" />
      <MetaCell label="Release model" :value="distro.releaseModel" />
      <MetaCell label="License" :value="distro.license" />
    </div>

    <div v-if="distro.website || distro.wikipedia" class="sp-links">
      <a v-if="distro.website" :href="distro.website" target="_blank" rel="noreferrer" class="sp-link">Website ↗</a>
      <a v-if="distro.wikipedia" :href="distro.wikipedia" target="_blank" rel="noreferrer" class="sp-link">Wikipedia ↗</a>
    </div>

    <div class="sp-section">
      <h3 class="sp-section-title">Connections</h3>
      <div class="sp-conns">
        <button v-if="parent" class="sp-conn sp-conn--parent" @click="g.selectedId.value = parent.id">
          <span class="sp-conn-label">based on</span>
          <span class="sp-conn-name">{{ parent.name }}</span>
        </button>
        <span v-else class="sp-conn sp-conn--root">
          <span class="sp-conn-label">root distro</span>
          <span class="sp-conn-name">{{ distro.name }}</span>
        </span>

        <div v-if="children.length > 0" class="sp-children">
          <span class="sp-conn-label">descendants ({{ children.length }})</span>
          <ul class="sp-child-list">
            <li v-for="c in children.slice(0, 12)" :key="c.id">
              <button class="sp-child-link" @click="g.selectedId.value = c.id">
                {{ c.name }}
                <span v-if="c.status === 'discontinued'" class="sp-discontinued-dot" aria-label="discontinued" />
              </button>
            </li>
            <li v-if="children.length > 12" class="sp-child-more">+ {{ children.length - 12 }} more</li>
          </ul>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, h, defineComponent } from 'vue';
import { useGraph } from '@/composables/useGraph';

const g = useGraph();
const distro = computed(() => g.selectedDistro.value!);
const family = computed(() => g.selectedFamily.value);
const parent = computed(() => g.parentDistro.value);
const children = computed(() => g.childrenDistros.value);

const accent = computed(() => family.value?.color ?? 'var(--accent)');
const isDisco = computed(() => distro.value.status === 'discontinued');
const foundedSuffix = computed(() => {
  if (distro.value.status === 'discontinued' && distro.value.discontinuedAt) return `–${distro.value.discontinuedAt}`;
  if (distro.value.status === 'active') return '–present';
  return '';
});

const MetaCell = defineComponent({
  props: { label: String, value: String },
  setup: (p) => () =>
    h('div', { class: 'sp-cell' }, [
      h('span', { class: 'sp-cell-label' }, p.label),
      h('span', { class: 'sp-cell-value' }, p.value ?? '—'),
    ]),
});
</script>