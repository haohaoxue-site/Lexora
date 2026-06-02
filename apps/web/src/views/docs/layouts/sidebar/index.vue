<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import DocumentSectionPanel from '../../components/document-section-panel'
import { useDocsPageActions } from '../../composables/useDocsPageActions'
import { useDocsSidebarSelection } from '../../composables/useDocsSidebarSelection'
import { useDocsSurfaceState } from '../../composables/useDocsSurfaceState'
import { useDocumentTree } from '../../composables/useDocumentTree'

const tree = useDocumentTree()
const { isDocumentLoading } = tree
const uiStore = useUiStore()
const { visibleTreeGroups } = useDocsSurfaceState()
const { openDocsControlCenterPage, openDocument } = useDocsPageActions()
const {
  confirmBatchDelete,
  enterSelectionMode,
  exitSelectionMode,
  hasSelectedDocuments,
  isBatchDeleting,
  isSelectionMode,
  replaceSectionSelection,
  selectedCount,
} = useDocsSidebarSelection()
const isSingleTreeGroup = computed(() => visibleTreeGroups.value.length === 1)

function handleDocumentOpen(documentId: string) {
  void openDocument(documentId)
}

function collapseDocumentLibrary() {
  uiStore.setDocumentLibrarySidebarCollapsed(true)
}

function openDocsControlCenter() {
  openDocsControlCenterPage()
}
</script>

<template>
  <aside class="docs-view__sidebar flex min-h-0 w-[var(--panel-docs-library-width)] max-w-[var(--panel-docs-library-width)] shrink-0 flex-col">
    <div class="docs-view__sidebar-header flex min-h-12 items-center justify-between gap-2 border-b px-3 py-2 pl-[0.9rem]">
      <template v-if="isSelectionMode">
        <span class="docs-view__sidebar-selection-count min-w-0 whitespace-nowrap text-sm font-medium text-main">已选 {{ selectedCount }} 项</span>
        <div class="flex shrink-0 items-center gap-1">
          <ElButton
            text
            size="small"
            class="docs-view__sidebar-header-text-btn px-1 text-[13px] text-secondary"
            :class="{ 'docs-view__sidebar-header-text-btn--delete': hasSelectedDocuments }"
            :disabled="!hasSelectedDocuments"
            :loading="isBatchDeleting"
            @click="confirmBatchDelete"
          >
            删除
          </ElButton>
          <ElButton
            text
            size="small"
            class="docs-view__sidebar-header-text-btn px-1 text-[13px] text-secondary"
            :disabled="isBatchDeleting"
            @click="exitSelectionMode"
          >
            取消
          </ElButton>
        </div>
      </template>

      <template v-else>
        <span class="docs-view__sidebar-header-title min-w-0 whitespace-nowrap text-sm font-medium text-main">文档库</span>
        <div class="flex shrink-0 items-center gap-1">
          <ElButton
            text
            size="small"
            class="docs-view__sidebar-header-icon-btn h-8 min-w-8 w-8 rounded-lg p-0 text-secondary"
            title="文档控制台"
            @click="openDocsControlCenter"
          >
            <SvgIcon category="ui" icon="settings-gear" size="0.95rem" />
          </ElButton>
          <ElButton
            text
            size="small"
            class="docs-view__sidebar-header-icon-btn h-8 min-w-8 w-8 rounded-lg p-0 text-secondary"
            title="多选"
            @click="enterSelectionMode"
          >
            <SvgIcon category="ui" icon="select-multiple" size="0.95rem" />
          </ElButton>
          <ElButton
            text
            size="small"
            class="docs-view__sidebar-header-icon-btn h-8 min-w-8 w-8 rounded-lg p-0 text-secondary"
            title="收起文档库"
            @click="collapseDocumentLibrary"
          >
            <SvgIcon category="ui" icon="pin-off" size="0.95rem" />
          </ElButton>
        </div>
      </template>
    </div>

    <ElScrollbar class="docs-view__sidebar-scroll flex-1 min-h-0" always>
      <div class="docs-view__sidebar-scroll-content flex min-h-full flex-col pb-4 pt-2">
        <div v-if="isDocumentLoading" class="px-3 py-4 text-sm text-secondary">
          正在加载文档树...
        </div>

        <div
          v-else
          class="docs-view__tree-sections flex min-h-0 flex-auto flex-col"
          :class="{ 'flex-1': isSingleTreeGroup }"
          role="tree"
          aria-label="文档树"
        >
          <DocumentSectionPanel
            v-for="group in visibleTreeGroups"
            :key="group.id"
            :group="group"
            :fill-height="isSingleTreeGroup"
            :selection-mode="isSelectionMode"
            @checked-change="documentIds => replaceSectionSelection(group, documentIds)"
            @open="handleDocumentOpen"
          />
        </div>
      </div>
    </ElScrollbar>
  </aside>
</template>

<style scoped lang="scss">
.docs-view__sidebar {
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 74%, transparent);
  background: var(--brand-bg-sidebar);
}

.docs-view__sidebar-header-icon-btn {
  &:hover,
  &:focus-visible {
    background: color-mix(in srgb, var(--brand-primary) 7%, transparent);
    color: var(--brand-primary);
  }
}

.docs-view__sidebar-header-text-btn {
  &--delete {
    color: var(--brand-error);

    &:hover,
    &:focus-visible {
      color: var(--brand-error);
    }
  }
}
</style>
