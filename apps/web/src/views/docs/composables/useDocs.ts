import type { DocumentShareChangedPayload } from '../typing'
import type { TiptapEditorCommentRequest } from '@/components/tiptap-editor'

import { ElMessage } from 'element-plus'
import {
  computed,
  shallowRef,
  watch,
} from 'vue'
import {
  useRoute,
  useRouter,
} from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import { resolveDocumentBlockIdFromHash } from '@/utils/documentBlockAnchor'
import { useActiveDocument } from './useActiveDocument'
import { useDocsHistoryState } from './useDocsHistoryState'
import { useDocsPageActions } from './useDocsPageActions'
import { useDocsPendingShareIndicator } from './useDocsPendingShareIndicator'
import { useDocsSurfaceState } from './useDocsSurfaceState'
import { useDocumentTree } from './useDocumentTree'

/**
 * 文档跳转选项。
 */
interface NavigateToDocumentOptions {
  replace?: boolean
  skipConfirm?: boolean
  focusTitle?: boolean
}

export function useDocs() {
  const route = useRoute()
  const router = useRouter()
  const workspaceStore = useWorkspaceStore()
  const activeDocumentId = computed(() => typeof route.params.id === 'string' ? route.params.id : null)
  const activeBlockId = computed(() => resolveDocumentBlockIdFromHash(route.hash))
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? null)
  const currentWorkspaceType = computed(() => workspaceStore.currentWorkspaceType)
  const isSelectingInitialDocument = shallowRef(false)
  const pendingHistoryDocumentId = shallowRef<string | null>(null)
  const pendingTitleFocusDocumentId = shallowRef<string | null>(null)
  let confirmPendingNavigation = async () => true

  const tree = useDocumentTree({
    activeDocumentId,
    currentWorkspaceId,
    currentWorkspaceType,
    confirmNavigation: () => confirmPendingNavigation(),
    navigateToDocument,
  })
  const activeDocument = useActiveDocument({
    activeDocumentId,
    ensureExpandedPath: tree.ensureExpandedPath,
    patchDocumentItem: tree.patchDocumentItem,
    rememberLastOpenedDocument: tree.rememberLastOpenedDocument,
  })
  confirmPendingNavigation = activeDocument.confirmNavigation

  const surfaceState = useDocsSurfaceState({
    routeName: computed(() => route.name),
    activeDocumentId,
    currentWorkspaceType,
    isSelectingInitialDocument,
    tree: {
      treeGroups: tree.treeGroups,
      defaultDocumentId: tree.defaultDocumentId,
      breadcrumbLabels: tree.breadcrumbLabels,
      isDocumentLoading: tree.isDocumentLoading,
    },
    activeDocument: {
      currentDocument: activeDocument.currentDocument,
      isDocumentItemLoading: activeDocument.isDocumentItemLoading,
      documentErrorState: activeDocument.documentErrorState,
    },
  })
  const historyState = useDocsHistoryState({
    activeDocumentId,
    currentDocument: activeDocument.currentDocument,
    snapshots: activeDocument.snapshots,
    isRestoringSnapshot: activeDocument.isRestoringSnapshot,
    ensureSnapshotsLoaded: activeDocument.ensureSnapshotsLoaded,
    restoreSnapshot: activeDocument.restoreSnapshot,
  })
  const pendingShareIndicator = useDocsPendingShareIndicator({
    routeKey: computed(() => route.fullPath),
    currentWorkspaceType,
  })
  const pageActions = useDocsPageActions({
    activeDocumentId,
    currentWorkspaceId,
    currentWorkspaceType,
    isSelectingInitialDocument,
    tree,
    activeDocument,
    surfaceState,
    navigateToDocument,
  })
  const docsDocumentEditorMode = computed(() =>
    historyState.isHistoryMode.value ? 'history' : 'default',
  )
  const isDocsDocumentEditable = computed(() =>
    docsDocumentEditorMode.value === 'default'
    && !activeDocument.isCollaborationReadonly.value
    && !activeDocument.isCollaborationInitialSyncing.value,
  )
  const shouldAutofocusTitle = computed(() =>
    docsDocumentEditorMode.value === 'default'
    && surfaceState.isDocumentSurface.value
    && activeDocument.currentDocument.value?.id === pendingTitleFocusDocumentId.value,
  )

  watch(
    [
      pendingHistoryDocumentId,
      activeDocumentId,
      () => activeDocument.currentDocument.value?.id ?? null,
      activeDocument.isDocumentItemLoading,
    ],
    () => {
      void openPendingDocumentHistory()
    },
  )

  watch(
    activeDocumentId,
    (nextDocumentId) => {
      if (
        pendingTitleFocusDocumentId.value
        && nextDocumentId !== pendingTitleFocusDocumentId.value
      ) {
        pendingTitleFocusDocumentId.value = null
      }
    },
  )

  watch(
    surfaceState.currentSurface,
    (nextSurface) => {
      if (nextSurface !== 'document') {
        pendingTitleFocusDocumentId.value = null
      }
    },
  )

  return {
    treeGroups: surfaceState.visibleTreeGroups,
    activeCollectionId: surfaceState.visibleActiveCollectionId,
    currentWorkspaceType,
    pendingShareCount: pendingShareIndicator.pendingShareCount,
    hasPendingShares: pendingShareIndicator.hasPendingShares,
    currentDocument: activeDocument.currentDocument,
    previewDocument: historyState.previewDocument,
    snapshots: activeDocument.snapshots,
    activeDocumentId,
    activeBlockId,
    docsDocumentEditorMode,
    docsDocumentEditorCollaboration: activeDocument.collaboration,
    isDocsDocumentEditable,
    expandedDocumentIdSet: tree.expandedDocumentIdSet,
    isDocumentLoading: tree.isDocumentLoading,
    isDocumentItemLoading: activeDocument.isDocumentItemLoading,
    isSnapshotsLoading: activeDocument.isSnapshotsLoading,
    isMutatingTree: tree.isMutatingTree,
    isDeleteDialogOpen: tree.isDeleteDialogOpen,
    deleteActionKind: tree.deleteActionKind,
    deleteDialogDocumentTitle: tree.deleteDialogDocumentTitle,
    isRestoringSnapshot: activeDocument.isRestoringSnapshot,
    isHistoryMode: historyState.isHistoryMode,
    shouldAutofocusTitle,
    selectedHistorySnapshotId: historyState.selectedHistorySnapshotId,
    canRestoreSelectedSnapshot: historyState.canRestoreSelectedSnapshot,
    documentPaneState: surfaceState.documentPaneState,
    hasFallbackDocument: surfaceState.hasVisibleFallbackDocument,
    visibleBreadcrumbLabels: surfaceState.visibleBreadcrumbLabels,
    currentSurface: surfaceState.currentSurface,
    isDocumentSurface: surfaceState.isDocumentSurface,
    documentCollaborationStatusLabel: activeDocument.collaborationStatusLabel,
    documentCollaborationStatusTone: activeDocument.collaborationStatusTone,
    documentCollaborationStatusHint: activeDocument.collaborationStatusHint,
    canReconnectDocumentCollaboration: activeDocument.canReconnectCollaboration,
    collapsedGroupIdSet: surfaceState.collapsedGroupIdSet,
    openDocumentHistory,
    closeHistoryMode: historyState.closeHistoryMode,
    openDocument: pageActions.openDocument,
    openDefaultDocument: pageActions.openDefaultDocument,
    markTitleAutofocusApplied,
    closeDeleteDialog: tree.closeDeleteDialog,
    confirmDeleteDocument: tree.confirmDeleteDocument,
    confirmPermanentlyDeleteDocument: tree.confirmPermanentlyDeleteDocument,
    reloadCurrentDocument: activeDocument.reloadCurrentDocument,
    reconnectDocumentCollaboration: activeDocument.reconnectCollaboration,
    applyDocumentShareChanged,
    restoreSelectedSnapshot: historyState.restoreSelectedSnapshot,
    selectHistorySnapshot: historyState.selectHistorySnapshot,
    toggleDocument: tree.toggleDocument,
    toggleGroupCollapse: surfaceState.toggleGroupCollapse,
    createRootDocument: pageActions.createRootDocument,
    createChildDocument: tree.createChildDocument,
    deleteDocument: tree.deleteDocument,
    moveDocumentToTeam: pageActions.moveDocumentToTeam,
    updateDocumentTitle: activeDocument.updateDocumentTitle,
    updateDocumentContent: activeDocument.updateDocumentContent,
    handleRequestComment,
  }

  async function openDocumentHistory(documentId: string) {
    if (
      activeDocument.currentDocument.value?.id === documentId
      && !activeDocument.isDocumentItemLoading.value
    ) {
      await historyState.openHistoryMode()
      return
    }

    const isCurrentRouteDocument = activeDocumentId.value === documentId
    const didNavigate = isCurrentRouteDocument || await navigateToDocument(documentId)

    if (!didNavigate) {
      pendingHistoryDocumentId.value = null
      return
    }

    pendingHistoryDocumentId.value = documentId
    await openPendingDocumentHistory()
  }

  async function openPendingDocumentHistory() {
    const pendingDocumentId = pendingHistoryDocumentId.value

    if (!pendingDocumentId) {
      return
    }

    if (
      activeDocumentId.value
      && activeDocumentId.value !== pendingDocumentId
      && !activeDocument.isDocumentItemLoading.value
    ) {
      pendingHistoryDocumentId.value = null
      return
    }

    if (
      activeDocument.isDocumentItemLoading.value
      || activeDocument.currentDocument.value?.id !== pendingDocumentId
    ) {
      return
    }

    pendingHistoryDocumentId.value = null
    await historyState.openHistoryMode()
  }

  async function navigateToDocument(
    documentId: string | null,
    options: NavigateToDocumentOptions = {},
  ) {
    if (documentId === activeDocumentId.value) {
      if (options.focusTitle && documentId) {
        pendingTitleFocusDocumentId.value = documentId
      }

      return true
    }

    if (!options.skipConfirm) {
      const canNavigate = await activeDocument.confirmNavigation()

      if (!canNavigate) {
        return false
      }
    }

    if (options.focusTitle && documentId) {
      pendingTitleFocusDocumentId.value = documentId
    }

    await router[options.replace ? 'replace' : 'push']({
      name: 'docs',
      ...(documentId ? { params: { id: documentId } } : {}),
      hash: '',
    })

    return true
  }

  function handleRequestComment(request: TiptapEditorCommentRequest) {
    void request
    ElMessage.info('评论能力稍后接入')
  }

  function markTitleAutofocusApplied() {
    if (activeDocument.currentDocument.value?.id !== pendingTitleFocusDocumentId.value) {
      return
    }

    pendingTitleFocusDocumentId.value = null
  }

  function applyDocumentShareChanged(payload: DocumentShareChangedPayload) {
    tree.patchDocumentItem(payload.documentId, {
      share: payload.share,
    })
    activeDocument.patchDocumentShare(payload.documentId, payload.share)
    void tree.loadTree({
      silent: true,
    })
  }
}
