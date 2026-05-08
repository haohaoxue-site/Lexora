<script setup lang="ts">
import type {
  DocsDocumentEditorFallbackEmits,
  DocsDocumentEditorFallbackProps,
} from '../typing'
import { useDocumentEditorFallback } from '../composables/useDocumentEditorFallback'

const props = defineProps<DocsDocumentEditorFallbackProps>()
const emits = defineEmits<DocsDocumentEditorFallbackEmits>()
const { emitAction, fallbackState } = useDocumentEditorFallback({
  onCreateDocument: () => emits('createDocument'),
  onOpenFallbackDocument: () => emits('openFallbackDocument'),
  onRetryLoad: () => emits('retryLoad'),
  props,
})
</script>

<template>
  <div class="docs-document-editor-fallback">
    <ElEmpty>
      <template #image>
        <div class="docs-document-editor-fallback__icon-shell">
          <SvgIcon
            :category="fallbackState.iconCategory"
            :icon="fallbackState.icon"
            size="1.75rem"
            :class="{ 'animate-spin': fallbackState.spin }"
          />
        </div>
      </template>

      <template #description>
        <div class="docs-document-editor-fallback__description">
          <div class="docs-document-editor-fallback__title">
            {{ fallbackState.title }}
          </div>

          <div class="docs-document-editor-fallback__text">
            {{ fallbackState.description }}
          </div>
        </div>
      </template>

      <div
        v-if="fallbackState.actions.length"
        class="docs-document-editor-fallback__actions"
      >
        <ElButton
          v-for="action in fallbackState.actions"
          :key="action.event"
          :type="action.type"
          @click="emitAction(action.event)"
        >
          {{ action.label }}
        </ElButton>
      </div>
    </ElEmpty>
  </div>
</template>

<style scoped lang="scss">
.docs-document-editor-fallback {
  display: flex;
  flex: 1 1 0%;
  align-items: center;
  justify-content: center;
  min-height: 0;

  .docs-document-editor-fallback__icon-shell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
    color: var(--brand-primary);
  }

  .docs-document-editor-fallback__description {
    display: grid;
    gap: 0.5rem;
    justify-items: center;
    max-width: 24rem;
    color: var(--brand-text-secondary);
  }

  .docs-document-editor-fallback__title {
    color: var(--brand-text-primary);
    font-size: 1rem;
    font-weight: 600;
  }

  .docs-document-editor-fallback__text {
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .docs-document-editor-fallback__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 1rem;
  }
}
</style>
