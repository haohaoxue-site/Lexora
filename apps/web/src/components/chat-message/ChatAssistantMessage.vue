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

    <div
      v-else-if="shouldShowAssistantPending(props.message)"
      class="chat-assistant-message__pending"
      aria-live="polite"
    >
      <span class="chat-assistant-message__pending-status">
        <span class="chat-assistant-message__pending-label">正在思考</span>
        <span class="chat-assistant-message__thinking-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </span>
      <span class="chat-assistant-message__thinking-wave" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
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

.chat-assistant-message__pending {
  display: inline-flex;
  width: fit-content;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.0625rem;
  min-height: 1.875rem;

  .chat-assistant-message--docs & {
    gap: 0;
    min-height: 1.6875rem;
  }
}

.chat-assistant-message__pending-status {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.chat-assistant-message__pending-label {
  font-weight: 500;
  color: color-mix(in srgb, var(--brand-text-secondary) 88%, var(--brand-text-primary));
}

.chat-assistant-message__thinking-dots {
  display: inline-flex;
  align-items: center;
  gap: 0.1875rem;
  width: 1rem;

  span {
    width: 0.21875rem;
    height: 0.21875rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-primary) 82%, var(--brand-text-secondary));
    opacity: 0.35;
    transform: translateY(0);
    animation: chat-assistant-message-dot 1.24s ease-in-out infinite;

    &:nth-child(2) {
      background: color-mix(in srgb, var(--brand-primary) 62%, var(--brand-warning));
      animation-delay: 0.14s;
    }

    &:nth-child(3) {
      animation-delay: 0.28s;
    }
  }
}

.chat-assistant-message__thinking-wave {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  height: 0.625rem;
  margin-left: 0.0625rem;

  .chat-assistant-message--docs & {
    height: 0.5625rem;
  }

  span {
    width: 0.125rem;
    height: 0.375rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-primary) 58%, transparent);
    transform-origin: center;
    animation: chat-assistant-message-wave 1.08s ease-in-out infinite;

    &:nth-child(2) {
      height: 0.625rem;
      background: color-mix(in srgb, var(--brand-primary) 74%, transparent);
      animation-delay: 0.12s;
    }

    &:nth-child(3) {
      height: 0.5rem;
      background: color-mix(in srgb, var(--brand-warning) 54%, var(--brand-primary));
      animation-delay: 0.24s;
    }

    &:nth-child(4) {
      height: 0.3125rem;
      animation-delay: 0.36s;
    }
  }
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

@keyframes chat-assistant-message-dot {
  0%,
  68%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  34% {
    opacity: 0.9;
    transform: translateY(-0.1875rem);
  }
}

@keyframes chat-assistant-message-wave {
  0%,
  100% {
    opacity: 0.45;
    transform: scaleY(0.72);
  }

  50% {
    opacity: 0.95;
    transform: scaleY(1.16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-assistant-message__stream-cursor,
  .chat-assistant-message__thinking-dots span,
  .chat-assistant-message__thinking-wave span {
    animation: none;
  }
}
</style>
