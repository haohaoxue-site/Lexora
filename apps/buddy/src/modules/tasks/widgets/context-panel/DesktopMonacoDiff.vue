<script setup lang="ts">
import type { editor } from 'monaco-editor/editor/editor.api.js'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useMonacoDiff } from './useMonacoDiff'

const props = defineProps<{
  after: string
  before: string
  language: string | null
  path: string
  wrap?: boolean
  sideBySide?: boolean
  fitContent?: boolean
  initialHeight?: number
  viewState?: editor.IDiffEditorViewState | null
}>()
const emit = defineEmits<{
  height: [height: number]
  viewState: [state: editor.IDiffEditorViewState | null]
}>()

const container = useTemplateRef<HTMLDivElement>('container')
const contentHeight = shallowRef(props.initialHeight ?? 160)
const { failed, loading } = useMonacoDiff({
  container,
  language: computed(() => props.language),
  modified: computed(() => props.after),
  original: computed(() => props.before),
  path: computed(() => props.path),
  wrap: computed(() => props.wrap ?? false),
  sideBySide: computed(() => props.sideBySide ?? true),
  getViewState: () => props.viewState ?? null,
  onViewState: state => emit('viewState', state),
  onHeight: (height) => {
    const nextHeight = Math.min(800, Math.max(80, height))
    if (contentHeight.value !== nextHeight) {
      contentHeight.value = nextHeight
      emit('height', nextHeight)
    }
  },
})
</script>

<template>
  <div class="desktop-monaco-diff" :style="fitContent ? { height: `${contentHeight}px` } : undefined">
    <div ref="container" class="desktop-monaco-diff__editor" />
    <div v-if="loading" class="desktop-monaco-diff__status">
      <slot name="loading" />
    </div>
    <div v-else-if="failed" class="desktop-monaco-diff__status is-error">
      <slot name="error" />
    </div>
  </div>
</template>

<style scoped>
.desktop-monaco-diff {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--buddy-surface-base);
}

.desktop-monaco-diff__editor {
  width: 100%;
  height: 100%;
}

.desktop-monaco-diff__status {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--buddy-surface-base);
  color: var(--buddy-text-secondary);
  font-size: 0.76rem;
}

.desktop-monaco-diff__status.is-error {
  color: var(--buddy-status-danger-text);
}
</style>
