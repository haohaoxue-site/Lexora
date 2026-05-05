<script setup lang="ts">
import type { DocsDocumentSurfacePageEmits, DocsDocumentSurfacePageProps } from './typing'
import DocsDocumentEditorPane from '../components/DocsDocumentEditorPane.vue'

const props = defineProps<DocsDocumentSurfacePageProps>()
const emits = defineEmits<DocsDocumentSurfacePageEmits>()
</script>

<template>
  <DocsDocumentEditorPane
    :document="props.document"
    :mode="props.mode"
    :editable="props.editable"
    :collaboration="props.collaboration ?? null"
    :active-block-id="props.activeBlockId"
    :is-loading="props.isLoading"
    :pane-state="props.paneState"
    :has-fallback-document="props.hasFallbackDocument"
    @update-title="emits('updateTitle', $event)"
    @update-content="emits('updateContent', $event)"
    @request-comment="emits('requestComment', $event)"
    @create-document="emits('createDocument')"
    @open-fallback-document="emits('openFallbackDocument')"
    @retry-load="emits('retryLoad')"
  />
</template>
