<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
const isAgentSettingsOpen = ref(false)
const conversationUsage = computed(() => createChatConversationUsageView(
  renderSession.value?.usage,
  renderSession.value?.messages ?? [],
))
const agentProfile = computed(() => renderSession.value?.agentProfile ?? null)

function setChatSidebarPinned(value: boolean) {
  uiStore.setChatSessionSidebarPinned(value)
}

async function refreshChatModelState(options: { silent?: boolean } = {}) {
  const { silent = true } = options
  if (await loadRuntimeConfig({ silent })) {
    await refreshModels({
      silent,
      showSuccessMessage: false,
      skipRuntimeConfigReload: true,
    })
  }
}

onMounted(async () => {
  await workspaceStore.ensurePersonalWorkspace()
  void loadSessions({
    selectFallbackSession: false,
  })
  await refreshChatModelState({ silent: false })
})
</script>

<template>
  <PagePanel>
    <template #header>
      <ChatContextBar
        :conversation-usage="conversationUsage"
        :is-agent-settings-open="isAgentSettingsOpen"
        @toggle-agent-settings="isAgentSettingsOpen = !isAgentSettingsOpen"
        @new-chat="navigateToNewChat"
      />
    </template>

    <ChatWorkspaceLayout
      :is-new-chat-route="isNewChatRoute"
      :is-sidebar-collapsed="isChatSidebarCollapsed"
      :is-agent-settings-open="isAgentSettingsOpen"
      :agent-profile="agentProfile"
      @collapse-sidebar="setChatSidebarPinned(false)"
      @show-sidebar="setChatSidebarPinned(true)"
      @close-agent-settings="isAgentSettingsOpen = false"
      @default-model-updated="refreshChatModelState"
    />
  </PagePanel>
</template>
