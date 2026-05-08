<script setup lang="ts">
import WorkspacePage from '@/layouts/components/WorkspacePage.vue'
import ChatInputBox from './components/ChatInputBox.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import ChatProviderSettingsDialog from './components/ChatProviderSettingsDialog.vue'
import ChatSessionSidebar from './components/ChatSessionSidebar.vue'
import { useChat } from './composables/useChat'

const {
  activeSession,
  activeSessionId,
  createSession,
  currentModelLabel,
  deleteSession,
  dialogVisible,
  draft,
  inputPlaceholder,
  isConfigured,
  isStreaming,
  modelBadgeStateClass,
  openDialog,
  saveSettings,
  sessions,
  selectSession,
  sendMessage,
} = useChat()
</script>

<template>
  <WorkspacePage>
    <template #context>
      <div class="chat-view-context">
        <div class="chat-view-context__copy">
          <div class="chat-view-context__title">
            对话
          </div>
        </div>

        <div class="chat-view-context__actions">
          <div class="chat-view-context__model-badge" :class="modelBadgeStateClass">
            <SvgIcon category="ai" icon="ai-spark" size="1rem" class="chat-view-context__model-icon" />
            <span class="max-w-52 truncate">{{ currentModelLabel }}</span>
          </div>

          <ElButton
            circle
            class="chat-view-context__settings-trigger"
            @click="openDialog"
          >
            <SvgIcon category="ui" icon="settings" size="1.125rem" class="chat-view-context__settings-icon" />
          </ElButton>
        </div>
      </div>
    </template>

    <div class="chat-view">
      <ChatSessionSidebar
        :sessions="sessions"
        :active-session-id="activeSessionId"
        @create="createSession"
        @select="selectSession"
        @delete="deleteSession"
      />

      <div class="chat-view__conversation">
        <ChatMessageList
          :messages="activeSession?.messages ?? []"
          :is-streaming="isStreaming"
          :is-configured="isConfigured"
        />

        <ChatInputBox
          :disabled="isStreaming || !isConfigured"
          :placeholder="inputPlaceholder"
          @send="sendMessage"
        />
      </div>
    </div>

    <ChatProviderSettingsDialog
      v-model="dialogVisible"
      v-model:form="draft"
      @save="saveSettings"
    />
  </WorkspacePage>
</template>

<style scoped lang="scss">
.chat-view-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  .chat-view-context__copy {
    min-width: 0;
  }

  .chat-view-context__title {
    color: var(--brand-text-primary);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 2rem;
  }

  .chat-view-context__actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .chat-view-context__model-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 9999px;
    font-size: 0.75rem;

    &.configured {
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      color: var(--brand-primary);
      background: color-mix(in srgb, var(--brand-primary) 6%, transparent);
    }

    &.idle {
      border-color: color-mix(in srgb, var(--brand-border-base) 80%, transparent);
      color: var(--brand-text-secondary);
      background: var(--brand-bg-surface-raised);
    }
  }

  .chat-view-context__model-icon {
    display: block;
  }

  .chat-view-context__settings-trigger {
    border-color: color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    color: var(--brand-text-secondary);
    background: var(--brand-bg-surface-raised);
    width: 2.5rem;
    height: 2.5rem;

    &:hover {
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      color: var(--brand-primary);
      background: var(--brand-bg-surface);
    }
  }

  .chat-view-context__settings-icon {
    display: block;
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
