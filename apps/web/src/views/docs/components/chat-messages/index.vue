<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { DocsChatMessagesProps } from './typing'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatAssistantAvatar from '@/components/chat-message/ChatAssistantAvatar.vue'
import ChatAssistantMessage from '@/components/chat-message/ChatAssistantMessage.vue'
import ChatUserMessageContent from '@/components/chat-message/ChatUserMessageContent.vue'
import { useDynamicChatVirtualList } from '@/composables/chat/useDynamicChatVirtualList'
import { shouldShowAssistantPending } from '@/composables/chat/utils/chat-message-display'

const props = defineProps<DocsChatMessagesProps>()
const { t } = useI18n()

const scrollContainerRef = useTemplateRef<HTMLElement>('scrollContainerRef')
const hasMessages = computed(() => props.messages.length > 0)
const virtualListKey = computed(() => props.sessionId)
const virtualMessages = computed(() => props.messages)
const {
  handleScroll,
  setItemElement,
  spacerStyle,
  virtualItems,
} = useDynamicChatVirtualList({
  items: virtualMessages,
  listKey: virtualListKey,
  scrollContainerRef,
  estimateSize: 96,
  overscan: 8,
  bottomThreshold: 72,
  getItemKey: message => message.id,
})

function setVirtualItemElement(key: string, element: Element | ComponentPublicInstance | null) {
  setItemElement(key, element instanceof Element ? element : null)
}
</script>

<template>
  <div
    ref="scrollContainerRef"
    class="docs-chat-messages min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-4"
    :data-message-count="props.messages.length"
    @scroll="handleScroll"
  >
    <div v-if="!hasMessages" class="flex min-h-48 flex-col justify-center text-center text-secondary">
      <div class="text-[0.95rem] font-semibold leading-6 text-main">
        {{ t('docs.chat.emptyTitle') }}
      </div>
      <div class="mt-1 text-[13px] leading-[1.35rem]">
        {{ t('docs.chat.emptyDescription') }}
      </div>
    </div>

    <div
      v-else
      class="docs-chat-messages__virtual-space"
      :style="spacerStyle"
    >
      <div
        v-for="virtual in virtualItems"
        :key="virtual.key"
        :ref="element => setVirtualItemElement(virtual.key, element)"
        class="docs-chat-messages__virtual-item"
        :style="virtual.style"
      >
        <div
          class="docs-chat-messages__item flex min-w-0"
          :class="virtual.item.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            v-if="virtual.item.role === 'user'"
            class="max-w-[min(18.5rem,100%)] break-words rounded-lg bg-primary px-3 py-2 text-[13px] leading-[1.55] text-white"
          >
            <ChatUserMessageContent :message="virtual.item" />
          </div>

          <div v-else class="flex min-w-0 max-w-full items-start gap-2">
            <ChatAssistantAvatar
              :pending="shouldShowAssistantPending(virtual.item)"
              size="sm"
              class="mt-0.5 shrink-0"
            />
            <ChatAssistantMessage :message="virtual.item" variant="docs" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.docs-chat-messages {
  overflow-anchor: none;
}

.docs-chat-messages__virtual-item {
  box-sizing: border-box;
  padding-bottom: 0.875rem;
}
</style>
