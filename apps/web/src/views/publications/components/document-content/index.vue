<script setup lang="ts">
import type { TiptapJsonContent } from '@haohaoxue/samepage-contracts'
import type { PublicationDocumentContentProps } from './typing'
import type { DocumentBodyEditorOutlineOptions } from '@/components/tiptap-editor'
import { collectDocumentAssetIds, hasDocumentContent } from '@haohaoxue/samepage-shared'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'
import { DocumentBodyEditor } from '@/components/tiptap-editor'
import dayjs from '@/utils/dayjs'
import {
  PUBLICATION_DISABLED_LINK_CLASS,
  PUBLICATION_UNPUBLISHED_MESSAGE,
} from '../../utils/publicationRendering'

const props = withDefaults(defineProps<PublicationDocumentContentProps>(), {
  outlineOptions: () => ({}),
  showHeader: true,
  showMeta: true,
})
const updatedFromNow = computed(() => dayjs(props.document.updatedAt).fromNow())
const isEmpty = computed(() =>
  !hasDocumentContent(props.body) && collectDocumentAssetIds(props.body).length === 0,
)
const hasOutline = computed(() => hasHeadingNode(props.body))
const showOutline = computed(() => props.layout === 'plain' && hasOutline.value)
const articleClass = computed(() => [
  `publication-document-content--${props.layout}`,
  {
    'publication-document-content--with-outline': showOutline.value,
  },
])
const effectiveOutlineOptions = computed<DocumentBodyEditorOutlineOptions>(() =>
  showOutline.value
    ? props.outlineOptions
    : { ...props.outlineOptions, layout: 'overlay' },
)

function hasHeadingNode(nodes: PublicationDocumentContentProps['body']): boolean {
  return nodes.some(node =>
    node.type === 'heading'
    || (Array.isArray(node.content) && hasHeadingNode(node.content as TiptapJsonContent)),
  )
}

function handleBodyClick(event: MouseEvent) {
  const target = event.target

  if (!(target instanceof Element)) {
    return
  }

  const link = target.closest('a')

  if (!link?.classList.contains(PUBLICATION_DISABLED_LINK_CLASS)) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  ElMessage.info(PUBLICATION_UNPUBLISHED_MESSAGE)
}
</script>

<template>
  <article class="publication-document-content text-main" :class="articleClass">
    <header v-if="props.showHeader" class="publication-document-content__header mb-6">
      <p v-if="props.showMeta" class="publication-document-content__meta m-0 mb-3 text-[13px] leading-[1.5] text-[var(--brand-text-tertiary)]">
        更新于 {{ updatedFromNow }}
      </p>
      <h1 class="publication-document-content__title m-0 font-bold leading-[1.18] text-main">
        {{ props.document.title || '未命名' }}
      </h1>
    </header>

    <div class="publication-document-content__body min-h-24" @click.capture="handleBodyClick">
      <DocumentBodyEditor
        v-if="!isEmpty"
        :document-id="null"
        :content="props.body"
        :editable="false"
        :outline-options="effectiveOutlineOptions"
        :show-outline="showOutline"
      />

      <p v-if="isEmpty" class="publication-document-content__empty mt-1 text-sm leading-[1.8] text-[var(--brand-text-tertiary)]">
        暂无内容
      </p>
    </div>
  </article>
</template>

<style scoped lang="scss">
.publication-document-content {
  --publication-document-content-body-width: 46rem;
  --publication-document-content-width: 46rem;
  width: min(100%, var(--publication-document-content-width));
}

.publication-document-content--plain {
  --publication-document-content-width: 76rem;
  margin: 0 auto;
}

.publication-document-content--plain {
  .publication-document-content__header {
    width: min(100%, var(--publication-document-content-body-width));
    margin: 0 auto 1.5rem;
  }

  .publication-document-content__title {
    font-size: clamp(1.9rem, 3vw, 2.35rem);
  }
}

.publication-document-content--plain.publication-document-content--with-outline {
  .publication-document-content__header {
    display: grid;
    grid-template-columns: minmax(0, var(--publication-document-content-body-width)) minmax(12rem, 15rem);
    width: 100%;
    column-gap: clamp(2rem, 4vw, 3.5rem);
    justify-content: center;
  }

  .publication-document-content__meta,
  .publication-document-content__title {
    grid-column: 1;
  }
}

.publication-document-content--site {
  padding: 4rem 2rem 5rem;
}

.publication-document-content__title {
  font-size: clamp(2rem, 4vw, 2.85rem);
}

.publication-document-content__body {
  :deep(.document-body-editor) {
    --tiptap-prosemirror-min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

  :deep(.document-body-editor--outline-side) {
    grid-template-columns: minmax(0, var(--publication-document-content-body-width)) minmax(12rem, 15rem);
    column-gap: clamp(2rem, 4vw, 3.5rem);
    align-items: start;
    justify-content: center;
  }

  :deep(.document-body-editor__surface) {
    grid-area: 1 / 1;
    width: min(100%, var(--publication-document-content-body-width));
    min-height: 0;
    margin-inline: auto;
  }

  :deep(.document-body-editor--outline-side .document-body-editor__surface) {
    grid-area: auto;
    grid-column: 1;
    width: 100%;
    margin-inline: 0;
  }

  :deep(.tiptap-editor__prosemirror) {
    padding: 0;
  }

  :deep(.tiptap-editor__prosemirror .ProseMirror) {
    padding: 0;
    color: var(--brand-text-primary);
    font-size: 15px;
    line-height: 1.72;
  }

  :deep(.tiptap-editor__prosemirror .ProseMirror > * + *) {
    margin-top: 0.78em;
  }

  :deep(.tiptap-editor__prosemirror .ProseMirror h1),
  :deep(.tiptap-editor__prosemirror .ProseMirror h2),
  :deep(.tiptap-editor__prosemirror .ProseMirror h3),
  :deep(.tiptap-editor__prosemirror .ProseMirror h4) {
    letter-spacing: 0;
    line-height: 1.28;
  }

  :deep(.is-empty[data-placeholder]::before) {
    content: none;
  }

  :deep(.editor-outline) {
    grid-area: 1 / 1;
  }

  :deep(.document-body-editor--outline-side .editor-outline) {
    grid-area: auto;
    grid-column: 2;
    width: 100%;
    justify-self: stretch;
  }

  :deep(a.publication-link-disabled) {
    color: var(--brand-text-tertiary);
    cursor: not-allowed;
    text-decoration-style: dashed;
  }
}

@media (max-width: 900px) {
  .publication-document-content--plain {
    --publication-document-content-width: 46rem;
  }

  .publication-document-content--plain.publication-document-content--with-outline {
    .publication-document-content__header {
      display: block;
      width: min(100%, var(--publication-document-content-body-width));
    }
  }

  .publication-document-content__body {
    :deep(.document-body-editor--outline-side) {
      grid-template-columns: minmax(0, 1fr);
    }

    :deep(.document-body-editor--outline-side .document-body-editor__surface) {
      width: min(100%, var(--publication-document-content-body-width));
      margin-inline: auto;
    }

    :deep(.editor-outline) {
      display: none;
    }
  }

  .publication-document-content--site {
    padding: 2rem 1.25rem 4rem;
  }
}
</style>
