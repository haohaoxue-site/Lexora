<script setup lang="ts">
import type { ChatMessageListProps } from '../typing'
import { useTemplateRef } from 'vue'
import { useChatMessageList } from '../composables/useChatMessageList'
import ChatReasoningBlock from './ChatReasoningBlock.vue'

const props = defineProps<ChatMessageListProps>()
const scrollContainerRef = useTemplateRef<HTMLElement>('scrollContainerRef')
const {
  emptyIcon,
  emptyIconStateClass,
  getAssistantFailureMessage,
  getMessageRoleClass,
  getMessageText,
  getReasoningElapsedMs,
  getReasoningText,
  isAssistantStreamingMessage,
  shouldShowAssistantPending,
} = useChatMessageList(props, {
  scrollContainerRef,
})
</script>

<template>
  <div ref="scrollContainerRef" class="chat-message-list flex-1 overflow-y-auto px-6 py-4">
    <div v-if="props.messages.length === 0" class="flex h-full items-center justify-center">
      <div class="text-center">
        <div class="chat-message-list__empty-icon" :class="emptyIconStateClass">
          <SvgIcon
            :category="emptyIcon.category"
            :icon="emptyIcon.icon"
            size="2.5rem"
            class="chat-message-list__empty-icon-image"
          />
        </div>
        <div class="text-lg text-secondary">
          {{ props.isConfigured ? '有什么可以帮助你的？' : '还不能开始对话' }}
        </div>
        <div v-if="props.isConfigured" class="mt-1 text-sm text-secondary-a60">
          输入消息开始对话
        </div>
        <div v-else class="mt-1 text-sm text-secondary-a60">
          请先
          <RouterLink to="/settings/models-default" class="chat-message-list__default-model-link">
            选择模型
          </RouterLink>
          ，或等待 AI 服务准备完成
        </div>
      </div>
    </div>

    <div v-else class="mx-auto max-w-3xl space-y-4">
      <div
        v-for="msg in props.messages"
        :key="msg.id"
        class="chat-message-list__row"
        :class="getMessageRoleClass(msg.role)"
      >
        <div v-if="msg.role === 'assistant'" class="chat-message-list__assistant-avatar">
          <SvgIcon category="ai" icon="ai-spark" size="1rem" class="chat-message-list__assistant-avatar-icon" />
        </div>

        <div v-if="msg.role === 'assistant'" class="chat-message-list__assistant-content">
          <ChatReasoningBlock
            v-if="getReasoningText(msg)"
            :text="getReasoningText(msg)"
            :status="msg.status"
            :elapsed-ms="getReasoningElapsedMs(msg)"
            :default-expanded="isAssistantStreamingMessage(msg)"
          />

          <div v-if="getMessageText(msg)" class="chat-message-list__bubble assistant">
            {{ getMessageText(msg) }}
            <span
              v-if="isAssistantStreamingMessage(msg)"
              class="chat-message-list__stream-cursor"
            />
          </div>

          <div v-else-if="shouldShowAssistantPending(msg)" class="chat-message-list__pending">
            正在生成
            <span class="chat-message-list__stream-cursor" />
          </div>

          <div v-if="getAssistantFailureMessage(msg)" class="chat-message-list__error">
            {{ getAssistantFailureMessage(msg) }}
          </div>
        </div>

        <div v-else class="chat-message-list__bubble user">
          {{ getMessageText(msg) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-message-list {
  .chat-message-list__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4.5rem;
    height: 4.5rem;
    margin: 0 auto 1rem;
    border-radius: 1.5rem;

    &.configured {
      background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
    }

    &.idle {
      background: color-mix(in srgb, var(--brand-border-base) 18%, transparent);
    }
  }

  .chat-message-list__empty-icon-image {
    display: block;
  }

  .chat-message-list__default-model-link {
    color: currentColor;
    text-decoration-line: underline;
    text-underline-offset: 0.18em;

    &:hover {
      color: var(--brand-primary);
    }
  }

  .chat-message-list__row {
    display: flex;
    gap: 0.75rem;

    &.user {
      justify-content: flex-end;
    }

    &.assistant {
      justify-content: flex-start;
    }
  }

  .chat-message-list__assistant-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    margin-top: 0.25rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  }

  .chat-message-list__assistant-avatar-icon {
    display: block;
  }

  .chat-message-list__assistant-content {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    max-width: 80%;
  }

  .chat-message-list__bubble {
    padding: 0.625rem 1rem;
    border-radius: 0.75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.875rem;
    line-height: 1.625;

    &.user {
      max-width: 80%;
      color: #fff;
      background: var(--brand-primary);
    }

    &.assistant {
      color: var(--brand-text-primary);
      background: var(--brand-bg-surface-raised);
      border: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
    }
  }

  .chat-message-list__pending,
  .chat-message-list__error {
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .chat-message-list__pending {
    color: var(--brand-text-secondary);
  }

  .chat-message-list__error {
    color: var(--el-color-danger);
  }

  .chat-message-list__stream-cursor {
    display: inline-block;
    width: 0.125rem;
    height: 1rem;
    margin-left: 0.125rem;
    vertical-align: text-bottom;
    background: currentColor;
    animation: chat-message-list-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
}

@keyframes chat-message-list-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}
</style>
