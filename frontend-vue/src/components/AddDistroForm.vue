<template>
  <div class="add-form-backdrop" @click.self="$emit('close')">
    <div class="add-form">
      <header class="add-form-header">
        <h2>Suggest a distro</h2>
        <p>We'll validate it against Wikipedia before queuing it for review.</p>
        <button class="add-form-close" aria-label="Close" @click="$emit('close')">×</button>
      </header>

      <div class="add-form-field">
        <label class="add-form-label">Wikipedia topic <em>(e.g. Bazzite)</em></label>
        <input
          v-model="topic"
          class="add-form-input"
          placeholder="Bazzite"
          :disabled="busy"
          @keyup.enter="submit"
        />
      </div>

      <div class="add-form-field">
        <label class="add-form-label">Why? <em>(optional)</em></label>
        <textarea v-model="rationale" rows="2" :disabled="busy" placeholder="It's a popular Fedora Atomic derivative…" />
      </div>

      <div v-if="status" class="add-form-status" :class="`add-form-status--${status.kind}`">{{ status.text }}</div>

      <div v-if="preview" class="add-form-preview">
        <h3>{{ preview.title }}</h3>
        <p>{{ preview.description }}</p>
        <a :href="preview.url" target="_blank" rel="noreferrer">{{ preview.url }}</a>
      </div>

      <div class="add-form-actions">
        <button class="btn btn--ghost" @click="$emit('close')">Cancel</button>
        <button class="btn btn--primary" :disabled="busy || !topic.trim()" @click="submit">Submit</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineEmits<{ (e: 'close'): void }>();

const topic = ref('');
const rationale = ref('');
const busy = ref(false);
const status = ref<{ kind: 'busy' | 'error' | 'ok'; text: string } | null>(null);
const preview = ref<{ title: string; description?: string; url: string } | null>(null);

async function submit() {
  const t = topic.value.trim();
  if (!t) return;
  busy.value = true;
  status.value = { kind: 'busy', text: 'Validating against Wikipedia…' };
  preview.value = null;
  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: t, rationale: rationale.value }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Validation failed');
    status.value = { kind: 'ok', text: `Queued as ${json.id} ✓` };
    preview.value = json.validated;
    topic.value = '';
    rationale.value = '';
  } catch (e) {
    status.value = { kind: 'error', text: e instanceof Error ? e.message : String(e) };
  } finally {
    busy.value = false;
  }
}
</script>