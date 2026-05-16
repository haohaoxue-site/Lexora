<script setup lang="ts">
import { computed, onMounted } from 'vue'
import PagePanel from '@/layouts/panels/PagePanel.vue'
import { useUiStore } from '@/stores/ui'
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
const { isNewChatRoute, navigateToNewChat } = useChatRouteState()
const uiStore = useUiStore()
const shouldShowChatSidebar = computed(() => uiStore.chatSessionSidebarPinned ?? !isNewChatRoute.value)
const isChatSidebarCollapsed = computed(() => !shouldShowChatSidebar.value)

function setChatSidebarPinned(value: boolean) {
  uiStore.setChatSessionSidebarPinned(value)
}

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
        <ChatModelBadge />

        <div class="chat-view-context__actions">
          <ElButton class="chat-view-context__new-chat-btn" @click="navigateToNewChat">
            <span class="chat-view-context__new-chat-content">
              <SvgIcon category="ui" icon="plus" size="0.875rem" />
              <span>新对话</span>
            </span>
          </ElButton>
        </div>
      </div>
    </template>

    <div class="chat-view">
      <ChatSessionSidebar v-if="!isChatSidebarCollapsed" @collapse="setChatSidebarPinned(false)" />

      <div class="chat-view__conversation">
        <ElButton
          v-if="isChatSidebarCollapsed"
          text
          circle
          size="small"
          class="chat-view__pin-sidebar-btn"
          title="显示对话列表"
          @click="setChatSidebarPinned(true)"
        >
          <SvgIcon category="ui" icon="pin" size="1rem" />
        </ElButton>

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
  justify-content: space-between;
  gap: 1rem;
  width: 100%;

  .chat-view-context__actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .chat-view-context__new-chat-btn {
    height: 2rem;
    padding: 0 0.875rem;
    border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--brand-bg-surface) 82%, transparent);
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 400;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      color 0.2s ease;

    &:hover,
    &:focus-visible {
      border-color: color-mix(in srgb, var(--brand-primary) 28%, var(--brand-border-base));
      background: color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-surface));
      color: var(--brand-primary);
    }

    .chat-view-context__new-chat-content {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }
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
    position: relative;
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
  }

  .chat-view__pin-sidebar-btn {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 2;
    width: 2rem;
    height: 2rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    background: color-mix(in srgb, var(--brand-bg-surface) 88%, transparent);
    color: var(--brand-text-secondary);

    &:hover,
    &:focus-visible {
      border-color: color-mix(in srgb, var(--brand-primary) 28%, var(--brand-border-base));
      background: color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-surface));
      color: var(--brand-primary);
    }
  }
}
</style>
