<script setup lang="ts">
import { onMounted } from 'vue'
import PagePanel from '@/layouts/panels/PagePanel.vue'
import ChatInputBox from './components/ChatInputBox.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import ChatModelBadge from './components/ChatModelBadge.vue'
import ChatModelSettingsDialog from './components/ChatModelSettingsDialog.vue'
import ChatSessionSidebar from './components/ChatSessionSidebar.vue'
import { useChatModels } from './composables/useChatModels'
import { useChatRuntimeConfig } from './composables/useChatRuntimeConfig'
import { useChatSessions } from './composables/useChatSessions'

const { loadRuntimeConfig } = useChatRuntimeConfig()
const { refreshModels } = useChatModels()
const { loadSessions } = useChatSessions()

onMounted(async () => {
  void loadSessions()
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
      <div class="chat-view-context">
        <div class="chat-view-context__actions">
          <ChatModelBadge />
        </div>
      </div>
    </template>

    <div class="chat-view">
      <ChatSessionSidebar />

      <div class="chat-view__conversation">
        <ChatMessageList />
        <ChatInputBox />
      </div>
    </div>

    <ChatModelSettingsDialog />
  </PagePanel>
</template>

<style scoped lang="scss">
.chat-view-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;

  .chat-view-context__actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
}

.chat-view {
  display: flex;
  height: 100%;
  min-height: 0;

  .chat-view__conversation {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
  }
}
</style>
