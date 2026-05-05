<script setup lang="ts">
import type {
  DocsActiveSurfaceLayoutEmits,
  DocsActiveSurfaceLayoutProps,
} from './typing'
import DocsSidebarLayout from './DocsSidebarLayout.vue'

const props = defineProps<DocsActiveSurfaceLayoutProps>()
const emits = defineEmits<DocsActiveSurfaceLayoutEmits>()
</script>

<template>
  <div class="docs-view">
    <DocsSidebarLayout
      :tree-groups="props.treeGroups"
      :current-workspace-type="props.currentWorkspaceType"
      :active-document-id="props.activeDocumentId"
      :expanded-document-ids="props.expandedDocumentIds"
      :collapsed-group-ids="props.collapsedGroupIds"
      :is-document-loading="props.isDocumentLoading"
      :is-mutating-tree="props.isMutatingTree"
      :current-surface="props.currentSurface"
      :pending-share-count="props.pendingShareCount"
      :has-pending-shares="props.hasPendingShares"
      :can-open-share-dialog="props.canOpenShareDialog"
      @open-document="emits('openDocument', $event)"
      @toggle-document="emits('toggleDocument', $event)"
      @toggle-group-collapse="emits('toggleGroupCollapse', $event)"
      @create-root-document="emits('createRootDocument', $event)"
      @create-child-document="emits('createChildDocument', $event)"
      @move-document-to-team="emits('moveDocumentToTeam', $event)"
      @share-document="emits('openShare', $event)"
      @delete-document="emits('deleteDocument', $event)"
      @open-pending-shares="emits('openPendingShares')"
      @open-permissions-overview="emits('openPermissionsOverview')"
      @open-trash-page="emits('openTrashPage')"
    />

    <RouterView v-slot="{ Component }">
      <component
        :is="Component"
        v-if="Component && props.isDocumentSurface"
        :document="props.previewDocument"
        :mode="props.docsDocumentEditorMode"
        :editable="props.isDocsDocumentEditable"
        :collaboration="props.docsDocumentEditorCollaboration ?? null"
        :active-block-id="props.activeBlockId"
        :is-loading="props.isDocumentItemLoading"
        :pane-state="props.documentPaneState"
        :has-fallback-document="props.hasFallbackDocument"
        @update-title="emits('updateTitle', $event)"
        @update-content="emits('updateContent', $event)"
        @request-comment="emits('requestComment', $event)"
        @create-document="emits('createDocument')"
        @open-fallback-document="emits('openFallbackDocument')"
        @retry-load="emits('retryLoad')"
      />

      <component
        :is="Component"
        v-else-if="Component && props.currentSurface === 'permissions'"
        :tree-groups="props.treeGroups"
        :is-loading="props.isDocumentLoading"
        @open-share="emits('openShare', $event)"
      />

      <component :is="Component" v-else-if="Component" />
    </RouterView>
  </div>
</template>

<style scoped lang="scss">
.docs-view {
  display: flex;
  height: 100%;
  min-height: 0;
}

@media (max-width: 1180px) {
  .docs-view {
    flex-direction: column;
  }
}
</style>
