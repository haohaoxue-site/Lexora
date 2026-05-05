import type { DocumentTreeCollectionId, WorkspaceType } from '@haohaoxue/samepage-contracts'
import type { ComputedRef, ShallowRef } from 'vue'
import type { useActiveDocument } from './useActiveDocument'
import type { useDocsSurfaceState } from './useDocsSurfaceState'
import type { useDocumentTree } from './useDocumentTree'
import {
  DOCUMENT_COLLECTION,
  DOCUMENT_PANE_STATE,
  DOCUMENT_VISIBILITY,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { patchDocumentMeta as patchDocumentMetaRequest } from '@/apis/document'

/**
 * 文档页动作组合参数。
 */
interface UseDocsPageActionsOptions {
  activeDocumentId: ComputedRef<string | null>
  currentUserId: ComputedRef<string | null>
  currentWorkspaceId: ComputedRef<string | null>
  currentWorkspaceType: ComputedRef<WorkspaceType>
  isSelectingInitialDocument: ShallowRef<boolean>
  tree: Pick<
    ReturnType<typeof useDocumentTree>,
    'activeCollectionId' | 'createRootDocument' | 'deleteDocument' | 'loadTree'
  >
  activeDocument: Pick<
    ReturnType<typeof useActiveDocument>,
    'confirmNavigation' | 'currentDocument' | 'documentErrorState' | 'isDocumentItemLoading' | 'reloadCurrentDocument'
  >
  surfaceState: Pick<
    ReturnType<typeof useDocsSurfaceState>,
    'documentPaneState' | 'isDocumentSurface' | 'visibleActiveCollectionId' | 'visibleDefaultDocumentId'
  >
  navigateToDocument: (
    documentId: string | null,
    options?: {
      replace?: boolean
      skipConfirm?: boolean
    },
  ) => Promise<boolean>
}

export function useDocsPageActions(options: UseDocsPageActionsOptions) {
  let lastInaccessibleRedirectDocumentId: string | null = null
  const canDeleteCurrentDocument = computed(() =>
    Boolean(options.surfaceState.visibleActiveCollectionId.value)
    && options.surfaceState.visibleActiveCollectionId.value !== DOCUMENT_COLLECTION.COLLABORATION,
  )
  const canMoveCurrentDocumentToTeam = computed(() =>
    options.currentWorkspaceType.value === WORKSPACE_TYPE.TEAM
    && options.activeDocument.currentDocument.value?.visibility === DOCUMENT_VISIBILITY.PRIVATE
    && options.activeDocument.currentDocument.value.parentId === null
    && options.activeDocument.currentDocument.value.createdBy === options.currentUserId.value,
  )

  watch(
    options.currentWorkspaceId,
    async (nextWorkspaceId, previousWorkspaceId) => {
      if (nextWorkspaceId === previousWorkspaceId) {
        return
      }

      await options.tree.loadTree()

      if (
        !options.surfaceState.isDocumentSurface.value
        || !nextWorkspaceId
        || options.activeDocumentId.value === options.surfaceState.visibleDefaultDocumentId.value
      ) {
        return
      }

      await options.navigateToDocument(options.surfaceState.visibleDefaultDocumentId.value, {
        replace: true,
        skipConfirm: true,
      })
    },
  )

  watch(
    [options.currentWorkspaceId, options.tree.activeCollectionId],
    async ([, nextActiveCollectionId], previousState) => {
      const [, previousActiveCollectionId] = previousState ?? []
      const isInitialRun = previousState === undefined
      const hasResolvedHiddenDocument
        = !isInitialRun && Boolean(nextActiveCollectionId) && nextActiveCollectionId !== previousActiveCollectionId

      if (!isInitialRun && !hasResolvedHiddenDocument) {
        return
      }

      if (!options.surfaceState.isDocumentSurface.value) {
        return
      }

      if (
        !options.activeDocumentId.value
        || !nextActiveCollectionId
        || options.surfaceState.visibleActiveCollectionId.value
      ) {
        return
      }

      await options.navigateToDocument(options.surfaceState.visibleDefaultDocumentId.value, {
        replace: true,
        skipConfirm: true,
      })
    },
    { immediate: true },
  )

  watch(
    [
      options.activeDocumentId,
      options.currentWorkspaceId,
      options.surfaceState.documentPaneState,
      options.surfaceState.visibleDefaultDocumentId,
      options.surfaceState.isDocumentSurface,
      options.activeDocument.isDocumentItemLoading,
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

      await options.navigateToDocument(targetDocumentId, {
        replace: true,
        skipConfirm: true,
      })
    },
  )

  onBeforeRouteUpdate(async (to, from) => {
    if (to.params.id === from.params.id) {
      return true
    }

    return await options.activeDocument.confirmNavigation()
  })

  onBeforeRouteLeave(options.activeDocument.confirmNavigation)
  void loadInitialTree()

  return {
    canDeleteCurrentDocument,
    canMoveCurrentDocumentToTeam,
    openDocument,
    openDefaultDocument,
    createRootDocument,
    deleteCurrentDocument,
    moveCurrentDocumentToTeam,
    moveDocumentToTeam,
  }

  async function openDocument(documentId: string) {
    lastInaccessibleRedirectDocumentId = null
    await options.navigateToDocument(documentId)
  }

  async function openDefaultDocument(input: { replace?: boolean } = {}) {
    if (!options.surfaceState.visibleDefaultDocumentId.value) {
      return
    }

    lastInaccessibleRedirectDocumentId = null
    await options.navigateToDocument(options.surfaceState.visibleDefaultDocumentId.value, input)
  }

  function resolveDefaultRootCollectionId() {
    return options.currentWorkspaceType.value === WORKSPACE_TYPE.TEAM
      ? DOCUMENT_COLLECTION.TEAM
      : DOCUMENT_COLLECTION.PERSONAL
  }

  async function createRootDocument(collectionId: DocumentTreeCollectionId = resolveDefaultRootCollectionId()) {
    if (collectionId === DOCUMENT_COLLECTION.COLLABORATION) {
      return
    }

    lastInaccessibleRedirectDocumentId = null
    await options.tree.createRootDocument(collectionId)
  }

  async function deleteCurrentDocument() {
    if (!options.activeDocument.currentDocument.value) {
      return
    }

    await options.tree.deleteDocument(options.activeDocument.currentDocument.value.id)
  }

  async function moveCurrentDocumentToTeam() {
    if (!options.activeDocument.currentDocument.value) {
      return
    }

    await moveDocumentToTeam(options.activeDocument.currentDocument.value.id)
  }

  async function moveDocumentToTeam(documentId: string) {
    const isCurrentDocument = options.activeDocument.currentDocument.value?.id === documentId

    if (isCurrentDocument) {
      const canContinue = await options.activeDocument.confirmNavigation()

      if (!canContinue) {
        return
      }
    }

    try {
      await patchDocumentMetaRequest(documentId, {
        visibility: DOCUMENT_VISIBILITY.WORKSPACE,
      })
      await options.tree.loadTree()

      if (isCurrentDocument) {
        await options.activeDocument.reloadCurrentDocument()
      }

      ElMessage.success('文档已移到团队')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '移到团队失败')
    }
  }

  async function loadInitialTree() {
    await options.tree.loadTree()

    if (
      !options.surfaceState.isDocumentSurface.value
      || options.activeDocumentId.value
      || !options.surfaceState.visibleDefaultDocumentId.value
    ) {
      return
    }

    options.isSelectingInitialDocument.value = true

    try {
      await options.navigateToDocument(options.surfaceState.visibleDefaultDocumentId.value, {
        replace: true,
        skipConfirm: true,
      })
    }
    finally {
      options.isSelectingInitialDocument.value = false
    }
  }
}

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
