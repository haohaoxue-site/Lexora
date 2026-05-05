<script setup lang="ts">
import type {
  DocsHistoryLayoutEmits,
  DocsHistoryLayoutProps,
} from './typing'
import DocsDocumentEditorPane from '../components/DocsDocumentEditorPane.vue'
import DocsHistoryPanel from './DocsHistoryPanel.vue'

const props = defineProps<DocsHistoryLayoutProps>()
const emits = defineEmits<DocsHistoryLayoutEmits>()
</script>

<template>
  <section class="docs-history-view">
    <header class="docs-history-view__header">
      <ElButton
        text
        class="docs-history-view__back"
        @click="emits('closeHistoryMode')"
      >
        <span class="docs-history-view__back-content">
          <SvgIcon category="ui" icon="arrow-left" size="14px" />
          <span>返回文档</span>
        </span>
      </ElButton>

      <ElButton
        type="primary"
        class="docs-history-view__restore"
        :disabled="!props.canRestoreSelectedSnapshot"
        :loading="props.isRestoringSnapshot"
        @click="emits('restoreSelectedSnapshot')"
      >
        还原此历史记录
      </ElButton>

      <div class="docs-history-view__header-spacer" />
    </header>

    <div class="docs-history-view__content">
      <DocsDocumentEditorPane
        :document="props.previewDocument"
        :mode="props.docsDocumentEditorMode"
        :editable="props.isDocsDocumentEditable"
        :active-block-id="props.activeBlockId"
        :is-loading="props.isDocumentItemLoading"
        :pane-state="props.documentPaneState"
        :has-fallback-document="props.hasFallbackDocument"
        @update-title="emits('updateTitle', $event)"
        @update-content="emits('updateContent', $event)"
        @request-comment="emits('requestComment', $event)"
        @create-document="emits('createDocument')"
        @open-fallback-document="emits('openFallbackDocument')"
        @retry-load="emits('retryLoad')"
      />

      <DocsHistoryPanel
        :document="props.currentDocument"
        :snapshots="props.snapshots"
        :selected-snapshot-id="props.selectedSnapshotId"
        :is-loading="props.isSnapshotsLoading"
        @select="emits('selectHistorySnapshot', $event)"
      />
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
