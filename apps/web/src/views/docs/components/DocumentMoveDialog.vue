<script setup lang="ts">
import type {
  DocumentItem,
  DocumentTreeCollectionId,
  DocumentTreeGroup,
  OwnedDocumentCollectionId,
} from '@haohaoxue/samepage-contracts'
import type { WorkspaceSwitcherItem } from '@/stores/workspace'
import {
  DOCUMENT_COLLECTION,
  DOCUMENT_COLLECTION_LABELS,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { computed, shallowRef, watch } from 'vue'
import { getDocuments } from '@/apis/document'
import { useWorkspaceStore } from '@/stores/workspace'
import { useDocsPageActions } from '../composables/useDocsPageActions'
import { useDocumentTree } from '../composables/useDocumentTree'
import { resolveDocumentTreeItemIcon } from '../utils/documentTree'

interface MoveTreeNode {
  id: string
  title: string
  hasChildren: boolean
  hasContent: boolean
  disabled: boolean
  children: MoveTreeNode[]
}

interface SelectedMoveTarget {
  workspaceId: string
  collectionId: OwnedDocumentCollectionId
  parentId: string | null
  label: string
}

const workspaceStore = useWorkspaceStore()
const tree = useDocumentTree()
const pageActions = useDocsPageActions()

const selectedWorkspaceId = shallowRef<string>('')
const selectedTarget = shallowRef<SelectedMoveTarget | null>(null)
const targetGroups = shallowRef<DocumentTreeGroup[]>([])
const isLoading = shallowRef(false)
const isMoving = shallowRef(false)
let loadRequestId = 0

const target = computed(() => tree.moveDialogTarget.value)
const isOpen = computed(() => tree.isMoveDialogOpen.value)
const workspaces = computed(() => workspaceStore.switchableWorkspaces)
const selectedWorkspace = computed(() =>
  workspaces.value.find(workspace => workspace.id === selectedWorkspaceId.value) ?? null,
)
const visibleGroups = computed(() =>
  targetGroups.value.filter(group => group.id !== DOCUMENT_COLLECTION.COLLABORATION),
)
const canConfirm = computed(() => Boolean(target.value && selectedTarget.value) && !isMoving.value)

watch(isOpen, (open) => {
  if (!open) {
    selectedTarget.value = null
    targetGroups.value = []
    return
  }

  selectedWorkspaceId.value = workspaceStore.currentWorkspace?.id
    ?? workspaces.value[0]?.id
    ?? ''
})

watch(selectedWorkspaceId, async (workspaceId) => {
  selectedTarget.value = null
  await loadTargetTree(workspaceId)
})

async function loadTargetTree(workspaceId: string) {
  const requestId = ++loadRequestId

  if (!workspaceId) {
    targetGroups.value = []
    return
  }

  isLoading.value = true

  try {
    const groups = await getDocuments(workspaceId)

    if (requestId !== loadRequestId) {
      return
    }

    targetGroups.value = groups
  }
  finally {
    if (requestId === loadRequestId) {
      isLoading.value = false
    }
  }
}

function selectWorkspace(workspace: WorkspaceSwitcherItem) {
  selectedWorkspaceId.value = workspace.id
}

function selectGroupRoot(group: DocumentTreeGroup) {
  if (!isOwnedCollection(group.id) || !selectedWorkspace.value) {
    return
  }

  selectedTarget.value = {
    workspaceId: selectedWorkspace.value.id,
    collectionId: group.id,
    parentId: null,
    label: `${selectedWorkspace.value.label} / ${DOCUMENT_COLLECTION_LABELS[group.id]}`,
  }
}

function selectDocumentNode(group: DocumentTreeGroup, node: MoveTreeNode) {
  if (!isOwnedCollection(group.id) || node.disabled || !selectedWorkspace.value) {
    return
  }

  selectedTarget.value = {
    workspaceId: selectedWorkspace.value.id,
    collectionId: group.id,
    parentId: node.id,
    label: `${selectedWorkspace.value.label} / ${node.title}`,
  }
}

function toTreeNodes(items: DocumentItem[]): MoveTreeNode[] {
  const excludedIds = target.value?.movingDocumentIds ?? new Set<string>()

  return items.map(item => ({
    id: item.id,
    title: item.title,
    hasChildren: item.hasChildren,
    hasContent: item.hasContent,
    disabled: excludedIds.has(item.id),
    children: toTreeNodes(item.children),
  }))
}

function getMoveTreeNodeIcon(node: MoveTreeNode, expanded: boolean) {
  return resolveDocumentTreeItemIcon(node, expanded)
}

function isGroupRootSelected(group: DocumentTreeGroup) {
  return selectedTarget.value?.workspaceId === selectedWorkspaceId.value
    && selectedTarget.value?.collectionId === group.id
    && selectedTarget.value?.parentId === null
}

async function confirmMove() {
  if (!target.value || !selectedTarget.value || isMoving.value) {
    return
  }

  isMoving.value = true

  try {
    await pageActions.moveDocumentTree(target.value.documentId, {
      targetWorkspaceId: selectedTarget.value.workspaceId,
      targetParentId: selectedTarget.value.parentId,
      targetCollectionId: selectedTarget.value.collectionId,
    })
    tree.closeMoveDialog()
  }
  finally {
    isMoving.value = false
  }
}

function closeDialog() {
  if (isMoving.value) {
    return
  }

  tree.closeMoveDialog()
}

function isOwnedCollection(collectionId: DocumentTreeCollectionId): collectionId is OwnedDocumentCollectionId {
  return collectionId !== DOCUMENT_COLLECTION.COLLABORATION
}
</script>

<template>
  <ElDialog
    :model-value="isOpen"
    title="移动到"
    width="760px"
    destroy-on-close
    align-center
    class="document-move-dialog"
    @update:model-value="closeDialog"
  >
    <div class="document-move-dialog__body">
      <aside class="document-move-dialog__spaces" aria-label="空间">
        <button
          v-for="workspace in workspaces"
          :key="workspace.id"
          type="button"
          class="document-move-dialog__space"
          :class="{ 'is-active': workspace.id === selectedWorkspaceId }"
          @click="selectWorkspace(workspace)"
        >
          <span class="document-move-dialog__space-icon">
            <SvgIcon
              category="ui"
              :icon="workspace.type === WORKSPACE_TYPE.TEAM ? 'folder-chip' : 'doc-card'"
              size="1rem"
            />
          </span>
          <span class="document-move-dialog__space-label">{{ workspace.label }}</span>
        </button>
      </aside>

      <section
        v-loading="isLoading"
        class="document-move-dialog__tree"
        aria-label="目标文档树"
      >
        <div
          v-for="group in visibleGroups"
          :key="group.id"
          class="document-move-dialog__group"
        >
          <button
            v-if="isOwnedCollection(group.id)"
            type="button"
            class="document-move-dialog__group-root"
            :class="{ 'is-active': isGroupRootSelected(group) }"
            @click="selectGroupRoot(group)"
          >
            <SvgIcon category="ui" icon="folder-chip" size="1rem" />
            <span>{{ DOCUMENT_COLLECTION_LABELS[group.id] }}</span>
          </button>

          <ElTree
            v-if="group.nodes.length"
            :data="toTreeNodes(group.nodes)"
            node-key="id"
            :props="{ label: 'title', children: 'children', disabled: 'disabled' }"
            highlight-current
            :current-node-key="selectedTarget?.parentId ?? undefined"
            default-expand-all
            class="document-move-dialog__el-tree"
            @node-click="(node: MoveTreeNode) => selectDocumentNode(group, node)"
          >
            <template #default="{ node, data }">
              <span class="document-move-dialog__node">
                <SvgIcon category="ui" :icon="getMoveTreeNodeIcon(data, Boolean(node.expanded))" size="1rem" />
                <span class="document-move-dialog__node-title">{{ data.title }}</span>
              </span>
            </template>
          </ElTree>
        </div>
      </section>
    </div>

    <div class="document-move-dialog__summary">
      <span class="document-move-dialog__summary-label">目标位置</span>
      <span class="document-move-dialog__summary-value">
        {{ selectedTarget?.label ?? '请选择目标位置' }}
      </span>
    </div>

    <template #footer>
      <ElButton :disabled="isMoving" @click="closeDialog">
        取消
      </ElButton>
      <ElButton
        class="ml-10px!"
        type="primary"
        :loading="isMoving"
        :disabled="!canConfirm"
        @click="confirmMove"
      >
        确定
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.document-move-dialog__body {
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);
  min-height: 26rem;
  max-height: 30rem;
  border: 1px solid var(--brand-border-base);
  border-radius: 0.5rem;
  overflow: hidden;
}

.document-move-dialog__spaces {
  padding: 0.75rem;
  border-right: 1px solid var(--brand-border-base);
  background: var(--brand-bg-sidebar);
}

.document-move-dialog__space,
.document-move-dialog__group-root {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
  border: none;
  border-radius: 0.4375rem;
  background: transparent;
  color: var(--brand-text-primary);
  text-align: left;
  cursor: pointer;
}

.document-move-dialog__space {
  padding: 0.5rem 0.625rem;

  &.is-active {
    background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
    color: var(--brand-primary);
  }
}

.document-move-dialog__space-icon {
  display: inline-flex;
  flex-shrink: 0;
}

.document-move-dialog__space-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-move-dialog__tree {
  min-width: 0;
  overflow-y: auto;
  padding: 0.75rem;
  background: var(--brand-bg-surface);
}

.document-move-dialog__group + .document-move-dialog__group {
  margin-top: 0.875rem;
}

.document-move-dialog__group-root {
  padding: 0.45rem 0.5rem;
  font-weight: 500;

  &:hover,
  &.is-active {
    background: var(--brand-fill-lighter);
  }
}

.document-move-dialog__el-tree {
  --el-tree-node-hover-bg-color: var(--brand-fill-lighter);
  margin-top: 0.25rem;
}

.document-move-dialog__node {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.document-move-dialog__node-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-move-dialog__summary {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  color: var(--brand-text-secondary);
  font-size: 13px;
}

.document-move-dialog__summary-label {
  flex: 0 0 auto;
}

.document-move-dialog__summary-value {
  min-width: 0;
  overflow: hidden;
  color: var(--brand-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.document-move-dialog .el-dialog__body) {
  padding-top: 0.5rem;
}
</style>
