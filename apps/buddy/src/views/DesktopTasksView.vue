<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import DesktopWorkbenchLayout from '@/layouts/DesktopWorkbenchLayout.vue'
import { desktopRouteLocations } from '@/router'
import DesktopChatWorkspace from '@/workbenches/chat/workspace/DesktopChatWorkspace.vue'
import DesktopChatWorkspaceHeader from '@/workbenches/chat/workspace/DesktopChatWorkspaceHeader.vue'
import { useConversationSearch } from '@/workbenches/chat/workspace/useConversationSearch'
import DesktopTaskIndex from '@/workbenches/tasks/index/DesktopTaskIndex.vue'

const router = useRouter()
const {
  capabilities: { tasks },
  notificationTargetMessageId,
  shell,
  toggleAppSidebar,
} = useDesktopApp()
const { index: taskIndex, session: taskSession } = tasks
const chatSession = tasks.workspace.session
const conversationSearch = useConversationSearch({
  activeBranchId: chatSession.activeBranchId,
  activeConversationId: chatSession.activeConversationId,
  loadMessages: chatSession.listActiveConversationMessages,
})
</script>

<template>
  <DesktopWorkbenchLayout>
    <template #sidebar>
      <DesktopTaskIndex
        :active-conversation-id="taskSession.activeTaskId.value"
        :app-sidebar-collapsed="shell.appSidebarCollapsed.value"
        :language="tasks.language.value"
        :pinned-items="shell.taskSidebarPinnedItems.value"
        :projects="taskIndex.projects.value"
        :tasks="taskIndex.tasks.value"
        @create-project="taskIndex.createProject"
        @delete-project="taskIndex.deleteProject"
        @delete-task="taskIndex.deleteTask"
        @new-task="taskSession.startTask"
        @open-task="taskSession.openTask"
        @rename-task="taskIndex.renameTask"
        @update-pinned-items="shell.setTaskSidebarPinnedItems"
        @toggle-app-sidebar="toggleAppSidebar"
        @update-project="taskIndex.updateProject"
      />
    </template>

    <DesktopChatWorkspaceHeader
      :active-search-index="conversationSearch.activeIndex.value"
      :can-search-conversation="taskSession.activeTaskId.value !== null"
      :conversation-search-loading="conversationSearch.isLoading.value"
      :conversation-search-open="conversationSearch.isOpen.value"
      :conversation-search-query="conversationSearch.query.value"
      :conversation-search-result-count="conversationSearch.resultCount.value"
      :language="tasks.language.value"
      :project-name="taskSession.activeProject.value?.name ?? null"
      :title="taskSession.currentTitle.value"
      @close-conversation-search="conversationSearch.close"
      @next-conversation-search-result="conversationSearch.move(1)"
      @open-conversation-search="conversationSearch.open"
      @previous-conversation-search-result="conversationSearch.move(-1)"
      @update-conversation-search="conversationSearch.setQuery"
    />
    <DesktopChatWorkspace
      :active-search-message-id="notificationTargetMessageId ?? conversationSearch.activeMessageId.value"
      :workspace="tasks.workspace"
      :matching-search-message-ids="conversationSearch.matchingMessageIds.value"
      @open-settings="router.push(desktopRouteLocations.settings($event))"
    />
  </DesktopWorkbenchLayout>
</template>
