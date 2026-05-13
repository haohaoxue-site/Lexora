<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { BlockTriggerMenuExposed } from '../../overlays/block-trigger/typing'
import type { DocumentBodyEditorEmits, DocumentBodyEditorProps } from './typing'
import { shallowRef, useTemplateRef } from 'vue'
import EditorAiComposer from '../../ai/EditorAiComposer.vue'
import TiptapEditor from '../../core/TiptapEditor.vue'
import BlockTriggerMenu from '../../overlays/block-trigger/BlockTriggerMenu.vue'
import BubbleToolbar from '../../overlays/bubble-toolbar/BubbleToolbar.vue'
import MathPanelBubble from '../../overlays/math-panel/MathPanelBubble.vue'
import EditorOutline from '../../overlays/outline/EditorOutline.vue'
import { useDocumentBodyEditor } from './useDocumentBodyEditor'

const props = withDefaults(defineProps<DocumentBodyEditorProps>(), {
  editable: true,
  activeBlockId: null,
  documentId: null,
  showOutline: true,
})
const emits = defineEmits<DocumentBodyEditorEmits>()
const bodyEditor = shallowRef<Editor | null>(null)
const blockTriggerMenuRef = useTemplateRef<BlockTriggerMenuExposed>('blockTriggerMenu')
const {
  editorAiComposer,
  bodyEditorExtensions,
  handleBodyEditorChange,
  handleBodyEditorKeyDown,
  handleBodyEditorTextInput,
  handleCommentRequest,
  handleUploadFile,
  handleUploadImage,
} = useDocumentBodyEditor({
  bodyEditor,
  blockTriggerMenuRef,
  props,
  onRequestComment: request => emits('requestComment', request),
})
</script>

<template>
  <section class="document-body-editor">
    <BubbleToolbar
      v-if="bodyEditor && props.editable"
      :editor="bodyEditor"
      @request-comment="handleCommentRequest"
      @request-ai-rewrite="editorAiComposer.openRewrite"
    />

    <MathPanelBubble
      v-if="bodyEditor && props.editable"
      :editor="bodyEditor"
    />

    <TiptapEditor
      class="document-body-editor__surface"
      :content="props.content"
      :content-source="props.collaboration ? 'collaboration' : 'props'"
      :initial-extensions="bodyEditorExtensions"
      :editable="props.editable"
      :handle-key-down="handleBodyEditorKeyDown"
      :handle-text-input="handleBodyEditorTextInput"
      @update:content="emits('update:content', $event)"
      @content-error="emits('contentError', $event)"
      @editor-change="handleBodyEditorChange"
    />

    <EditorOutline
      v-if="bodyEditor && props.showOutline"
      :editor="bodyEditor"
      :content="props.content"
    />

    <BlockTriggerMenu
      v-if="bodyEditor && props.editable"
      ref="blockTriggerMenu"
      :editor="bodyEditor"
      :upload-image="handleUploadImage"
      :upload-file="handleUploadFile"
      @request-comment="handleCommentRequest"
    />

    <EditorAiComposer
      :visible="editorAiComposer.visible.value"
      :mode="editorAiComposer.mode.value"
      :status="editorAiComposer.status.value"
      :prompt="editorAiComposer.prompt.value"
      :anchor-style="editorAiComposer.anchorStyle.value"
      :preview-text="editorAiComposer.previewText.value"
      :error-message="editorAiComposer.errorMessage.value"
      :can-submit="editorAiComposer.canSubmit.value"
      :can-accept="editorAiComposer.canAccept.value"
      :can-reject="editorAiComposer.canReject.value"
      @update:prompt="editorAiComposer.updatePrompt"
      @submit="editorAiComposer.submit"
      @accept="editorAiComposer.accept"
      @reject="editorAiComposer.reject"
      @close="editorAiComposer.clear"
    />
  </section>
</template>
