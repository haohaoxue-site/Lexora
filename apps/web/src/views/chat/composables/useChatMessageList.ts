import type { Ref } from 'vue'
import type { ChatMessageListProps } from '../typing'
import { computed, nextTick, onUpdated } from 'vue'
import { SvgIconCategory } from '@/components/svg-icon/typing'

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
        category: SvgIconCategory.UI,
        icon: 'settings',
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
    getMessageRoleClass,
  }
}
