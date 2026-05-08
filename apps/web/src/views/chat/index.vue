<script setup lang="ts">
import PagePanel from '@/layouts/panels/PagePanel.vue'
import ChatInputBox from './components/ChatInputBox.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import ChatModelSettingsDialog from './components/ChatModelSettingsDialog.vue'
import ChatSessionSidebar from './components/ChatSessionSidebar.vue'
import { useChat } from './composables/useChat'

const {
  activeSession,
  activeSessionId,
  createSession,
  currentModelLabel,
  deleteSession,
  inputPlaceholder,
  isConfigured,
  isStreaming,
  modelSettingsDialogVisible,
  modelSettingsDraft,
  modelBadgeStateClass,
  openModelSettingsDialog,
  renameSession,
  saveModelSettings,
  sessions,
  selectSession,
  sendMessage,
} = useChat()
</script>

<template>
  <PagePanel>
    <template #header>
      <div class="chat-view-context">
        <div class="chat-view-context__actions">
          <button
            type="button"
            class="chat-view-context__model-badge"
            :class="modelBadgeStateClass"
            @click="openModelSettingsDialog"
          >
            <SvgIcon category="ai" icon="ai-spark" size="1rem" class="chat-view-context__model-icon" />
            <span class="max-w-52 truncate">{{ currentModelLabel }}</span>
          </button>
        </div>
      </div>
    </template>

    <div class="chat-view">
      <ChatSessionSidebar
        :sessions="sessions"
        :active-session-id="activeSessionId"
        @create="createSession"
        @select="selectSession"
        @rename="renameSession"
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

    <ChatModelSettingsDialog
      v-model="modelSettingsDialogVisible"
      v-model:form="modelSettingsDraft"
      @save="saveModelSettings"
    />
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

  .chat-view-context__model-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 9999px;
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.75rem;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      color 0.2s ease;

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

    &:hover {
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      color: var(--brand-primary);
      background: var(--brand-bg-surface);
    }
  }

  .chat-view-context__model-icon {
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
