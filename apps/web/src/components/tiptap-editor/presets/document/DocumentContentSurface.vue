<script setup lang="ts">
import type {
  DocumentContentSurfaceEmits,
  DocumentContentSurfaceProps,
} from './typing'
import { computed } from 'vue'
import DocumentBodyEditor from '../body/DocumentBodyEditor.vue'
import DocumentTitleEditor from '../title/DocumentTitleEditor.vue'

const props = withDefaults(defineProps<DocumentContentSurfaceProps>(), {
  documentId: null,
  editable: true,
  titleCollaboration: null,
  bodyCollaboration: null,
  activeBlockId: null,
  showOutline: true,
  footerMetaItems: () => [],
})
const emits = defineEmits<DocumentContentSurfaceEmits>()

const bindingObjectIds = new WeakMap<object, number>()
let bindingObjectSequence = 0

const titleEditorKey = computed(() =>
  `${props.documentId ?? 'document'}:title:${resolveBindingKey(props.titleCollaboration)}`,
)
const bodyEditorKey = computed(() =>
  `${props.documentId ?? 'document'}:body:${resolveBindingKey(props.bodyCollaboration)}`,
)

function resolveBindingKey(binding: DocumentContentSurfaceProps['titleCollaboration']) {
  if (!binding) {
    return 'plain'
  }

  return [
    resolveObjectKey(binding.document),
    binding.field,
    resolveObjectKey(binding.provider ?? null),
  ].join(':')
}

function resolveObjectKey(value: object | null) {
  if (!value) {
    return 'none'
  }

  const currentId = bindingObjectIds.get(value)

  if (currentId) {
    return String(currentId)
  }

  bindingObjectSequence += 1
  bindingObjectIds.set(value, bindingObjectSequence)
  return String(bindingObjectSequence)
}
</script>

<template>
  <section class="document-content-surface">
    <div class="document-content-surface__title">
      <DocumentTitleEditor
        :key="titleEditorKey"
        class="document-content-surface__title-editor"
        :title="props.title"
        :autofocus="props.autofocusTitle"
        :collaboration="props.titleCollaboration"
        :editable="props.editable"
        @update:title="emits('updateTitle', $event)"
        @autofocus-applied="emits('titleAutofocusApplied')"
      />
    </div>

    <div class="document-content-surface__body">
      <DocumentBodyEditor
        :key="bodyEditorKey"
        class="document-content-surface__body-editor"
        :document-id="props.documentId"
        :content="props.body"
        :collaboration="props.bodyCollaboration"
        :active-block-id="props.activeBlockId"
        :editable="props.editable"
        :show-outline="props.showOutline"
        @update:content="emits('updateContent', $event)"
        @content-error="emits('contentError', $event)"
        @request-comment="emits('requestComment', $event)"
      />
    </div>

    <footer v-if="props.footerMetaItems.length" class="document-content-surface__footer">
      <div class="document-content-surface__footer-content">
        <div
          v-for="item in props.footerMetaItems"
          :key="item.label"
          class="document-content-surface__footer-meta"
        >
          <span class="document-content-surface__footer-label">{{ item.label }}：</span>
          <span class="document-content-surface__footer-value">{{ item.value }}</span>
        </div>
      </div>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.document-content-surface {
  --document-content-surface-inline-start: 2.75rem;
  --document-content-surface-inline-end: 1.25rem;
  --document-content-surface-inline-size: 100%;
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  min-height: 0;
  background: var(--brand-bg-surface);

  .document-content-surface__title {
    padding:
      1.625rem
      var(--document-content-surface-inline-end)
      1rem
      var(--document-content-surface-inline-start);
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
    background: inherit;
  }

  .document-content-surface__title-editor {
    --document-content-surface-title-font-size: 1.6rem;
    --document-content-surface-title-line-height: 1.2;
    --document-content-surface-title-height: 1.92rem;
    --tiptap-content-min-height: auto;
    --tiptap-prosemirror-min-height: auto;
    --tiptap-prosemirror-height: var(--document-content-surface-title-height);
    --tiptap-prosemirror-color: var(--brand-text-primary);
    --tiptap-prosemirror-font-size: var(--document-content-surface-title-font-size);
    --tiptap-prosemirror-font-weight: 700;
    --tiptap-prosemirror-line-height: var(--document-content-surface-title-line-height);
    --tiptap-prosemirror-letter-spacing: 0;
    --tiptap-placeholder-color: var(--brand-text-placeholder);
    width: var(--document-content-surface-inline-size);
    max-width: 100%;
    min-height: auto;
    height: var(--document-content-surface-title-height);
    margin-inline-end: auto;
    overflow: hidden;

    :deep(.tiptap-editor) {
      min-height: 0;
      height: var(--document-content-surface-title-height);
      overflow: hidden;
    }

    :deep(.tiptap-editor__content) {
      min-height: 0;
      height: var(--document-content-surface-title-height);
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
    }

    :deep(.tiptap-editor__content::-webkit-scrollbar) {
      display: none;
    }

    :deep(.tiptap-editor__prosemirror) {
      width: max-content;
      min-width: 100%;
      max-width: none;
      overflow: visible;
      white-space: pre;
    }

    :deep(.tiptap-editor__prosemirror p) {
      display: inline;
      margin: 0;
      white-space: pre;
    }

    :deep(.tiptap-editor__prosemirror p:not(:first-child)::before) {
      content: ' ';
    }
  }

  .document-content-surface__body {
    position: relative;
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem 0 2rem;
  }

  .document-content-surface__body-editor {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    flex: 1 0 auto;
    width: 100%;
    min-width: 0;
    min-height: 100%;
    padding-inline: var(--document-content-surface-inline-start) var(--document-content-surface-inline-end);
    box-sizing: border-box;

    :deep(.document-body-editor__surface) {
      grid-area: 1 / 1;
      flex: 1 1 0%;
      width: var(--document-content-surface-inline-size);
      max-width: 100%;
      min-width: 0;
      min-height: 0;
      margin-inline-end: auto;
    }
  }

  .document-content-surface__footer {
    flex-shrink: 0;
    padding:
      0.75rem
      var(--document-content-surface-inline-end)
      0.75rem
      var(--document-content-surface-inline-start);
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
    background: inherit;
    color: color-mix(in srgb, var(--brand-text-secondary) 82%, transparent);
    font-size: 12px;
    line-height: 1.25rem;
  }

  .document-content-surface__footer-content {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    width: var(--document-content-surface-inline-size);
    max-width: 100%;
    margin-inline-end: auto;
  }

  .document-content-surface__footer-meta {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    white-space: nowrap;
  }

  .document-content-surface__footer-label {
    color: color-mix(in srgb, var(--brand-text-primary) 72%, transparent);
    font-weight: 600;
  }

  .document-content-surface__footer-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
