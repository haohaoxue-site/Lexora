<script setup lang="ts">
import type {
  DocsDocumentEditorFallbackEmits,
  DocsDocumentEditorFallbackProps,
} from './typing'
import { useDocumentEditorFallback } from '../../composables/useDocumentEditorFallback'

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
  <div class="docs-document-editor-fallback flex min-h-0 flex-1 items-center justify-center">
    <ElEmpty>
      <template #image>
        <div class="docs-document-editor-fallback__icon-shell inline-flex h-12 w-12 items-center justify-center rounded-full">
          <SvgIcon
            :category="fallbackState.iconCategory"
            :icon="fallbackState.icon"
            size="1.75rem"
            :class="{ 'animate-spin': fallbackState.spin }"
          />
        </div>
      </template>

      <template #description>
        <div class="grid max-w-96 justify-items-center gap-2 text-secondary">
          <div class="text-base font-semibold text-main">
            {{ fallbackState.title }}
          </div>

          <div class="text-sm leading-[1.6]">
            {{ fallbackState.description }}
          </div>
        </div>
      </template>

      <div
        v-if="fallbackState.actions.length"
        class="mt-4 flex flex-wrap justify-center gap-3"
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
.docs-document-editor-fallback__icon-shell {
  background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
  color: var(--brand-primary);
}
</style>
