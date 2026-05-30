<script setup lang="ts">
import type { ChatMessage } from '@/apis/chat'
import { computed, nextTick, onUpdated, useTemplateRef } from 'vue'
import ChatAssistantMessage from '@/components/chat-message/ChatAssistantMessage.vue'
import ChatUserMessageContent from '@/components/chat-message/ChatUserMessageContent.vue'

const props = defineProps<{
  messages: ChatMessage[]
}>()

const scrollContainerRef = useTemplateRef<HTMLElement>('scrollContainerRef')
const hasMessages = computed(() => props.messages.length > 0)

onUpdated(() => {
  void nextTick(scrollToBottom)
})

function scrollToBottom() {
  if (!scrollContainerRef.value) {
    return
  }

  scrollContainerRef.value.scrollTop = scrollContainerRef.value.scrollHeight
}
</script>

<template>
  <div ref="scrollContainerRef" class="docs-chat-messages">
    <div v-if="!hasMessages" class="docs-chat-messages__empty">
      <div class="docs-chat-messages__empty-title">
        开始新的文档对话
      </div>
      <div class="docs-chat-messages__empty-description">
        可以提问，或用 @ 添加文档上下文。
      </div>
    </div>

    <div v-else class="docs-chat-messages__list">
      <div
        v-for="message in props.messages"
        :key="message.id"
        class="docs-chat-messages__row"
        :class="`is-${message.role}`"
      >
        <div v-if="message.role === 'user'" class="docs-chat-messages__bubble is-user">
          <ChatUserMessageContent :message="message" />
        </div>

        <ChatAssistantMessage v-else :message="message" variant="docs" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.docs-chat-messages {
  flex: 1 1 0%;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem 1rem 0.75rem;
}

.docs-chat-messages__empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 12rem;
  color: var(--brand-text-secondary);
  text-align: center;
}

.docs-chat-messages__empty-title {
  color: var(--brand-text-primary);
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.5rem;
}

.docs-chat-messages__empty-description {
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  line-height: 1.35rem;
}

.docs-chat-messages__list {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.docs-chat-messages__row {
  display: flex;
  min-width: 0;

  &.is-user {
    justify-content: flex-end;
  }

  &.is-assistant {
    justify-content: flex-start;
  }
}

.docs-chat-messages__bubble {
  max-width: min(18.5rem, 100%);
  padding: 0.5rem 0.75rem;
  border-radius: 0.625rem;
  overflow-wrap: break-word;
  font-size: 0.8125rem;
  line-height: 1.55;

  &.is-user {
    color: #fff;
    background: var(--brand-primary);
  }
}
</style>
