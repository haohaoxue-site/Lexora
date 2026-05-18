<script setup lang="tsx">
import type { VNodeChild } from 'vue'
import { computed } from 'vue'
import { SvgIcon } from '@/components/svg-icon'
import { useUiStore } from '@/stores/ui'
import DocumentSectionPanel from '../components/DocumentSectionPanel.vue'
import { useDocsPageActions } from '../composables/useDocsPageActions'
import { useDocsPendingShareIndicator } from '../composables/useDocsPendingShareIndicator'
import { useDocsShareDialog } from '../composables/useDocsShareDialog'
import { useDocsSidebarSelection } from '../composables/useDocsSidebarSelection'
import { useDocsSurfaceState } from '../composables/useDocsSurfaceState'
import { useDocumentTree } from '../composables/useDocumentTree'

interface DocsSidebarFooterAction {
  /** 动作唯一标识 */
  id: string
  /** 用户可见名称 */
  label: string
  /** 是否处于激活状态 */
  isActive: boolean
  /** 图标渲染函数 */
  icon: () => VNodeChild
  /** 点击动作 */
  onClick: () => void
}

const tree = useDocumentTree()
const { isDocumentLoading } = tree
const uiStore = useUiStore()
const { currentSurface, visibleTreeGroups } = useDocsSurfaceState()
const { hasPendingShares, pendingShareCount } = useDocsPendingShareIndicator()
const { canOpenShareDialog } = useDocsShareDialog()
const { openDocument, openPendingShares, openPermissionsOverview, openTrashPage } = useDocsPageActions()
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
  const actions: DocsSidebarFooterAction[] = []

  if (hasPendingShares.value) {
    actions.push({
      id: 'pending-shares',
      label: '待接收分享',
      isActive: currentSurface.value === 'pending-shares',
      icon: () => (
        <ElBadge value={pendingShareCount.value} max={9}>
          <SvgIcon category="ui" icon="bell" />
        </ElBadge>
      ),
      onClick: () => openPendingShares(),
    })
  }

  if (canOpenShareDialog.value) {
    actions.push({
      id: 'permissions',
      label: '权限管理',
      isActive: currentSurface.value === 'permissions',
      icon: () => <SvgIcon category="ui" icon="lock" />,
      onClick: () => openPermissionsOverview(),
    })
  }

  actions.push({
    id: 'trash',
    label: '回收站',
    isActive: currentSurface.value === 'trash',
    icon: () => <SvgIcon category="ui" icon="trash-can" />,
    onClick: () => openTrashPage(),
  })

  return actions
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
</script>

<template>
  <aside class="docs-view__sidebar">
    <div class="docs-view__sidebar-header">
      <template v-if="isSelectionMode">
        <span class="docs-view__sidebar-selection-count">已选 {{ selectedCount }} 项</span>
        <div class="docs-view__sidebar-header-actions">
          <ElButton
            text
            size="small"
            class="docs-view__sidebar-header-text-btn"
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
            class="docs-view__sidebar-header-text-btn"
            :disabled="isBatchDeleting"
            @click="exitSelectionMode"
          >
            取消
          </ElButton>
        </div>
      </template>

      <template v-else>
        <span class="docs-view__sidebar-header-title">文档库</span>
        <div class="docs-view__sidebar-header-actions">
          <ElButton
            text
            circle
            size="small"
            class="docs-view__sidebar-header-icon-btn"
            title="多选"
            @click="enterSelectionMode"
          >
            <SvgIcon category="ui" icon="select-multiple" size="0.95rem" />
          </ElButton>
          <ElButton
            text
            circle
            size="small"
            class="docs-view__sidebar-header-icon-btn"
            title="收起文档库"
            @click="collapseDocumentLibrary"
          >
            <SvgIcon category="ui" icon="pin-off" size="0.95rem" />
          </ElButton>
        </div>
      </template>
    </div>

    <ElScrollbar class="docs-view__sidebar-scroll" always>
      <div v-if="isDocumentLoading" class="docs-view__tree-loading">
        正在加载文档树...
      </div>

      <div
        v-else
        class="docs-view__tree-sections"
        :class="{ 'is-single-group': isSingleTreeGroup }"
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
    </ElScrollbar>

    <div class="docs-view__sidebar-footer" :style="footerGridStyle">
      <div
        v-for="action in footerActions"
        :key="action.id"
        class="docs-view__sidebar-footer-item"
        :class="{ 'has-divider': action !== footerActions[0] }"
      >
        <ElTooltip :content="action.label" effect="dark" placement="top" :show-after="120">
          <ElButton
            text size="small"
            class="docs-view__sidebar-footer-button"
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
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex-shrink: 0;
  width: 100%;
  max-width: 16rem;
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  background: var(--brand-bg-sidebar);
}

.docs-view__sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 3rem;
  padding: 0.5rem 0.75rem 0.5rem 0.9rem;
  border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 60%, transparent);
}

.docs-view__sidebar-header-title,
.docs-view__sidebar-selection-count {
  min-width: 0;
  color: var(--brand-text-primary);
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
}

.docs-view__sidebar-header-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.25rem;
}

.docs-view__sidebar-header-icon-btn {
  width: 1.75rem;
  height: 1.75rem;
  color: var(--brand-text-secondary);

  &:hover,
  &:focus-visible {
    background: color-mix(in srgb, var(--brand-primary) 7%, transparent);
    color: var(--brand-primary);
  }
}

.docs-view__sidebar-header-text-btn {
  padding: 0 0.35rem;
  color: var(--brand-text-secondary);
  font-size: 0.8125rem;

  &--delete {
    color: var(--brand-error);

    &:hover,
    &:focus-visible {
      color: var(--brand-error);
    }
  }
}

.docs-view__sidebar-scroll {
  flex: 1 1 0%;
  min-height: 0;

  :deep(.el-scrollbar__view) {
    display: flex;
    min-height: 100%;
    padding: 0.5rem 0.75rem 1rem 0.75rem;
  }
}

.docs-view__tree-loading {
  padding: 1.5rem 0.75rem;
  color: var(--brand-text-secondary);
  font-size: 0.875rem;
}

.docs-view__tree-sections {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding-bottom: 5rem;

  > * + * {
    margin-top: 1.5rem;
  }

  &.is-single-group {
    flex: 1 1 0%;
    padding-bottom: 0;
  }
}

.docs-view__sidebar-footer {
  display: grid;
  align-items: center;
  flex: 0 0 var(--default-footer-height);
  height: var(--default-footer-height);
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 74%, transparent);
  box-sizing: border-box;
}

.docs-view__sidebar-footer-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-width: 0;

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
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 1.875rem;
  min-width: 1.875rem;
  height: 1.875rem;
  min-height: 1.875rem;
  border-radius: 0.625rem;
  background: transparent;
  padding: 0;
  font-size: 18px;
  color: color-mix(in srgb, var(--brand-text-secondary) 88%, transparent);
  line-height: 0;
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
