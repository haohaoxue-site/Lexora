<script setup lang="ts">
import type {
  DocumentItem,
  DocumentTreeCollectionId,
  DocumentTreeGroup,
  OwnedDocumentCollectionId,
} from '@haohaoxue/samepage-contracts'
import {
  DOCUMENT_COLLECTION,
  DOCUMENT_COLLECTION_LABELS,
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
const visibleGroups = computed(() =>
  targetGroups.value.filter(group => group.id !== DOCUMENT_COLLECTION.COLLABORATION),
)
const canConfirm = computed(() => Boolean(target.value && selectedTarget.value) && !isMoving.value)

watch(isOpen, async (open) => {
  if (!open) {
    selectedTarget.value = null
    targetGroups.value = []
    return
  }

  const workspace = await workspaceStore.ensurePersonalWorkspace()
  if (!isOpen.value) {
    return
  }

  selectedWorkspaceId.value = workspace.id
  selectedTarget.value = null
  await loadTargetTree(workspace.id)
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

function selectGroupRoot(group: DocumentTreeGroup) {
  if (!isOwnedCollection(group.id) || !selectedWorkspaceId.value) {
    return
  }

  selectedTarget.value = {
    workspaceId: selectedWorkspaceId.value,
    collectionId: group.id,
    parentId: null,
    label: DOCUMENT_COLLECTION_LABELS[group.id],
  }
}

function selectDocumentNode(group: DocumentTreeGroup, node: MoveTreeNode) {
  if (!isOwnedCollection(group.id) || node.disabled || !selectedWorkspaceId.value) {
    return
  }

  selectedTarget.value = {
    workspaceId: selectedWorkspaceId.value,
    collectionId: group.id,
    parentId: node.id,
    label: node.title,
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
  min-height: 26rem;
  max-height: 30rem;
  border: 1px solid var(--brand-border-base);
  border-radius: 0.5rem;
  overflow: hidden;
}

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
