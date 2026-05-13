import type { Ref } from 'vue'
import type { ChatMessage } from '@/apis/chat'
import { useClipboard } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, nextTick, onUpdated, shallowRef, watch } from 'vue'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import {
  getAssistantFailureMessage,
  getMessageText,
  getReasoningElapsedMs,
  getReasoningText,
  isAssistantStreamingMessage,
  shouldShowAssistantCancelled,
  shouldShowAssistantPending,
} from '../utils/chat-message-display'
import { useChatModelSettings } from './useChatModelSettings'
import { useChatRuntimeOverlay } from './useChatRuntimeOverlay'
import { useChatStream } from './useChatStream'

export function useChatMessageList(options: {
  scrollContainerRef: Ref<HTMLElement | null>
}) {
  const { isConfigured } = useChatModelSettings()
  const { renderSession } = useChatRuntimeOverlay()
  const {
    editAndSendMessage,
    isStreaming,
    retryMessage,
    switchBranch,
  } = useChatStream()
  const editingMessageId = shallowRef<string | null>(null)
  const editingContent = shallowRef('')
  const copiedMessageId = shallowRef<string | null>(null)
  const {
    copy: copyText,
    copied: copiedMessage,
    isSupported: isClipboardSupported,
  } = useClipboard({
    copiedDuring: 1400,
    legacy: true,
  })

  const messages = computed<ChatMessage[]>(() => renderSession.value?.messages ?? [])
  const emptyIconStateClass = computed(() => isConfigured.value ? 'configured' : 'idle')
  const emptyIcon = computed(() => isConfigured.value
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

  watch(copiedMessage, (copied) => {
    if (!copied) {
      copiedMessageId.value = null
    }
  })

  function scrollToBottom() {
    if (options.scrollContainerRef.value) {
      options.scrollContainerRef.value.scrollTop = options.scrollContainerRef.value.scrollHeight
    }
  }

  function getMessageRoleClass(role: ChatMessage['role']) {
    return role === 'user' ? 'user' : 'assistant'
  }

  async function copyMessage(message: ChatMessage) {
    const text = getMessageText(message)
    if (!text) {
      ElMessage.warning('没有可复制的内容')
      return
    }

    if (!isClipboardSupported.value) {
      ElMessage.error('当前环境不支持复制')
      return
    }

    try {
      await copyText(text)
      copiedMessageId.value = message.id
    }
    catch {
      ElMessage.error('复制失败')
    }
  }

  function isMessageCopied(message: ChatMessage) {
    return copiedMessage.value && copiedMessageId.value === message.id
  }

  function startEditMessage(message: ChatMessage) {
    if (message.role !== 'user' || isStreaming.value) {
      return
    }

    editingMessageId.value = message.id
    editingContent.value = getMessageText(message)
  }

  function cancelEditMessage() {
    editingMessageId.value = null
    editingContent.value = ''
  }

  async function submitEditMessage(message: ChatMessage) {
    if (message.role !== 'user' || !editingContent.value.trim()) {
      return
    }

    if (await editAndSendMessage(message.id, editingContent.value)) {
      cancelEditMessage()
    }
  }

  async function retryAssistantMessage(message: ChatMessage) {
    if (message.role !== 'assistant' || isStreaming.value) {
      return
    }

    await retryMessage(message.id)
  }

  async function switchToBranch(messageId: string | null) {
    if (!messageId || isStreaming.value) {
      return
    }

    await switchBranch(messageId)
  }

  function isEditingMessage(message: ChatMessage) {
    return editingMessageId.value === message.id
  }

  return {
    cancelEditMessage,
    copyMessage,
    editingContent,
    emptyIcon,
    emptyIconStateClass,
    getAssistantFailureMessage,
    getMessageRoleClass,
    getMessageText,
    getReasoningElapsedMs,
    getReasoningText,
    isEditingMessage,
    isMessageCopied,
    isAssistantStreamingMessage,
    isConfigured,
    isStreaming,
    messages,
    retryAssistantMessage,
    shouldShowAssistantCancelled,
    shouldShowAssistantPending,
    startEditMessage,
    submitEditMessage,
    switchToBranch,
  }
}
