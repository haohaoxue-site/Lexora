import type { DocumentTreeCollectionId } from '@haohaoxue/samepage-contracts'
import {
  DOCUMENT_COLLECTION,
  DOCUMENT_PANE_STATE,
  DOCUMENT_VISIBILITY,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { patchDocumentMeta as patchDocumentMetaRequest } from '@/apis/document'
import { useActiveDocument } from './useActiveDocument'
import { useDocsContext } from './useDocsContext'
import { useDocsShareDialog } from './useDocsShareDialog'
import { useDocsSurfaceState } from './useDocsSurfaceState'
import { useDocumentTree } from './useDocumentTree'

export const useDocsPageActions = createSharedComposable(() => {
  const router = useRouter()
  const {
    activeDocumentId,
    currentWorkspaceId,
    currentWorkspaceType,
    isSelectingInitialDocument,
    navigateToDocument,
  } = useDocsContext()
  const tree = useDocumentTree()
  const activeDocument = useActiveDocument()
  const surfaceState = useDocsSurfaceState()
  const { canOpenShareDialog } = useDocsShareDialog()

  let lastInaccessibleRedirectDocumentId: string | null = null

  watch(
    currentWorkspaceId,
    async (nextWorkspaceId, previousWorkspaceId) => {
      if (nextWorkspaceId === previousWorkspaceId) {
        return
      }

      await tree.loadTree()

      if (
        !surfaceState.isDocumentSurface.value
        || !nextWorkspaceId
        || activeDocumentId.value === surfaceState.visibleDefaultDocumentId.value
      ) {
        return
      }

      await navigateToDocument(surfaceState.visibleDefaultDocumentId.value, {
        replace: true,
        skipConfirm: true,
      })
    },
  )

  watch(
    [currentWorkspaceId, tree.activeCollectionId],
    async ([, nextActiveCollectionId], previousState) => {
      const [, previousActiveCollectionId] = previousState ?? []
      const isInitialRun = previousState === undefined
      const hasResolvedHiddenDocument
        = !isInitialRun && Boolean(nextActiveCollectionId) && nextActiveCollectionId !== previousActiveCollectionId

      if (!isInitialRun && !hasResolvedHiddenDocument) {
        return
      }

      if (!surfaceState.isDocumentSurface.value) {
        return
      }

      if (
        !activeDocumentId.value
        || !nextActiveCollectionId
        || surfaceState.visibleActiveCollectionId.value
      ) {
        return
      }

      await navigateToDocument(surfaceState.visibleDefaultDocumentId.value, {
        replace: true,
        skipConfirm: true,
      })
    },
    { immediate: true },
  )

  watch(
    [
      activeDocumentId,
      currentWorkspaceId,
      surfaceState.documentPaneState,
      surfaceState.visibleDefaultDocumentId,
      surfaceState.isDocumentSurface,
      activeDocument.isDocumentItemLoading,
    ],
    async ([nextDocumentId, nextWorkspaceId, nextPaneState, nextDefaultDocumentId, isDocumentSurface, isDocumentItemLoading]) => {
      if (!isDocumentSurface || !nextWorkspaceId || !nextDocumentId || isDocumentItemLoading) {
        return
      }

      if (
        nextPaneState !== DOCUMENT_PANE_STATE.NOT_FOUND
        && nextPaneState !== DOCUMENT_PANE_STATE.FORBIDDEN
      ) {
        return
      }

      if (lastInaccessibleRedirectDocumentId === nextDocumentId) {
        return
      }

      lastInaccessibleRedirectDocumentId = nextDocumentId
      const targetDocumentId = nextDefaultDocumentId === nextDocumentId
        ? null
        : nextDefaultDocumentId

      ElMessage.warning(resolveInaccessibleDocumentRedirectMessage({
        paneState: nextPaneState,
        hasFallbackDocument: Boolean(targetDocumentId),
      }))

      await navigateToDocument(targetDocumentId, {
        replace: true,
        skipConfirm: true,
      })
    },
  )

  async function openDocument(documentId: string) {
    lastInaccessibleRedirectDocumentId = null
    await navigateToDocument(documentId)
  }

  async function openDefaultDocument(input: { replace?: boolean } = {}) {
    if (!surfaceState.visibleDefaultDocumentId.value) {
      return
    }

    lastInaccessibleRedirectDocumentId = null
    await navigateToDocument(surfaceState.visibleDefaultDocumentId.value, input)
  }

  function resolveDefaultRootCollectionId() {
    return currentWorkspaceType.value === WORKSPACE_TYPE.TEAM
      ? DOCUMENT_COLLECTION.TEAM
      : DOCUMENT_COLLECTION.PERSONAL
  }

  async function createRootDocument(collectionId: DocumentTreeCollectionId = resolveDefaultRootCollectionId()) {
    if (collectionId === DOCUMENT_COLLECTION.COLLABORATION) {
      return
    }

    lastInaccessibleRedirectDocumentId = null
    await tree.createRootDocument(collectionId)
  }

  async function moveDocumentToTeam(documentId: string) {
    const isCurrentDocument = activeDocument.currentDocument.value?.id === documentId

    if (isCurrentDocument) {
      const canContinue = await activeDocument.confirmNavigation()

      if (!canContinue) {
        return
      }
    }

    try {
      await patchDocumentMetaRequest(documentId, {
        visibility: DOCUMENT_VISIBILITY.WORKSPACE,
      })
      await tree.loadTree()

      if (isCurrentDocument) {
        await activeDocument.reloadCurrentDocument()
      }

      ElMessage.success('文档已移到团队')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '移到团队失败')
    }
  }

  async function loadInitialTree() {
    await tree.loadTree()

    if (
      !surfaceState.isDocumentSurface.value
      || activeDocumentId.value
      || !surfaceState.visibleDefaultDocumentId.value
    ) {
      return
    }

    isSelectingInitialDocument.value = true

    try {
      await navigateToDocument(surfaceState.visibleDefaultDocumentId.value, {
        replace: true,
        skipConfirm: true,
      })
    }
    finally {
      isSelectingInitialDocument.value = false
    }
  }

  function openPermissionsOverview() {
    if (!canOpenShareDialog.value) {
      ElMessage.warning('仅 MAINTAINER 可以查看分享管理')
      return
    }

    void router.push({
      name: 'docs-permissions',
    })
  }

  function openPendingShares() {
    void router.push({
      name: 'docs-pending-shares',
    })
  }

  function openTrashPage() {
    void router.push({
      name: 'docs-trash',
    })
  }

  return {
    createRootDocument,
    loadInitialTree,
    moveDocumentToTeam,
    openDefaultDocument,
    openDocument,
    openPendingShares,
    openPermissionsOverview,
    openTrashPage,
  }
})

function resolveInaccessibleDocumentRedirectMessage(input: {
  paneState: string
  hasFallbackDocument: boolean
}) {
  if (input.paneState === DOCUMENT_PANE_STATE.FORBIDDEN) {
    return input.hasFallbackDocument
      ? '你无权访问这篇文档，已为你打开其他可访问文档'
      : '你无权访问这篇文档，已返回文档页'
  }

  return input.hasFallbackDocument
    ? '当前文档不存在或你无权访问，已为你打开其他可访问文档'
    : '当前文档不存在或你无权访问，已返回文档页'
}
