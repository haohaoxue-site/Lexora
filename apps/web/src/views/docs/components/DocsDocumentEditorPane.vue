<script setup lang="ts">
import type {
  DocsDocumentEditorPaneEmits,
  DocsDocumentEditorPaneProps,
} from '../typing'
import { useDocumentEditorPane } from '../composables/useDocumentEditorPane'
import DocsDocumentEditor from './DocsDocumentEditor.vue'
import DocsDocumentEditorFallback from './DocsDocumentEditorFallback.vue'

const props = defineProps<DocsDocumentEditorPaneProps>()
const emits = defineEmits<DocsDocumentEditorPaneEmits>()
const { contentError, handleContentError, handleRetryLoad, shouldShowEditor } = useDocumentEditorPane({
  onRetryLoad: () => emits('retryLoad'),
  props,
})
</script>

<template>
  <section class="docs-document-editor-pane">
    <DocsDocumentEditor
      v-if="shouldShowEditor && props.document"
      :document="props.document"
      :mode="props.mode"
      :editable="props.editable"
      :collaboration="props.collaboration ?? null"
      :active-block-id="props.activeBlockId"
      @update-title="emits('updateTitle', $event)"
      @update-content="emits('updateContent', $event)"
      @content-error="handleContentError"
      @request-comment="emits('requestComment', $event)"
    />

    <DocsDocumentEditorFallback
      v-else
      :pane-state="props.paneState"
      :is-loading="props.isLoading"
      :has-fallback-document="props.hasFallbackDocument"
      :content-error="contentError"
      @create-document="emits('createDocument')"
      @open-fallback-document="emits('openFallbackDocument')"
      @retry-load="handleRetryLoad"
    />
  </section>
</template>

<style scoped lang="scss">
.docs-document-editor-pane {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  min-height: 0;
  padding-bottom: clamp(1.5rem, 3vw, 2rem);
  box-sizing: border-box;
}
</style>
