<script setup lang="ts">
import type {
  DocumentItem,
  DocumentTreeCollectionId,
  DocumentTreeGroup,
  OwnedDocumentCollectionId,
} from '@haohaoxue/samepage-contracts'
import type { MoveTreeNode, SelectedMoveTarget } from './typing'
import {
  DOCUMENT_COLLECTION,
  DOCUMENT_COLLECTION_LABELS,
} from '@haohaoxue/samepage-contracts'
import { computed, shallowRef, watch } from 'vue'
import { getDocuments } from '@/apis/document'
import { useWorkspaceStore } from '@/stores/workspace'
import { useDocsPageActions } from '../../composables/useDocsPageActions'
import { useDocumentTree } from '../../composables/useDocumentTree'
import { resolveDocumentTreeItemIcon } from '../../utils/documentTree'

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
    body-class="pt-2"
    @update:model-value="closeDialog"
  >
    <div class="document-move-dialog__body rounded-lg">
      <section
        v-loading="isLoading"
        class="document-move-dialog__tree min-w-0 overflow-y-auto bg-surface p-3"
        aria-label="目标文档树"
      >
        <div
          v-for="group in visibleGroups"
          :key="group.id"
          class="grid gap-[0.875rem]"
        >
          <button
            v-if="isOwnedCollection(group.id)"
            type="button"
            class="document-move-dialog__group-root flex w-full min-w-0 items-center gap-2 rounded-[0.4375rem] border-none bg-transparent px-[0.5rem] py-[0.45rem] text-left font-medium text-main"
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
            class="document-move-dialog__el-tree mt-1"
            @node-click="(node: MoveTreeNode) => selectDocumentNode(group, node)"
          >
            <template #default="{ node, data }">
              <span class="inline-flex min-w-0 items-center gap-2">
                <SvgIcon category="ui" :icon="getMoveTreeNodeIcon(data, Boolean(node.expanded))" size="1rem" />
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ data.title }}</span>
              </span>
            </template>
          </ElTree>
        </div>
      </section>
    </div>

    <div class="mt-3 flex gap-2 text-[13px] text-secondary">
      <span class="shrink-0">目标位置</span>
      <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-main">
        {{ selectedTarget?.label ?? '请选择目标位置' }}
      </span>
    </div>

    <template #footer>
      <ElButton :disabled="isMoving" @click="closeDialog">
        取消
      </ElButton>
      <ElButton
        class="ml-[10px]"
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
  overflow: hidden;
}

.document-move-dialog__group-root {
  cursor: pointer;
}

.document-move-dialog__group-root {
  &:hover,
  &.is-active {
    background: var(--brand-fill-lighter);
  }
}

.document-move-dialog__el-tree {
  --el-tree-node-hover-bg-color: var(--brand-fill-lighter);
}

:global(.document-move-dialog .el-dialog__body) {
}
</style>
