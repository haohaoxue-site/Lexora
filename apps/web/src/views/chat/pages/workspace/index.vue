<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useChatModels } from '@/composables/chat/useChatModels'
import { useChatRuntimeConfig } from '@/composables/chat/useChatRuntimeConfig'
import PagePanel from '@/layouts/panels/page-panel'
import { useUiStore } from '@/stores/ui'
import { useWorkspaceStore } from '@/stores/workspace'
import { useChatRouteState } from '../../composables/useChatRouteState'
import { useChatRuntimeOverlay } from '../../composables/useChatRuntimeOverlay'
import { useChatSessions } from '../../composables/useChatSessions'
import ChatContextBar from '../../layouts/context-bar'
import ChatWorkspaceLayout from '../../layouts/workspace'
import { createChatConversationUsageView } from '../../utils/chat-usage-display'

const { loadRuntimeConfig } = useChatRuntimeConfig()
const { refreshModels } = useChatModels()
const { loadSessions } = useChatSessions()
const { renderSession } = useChatRuntimeOverlay()
const { isNewChatRoute, navigateToNewChat } = useChatRouteState()
const uiStore = useUiStore()
const workspaceStore = useWorkspaceStore()
const shouldShowChatSidebar = computed(() => uiStore.chatSessionSidebarPinned ?? !isNewChatRoute.value)
const isChatSidebarCollapsed = computed(() => !shouldShowChatSidebar.value)
const conversationUsage = computed(() => createChatConversationUsageView(
  renderSession.value?.usage,
  renderSession.value?.messages ?? [],
))

function setChatSidebarPinned(value: boolean) {
  uiStore.setChatSessionSidebarPinned(value)
}

onMounted(async () => {
  await workspaceStore.ensurePersonalWorkspace()
  void loadSessions({
    selectFallbackSession: false,
  })
  if (await loadRuntimeConfig()) {
    await refreshModels({
      silent: true,
      showSuccessMessage: false,
      skipRuntimeConfigReload: true,
    })
  }
})
</script>

<template>
  <PagePanel>
    <template #header>
      <ChatContextBar
        :conversation-usage="conversationUsage"
        @new-chat="navigateToNewChat"
      />
    </template>

    <ChatWorkspaceLayout
      :is-new-chat-route="isNewChatRoute"
      :is-sidebar-collapsed="isChatSidebarCollapsed"
      @collapse-sidebar="setChatSidebarPinned(false)"
      @show-sidebar="setChatSidebarPinned(true)"
    />
  </PagePanel>
</template>
