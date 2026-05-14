<script setup lang="ts">
import { onMounted } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import PagePanel from '@/layouts/panels/PagePanel.vue'
import DocumentDeleteDialog from './components/DocumentDeleteDialog.vue'
import DocumentMoveDialog from './components/DocumentMoveDialog.vue'
import DocumentRenameDialog from './components/DocumentRenameDialog.vue'
import DocumentShareDialog from './components/DocumentShareDialog.vue'
import { useActiveDocument } from './composables/useActiveDocument'
import { useDocsHistoryState } from './composables/useDocsHistoryState'
import { useDocsPageActions } from './composables/useDocsPageActions'
import { useDocsShareDialog } from './composables/useDocsShareDialog'
import DocsActiveSurfaceLayout from './layouts/DocsActiveSurfaceLayout.vue'
import DocsContextBarLayout from './layouts/DocsContextBarLayout.vue'
import DocsHistoryLayout from './layouts/DocsHistoryLayout.vue'

const { applyDocumentShareChanged, confirmNavigation } = useActiveDocument()
const { isHistoryMode } = useDocsHistoryState()
const { loadInitialTree } = useDocsPageActions()
const {
  handleShareDialogVisibleChange,
  isShareDialogOpen,
  shareDialogDocumentId,
} = useDocsShareDialog()

onMounted(() => {
  void loadInitialTree()
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

    <DocumentShareDialog
      v-if="isShareDialogOpen"
      :model-value="isShareDialogOpen"
      :document-id="shareDialogDocumentId"
      @share-changed="applyDocumentShareChanged"
      @update:model-value="handleShareDialogVisibleChange"
    />

    <DocumentDeleteDialog />
    <DocumentMoveDialog />
    <DocumentRenameDialog />
  </PagePanel>
</template>
