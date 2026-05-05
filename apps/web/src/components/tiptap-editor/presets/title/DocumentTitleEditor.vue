<script setup lang="ts">
import type { TiptapEditorContent, TiptapEditorHandleKeyDown } from '../../core/typing'
import type { DocumentTitleEditorEmits, DocumentTitleEditorProps } from './typing'
import { computed } from 'vue'
import TiptapEditor from '../../core/TiptapEditor.vue'
import { fromTiptapDocumentTitleEditorContent, toTiptapDocumentTitleEditorContent } from '../../core/utils'
import { createTitleExtensions } from '../../extensions/createExtensions'

const props = defineProps<DocumentTitleEditorProps>()
const emits = defineEmits<DocumentTitleEditorEmits>()

const titleEditorContent = computed(() => toTiptapDocumentTitleEditorContent(props.title))
const titleEditorExtensions = createTitleExtensions({
  collaboration: props.collaboration,
})
const handleTitleEditorKeyDown: TiptapEditorHandleKeyDown = (_, event) => event.key === 'Enter'

function handleUpdateTitle(content: TiptapEditorContent) {
  emits('update:title', fromTiptapDocumentTitleEditorContent(content))
}
</script>

<template>
  <TiptapEditor
    class="document-title-editor"
    :content="titleEditorContent"
    :content-source="props.collaboration ? 'collaboration' : 'props'"
    :initial-extensions="titleEditorExtensions"
    :editable="props.editable"
    :handle-key-down="handleTitleEditorKeyDown"
    @update:content="handleUpdateTitle"
  />
</template>
