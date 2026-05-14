import type {
  DocumentCurrent,
  DocumentItem,
  DocumentTreeCollectionId,
  DocumentTreeGroup,
  OwnedDocumentCollectionId,
} from '@haohaoxue/samepage-contracts'
import type { ComputedRef } from 'vue'
import type { DocumentDeleteAction } from '../typing'
import { DOCUMENT_COLLECTION, DOCUMENT_DEFAULT_TITLE } from '@haohaoxue/samepage-contracts'
import { formatDocumentCollectionLabel, getDocumentTitlePlainText, resolveRootDocumentVisibility } from '@haohaoxue/samepage-shared'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, shallowRef } from 'vue'
import {
  createDocument as createDocumentRequest,
  deleteDocument as deleteDocumentRequest,
  getDocuments,
  patchDocumentTitle as patchDocumentTitleRequest,
  permanentlyDeleteDocument as permanentlyDeleteDocumentRequest,
} from '@/apis/document'
import { useUiStore } from '@/stores/ui'
import {
  collectDocumentItemIds,
  findDocumentPath,
  resolveNextDocumentIdAfterDelete,
  resolvePreferredDocumentId,
  updateDocumentBranch,
} from '../utils/documentTree'
import { useDocsContext } from './useDocsContext'

interface LoadDocumentTreeOptions {
  silent?: boolean
}

interface PendingDeleteDocumentTarget {
  documentId: string
  documentTitle: string
  deletedDocumentIds: Set<string>
  nextDocumentId: string | null
}

interface PendingMoveDocumentTarget {
  documentId: string
  documentTitle: string
  movingDocumentIds: Set<string>
}

interface PendingRenameDocumentTarget {
  documentId: string
  documentTitle: string
}

export const useDocumentTree = createSharedComposable(() => {
  const {
    activeDocumentId,
    confirmNavigation,
    currentWorkspaceId,
    currentWorkspaceType,
    navigateToDocument,
  } = useDocsContext()
  const state = useDocumentTreeState({
    activeDocumentId,
    currentWorkspaceId,
  })

  const isDocumentLoading = shallowRef(false)
  const isCreating = shallowRef(false)
  const deleteDialogTarget = shallowRef<PendingDeleteDocumentTarget | null>(null)
  const deleteActionKind = shallowRef<DocumentDeleteAction | null>(null)
  const moveDialogTarget = shallowRef<PendingMoveDocumentTarget | null>(null)
  const renameDialogTarget = shallowRef<PendingRenameDocumentTarget | null>(null)
  const isRenaming = shallowRef(false)
  let treeRequestId = 0

  const isDeleting = computed(() => deleteActionKind.value !== null)
  const isMutatingTree = computed(() => isCreating.value || isDeleting.value || isRenaming.value)
  const isDeleteDialogOpen = computed(() => Boolean(deleteDialogTarget.value))
  const deleteDialogDocumentTitle = computed(() => deleteDialogTarget.value?.documentTitle ?? '')
  const isMoveDialogOpen = computed(() => Boolean(moveDialogTarget.value))
  const isRenameDialogOpen = computed(() => Boolean(renameDialogTarget.value))

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
    if (deleteActionKind.value) {
      return
    }

    const target = resolveDeleteTarget(documentId)

    if (!target) {
      return
    }

    deleteDialogTarget.value = target
  }

  function openMoveDialog(documentId: string) {
    const targetPath = findDocumentPath(state.treeGroups.value, documentId)
    const targetDocument = targetPath?.nodes.at(-1)

    if (!targetPath || !targetDocument || !isOwnedDocumentCollection(targetPath.collectionId)) {
      return
    }

    moveDialogTarget.value = {
      documentId,
      documentTitle: targetDocument.title,
      movingDocumentIds: collectDocumentItemIds([targetDocument]),
    }
  }

  function closeMoveDialog() {
    moveDialogTarget.value = null
  }

  function openRenameDialog(documentId: string) {
    const targetPath = findDocumentPath(state.treeGroups.value, documentId)
    const targetDocument = targetPath?.nodes.at(-1)

    if (!targetPath || !targetDocument || !isOwnedDocumentCollection(targetPath.collectionId)) {
      return
    }

    renameDialogTarget.value = {
      documentId,
      documentTitle: targetDocument.title,
    }
  }

  function closeRenameDialog() {
    if (isRenaming.value) {
      return
    }

    renameDialogTarget.value = null
  }

  async function confirmRenameDocument(title: string): Promise<DocumentCurrent | null> {
    const target = renameDialogTarget.value
    const normalizedTitle = title.trim()

    if (!target || isRenaming.value || !normalizedTitle) {
      return null
    }

    if (normalizedTitle === target.documentTitle) {
      renameDialogTarget.value = null
      return null
    }

    isRenaming.value = true

    try {
      const current = await patchDocumentTitleRequest(target.documentId, {
        title: normalizedTitle,
      })

      state.patchDocumentItem(target.documentId, {
        hasContent: current.document.summary.length > 0,
        summary: current.document.summary,
        title: getDocumentTitlePlainText(current.currentProjection.title),
        updatedAt: current.document.updatedAt,
      })
      renameDialogTarget.value = null
      return current
    }
    finally {
      isRenaming.value = false
    }
  }

  async function confirmDeleteDocument() {
    await executeDeleteDocument('trash')
  }

  async function confirmPermanentlyDeleteDocument() {
    await executeDeleteDocument('permanent')
  }

  function closeDeleteDialog() {
    if (deleteActionKind.value) {
      return
    }

    deleteDialogTarget.value = null
  }

  async function executeDeleteDocument(action: DocumentDeleteAction) {
    const target = deleteDialogTarget.value

    if (!target || deleteActionKind.value) {
      return
    }

    deleteActionKind.value = action

    try {
      await (action === 'trash'
        ? deleteDocumentRequest(target.documentId)
        : permanentlyDeleteDocumentRequest(target.documentId))
      state.pruneExpandedDocumentIds(target.deletedDocumentIds)
      deleteDialogTarget.value = null
      await loadTree()

      if (activeDocumentId.value && target.deletedDocumentIds.has(activeDocumentId.value)) {
        await navigateToDocument(target.nextDocumentId, {
          skipConfirm: true,
        })
      }

      ElMessage.success(action === 'trash' ? '文档已删除' : '已彻底删除文档')
    }
    catch (error) {
      ElMessage.error(error instanceof Error
        ? error.message
        : action === 'trash'
          ? '删除文档失败'
          : '彻底删除文档失败')
    }
    finally {
      deleteActionKind.value = null
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
        title: DOCUMENT_DEFAULT_TITLE,
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
        focusTitle: true,
        skipConfirm: true,
      })
    }
    finally {
      isCreating.value = false
    }
  }

  function isActiveTreeRequest(requestId: number, workspaceId: string | null) {
    return requestId === treeRequestId && currentWorkspaceId.value === workspaceId
  }

  function resolveDeleteTarget(documentId: string): PendingDeleteDocumentTarget | null {
    const targetPath = findDocumentPath(state.treeGroups.value, documentId)
    const targetDocument = targetPath?.nodes.at(-1)

    if (!targetPath || !targetDocument || !isOwnedDocumentCollection(targetPath.collectionId)) {
      return null
    }

    return {
      documentId,
      documentTitle: targetDocument.title,
      deletedDocumentIds: collectDocumentItemIds([targetDocument]),
      nextDocumentId: resolveNextDocumentIdAfterDelete(
        state.treeGroups.value,
        documentId,
        activeDocumentId.value,
      ),
    }
  }

  return {
    activeCollectionId: state.activeCollectionId,
    breadcrumbLabels: state.breadcrumbLabels,
    closeDeleteDialog,
    closeMoveDialog,
    closeRenameDialog,
    confirmDeleteDocument,
    confirmPermanentlyDeleteDocument,
    confirmRenameDocument,
    createChildDocument,
    createRootDocument: createRootDocumentIn,
    defaultDocumentId: state.defaultDocumentId,
    deleteActionKind,
    deleteDialogDocumentTitle,
    deleteDocument,
    expandDocument: state.expandDocument,
    ensureExpandedPath: state.ensureExpandedPath,
    expandedDocumentIdSet: state.expandedDocumentIdSet,
    hasFallbackDocument: state.hasFallbackDocument,
    isCreating,
    isDeleteDialogOpen,
    isDocumentLoading,
    isMoveDialogOpen,
    isMutatingTree,
    isRenameDialogOpen,
    isRenaming,
    loadTree,
    moveDialogTarget,
    openMoveDialog,
    openRenameDialog,
    patchDocumentItem: state.patchDocumentItem,
    renameDialogTarget,
    rememberLastOpenedDocument: state.rememberLastOpenedDocument,
    toggleDocument: state.toggleDocument,
    treeGroups: state.treeGroups,
  }
})

interface UseDocumentTreeStateOptions {
  activeDocumentId: ComputedRef<string | null>
  currentWorkspaceId: ComputedRef<string | null>
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
  const activePath = computed(() =>
    activeDocumentId.value ? findDocumentPath(treeGroups.value, activeDocumentId.value) : null,
  )
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

  function expandDocument(documentId: string) {
    const nextExpandedIds = new Set(expandedDocumentIds.value)
    nextExpandedIds.add(documentId)
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
    activeCollectionId,
    applyLoadedTree,
    breadcrumbLabels,
    defaultDocumentId,
    expandDocument,
    ensureExpandedPath,
    expandedDocumentIdSet,
    hasFallbackDocument,
    patchDocumentItem,
    pruneExpandedDocumentIds,
    rememberLastOpenedDocument,
    toggleDocument,
    treeGroups,
  }
}

function isOwnedDocumentCollection(collectionId: DocumentTreeCollectionId): collectionId is OwnedDocumentCollectionId {
  return collectionId !== DOCUMENT_COLLECTION.COLLABORATION
}
