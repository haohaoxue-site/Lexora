import type { MaybeRefOrGetter } from 'vue'
import type { ChatMessage } from '@/apis/chat'
import type {
  ChatComposerAttachment,
  ChatComposerContentJSON,
  ChatComposerSubmitPayload,
} from '@/components/chat-composer/typing'
import { useClipboard } from '@vueuse/core'
import { computed, shallowRef, toValue, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createEmptyChatComposerContentJSON } from '@/components/chat-composer/serialization'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { getMessageText } from '@/composables/chat/utils/chat-message-display'
import { ElMessage } from '@/utils/element-plus'
import { useChatModelSettings } from './useChatModelSettings'
import { useChatRuntimeOverlay } from './useChatRuntimeOverlay'
import { useChatStream } from './useChatStream'

const EDIT_HIGHLIGHT_DURATION_MS = 1400

export interface UseChatMessageListOptions {
  isReadonly?: MaybeRefOrGetter<boolean>
}

export function useChatMessageList(options: UseChatMessageListOptions = {}) {
  const { t } = useI18n({ useScope: 'global' })
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
  const isReadonly = computed(() => Boolean(toValue(options.isReadonly)))
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
  const assistantName = computed(() => renderSession.value?.agentProfile?.name?.trim() || t('chat.messageList.assistantName'))
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
      ElMessage.warning(t('chat.messageList.noCopyContent'))
      return
    }

    if (!isClipboardSupported.value) {
      ElMessage.error(t('chat.messageList.copyUnsupported'))
      return
    }

    try {
      await copyText(text)
      copiedMessageId.value = message.id
    }
    catch {
      ElMessage.error(t('chat.messageList.copyFailed'))
    }
  }

  function isMessageCopied(message: ChatMessage) {
    return copiedMessage.value && copiedMessageId.value === message.id
  }

  function startEditMessage(message: ChatMessage) {
    if (message.role !== 'user' || isStreaming.value || isReadonly.value) {
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
    if (message.role !== 'user' || isReadonly.value) {
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
    ElMessage.info(t('chat.messageList.uploadPending'))
  }

  async function retryAssistantMessage(message: ChatMessage) {
    if (message.role !== 'assistant' || isStreaming.value || isReadonly.value) {
      return
    }

    await retryMessage(message.id)
  }

  async function switchToBranch(messageId: string | null) {
    if (!messageId || isStreaming.value || isReadonly.value) {
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
