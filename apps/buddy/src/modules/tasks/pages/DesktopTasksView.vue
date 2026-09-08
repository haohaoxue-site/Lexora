<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskContext } from '@/modules/tasks/taskContext'
import DesktopTaskSpaceSelector from '@/modules/tasks/widgets/composer/DesktopTaskSpaceSelector.vue'
import DesktopTaskContextPanel from '@/modules/tasks/widgets/context-panel/DesktopTaskContextPanel.vue'
import { useTaskResourcePanel } from '@/modules/tasks/widgets/context-panel/useTaskResourcePanel'
import DesktopTaskIndex from '@/modules/tasks/widgets/task-index/DesktopTaskIndex.vue'
import DesktopChatWorkspace from '@/modules/tasks/widgets/workspace/DesktopChatWorkspace.vue'
import DesktopChatWorkspaceHeader from '@/modules/tasks/widgets/workspace/DesktopChatWorkspaceHeader.vue'
import { useConversationSearch } from '@/modules/tasks/widgets/workspace/useConversationSearch'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import DesktopWorkbenchLayout from '@/shared/ui/workbench-layout/DesktopWorkbenchLayout.vue'

const router = useRouter()
const {
  browser,
  tasks,
  notificationTargetMessageId,
  appSidebarCollapsed,
} = useTaskContext()
const { language, workspace } = tasks
const { pinnedItems, spaces, tasks: taskItems, ...indexActions } = tasks.index
const { activeSpace, activeTaskId, currentTitle, openTask, startTask } = tasks.session
const { getChangeSet, readArtifactText } = workspace.context
const chatSession = workspace.session
const taskSidebarCollapsed = shallowRef(false)
const {
  activeTab,
  artifactCount,
  isOpen: contextOpen,
  tabs: contextTabs,
  ...contextActions
} = useTaskResourcePanel({
  activeConversationId: workspace.session.activeConversationId,
  activeRunId: computed(() => workspace.execution.activeRun.value?.id ?? null),
  browser,
  changeSets: workspace.transcript.changeSets,
  runSignalEvents: workspace.transcript.runSignalEvents,
  runOutputs: workspace.transcript.runOutputs,
})
const {
  activeIndex: activeSearchIndex,
  activeMessageId: activeSearchMessageId,
  isLoading: searchLoading,
  isOpen: searchOpen,
  matchingMessageIds,
  query: searchQuery,
  resultCount: searchResultCount,
  ...searchActions
} = useConversationSearch({
  activeBranchId: chatSession.activeBranchId,
  activeConversationId: chatSession.activeConversationId,
  loadMessages: chatSession.listActiveConversationMessages,
})
</script>

<template>
  <DesktopWorkbenchLayout
    v-model:sidebar-collapsed="taskSidebarCollapsed"
    :language="language"
    sidebar-collapsible
    sidebar-resizable
  >
    <template #sidebar>
      <DesktopTaskIndex
        :active-conversation-id="activeTaskId"
        :app-sidebar-collapsed="appSidebarCollapsed"
        :language="language"
        :pinned-items="pinnedItems"
        :spaces="spaces"
        :select-space-directory="indexActions.selectSpaceDirectory"
        :tasks="taskItems"
        :create-space="indexActions.createSpace"
        :update-space="indexActions.updateSpace"
        @delete-space="indexActions.deleteSpace"
        @delete-task="indexActions.deleteTask"
        @new-task="startTask"
        @open-task="openTask"
        @rename-task="indexActions.renameTask"
        @update-pinned-items="indexActions.setPinnedItems"
      />
    </template>

    <DesktopChatWorkspaceHeader
      :active-search-index="activeSearchIndex"
      :artifact-count="artifactCount"
      :can-open-context="activeTaskId !== null"
      :can-search-conversation="activeTaskId !== null"
      :conversation-search-loading="searchLoading"
      :conversation-search-open="searchOpen"
      :conversation-search-query="searchQuery"
      :conversation-search-result-count="searchResultCount"
      :context-open="contextOpen"
      :language="language"
      :title="currentTitle"
      @close-conversation-search="searchActions.close"
      @next-conversation-search-result="searchActions.move(1)"
      @open-conversation-search="searchActions.open"
      @previous-conversation-search-result="searchActions.move(-1)"
      @toggle-context="contextActions.toggle"
      @update-conversation-search="searchActions.setQuery"
    />
    <DesktopChatWorkspace
      :active-search-message-id="notificationTargetMessageId ?? activeSearchMessageId"
      :workspace="workspace"
      :matching-search-message-ids="matchingMessageIds"
      @open-settings="router.push(desktopRouteLocations.settings($event))"
      @open-artifact="contextActions.openArtifact"
      @open-changes="contextActions.openChanges"
    >
      <template v-if="activeTaskId === null" #composerLeadingContext>
        <DesktopTaskSpaceSelector
          :active-space="activeSpace"
          :language="language"
          :spaces="spaces"
          :select-directory="indexActions.selectSpaceDirectory"
          :create-space="indexActions.createSpace"
          @select-space="startTask"
        />
      </template>
    </DesktopChatWorkspace>

    <template v-if="contextOpen" #context>
      <DesktopTaskContextPanel
        :active-tab="activeTab"
        :get-change-set="getChangeSet"
        :language="language"
        :read-artifact-text="readArtifactText"
        :tabs="contextTabs"
        @close-tab="contextActions.closeTab"
        @collapse="contextActions.toggle"
        @open-browser="contextActions.openBrowser"
        @select-tab="contextActions.selectTab"
      />
    </template>
  </DesktopWorkbenchLayout>
</template>
