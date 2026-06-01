<script setup lang="ts">
import type { DocsChatMessagesProps } from './typing'
import { computed, nextTick, onUpdated, useTemplateRef } from 'vue'
import ChatAssistantMessage from '@/components/chat-message/ChatAssistantMessage.vue'
import ChatUserMessageContent from '@/components/chat-message/ChatUserMessageContent.vue'

const props = defineProps<DocsChatMessagesProps>()

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
  <div ref="scrollContainerRef" class="docs-chat-messages min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-4">
    <div v-if="!hasMessages" class="flex min-h-48 flex-col justify-center text-center text-secondary">
      <div class="text-[0.95rem] font-semibold leading-6 text-main">
        开始新的文档对话
      </div>
      <div class="mt-1 text-[0.8125rem] leading-[1.35rem]">
        可以提问，或用 @ 添加文档上下文。
      </div>
    </div>

    <div v-else class="flex flex-col gap-3.5">
      <div
        v-for="message in props.messages"
        :key="message.id"
        class="flex min-w-0"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          v-if="message.role === 'user'"
          class="max-w-[min(18.5rem,100%)] break-words rounded-[0.625rem] bg-primary px-3 py-2 text-[0.8125rem] leading-[1.55] text-white"
        >
          <ChatUserMessageContent :message="message" />
        </div>

        <ChatAssistantMessage v-else :message="message" variant="docs" />
      </div>
    </div>
  </div>
</template>
