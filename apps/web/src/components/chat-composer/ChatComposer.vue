<script setup lang="ts">
import type { Editor, EditorEvents, Extensions, JSONContent } from '@tiptap/core'
import type {
  ChatComposerAttachment,
  ChatComposerEmits,
  ChatComposerProps,
  ChatComposerSubmitPayload,
} from './typing'
import type { ReadableDocumentSearchResult } from '@/apis/document'
import {
  CHAT_MESSAGE_ATTACHMENT_PLACEMENT,
  CHAT_MESSAGE_ATTACHMENT_TYPE,
} from '@haohaoxue/samepage-contracts/chat/constants'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { nanoid } from 'nanoid'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  findDuplicatePanelAttachment,
  orderChatComposerAttachments,
} from './attachmentOrdering'
import ChatComposerContextTags from './ChatComposerContextTags.vue'
import ChatComposerToolbar from './ChatComposerToolbar.vue'
import ChatDocumentPicker from './ChatDocumentPicker.vue'
import { CHAT_REFERENCE_NODE_NAME, ChatReference } from './extensions/ChatReference'
import {
  garbageCollectInlineAttachments,
  serializeChatComposerContent,
} from './serialization'

const props = withDefaults(defineProps<ChatComposerProps>(), {
  selectedModelRef: null,
  isStreaming: false,
  disabled: false,
  highlightAttachmentId: null,
  documentPickerTeleportTo: '',
})
const emits = defineEmits<ChatComposerEmits>()

const pickerVisible = shallowRef(false)
const pickerMode = shallowRef<'panel' | 'inline'>('panel')
let pastedAttachments: ChatComposerAttachment[] = []

const serializedContent = computed(() => serializeChatComposerContent(props.contentJSON))
const hasSelectedModel = computed(() => Boolean(
  props.selectedModelRef?.providerId.trim()
  && props.selectedModelRef.modelId.trim(),
))
const canSend = computed(() =>
  !props.disabled
  && !props.isStreaming
  && hasSelectedModel.value
  && Boolean(serializedContent.value.bodyTextWithoutReferences.trim()),
)

const editor = useEditor({
  content: props.contentJSON as JSONContent,
  extensions: createChatComposerExtensions(),
  editable: !props.disabled,
  editorProps: {
    attributes: {
      class: 'chat-composer__prosemirror',
    },
    handleKeyDown: (_, event) => handleEditorKeyDown(event),
    handleTextInput: (_, __, ___, text) => handleEditorTextInput(text),
    handlePaste: (_, event) => handleEditorPaste(event),
  },
  onUpdate: handleEditorUpdate,
})

const orderedSubmitAttachments = computed(() =>
  orderChatComposerAttachments(
    garbageCollectInlineAttachments(props.contentJSON, props.attachments),
    props.contentJSON,
  ),
)

watch(
  () => props.contentJSON,
  (contentJSON) => {
    if (!editor.value || isSameContent(editor.value, contentJSON as JSONContent)) {
      return
    }

    editor.value.commands.setContent(contentJSON as JSONContent, {
      emitUpdate: false,
    })
  },
)

watch(
  () => props.disabled,
  disabled => editor.value?.setEditable(!disabled, false),
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})

defineExpose({
  focus: () => {
    editor.value?.chain().focus('end').run()
    editor.value?.view.dom.focus()
  },
})

function createChatComposerExtensions(): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      listItem: false,
      orderedList: false,
      strike: false,
    }),
    Placeholder.configure({
      placeholder: '输入消息，Ctrl/⌘ + Enter 发送',
    }),
    ChatReference.configure({
      getAttachmentById: attachmentId =>
        props.attachments.find(attachment => attachment.id === attachmentId) ?? null,
      cloneAttachment: cloneInlineAttachmentForPaste,
    }),
  ]
}

function handleEditorUpdate(options: EditorEvents['update']) {
  const contentJSON = options.editor.getJSON() as ChatComposerProps['contentJSON']
  emits('update:contentJSON', contentJSON)

  const nextAttachments = garbageCollectInlineAttachments(contentJSON, props.attachments)
  if (nextAttachments.length !== props.attachments.length) {
    emits('update:attachments', nextAttachments)
  }
}

function handleEditorKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
    return false
  }

  event.preventDefault()
  if (canSend.value) {
    emitSend()
  }
  return true
}

function handleEditorTextInput(text: string) {
  if (text !== '@' || props.disabled) {
    return false
  }

  openInlinePicker()
  return false
}

function handleEditorPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (!files.length) {
    return false
  }

  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (text) {
    editor.value?.commands.insertContent(text)
  }
  return true
}

function openPanelPicker() {
  pickerMode.value = 'panel'
  pickerVisible.value = true
}

function openInlinePicker() {
  pickerMode.value = 'inline'
  pickerVisible.value = true
}

function closePicker() {
  pickerVisible.value = false
}

function handlePickDocument(document: ReadableDocumentSearchResult) {
  if (pickerMode.value === 'inline') {
    addInlineDocumentReference(document)
  }
  else {
    addPanelDocumentContext(document)
  }

  closePicker()
}

function addPanelDocumentContext(document: ReadableDocumentSearchResult) {
  const attachment = createDocumentAttachment(document, CHAT_MESSAGE_ATTACHMENT_PLACEMENT.PANEL)
  const duplicate = findDuplicatePanelAttachment(props.attachments, attachment)

  if (duplicate) {
    emits('highlightAttachment', duplicate.id)
    return
  }

  emits('update:attachments', [...props.attachments, attachment])
}

function addInlineDocumentReference(document: ReadableDocumentSearchResult) {
  const attachment = createDocumentAttachment(document, CHAT_MESSAGE_ATTACHMENT_PLACEMENT.INLINE)
  emits('update:attachments', [...props.attachments, attachment])
  insertInlineReference(attachment, createReferenceNodeId())
}

function removePanelAttachment(attachmentId: string) {
  emits('update:attachments', props.attachments.filter(attachment => attachment.id !== attachmentId))
}

function emitSend() {
  if (!canSend.value) {
    return
  }

  const payload: ChatComposerSubmitPayload = {
    content: serializedContent.value.content.trim(),
    contentJSON: props.contentJSON,
    attachments: orderedSubmitAttachments.value,
  }
  emits('send', payload)
}

function insertInlineReference(attachment: ChatComposerAttachment, nodeId: string) {
  const currentEditor = editor.value
  if (!currentEditor) {
    return
  }

  const cursorPosition = currentEditor.state.selection.from
  const shouldDeleteTrigger = cursorPosition > 1 && currentEditor.state.doc.textBetween(cursorPosition - 1, cursorPosition) === '@'
  const chain = currentEditor.chain().focus()

  if (shouldDeleteTrigger) {
    chain.deleteRange({
      from: cursorPosition - 1,
      to: cursorPosition,
    })
  }

  chain
    .insertContent({
      type: CHAT_REFERENCE_NODE_NAME,
      attrs: {
        id: nodeId,
        attachmentId: attachment.id,
        label: attachment.title,
      },
    })
    .insertContent(' ')
    .run()
}

function cloneInlineAttachmentForPaste(attachment: ChatComposerAttachment) {
  const clonedAttachment: ChatComposerAttachment = {
    ...attachment,
    id: createAttachmentId(),
    placement: CHAT_MESSAGE_ATTACHMENT_PLACEMENT.INLINE,
  }

  if (!pastedAttachments.length) {
    queueMicrotask(() => {
      pastedAttachments = []
    })
  }

  pastedAttachments.push(clonedAttachment)
  emits('update:attachments', [
    ...props.attachments,
    ...pastedAttachments,
  ])

  return {
    nodeId: createReferenceNodeId(),
    attachment: clonedAttachment,
  }
}

function createDocumentAttachment(
  document: ReadableDocumentSearchResult,
  placement: ChatComposerAttachment['placement'],
): ChatComposerAttachment {
  return {
    id: createAttachmentId(),
    type: CHAT_MESSAGE_ATTACHMENT_TYPE.DOCUMENT,
    placement,
    documentId: document.id,
    title: document.title,
    scope: {
      kind: 'full',
    },
    size: 0,
  }
}

function createAttachmentId() {
  return `att_${nanoid(10)}`
}

function createReferenceNodeId() {
  return `ref_${nanoid(10)}`
}

function isSameContent(currentEditor: Editor, contentJSON: JSONContent) {
  return JSON.stringify(currentEditor.getJSON()) === JSON.stringify(contentJSON)
}
</script>

<template>
  <section class="chat-composer">
    <div class="chat-composer__surface">
      <ChatComposerContextTags
        :attachments="props.attachments"
        :highlight-attachment-id="props.highlightAttachmentId"
        @remove="removePanelAttachment"
      />

      <div class="chat-composer__editor">
        <EditorContent v-if="editor" :editor="editor" />
      </div>

      <ChatComposerToolbar
        :selected-model-ref="props.selectedModelRef"
        :is-streaming="props.isStreaming"
        :disabled="props.disabled"
        :can-send="canSend"
        @open-panel-picker="openPanelPicker"
        @placeholder-upload="emits('placeholderUpload')"
        @placeholder-command="emits('placeholderCommand')"
        @select-model="emits('selectModel', $event)"
        @send="emitSend"
        @stop="emits('stop')"
      />

      <Teleport
        defer
        :to="props.documentPickerTeleportTo || 'body'"
        :disabled="!props.documentPickerTeleportTo"
      >
        <ChatDocumentPicker
          :visible="pickerVisible"
          @close="closePicker"
          @select="handlePickDocument"
        />
      </Teleport>
    </div>
  </section>
</template>

<style scoped lang="scss">
.chat-composer {
  width: 100%;

  .chat-composer__surface {
    position: relative;
    overflow: visible;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    border-radius: 0.5rem;
    background: var(--brand-bg-surface);
    box-shadow: var(--brand-shadow-hairline);
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;

    &:focus-within {
      border-color: color-mix(in srgb, var(--brand-primary) 32%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-primary) 12%, transparent);
    }
  }

  .chat-composer__editor {
    max-height: min(40vh, 320px);
    overflow-y: auto;
    padding: 0.5rem 0.625rem 0.125rem;
  }

  :deep(.chat-composer__prosemirror) {
    min-height: 3rem;
    outline: none;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
  }

  :deep(.chat-composer__prosemirror p) {
    margin: 0;
  }

  :deep(.chat-composer__prosemirror p + p) {
    margin-top: 0.25rem;
  }

  :deep(.chat-composer__prosemirror p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    color: var(--brand-text-placeholder);
    pointer-events: none;
  }

  :deep(.chat-reference-node) {
    display: inline-flex;
    align-items: center;
    max-width: 12rem;
    margin-inline: 0.125rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--brand-primary) 8%, var(--brand-bg-surface));
    color: var(--brand-primary);
    font-size: 0.85em;
    font-weight: 600;
    line-height: 1.45;
    vertical-align: 0.02em;
    white-space: nowrap;
  }
}
</style>
