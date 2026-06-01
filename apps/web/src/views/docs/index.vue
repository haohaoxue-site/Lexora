<script setup lang="ts">
import { onMounted } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import PagePanel from '@/layouts/panels/page-panel'
import { useWorkspaceStore } from '@/stores/workspace'
import { useActiveDocument } from './composables/useActiveDocument'
import { useDocsCollaborationDialog } from './composables/useDocsCollaborationDialog'
import { useDocsHistoryState } from './composables/useDocsHistoryState'
import { useDocsPageActions } from './composables/useDocsPageActions'
import { useDocsPublicationDialog } from './composables/useDocsPublicationDialog'
import DocsActiveSurfaceLayout from './layouts/active-surface'
import DocsContextBarLayout from './layouts/context-bar'
import DocsHistoryLayout from './layouts/history'
import DocumentCollaborationDialog from './widgets/document-collaboration-dialog'
import DocumentDeleteDialog from './widgets/document-delete-dialog'
import DocumentMoveDialog from './widgets/document-move-dialog'
import DocumentPublicationDialog from './widgets/document-publication-dialog'
import DocumentRenameDialog from './widgets/document-rename-dialog'

const { confirmNavigation } = useActiveDocument()
const { isHistoryMode } = useDocsHistoryState()
const { loadInitialTree } = useDocsPageActions()
const workspaceStore = useWorkspaceStore()
const {
  collaborationDialogDocumentId,
  handleCollaborationDialogVisibleChange,
  isCollaborationDialogOpen,
} = useDocsCollaborationDialog()
const {
  handlePublicationDialogVisibleChange,
  isPublicationDialogOpen,
  publicationDialogDocumentId,
} = useDocsPublicationDialog()

onMounted(async () => {
  await workspaceStore.ensurePersonalWorkspace()
  await loadInitialTree()
})

onBeforeRouteUpdate(async (to, from) => {
  if (to.params.id === from.params.id) {
    return true
  }

  return await confirmNavigation()
})

onBeforeRouteLeave(confirmNavigation)
</script>

<template>
  <PagePanel :show-header="!isHistoryMode">
    <template v-if="!isHistoryMode" #header>
      <DocsContextBarLayout />
    </template>

    <DocsHistoryLayout v-if="isHistoryMode" />
    <DocsActiveSurfaceLayout v-else />

    <DocumentCollaborationDialog
      v-if="isCollaborationDialogOpen"
      :model-value="isCollaborationDialogOpen"
      :document-id="collaborationDialogDocumentId"
      @update:model-value="handleCollaborationDialogVisibleChange"
    />

    <DocumentPublicationDialog
      v-if="isPublicationDialogOpen"
      :model-value="isPublicationDialogOpen"
      :document-id="publicationDialogDocumentId"
      @update:model-value="handlePublicationDialogVisibleChange"
    />

    <DocumentDeleteDialog />
    <DocumentMoveDialog />
    <DocumentRenameDialog />
  </PagePanel>
</template>
