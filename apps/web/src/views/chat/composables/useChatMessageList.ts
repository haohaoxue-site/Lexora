import type { Ref } from 'vue'
import type { ChatMessageListProps } from '../typing'
import { computed, nextTick, onUpdated } from 'vue'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import {
  getAssistantFailureMessage,
  getMessageText,
  getReasoningElapsedMs,
  getReasoningText,
  isAssistantStreamingMessage,
  shouldShowAssistantPending,
} from '../utils/chat-message-display'

export function useChatMessageList(
  props: ChatMessageListProps,
  options: {
    scrollContainerRef: Ref<HTMLElement | null>
  },
) {
  const emptyIconStateClass = computed(() => props.isConfigured ? 'configured' : 'idle')
  const emptyIcon = computed(() => props.isConfigured
    ? {
        category: SvgIconCategory.NAV,
        icon: 'chat-active',
      }
    : {
        category: SvgIconCategory.AI,
        icon: 'ai-spark',
      })

  onUpdated(() => {
    void nextTick(scrollToBottom)
  })

  function scrollToBottom() {
    if (options.scrollContainerRef.value) {
      options.scrollContainerRef.value.scrollTop = options.scrollContainerRef.value.scrollHeight
    }
  }

  function getMessageRoleClass(role: ChatMessageListProps['messages'][number]['role']) {
    return role === 'user' ? 'user' : 'assistant'
  }

  return {
    emptyIcon,
    emptyIconStateClass,
    getAssistantFailureMessage,
    getMessageRoleClass,
    getMessageText,
    getReasoningElapsedMs,
    getReasoningText,
    isAssistantStreamingMessage,
    shouldShowAssistantPending,
  }
}
