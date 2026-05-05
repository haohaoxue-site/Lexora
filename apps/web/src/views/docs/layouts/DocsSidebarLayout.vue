<script setup lang="tsx">
import type { VNodeChild } from 'vue'
import type {
  DocsSidebarLayoutEmits,
  DocsSidebarLayoutProps,
} from './typing'
import {
  DOCUMENT_COLLECTION,
} from '@haohaoxue/samepage-contracts'
import { computed } from 'vue'
import { SvgIcon } from '@/components/svg-icon'
import DocumentSectionPanel from '../components/DocumentSectionPanel.vue'

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

const props = defineProps<DocsSidebarLayoutProps>()
const emits = defineEmits<DocsSidebarLayoutEmits>()

const treeSections = computed(() => props.treeGroups.map(group => ({
  group,
  canCreateRoot: group.id !== DOCUMENT_COLLECTION.COLLABORATION,
})))
const footerActions = computed<DocsSidebarFooterAction[]>(() => {
  const actions: DocsSidebarFooterAction[] = []

  if (props.hasPendingShares) {
    actions.push({
      id: 'pending-shares',
      label: '待接收分享',
      isActive: props.currentSurface === 'pending-shares',
      icon: () => (
        <ElBadge value={props.pendingShareCount} max={9}>
          <SvgIcon category="ui" icon="notification-bell" size="0.95rem" />
        </ElBadge>
      ),
      onClick: () => emits('openPendingShares'),
    })
  }

  if (props.canOpenShareDialog) {
    actions.push({
      id: 'permissions',
      label: '权限管理',
      isActive: props.currentSurface === 'permissions',
      icon: () => <SvgIcon category="ui" icon="lock" size="0.95rem" />,
      onClick: () => emits('openPermissionsOverview'),
    })
  }

  actions.push({
    id: 'trash',
    label: '回收站',
    isActive: props.currentSurface === 'trash',
    icon: () => <SvgIcon category="ui" icon="trash-can" size="0.95rem" />,
    onClick: () => emits('openTrashPage'),
  })

  return actions
})
const footerGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${footerActions.value.length}, minmax(0, 1fr))`,
}))
</script>

<template>
  <aside class="docs-view__sidebar">
    <div class="docs-view__sidebar-scroll">
      <div v-if="props.isDocumentLoading" class="docs-view__tree-loading">
        正在加载文档树...
      </div>

      <div v-else class="docs-view__tree-sections" role="tree" aria-label="文档树">
        <DocumentSectionPanel
          v-for="section in treeSections"
          :key="section.group.id"
          :group="section.group"
          :current-workspace-type="props.currentWorkspaceType"
          :active-document-id="props.activeDocumentId"
          :expanded-document-ids="props.expandedDocumentIds"
          :is-collapsed="props.collapsedGroupIds.has(section.group.id)"
          :is-action-pending="props.isMutatingTree"
          :can-share-document="props.canOpenShareDialog"
          :can-create-root="section.canCreateRoot"
          @open="emits('openDocument', $event)"
          @toggle="emits('toggleDocument', $event)"
          @toggle-collapse="emits('toggleGroupCollapse', $event)"
          @create-root="emits('createRootDocument', $event)"
          @create-child="emits('createChildDocument', $event)"
          @move-document-to-team="emits('moveDocumentToTeam', $event)"
          @share-document="emits('shareDocument', $event)"
          @delete-document="emits('deleteDocument', $event)"
        />
      </div>
    </div>

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

.docs-view__sidebar-scroll {
  flex: 1 1 0%;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem 0.75rem;
}

.docs-view__tree-loading {
  padding: 1.5rem 0.75rem;
  color: var(--brand-text-secondary);
  font-size: 0.875rem;
}

.docs-view__tree-sections {
  padding-bottom: 5rem;

  > * + * {
    margin-top: 1.5rem;
  }
}

.docs-view__sidebar-footer {
  display: grid;
  align-items: center;
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 74%, transparent);
  padding: 0.45rem 0.625rem 0.5rem;
}

.docs-view__sidebar-footer-item {
  position: relative;
  display: flex;
  justify-content: center;
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
