<script setup lang="ts">
import type { ChatComposerExposed } from '@/components/chat-composer/typing'
import { nextTick, useTemplateRef, watch } from 'vue'
import ChatComposer from '@/components/chat-composer/ChatComposer.vue'
import { useDocsChatPanel } from '../composables/useDocsChatPanel'
import { useDocsChatSessions } from '../composables/useDocsChatSessions'
import DocsChatHeader from './DocsChatHeader.vue'
import DocsChatMessages from './DocsChatMessages.vue'
import DocsChatRenameDialog from './DocsChatRenameDialog.vue'

const {
  activeSessionTitle,
  attachments,
  cancelActiveRun,
  composerFocusRequestVersion,
  composerSelectedModelRef,
  confirmDeleteActiveSession,
  contentJSON,
  handlePlaceholderCommand,
  handlePlaceholderUpload,
  handleSend,
  hasActiveSession,
  highlightAttachment,
  highlightAttachmentId,
  isDeleting,
  isRenaming,
  isStreaming,
  loadHistorySessions,
  messages,
  openRenameDialog,
  renameDialogVisible,
  selectComposerModel,
  selectHistorySession,
  startNewSession,
  submitRename,
} = useDocsChatPanel()
const {
  activeSessionId,
  isLoadingSessions,
  sessions,
} = useDocsChatSessions()

const composerRef = useTemplateRef<ChatComposerExposed>('composer')

watch(
  composerFocusRequestVersion,
  async () => {
    await nextTick()
    composerRef.value?.focus()
    window.setTimeout(() => composerRef.value?.focus(), 0)
  },
)
</script>

<template>
  <aside class="docs-chat-panel">
    <div class="docs-chat-panel__picker-layer" />

    <DocsChatHeader
      :title="activeSessionTitle"
      :sessions="sessions"
      :active-session-id="activeSessionId"
      :is-loading-sessions="isLoadingSessions"
      :has-active-session="hasActiveSession"
      :is-deleting="isDeleting"
      @load-history="loadHistorySessions"
      @select-history="selectHistorySession"
      @new-session="startNewSession"
      @rename-session="openRenameDialog"
      @delete-session="confirmDeleteActiveSession"
    />

    <DocsChatMessages :messages="messages" />

    <div class="docs-chat-panel__composer">
      <ChatComposer
        ref="composer"
        v-model:attachments="attachments"
        :content-j-s-o-n="contentJSON"
        :selected-model-ref="composerSelectedModelRef"
        :is-streaming="isStreaming"
        :highlight-attachment-id="highlightAttachmentId"
        document-picker-teleport-to=".docs-chat-panel__picker-layer"
        @update:content-j-s-o-n="contentJSON = $event"
        @send="handleSend"
        @stop="cancelActiveRun"
        @select-model="selectComposerModel"
        @placeholder-upload="handlePlaceholderUpload"
        @placeholder-command="handlePlaceholderCommand"
        @highlight-attachment="highlightAttachment"
      />
    </div>

    <DocsChatRenameDialog
      v-model="renameDialogVisible"
      :title="activeSessionTitle"
      :loading="isRenaming"
      @confirm="submitRename"
    />
  </aside>
</template>

<style scoped lang="scss">
.docs-chat-panel {
  position: relative;
  display: flex;
  flex: 0 0 23rem;
  flex-direction: column;
  width: 23rem;
  min-width: 23rem;
  max-width: 23rem;
  min-height: 0;
  border-left: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
  background: color-mix(in srgb, var(--brand-bg-surface) 96%, var(--brand-bg-body));
}

.docs-chat-panel__picker-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.docs-chat-panel__composer {
  flex: 0 0 auto;
  padding: 0.75rem;
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--brand-bg-surface) 70%, transparent) 0%,
      var(--brand-bg-surface) 100%
    );
}
</style>
