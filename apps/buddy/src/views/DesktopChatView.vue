<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import DesktopWorkbenchLayout from '@/layouts/DesktopWorkbenchLayout.vue'
import { desktopRouteLocations } from '@/router'
import DesktopChatIndex from '@/workbenches/chat/index/DesktopChatIndex.vue'
import DesktopChatWorkspace from '@/workbenches/chat/workspace/DesktopChatWorkspace.vue'
import DesktopChatWorkspaceHeader from '@/workbenches/chat/workspace/DesktopChatWorkspaceHeader.vue'
import { useConversationSearch } from '@/workbenches/chat/workspace/useConversationSearch'

const router = useRouter()
const {
  capabilities: { chat },
  notificationTargetMessageId,
  shell,
  toggleAppSidebar,
} = useDesktopApp()
const { index: chatIndex, session: chatSession } = chat
const conversationSearch = useConversationSearch({
  activeBranchId: chatSession.activeBranchId,
  activeConversationId: chatSession.activeConversationId,
  loadMessages: chatSession.listActiveConversationMessages,
})
</script>

<template>
  <DesktopWorkbenchLayout>
    <template #sidebar>
      <DesktopChatIndex
        :active-conversation-id="chatSession.activeConversationId.value"
        :app-sidebar-collapsed="shell.appSidebarCollapsed.value"
        :conversations="chatIndex.conversations.value"
        :language="chat.language.value"
        :pinned-items="shell.chatSidebarPinnedItems.value"
        :projects="chatIndex.projects.value"
        @create-project="chatIndex.createProject"
        @delete-conversation="chatIndex.deleteConversation"
        @delete-project="chatIndex.deleteProject"
        @new-global="chatSession.startGlobalConversation"
        @new-project="chatSession.startProjectConversation"
        @open-conversation="chatSession.openConversation"
        @rename-conversation="chatIndex.renameConversation"
        @update-pinned-items="shell.setChatSidebarPinnedItems"
        @toggle-app-sidebar="toggleAppSidebar"
        @update-project="chatIndex.updateProject"
      />
    </template>

    <DesktopChatWorkspaceHeader
      :active-search-index="conversationSearch.activeIndex.value"
      :can-search-conversation="chatSession.activeConversationId.value !== null"
      :conversation-search-loading="conversationSearch.isLoading.value"
      :conversation-search-open="conversationSearch.isOpen.value"
      :conversation-search-query="conversationSearch.query.value"
      :conversation-search-result-count="conversationSearch.resultCount.value"
      :language="chat.language.value"
      :project-name="chatSession.activeProject.value?.name ?? null"
      :title="chatSession.currentTitle.value"
      @close-conversation-search="conversationSearch.close"
      @next-conversation-search-result="conversationSearch.move(1)"
      @open-conversation-search="conversationSearch.open"
      @previous-conversation-search-result="conversationSearch.move(-1)"
      @update-conversation-search="conversationSearch.setQuery"
    />
    <DesktopChatWorkspace
      :active-search-message-id="notificationTargetMessageId ?? conversationSearch.activeMessageId.value"
      :workspace="chat.workspace"
      :matching-search-message-ids="conversationSearch.matchingMessageIds.value"
      @open-settings="router.push(desktopRouteLocations.settings($event))"
    />
  </DesktopWorkbenchLayout>
</template>

<style scoped>
.desktop-chat-page {
  min-height: 0;
  flex: 1;
}
</style>
