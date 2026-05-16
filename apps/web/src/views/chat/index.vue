<script setup lang="ts">
import { onMounted } from 'vue'
import PagePanel from '@/layouts/panels/PagePanel.vue'
import ChatInputBox from './components/ChatInputBox.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import ChatModelBadge from './components/ChatModelBadge.vue'
import ChatModelSettingsDialog from './components/ChatModelSettingsDialog.vue'
import ChatSessionSidebar from './components/ChatSessionSidebar.vue'
import { useChatModels } from './composables/useChatModels'
import { useChatRouteState } from './composables/useChatRouteState'
import { useChatRuntimeConfig } from './composables/useChatRuntimeConfig'
import { useChatSessions } from './composables/useChatSessions'

const { loadRuntimeConfig } = useChatRuntimeConfig()
const { refreshModels } = useChatModels()
const { loadSessions } = useChatSessions()
const { isNewChatRoute } = useChatRouteState()

onMounted(async () => {
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
      <div class="chat-view-context">
        <div class="chat-view-context__actions">
          <ChatModelBadge />
        </div>
      </div>
    </template>

    <div class="chat-view">
      <ChatSessionSidebar />

      <div class="chat-view__conversation">
        <section v-if="isNewChatRoute" class="chat-view-new">
          <div class="chat-view-new__content">
            <h1 class="chat-view-new__title">
              有什么可以帮助你的？
            </h1>
            <ChatInputBox variant="hero" />
          </div>
        </section>

        <template v-else>
          <ChatMessageList />
          <ChatInputBox />
        </template>
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

.chat-view-new {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0%;
  height: 100%;
  min-height: 0;
  padding: 2rem;

  .chat-view-new__content {
    width: min(48rem, 100%);
    transform: translateY(-8vh);
  }

  .chat-view-new__title {
    margin: 0 0 1.5rem;
    color: var(--brand-text-primary);
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 2rem;
    text-align: center;
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
