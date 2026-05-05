import type {
  DocumentItem,
  DocumentTreeCollectionId,
  DocumentTreeGroup,
  OwnedDocumentCollectionId,
  WorkspaceType,
} from '@haohaoxue/samepage-contracts'
import type { ComputedRef } from 'vue'
import { DOCUMENT_COLLECTION } from '@haohaoxue/samepage-contracts'
import { formatDocumentCollectionLabel, resolveRootDocumentVisibility } from '@haohaoxue/samepage-shared'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, shallowRef } from 'vue'
import {
  createDocument as createDocumentRequest,
  deleteDocument as deleteDocumentRequest,
  getDocuments,
} from '@/apis/document'
import { useUiStore } from '@/stores/ui'
import {
  collectDocumentItemIds,
  findDocumentPath,
  resolveNextDocumentIdAfterDelete,
  resolvePreferredDocumentId,
  updateDocumentBranch,
} from '../utils/documentTree'

/**
 * 文档跳转选项。
 */
interface NavigateToDocumentOptions {
  replace?: boolean
  skipConfirm?: boolean
}

/**
 * 文档树组合参数。
 */
interface UseDocumentTreeOptions {
  activeDocumentId: ComputedRef<string | null>
  currentWorkspaceId: ComputedRef<string | null>
  currentWorkspaceType: ComputedRef<WorkspaceType>
  confirmNavigation: () => Promise<boolean>
  navigateToDocument: (documentId: string | null, options?: NavigateToDocumentOptions) => Promise<boolean>
}

/**
 * 文档树加载选项。
 */
interface LoadDocumentTreeOptions {
  /** 是否静默加载 */
  silent?: boolean
}

/**
 * 文档树状态组合参数。
 */
interface UseDocumentTreeStateOptions {
  activeDocumentId: ComputedRef<string | null>
  currentWorkspaceId: ComputedRef<string | null>
}

export function useDocumentTree({
  activeDocumentId,
  currentWorkspaceId,
  currentWorkspaceType,
  confirmNavigation,
  navigateToDocument,
}: UseDocumentTreeOptions) {
  const isDocumentLoading = shallowRef(false)
  const isCreating = shallowRef(false)
  const isDeleting = shallowRef(false)
  let treeRequestId = 0
  const state = useDocumentTreeState({
    activeDocumentId,
    currentWorkspaceId,
  })

  const isMutatingTree = computed(() => isCreating.value || isDeleting.value)

  async function loadTree(options: LoadDocumentTreeOptions = {}) {
    const workspaceId = currentWorkspaceId.value
    const requestId = ++treeRequestId
    const shouldShowLoading = !options.silent

    if (!workspaceId) {
      isDocumentLoading.value = false
      state.applyLoadedTree([])
      return
    }

    if (shouldShowLoading) {
      isDocumentLoading.value = true
    }

    try {
      const groups = await getDocuments(workspaceId)

      if (!isActiveTreeRequest(requestId, workspaceId)) {
        return
      }

      state.applyLoadedTree(groups)
    }
    finally {
      if (shouldShowLoading && isActiveTreeRequest(requestId, workspaceId)) {
        isDocumentLoading.value = false
      }
    }
  }

  async function createRootDocumentIn(collectionId: OwnedDocumentCollectionId = DOCUMENT_COLLECTION.PERSONAL) {
    await createDocument(null, collectionId)
  }

  async function createChildDocument(parentDocumentId = activeDocumentId.value) {
    if (!parentDocumentId) {
      return
    }

    const parentPath = findDocumentPath(state.treeGroups.value, parentDocumentId)

    if (!parentPath || !isOwnedDocumentCollection(parentPath.collectionId)) {
      return
    }

    await createDocument(parentDocumentId)
  }

  async function deleteDocument(documentId: string) {
    const targetPath = findDocumentPath(state.treeGroups.value, documentId)
    const targetDocument = targetPath?.nodes.at(-1)

    if (!targetPath || !targetDocument || !isOwnedDocumentCollection(targetPath.collectionId)) {
      return
    }

    const confirmed = await ElMessageBox.confirm(
      `将把「${targetDocument.title}」及其所有子文档移到回收站，你可以稍后在回收站恢复。`,
      '移到回收站',
      {
        type: 'warning',
        confirmButtonText: '移到回收站',
        cancelButtonText: '取消',
      },
    ).then(() => true).catch(() => false)

    if (!confirmed) {
      return
    }

    const deletedDocumentIds = collectDocumentItemIds([targetDocument])
    const nextDocumentId = resolveNextDocumentIdAfterDelete(
      state.treeGroups.value,
      documentId,
      activeDocumentId.value,
    )

    isDeleting.value = true

    try {
      await deleteDocumentRequest(documentId)
      state.pruneExpandedDocumentIds(deletedDocumentIds)
      await loadTree()

      if (activeDocumentId.value && deletedDocumentIds.has(activeDocumentId.value)) {
        await navigateToDocument(nextDocumentId, {
          skipConfirm: true,
        })
      }

      ElMessage.success('文档已移到回收站')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '移到回收站失败')
    }
    finally {
      isDeleting.value = false
    }
  }

  async function createDocument(parentId: string | null, collectionId: OwnedDocumentCollectionId = DOCUMENT_COLLECTION.PERSONAL) {
    const workspaceId = currentWorkspaceId.value

    if (!workspaceId) {
      return
    }

    const canNavigate = await confirmNavigation()

    if (!canNavigate) {
      return
    }

    isCreating.value = true

    try {
      const createdDocument = await createDocumentRequest({
        title: '未命名',
        workspaceId,
        parentId,
        ...(parentId
          ? {}
          : {
              visibility: resolveRootDocumentVisibility({
                workspaceType: currentWorkspaceType.value,
                collectionId,
              }),
            }),
      })
      await loadTree()
      await navigateToDocument(createdDocument.id, {
        skipConfirm: true,
      })
    }
    finally {
      isCreating.value = false
    }
  }

  return {
    treeGroups: state.treeGroups,
    activeCollectionId: state.activeCollectionId,
    breadcrumbLabels: state.breadcrumbLabels,
    expandedDocumentIdSet: state.expandedDocumentIdSet,
    isDocumentLoading,
    isCreating,
    isMutatingTree,
    defaultDocumentId: state.defaultDocumentId,
    hasFallbackDocument: state.hasFallbackDocument,
    loadTree,
    toggleDocument: state.toggleDocument,
    ensureExpandedPath: state.ensureExpandedPath,
    patchDocumentItem: state.patchDocumentItem,
    rememberLastOpenedDocument: state.rememberLastOpenedDocument,
    createRootDocument: createRootDocumentIn,
    createChildDocument,
    deleteDocument,
  }

  function isActiveTreeRequest(requestId: number, workspaceId: string | null) {
    return requestId === treeRequestId && currentWorkspaceId.value === workspaceId
  }
}

export function useDocumentTreeState({
  activeDocumentId,
  currentWorkspaceId,
}: UseDocumentTreeStateOptions) {
  const uiStore = useUiStore()
  const treeGroups = shallowRef<DocumentTreeGroup[]>([])
  const expandedDocumentIds = computed(() =>
    uiStore.getDocumentTreeState(currentWorkspaceId.value).expandedDocumentIds,
  )
  const lastOpenedDocumentId = computed(() =>
    uiStore.getDocumentTreeState(currentWorkspaceId.value).lastOpenedDocumentId,
  )

  const expandedDocumentIdSet = computed(() => new Set(expandedDocumentIds.value))
  const activePath = computed(() => activeDocumentId.value ? findDocumentPath(treeGroups.value, activeDocumentId.value) : null)
  const activeCollectionId = computed(() => activePath.value?.collectionId ?? null)
  const defaultDocumentId = computed(() => resolvePreferredDocumentId(
    treeGroups.value,
    lastOpenedDocumentId.value,
  ))
  const hasFallbackDocument = computed(() => Boolean(defaultDocumentId.value))
  const breadcrumbLabels = computed(() => {
    if (!activePath.value) {
      return ['文档']
    }

    return [
      formatDocumentCollectionLabel(activePath.value.collectionId),
      ...activePath.value.nodes.map(document => document.title),
    ]
  })

  function applyLoadedTree(groups: DocumentTreeGroup[]) {
    treeGroups.value = groups
    ensureExpandedPath(activeDocumentId.value)
  }

  function toggleDocument(documentId: string) {
    const nextExpandedIds = new Set(expandedDocumentIds.value)

    if (nextExpandedIds.has(documentId)) {
      nextExpandedIds.delete(documentId)
    }
    else {
      nextExpandedIds.add(documentId)
    }

    uiStore.setExpandedDocumentIds(currentWorkspaceId.value, Array.from(nextExpandedIds))
  }

  function ensureExpandedPath(documentId: string | null) {
    if (!documentId) {
      return
    }

    const path = findDocumentPath(treeGroups.value, documentId)

    if (!path) {
      return
    }

    const nextExpandedIds = new Set(expandedDocumentIds.value)

    for (const document of path.nodes) {
      nextExpandedIds.add(document.id)
    }

    uiStore.setExpandedDocumentIds(currentWorkspaceId.value, Array.from(nextExpandedIds))
  }

  function pruneExpandedDocumentIds(documentIds: Set<string>) {
    uiStore.setExpandedDocumentIds(
      currentWorkspaceId.value,
      expandedDocumentIds.value.filter(id => !documentIds.has(id)),
    )
  }

  function patchDocumentItem(documentId: string, input: Partial<DocumentItem>) {
    const currentGroups = treeGroups.value

    for (let index = 0; index < currentGroups.length; index += 1) {
      const group = currentGroups[index]
      const nextNodes = updateDocumentBranch(group.nodes, documentId, input)

      if (nextNodes === group.nodes) {
        continue
      }

      const nextGroups = currentGroups.slice()
      nextGroups[index] = {
        ...group,
        nodes: nextNodes,
      }
      treeGroups.value = nextGroups
      return
    }
  }

  function rememberLastOpenedDocument(documentId: string) {
    uiStore.setLastOpenedDocumentId(currentWorkspaceId.value, documentId)
  }

  return {
    treeGroups,
    activeCollectionId,
    breadcrumbLabels,
    expandedDocumentIdSet,
    defaultDocumentId,
    hasFallbackDocument,
    applyLoadedTree,
    toggleDocument,
    ensureExpandedPath,
    pruneExpandedDocumentIds,
    patchDocumentItem,
    rememberLastOpenedDocument,
  }
}

function isOwnedDocumentCollection(collectionId: DocumentTreeCollectionId): collectionId is OwnedDocumentCollectionId {
  return collectionId !== DOCUMENT_COLLECTION.COLLABORATION
}
