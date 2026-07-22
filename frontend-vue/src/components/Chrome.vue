<template>
  <!-- Brand is rendered by the parent App via <Brand /> -->
</template>

<script lang="ts">
import { defineComponent, h, ref as vRef, onMounted, onBeforeUnmount } from 'vue';
import { useGraph } from '@/composables/useGraph';

const SHORTCUTS = [
  { keys: ['/'], label: 'Search' },
  { keys: ['⌘', 'K'], label: 'Search (any field)' },
  { keys: ['F'], label: 'Filter to selected family' },
  { keys: ['↑', '↓'], label: 'Walk ancestors / descendants' },
  { keys: ['Esc'], label: 'Close panel / clear filter' },
  { keys: ['T'], label: 'Toggle theme' },
  { keys: ['?'], label: 'Toggle this list' },
];

export const Brand = defineComponent({
  name: 'Brand',
  setup() {
    const g = useGraph();
    return () => {
      const data = g.data.value;
      if (!data) return null;
      return h('div', { class: 'brand' }, [
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, [h('span', { class: 'brand-mark-dot' })]),
        h('div', { class: 'brand-text' }, [
          h('span', { class: 'brand-title' }, 'DistroMap'),
          h('span', { class: 'brand-sub' }, 'the Linux knowledge graph'),
        ]),
        h('div', { class: 'brand-stats' }, [
          h('div', { class: 'brand-stat' }, [h('strong', String(data.meta.active)), h('span', 'active')]),
          h('div', { class: 'brand-stat' }, [h('strong', String(data.meta.discontinued)), h('span', 'disc.')]),
          h('div', { class: 'brand-stat' }, [h('strong', String(Math.max(0, data.meta.families - 1))), h('span', 'families')]),
        ]),
      ]);
    };
  },
});

export const KeyboardHints = defineComponent({
  name: 'KeyboardHints',
  setup() {
    const g = useGraph();
    return () =>
      h('div', { class: ['kbd-hints', g.kbdOpen.value ? 'is-open' : ''] }, [
        h('button', {
          class: 'kbd-hints-toggle',
          'aria-label': 'Toggle keyboard shortcuts',
          onClick: () => (g.kbdOpen.value = !g.kbdOpen.value),
        }, [h('span', { class: 'kbd-hints-toggle-key' }, '?')]),
        h('div', { class: 'kbd-hints-panel' }, [
          h('h3', 'Keyboard shortcuts'),
          h('ul', SHORTCUTS.map((s) =>
            h('li', { key: s.label }, [
              h('span', { class: 'kbd-keys' }, s.keys.map((k, i) => h('kbd', { key: i }, k))),
              h('span', { class: 'kbd-label' }, s.label),
            ]),
          )),
        ]),
      ]);
  },
});

export const ThemeToggle = defineComponent({
  name: 'ThemeToggle',
  setup() {
    const g = useGraph();
    const animating = vRef(false);
    return () =>
      h('button', {
        class: 'theme-toggle',
        'aria-label': `Switch to ${g.theme.value === 'dark' ? 'light' : 'dark'} theme`,
        title: `Switch to ${g.theme.value === 'dark' ? 'light' : 'dark'} theme`,
        onClick: () => {
          if (animating.value) return;
          animating.value = true;
          g.toggleTheme();
          setTimeout(() => (animating.value = false), 500);
        },
      }, [
        h('span', { class: 'theme-toggle-icon' }, g.theme.value === 'dark' ? '☀' : '☾'),
      ]);
  },
});

export default defineComponent({ name: 'ChromeStub', setup: () => () => null });
// keep tree-shaking from dropping onMounted/onBeforeUnmount imports if needed elsewhere
void onMounted; void onBeforeUnmount;
</script>