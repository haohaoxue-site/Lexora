<script setup lang="ts">
import type { ChatComposerExposed } from '@/components/chat-composer/typing'
import { nextTick, useTemplateRef, watch } from 'vue'
import ChatComposer from '@/components/chat-composer/ChatComposer.vue'
import DocsChatHeader from '../../components/chat-header'
import DocsChatMessages from '../../components/chat-messages'
import DocsChatRenameDialog from '../../components/chat-rename-dialog'
import { useDocsChatPanel } from '../../composables/useDocsChatPanel'
import { useDocsChatSessions } from '../../composables/useDocsChatSessions'

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
  renderSessionId,
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
  <aside class="docs-chat-panel relative flex w-[var(--panel-docs-chat-width)] min-w-[var(--panel-docs-chat-width)] max-w-[var(--panel-docs-chat-width)] min-h-0 shrink-0 grow-0 flex-col">
    <div class="docs-chat-panel__picker-layer pointer-events-none absolute inset-0 z-[5]" />

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

    <DocsChatMessages :messages="messages" :session-id="renderSessionId" />

    <div class="docs-chat-panel__composer flex-none p-3">
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
  border-left: 1px solid color-mix(in srgb, var(--brand-border-base) 74%, transparent);
  background: color-mix(in srgb, var(--brand-bg-surface) 94%, var(--brand-bg-base));
}

.docs-chat-panel__composer {
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--brand-bg-surface) 70%, transparent) 0%,
      var(--brand-bg-surface) 100%
    );
}
</style>
