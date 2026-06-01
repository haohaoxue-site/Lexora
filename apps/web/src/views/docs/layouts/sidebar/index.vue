<script setup lang="tsx">
import type { DocsSidebarFooterAction } from './typing'
import { computed } from 'vue'
import { SvgIcon } from '@/components/svg-icon'
import { useUiStore } from '@/stores/ui'
import DocumentSectionPanel from '../../components/document-section-panel'
import { useDocsPageActions } from '../../composables/useDocsPageActions'
import { useDocsSidebarSelection } from '../../composables/useDocsSidebarSelection'
import { useDocsSurfaceState } from '../../composables/useDocsSurfaceState'
import { useDocumentTree } from '../../composables/useDocumentTree'

const tree = useDocumentTree()
const { isDocumentLoading } = tree
const uiStore = useUiStore()
const { currentSurface, visibleTreeGroups } = useDocsSurfaceState()
const { openDocsControlCenterPage, openDocument, openTrashPage } = useDocsPageActions()
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
const footerActions = computed<DocsSidebarFooterAction[]>(() => {
  return [{
    id: 'trash',
    label: '回收站',
    isActive: currentSurface.value === 'trash',
    icon: () => <SvgIcon category="ui" icon="trash-can" />,
    onClick: () => openTrashPage(),
  }]
})
const footerGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${footerActions.value.length}, minmax(0, 1fr))`,
}))

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
  <aside class="docs-view__sidebar flex min-h-0 w-full max-w-64 shrink-0 flex-col">
    <div class="docs-view__sidebar-header border-b px-3 py-2 pl-[0.9rem] flex min-h-12 items-center justify-between gap-2">
      <template v-if="isSelectionMode">
        <span class="min-w-0 whitespace-nowrap text-sm font-medium text-main">已选 {{ selectedCount }} 项</span>
        <div class="flex shrink-0 items-center gap-1">
          <ElButton
            text
            size="small"
            class="docs-view__sidebar-header-text-btn px-[0.35rem] text-[0.8125rem] text-secondary"
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
            class="docs-view__sidebar-header-text-btn px-[0.35rem] text-[0.8125rem] text-secondary"
            :disabled="isBatchDeleting"
            @click="exitSelectionMode"
          >
            取消
          </ElButton>
        </div>
      </template>

      <template v-else>
        <span class="min-w-0 whitespace-nowrap text-sm font-medium text-main">文档库</span>
        <div class="flex shrink-0 items-center gap-1">
          <ElButton
            text
            circle
            size="small"
            class="docs-view__sidebar-header-icon-btn h-7 w-7 text-secondary"
            title="文档控制台"
            @click="openDocsControlCenter"
          >
            <SvgIcon category="ui" icon="settings-gear" size="0.95rem" />
          </ElButton>
          <ElButton
            text
            circle
            size="small"
            class="docs-view__sidebar-header-icon-btn h-7 w-7 text-secondary"
            title="多选"
            @click="enterSelectionMode"
          >
            <SvgIcon category="ui" icon="select-multiple" size="0.95rem" />
          </ElButton>
          <ElButton
            text
            circle
            size="small"
            class="docs-view__sidebar-header-icon-btn h-7 w-7 text-secondary"
            title="收起文档库"
            @click="collapseDocumentLibrary"
          >
            <SvgIcon category="ui" icon="pin-off" size="0.95rem" />
          </ElButton>
        </div>
      </template>
    </div>

    <ElScrollbar class="docs-view__sidebar-scroll flex-1 min-h-0" always>
      <div class="docs-view__sidebar-scroll-content flex min-h-full flex-col px-3 pb-4 pt-2">
        <div v-if="isDocumentLoading" class="px-0 py-4 text-sm text-secondary">
          正在加载文档树...
        </div>

        <div
          v-else
          class="docs-view__tree-sections flex min-h-0 flex-auto flex-col gap-6 pb-20"
          :class="isSingleTreeGroup ? 'flex-1 pb-0' : ''"
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

    <div class="docs-view__sidebar-footer box-border grid h-[var(--default-footer-height)] flex-none items-center border-t" :style="footerGridStyle">
      <div
        v-for="action in footerActions"
        :key="action.id"
        class="docs-view__sidebar-footer-item relative flex h-full min-w-0 items-center justify-center"
        :class="{ 'has-divider': action !== footerActions[0] }"
      >
        <ElTooltip :content="action.label" effect="dark" placement="top" :show-after="120">
          <ElButton
            text size="small"
            class="docs-view__sidebar-footer-button inline-flex h-[1.875rem] min-h-[1.875rem] w-[1.875rem] min-w-[1.875rem] shrink-0 items-center justify-center rounded-[0.625rem] bg-transparent p-0 text-[18px] leading-none"
            :class="{ 'is-active': action.isActive }"
            @click="action.onClick"
          >
            <component :is="action.icon" />
          </ElButton>
        </ElTooltip>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.docs-view__sidebar {
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
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

.docs-view__sidebar-footer-item {
  &.has-divider::before {
    position: absolute;
    top: 50%;
    left: 0;
    width: 1px;
    height: 0.875rem;
    background: #d2d2d2;
    content: '';
    transform: translateY(-50%);
  }
}

.docs-view__sidebar-footer-button {
  --el-button-text-color: color-mix(in srgb, var(--brand-text-secondary) 88%, transparent);
  --el-button-hover-text-color: var(--brand-text-primary);
  --el-button-active-text-color: var(--brand-primary);
  --el-button-hover-bg-color: color-mix(in srgb, var(--brand-text-primary) 4%, transparent);
  --el-button-active-bg-color: color-mix(in srgb, var(--brand-primary) 6%, transparent);
  --el-button-border-color: transparent;
  --el-button-hover-border-color: transparent;
  --el-button-active-border-color: transparent;
  color: color-mix(in srgb, var(--brand-text-secondary) 88%, transparent);
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  &:hover {
    color: var(--brand-text-primary);
    background: color-mix(in srgb, var(--brand-text-primary) 4%, transparent);
  }

  &.is-active {
    color: var(--brand-primary);
    background: color-mix(in srgb, var(--brand-primary) 6%, transparent);
  }
}
</style>
