<script setup lang="ts">
import type { ChatMessage } from '@/apis/chat'
import ChatMarkdownContent from '@/components/chat-markdown/ChatMarkdownContent.vue'
import {
  getAssistantFailureMessage,
  getMessageText,
  getMessageTextPartId,
  getReasoningElapsedMs,
  getReasoningText,
  getToolResultParts,
  isAssistantStreamingMessage,
  shouldShowAssistantCancelled,
  shouldShowAssistantPending,
} from '@/composables/chat/utils/chat-message-display'
import ChatReasoningBlock from './ChatReasoningBlock.vue'
import ChatToolResultBlock from './ChatToolResultBlock.vue'

const props = withDefaults(defineProps<{
  message: ChatMessage
  variant?: 'global' | 'docs'
}>(), {
  variant: 'global',
})
</script>

<template>
  <div class="chat-assistant-message" :class="`chat-assistant-message--${props.variant}`">
    <ChatReasoningBlock
      v-if="getReasoningText(props.message)"
      :text="getReasoningText(props.message)"
      :status="props.message.status"
      :elapsed-ms="getReasoningElapsedMs(props.message)"
      :default-expanded="isAssistantStreamingMessage(props.message)"
    />

    <div v-if="getMessageText(props.message)" class="chat-assistant-message__bubble">
      <ChatMarkdownContent
        :message-id="props.message.id"
        :part-id="getMessageTextPartId(props.message)"
        :source="getMessageText(props.message)"
        :status="props.message.status"
        :is-streaming="isAssistantStreamingMessage(props.message)"
      />
      <span
        v-if="isAssistantStreamingMessage(props.message)"
        class="chat-assistant-message__stream-cursor"
      />
    </div>

    <div v-else-if="shouldShowAssistantPending(props.message)" class="chat-assistant-message__pending">
      正在生成
      <span class="chat-assistant-message__stream-cursor" />
    </div>

    <div v-if="getAssistantFailureMessage(props.message)" class="chat-assistant-message__error">
      {{ getAssistantFailureMessage(props.message) }}
    </div>

    <div v-if="shouldShowAssistantCancelled(props.message)" class="chat-assistant-message__cancelled">
      已停止
    </div>

    <ChatToolResultBlock
      v-for="(part, index) in getToolResultParts(props.message)"
      :key="part.id"
      :message-id="props.message.id"
      :status="props.message.status"
      :part="part"
      :index="index"
    />
  </div>
</template>

<style scoped lang="scss">
.chat-assistant-message {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  min-width: 0;

  &.chat-assistant-message--docs {
    gap: 0.5rem;
    max-width: 100%;
  }
}

.chat-assistant-message__bubble {
  padding: 0.625rem 1rem;
  border-radius: 0.75rem;
  overflow-wrap: break-word;
  color: var(--brand-text-primary);
  background: var(--brand-bg-surface-raised);
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  font-size: 0.875rem;
  line-height: 1.625;

  .chat-assistant-message--docs & {
    max-width: min(18.5rem, 100%);
    padding: 0.5rem 0.75rem;
    border-radius: 0.625rem;
    font-size: 0.8125rem;
    line-height: 1.55;
  }
}

.chat-assistant-message__pending,
.chat-assistant-message__error,
.chat-assistant-message__cancelled {
  font-size: 0.8125rem;
  line-height: 1.5;
}

.chat-assistant-message__pending,
.chat-assistant-message__cancelled {
  color: var(--brand-text-secondary);
}

.chat-assistant-message__error {
  color: var(--el-color-danger);
}

.chat-assistant-message__stream-cursor {
  display: inline-block;
  width: 0.125rem;
  height: 1rem;
  margin-left: 0.125rem;
  vertical-align: text-bottom;
  background: currentColor;
  animation: chat-assistant-message-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;

  .chat-assistant-message--docs & {
    height: 0.9rem;
  }
}

@keyframes chat-assistant-message-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}
</style>
