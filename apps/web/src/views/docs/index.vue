<script setup lang="ts">
import { WORKSPACE_TYPE } from '@haohaoxue/samepage-contracts'
import { canManageDocumentShare } from '@haohaoxue/samepage-shared'
import { ElMessage } from 'element-plus'
import { computed, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import PagePanel from '@/layouts/panels/PagePanel.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import DocumentShareDialog from './components/DocumentShareDialog.vue'
import { useDocs } from './composables/useDocs'
import DocsActiveSurfaceLayout from './layouts/DocsActiveSurfaceLayout.vue'
import DocsContextBarLayout from './layouts/DocsContextBarLayout.vue'
import DocsHistoryLayout from './layouts/DocsHistoryLayout.vue'

const {
  treeGroups,
  currentDocument,
  currentWorkspaceType,
  pendingShareCount,
  hasPendingShares,
  previewDocument,
  snapshots,
  activeDocumentId,
  activeBlockId,
  docsDocumentEditorMode,
  docsDocumentEditorCollaboration,
  isDocsDocumentEditable,
  expandedDocumentIdSet,
  isDocumentLoading,
  isDocumentItemLoading,
  isSnapshotsLoading,
  isMutatingTree,
  isRestoringSnapshot,
  isHistoryMode,
  selectedHistorySnapshotId,
  canRestoreSelectedSnapshot,
  documentPaneState,
  hasFallbackDocument,
  visibleBreadcrumbLabels,
  currentSurface,
  isDocumentSurface,
  documentCollaborationStatusLabel,
  documentCollaborationStatusTone,
  documentCollaborationStatusHint,
  canReconnectDocumentCollaboration,
  collapsedGroupIdSet,
  openDocumentHistory,
  closeHistoryMode,
  openDocument,
  openDefaultDocument,
  reloadCurrentDocument,
  reconnectDocumentCollaboration,
  applyDocumentShareChanged,
  restoreSelectedSnapshot,
  selectHistorySnapshot,
  toggleDocument,
  toggleGroupCollapse,
  createRootDocument,
  createChildDocument,
  deleteDocument,
  moveDocumentToTeam,
  updateDocumentTitle,
  updateDocumentContent,
  handleRequestComment,
} = useDocs()

const router = useRouter()
const workspaceStore = useWorkspaceStore()
const shareDialogDocumentId = shallowRef('')
const isShareDialogOpen = computed(() => Boolean(shareDialogDocumentId.value))
const canOpenShareDialog = computed(() => {
  const currentWorkspace = workspaceStore.currentWorkspace

  if (!currentWorkspace) {
    return workspaceStore.currentWorkspaceType !== WORKSPACE_TYPE.TEAM
  }

  if (currentWorkspace.type === WORKSPACE_TYPE.PERSONAL) {
    return true
  }

  return canManageDocumentShare({
    workspaceType: currentWorkspace.type,
    workspaceMemberRole: currentWorkspace.role,
  })
})
function openDocumentShareDialog(documentId: string) {
  if (!canOpenShareDialog.value) {
    ElMessage.warning('仅 MAINTAINER 可以管理分享设置')
    return
  }

  shareDialogDocumentId.value = documentId
}

function handleShareDialogVisibleChange(visible: boolean) {
  if (visible) {
    return
  }

  shareDialogDocumentId.value = ''
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
</script>

<template>
  <PagePanel :show-header="!isHistoryMode">
    <template v-if="!isHistoryMode" #header>
      <DocsContextBarLayout
        :is-document-surface="isDocumentSurface"
        :current-surface="currentSurface"
        :visible-breadcrumb-labels="visibleBreadcrumbLabels"
        :collaboration-status-label="documentCollaborationStatusLabel"
        :collaboration-status-tone="documentCollaborationStatusTone"
        :collaboration-status-hint="documentCollaborationStatusHint"
        :can-reconnect-collaboration="canReconnectDocumentCollaboration"
        :document-id="currentDocument?.id ?? ''"
        :document-share="currentDocument?.share ?? null"
        :can-open-share-dialog="canOpenShareDialog"
        @reconnect-collaboration="reconnectDocumentCollaboration"
        @open-share="openDocumentShareDialog"
      />
    </template>

    <DocsHistoryLayout
      v-if="isHistoryMode"
      :preview-document="previewDocument"
      :current-document="currentDocument"
      :snapshots="snapshots"
      :docs-document-editor-mode="docsDocumentEditorMode"
      :is-docs-document-editable="isDocsDocumentEditable"
      :active-block-id="activeBlockId"
      :is-document-item-loading="isDocumentItemLoading"
      :is-snapshots-loading="isSnapshotsLoading"
      :is-restoring-snapshot="isRestoringSnapshot"
      :selected-snapshot-id="selectedHistorySnapshotId"
      :can-restore-selected-snapshot="canRestoreSelectedSnapshot"
      :document-pane-state="documentPaneState"
      :has-fallback-document="hasFallbackDocument"
      @close-history-mode="closeHistoryMode"
      @restore-selected-snapshot="restoreSelectedSnapshot"
      @select-history-snapshot="selectHistorySnapshot"
      @update-title="updateDocumentTitle"
      @update-content="updateDocumentContent"
      @request-comment="handleRequestComment"
      @create-document="createRootDocument"
      @open-fallback-document="openDefaultDocument"
      @retry-load="reloadCurrentDocument"
    />

    <DocsActiveSurfaceLayout
      v-else
      :tree-groups="treeGroups"
      :current-workspace-type="currentWorkspaceType"
      :active-document-id="activeDocumentId"
      :expanded-document-ids="expandedDocumentIdSet"
      :collapsed-group-ids="collapsedGroupIdSet"
      :is-document-loading="isDocumentLoading"
      :is-mutating-tree="isMutatingTree"
      :current-surface="currentSurface"
      :pending-share-count="pendingShareCount"
      :has-pending-shares="hasPendingShares"
      :can-open-share-dialog="canOpenShareDialog"
      :is-document-surface="isDocumentSurface"
      :preview-document="previewDocument"
      :docs-document-editor-collaboration="docsDocumentEditorCollaboration"
      :docs-document-editor-mode="docsDocumentEditorMode"
      :is-docs-document-editable="isDocsDocumentEditable"
      :active-block-id="activeBlockId"
      :is-document-item-loading="isDocumentItemLoading"
      :document-pane-state="documentPaneState"
      :has-fallback-document="hasFallbackDocument"
      @open-document="openDocument"
      @toggle-document="toggleDocument"
      @toggle-group-collapse="toggleGroupCollapse"
      @create-root-document="createRootDocument"
      @create-child-document="createChildDocument"
      @open-history="openDocumentHistory"
      @move-document-to-team="moveDocumentToTeam"
      @delete-document="deleteDocument"
      @open-pending-shares="openPendingShares"
      @open-permissions-overview="openPermissionsOverview"
      @open-trash-page="openTrashPage"
      @open-share="openDocumentShareDialog"
      @update-title="updateDocumentTitle"
      @update-content="updateDocumentContent"
      @request-comment="handleRequestComment"
      @create-document="createRootDocument"
      @open-fallback-document="openDefaultDocument"
      @retry-load="reloadCurrentDocument"
    />

    <DocumentShareDialog
      v-if="isShareDialogOpen"
      :model-value="isShareDialogOpen"
      :document-id="shareDialogDocumentId"
      @share-changed="applyDocumentShareChanged"
      @update:model-value="handleShareDialogVisibleChange"
    />
  </PagePanel>
</template>
