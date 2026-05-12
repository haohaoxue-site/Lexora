<script setup lang="ts">
import DocsDocumentEditorPane from '../components/DocsDocumentEditorPane.vue'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useDocsContext } from '../composables/useDocsContext'
import { useDocsHistoryState } from '../composables/useDocsHistoryState'
import { useDocsPageActions } from '../composables/useDocsPageActions'
import { useDocsSurfaceState } from '../composables/useDocsSurfaceState'
import DocsHistoryPanel from './DocsHistoryPanel.vue'

const { activeBlockId, handleRequestComment } = useDocsContext()
const {
  isDocumentItemLoading,
  isRestoringSnapshot,
  isSnapshotsLoading,
  reloadCurrentDocument,
  updateDocumentContent,
  updateDocumentTitle,
} = useActiveDocument()
const {
  canRestoreSelectedSnapshot,
  closeHistoryMode,
  docsDocumentEditorMode,
  isDocsDocumentEditable,
  previewDocument,
  restoreSelectedSnapshot,
} = useDocsHistoryState()
const { documentPaneState, hasVisibleFallbackDocument: hasFallbackDocument } = useDocsSurfaceState()
const { createRootDocument, openDefaultDocument } = useDocsPageActions()
</script>

<template>
  <section class="docs-history-view">
    <header class="docs-history-view__header">
      <ElButton
        text
        class="docs-history-view__back"
        @click="closeHistoryMode"
      >
        <span class="docs-history-view__back-content">
          <SvgIcon category="ui" icon="arrow-left" size="14px" />
          <span>返回文档</span>
        </span>
      </ElButton>

      <ElButton
        type="primary"
        class="docs-history-view__restore"
        :disabled="!canRestoreSelectedSnapshot"
        :loading="isRestoringSnapshot"
        @click="restoreSelectedSnapshot"
      >
        还原此历史记录
      </ElButton>

      <div class="docs-history-view__header-spacer" />
    </header>

    <div class="docs-history-view__content">
      <DocsDocumentEditorPane
        :document="previewDocument"
        :mode="docsDocumentEditorMode"
        :editable="isDocsDocumentEditable"
        :active-block-id="activeBlockId"
        :is-loading="isDocumentItemLoading"
        :pane-state="documentPaneState"
        :has-fallback-document="hasFallbackDocument"
        @update-title="updateDocumentTitle"
        @update-content="updateDocumentContent"
        @request-comment="handleRequestComment"
        @create-document="createRootDocument()"
        @open-fallback-document="openDefaultDocument()"
        @retry-load="reloadCurrentDocument"
      />

      <DocsHistoryPanel :is-loading="isSnapshotsLoading" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.docs-history-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--brand-bg-surface);

  .docs-history-view__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 1.5rem;
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
    background: color-mix(in srgb, var(--brand-bg-surface) 92%, white 8%);
  }

  .docs-history-view__back {
    justify-self: start;
    color: var(--brand-text-secondary);

    &:hover {
      color: var(--brand-text-primary);
    }
  }

  .docs-history-view__back-content {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 13px;
    font-weight: 500;
  }

  .docs-history-view__restore {
    min-width: 8.5rem;
  }

  .docs-history-view__header-spacer {
    min-width: 0;
  }

  .docs-history-view__content {
    display: flex;
    flex: 1 1 0%;
    min-height: 0;
  }
}

@media (max-width: 1180px) {
  .docs-history-view {
    .docs-history-view__header {
      grid-template-columns: 1fr;
      justify-items: center;
    }

    .docs-history-view__back {
      justify-self: stretch;
    }

    .docs-history-view__header-spacer {
      display: none;
    }

    .docs-history-view__content {
      flex-direction: column;
    }
  }
}
</style>
