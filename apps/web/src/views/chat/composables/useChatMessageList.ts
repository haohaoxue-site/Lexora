import type { ChatMessage } from '@/apis/chat'
import type {
  ChatComposerAttachment,
  ChatComposerContentJSON,
  ChatComposerSubmitPayload,
} from '@/components/chat-composer/typing'
import { useClipboard } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import { createEmptyChatComposerContentJSON } from '@/components/chat-composer/serialization'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { getMessageText } from '@/composables/chat/utils/chat-message-display'
import { ElMessage } from '@/utils/element-plus'
import { useChatModelSettings } from './useChatModelSettings'
import { useChatRuntimeOverlay } from './useChatRuntimeOverlay'
import { useChatStream } from './useChatStream'

const EDIT_HIGHLIGHT_DURATION_MS = 1400
const DEFAULT_ASSISTANT_NAME = '小助手'

export function useChatMessageList() {
  const {
    composerModelSelectionKind,
    composerSelectedModelRef,
    isConfigured,
    selectComposerModel,
  } = useChatModelSettings()
  const { renderSession } = useChatRuntimeOverlay()
  const {
    editAndSendMessage,
    isStreaming,
    retryMessage,
    switchBranch,
  } = useChatStream()
  const editingMessageId = shallowRef<string | null>(null)
  const editingContentJSON = shallowRef<ChatComposerContentJSON>(createEmptyChatComposerContentJSON())
  const editingAttachments = shallowRef<ChatComposerAttachment[]>([])
  const editingHighlightAttachmentId = shallowRef<string | null>(null)
  const copiedMessageId = shallowRef<string | null>(null)
  let editingHighlightTimer: ReturnType<typeof setTimeout> | null = null
  const {
    copy: copyText,
    copied: copiedMessage,
    isSupported: isClipboardSupported,
  } = useClipboard({
    copiedDuring: 1400,
    legacy: true,
  })

  const messages = computed<ChatMessage[]>(() => renderSession.value?.messages ?? [])
  const listKey = computed(() => renderSession.value?.id ?? null)
  const assistantName = computed(() => renderSession.value?.agentProfile?.name?.trim() || DEFAULT_ASSISTANT_NAME)
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

  watch(copiedMessage, (copied) => {
    if (!copied) {
      copiedMessageId.value = null
    }
  })

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
    editingContentJSON.value = cloneContentJSON(message.metadata.contentJSON)
    editingAttachments.value = message.metadata.attachments.map(attachment => ({ ...attachment }))
    editingHighlightAttachmentId.value = null
  }

  function cancelEditMessage() {
    editingMessageId.value = null
    editingContentJSON.value = createEmptyChatComposerContentJSON()
    editingAttachments.value = []
    editingHighlightAttachmentId.value = null
  }

  async function submitEditMessage(message: ChatMessage, payload: ChatComposerSubmitPayload) {
    if (message.role !== 'user') {
      return
    }

    if (await editAndSendMessage(message.id, payload)) {
      cancelEditMessage()
    }
  }

  function highlightEditingAttachment(attachmentId: string) {
    editingHighlightAttachmentId.value = attachmentId
    if (editingHighlightTimer) {
      clearTimeout(editingHighlightTimer)
    }
    editingHighlightTimer = setTimeout(() => {
      if (editingHighlightAttachmentId.value === attachmentId) {
        editingHighlightAttachmentId.value = null
      }
    }, EDIT_HIGHLIGHT_DURATION_MS)
  }

  function handleEditPlaceholderUpload() {
    ElMessage.info('文件上传入口待接入')
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
    assistantName,
    cancelEditMessage,
    composerModelSelectionKind,
    composerSelectedModelRef,
    copyMessage,
    editingAttachments,
    editingContentJSON,
    editingHighlightAttachmentId,
    emptyIcon,
    emptyIconStateClass,
    getMessageRoleClass,
    getMessageText,
    handleEditPlaceholderUpload,
    highlightEditingAttachment,
    isEditingMessage,
    isMessageCopied,
    isConfigured,
    isStreaming,
    listKey,
    messages,
    retryAssistantMessage,
    selectComposerModel,
    startEditMessage,
    submitEditMessage,
    switchToBranch,
  }
}

function cloneContentJSON(contentJSON: ChatComposerContentJSON): ChatComposerContentJSON {
  return JSON.parse(JSON.stringify(contentJSON)) as ChatComposerContentJSON
}
