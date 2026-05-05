import type { DocumentShareChangedPayload } from '../typing'
import type { TiptapEditorCommentRequest } from '@/components/tiptap-editor'

import { ElMessage } from 'element-plus'
import {
  computed,
  shallowRef,
} from 'vue'
import {
  useRoute,
  useRouter,
} from 'vue-router'
import { useUserStore } from '@/stores/user'
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
}

export function useDocs() {
  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const workspaceStore = useWorkspaceStore()
  const activeDocumentId = computed(() => typeof route.params.id === 'string' ? route.params.id : null)
  const activeBlockId = computed(() => resolveDocumentBlockIdFromHash(route.hash))
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? null)
  const currentWorkspaceType = computed(() => workspaceStore.currentWorkspaceType)
  const currentUserId = computed(() => userStore.currentUser?.id ?? null)
  const isSelectingInitialDocument = shallowRef(false)
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
    currentUserId,
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
    canDeleteCurrentDocument: pageActions.canDeleteCurrentDocument,
    canMoveCurrentDocumentToTeam: pageActions.canMoveCurrentDocumentToTeam,
    expandedDocumentIdSet: tree.expandedDocumentIdSet,
    isDocumentLoading: tree.isDocumentLoading,
    isDocumentItemLoading: activeDocument.isDocumentItemLoading,
    isSnapshotsLoading: activeDocument.isSnapshotsLoading,
    isMutatingTree: tree.isMutatingTree,
    isRestoringSnapshot: activeDocument.isRestoringSnapshot,
    isHistoryMode: historyState.isHistoryMode,
    selectedHistorySnapshotId: historyState.selectedHistorySnapshotId,
    canRestoreSelectedSnapshot: historyState.canRestoreSelectedSnapshot,
    documentPaneState: surfaceState.documentPaneState,
    hasFallbackDocument: surfaceState.hasVisibleFallbackDocument,
    visibleBreadcrumbLabels: surfaceState.visibleBreadcrumbLabels,
    currentSurface: surfaceState.currentSurface,
    isDocumentSurface: surfaceState.isDocumentSurface,
    saveStateLabel: activeDocument.saveStateLabel,
    documentCollaborationStatusLabel: activeDocument.collaborationStatusLabel,
    documentCollaborationStatusHint: activeDocument.collaborationStatusHint,
    canReconnectDocumentCollaboration: activeDocument.canReconnectCollaboration,
    collapsedGroupIdSet: surfaceState.collapsedGroupIdSet,
    openHistoryMode: historyState.openHistoryMode,
    closeHistoryMode: historyState.closeHistoryMode,
    openDocument: pageActions.openDocument,
    openDefaultDocument: pageActions.openDefaultDocument,
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
    deleteCurrentDocument: pageActions.deleteCurrentDocument,
    moveCurrentDocumentToTeam: pageActions.moveCurrentDocumentToTeam,
    moveDocumentToTeam: pageActions.moveDocumentToTeam,
    updateDocumentTitle: activeDocument.updateDocumentTitle,
    updateDocumentContent: activeDocument.updateDocumentContent,
    handleRequestComment,
  }

  async function navigateToDocument(
    documentId: string | null,
    options: NavigateToDocumentOptions = {},
  ) {
    if (documentId === activeDocumentId.value) {
      return true
    }

    if (!options.skipConfirm) {
      const canNavigate = await activeDocument.confirmNavigation()

      if (!canNavigate) {
        return false
      }
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
