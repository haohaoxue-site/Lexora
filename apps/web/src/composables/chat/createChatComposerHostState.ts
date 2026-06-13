import type { ComputedRef } from 'vue'
import type { SendChatComposerMessageInput } from './createChatStreamController'
import type {
  ChatComposerAttachment,
  ChatComposerContentJSON,
  ChatComposerModelRef,
  ChatComposerModelSelectionKind,
  ChatComposerSubmitPayload,
} from '@/components/chat-composer/typing'
import { shallowRef } from 'vue'
import { createEmptyChatComposerContentJSON } from '@/components/chat-composer/serialization'
import { translate } from '@/i18n'
import { ElMessage } from '@/utils/element-plus'

const HIGHLIGHT_DURATION_MS = 1400

export type ChatComposerBeforeSendHandler = (payload: ChatComposerSubmitPayload) => ChatComposerSubmitPayload

export interface ChatComposerHostModel {
  composerSelectedModelRef: ComputedRef<ChatComposerModelRef | null>
  composerModelSelectionKind?: ComputedRef<ChatComposerModelSelectionKind>
  shouldPersistComposerModelRef?: ComputedRef<boolean>
  clearNewSessionModelDraft: () => void
}

export type ChatComposerHostState = ReturnType<typeof createChatComposerHostState>

export function createChatComposerHostState(options: {
  model: ChatComposerHostModel
  sendMessage: (input: SendChatComposerMessageInput) => Promise<boolean>
}) {
  const contentJSON = shallowRef<ChatComposerContentJSON>(createEmptyChatComposerContentJSON())
  const attachments = shallowRef<ChatComposerAttachment[]>([])
  const highlightAttachmentId = shallowRef<string | null>(null)
  const beforeSendHandlers = new Set<ChatComposerBeforeSendHandler>()
  let highlightTimer: ReturnType<typeof setTimeout> | null = null

  function resetComposer() {
    contentJSON.value = createEmptyChatComposerContentJSON()
    attachments.value = []
    highlightAttachmentId.value = null
  }

  function registerBeforeSendHandler(handler: ChatComposerBeforeSendHandler) {
    beforeSendHandlers.add(handler)

    return () => beforeSendHandlers.delete(handler)
  }

  function applyBeforeSendHandlers(payload: ChatComposerSubmitPayload) {
    let nextPayload = payload

    for (const handler of beforeSendHandlers) {
      nextPayload = handler(nextPayload)
    }

    return nextPayload
  }

  async function handleSend(payload: ChatComposerSubmitPayload) {
    const modelRef = normalizeSelectedModelRef(options.model.composerSelectedModelRef.value)
    if (!modelRef) {
      ElMessage.warning(translate('chat.composer.selectModel'))
      return false
    }

    const nextPayload = applyBeforeSendHandlers(payload)
    const sent = await options.sendMessage({
      ...nextPayload,
      modelRef: shouldPersistComposerModel(options.model) ? modelRef : undefined,
    })
    if (!sent) {
      return false
    }

    resetComposer()
    options.model.clearNewSessionModelDraft()
    return true
  }

  function handlePlaceholderUpload() {
    ElMessage.info(translate('chat.composer.placeholderUpload'))
  }

  function highlightAttachment(attachmentId: string) {
    highlightAttachmentId.value = attachmentId
    if (highlightTimer) {
      clearTimeout(highlightTimer)
    }
    highlightTimer = setTimeout(() => {
      if (highlightAttachmentId.value === attachmentId) {
        highlightAttachmentId.value = null
      }
    }, HIGHLIGHT_DURATION_MS)
  }

  return {
    attachments,
    contentJSON,
    handlePlaceholderUpload,
    handleSend,
    highlightAttachment,
    highlightAttachmentId,
    registerBeforeSendHandler,
    resetComposer,
  }
}

function shouldPersistComposerModel(model: ChatComposerHostModel) {
  const explicitValue = model.shouldPersistComposerModelRef?.value
  if (explicitValue !== undefined) {
    return explicitValue
  }

  const selectionKind = model.composerModelSelectionKind?.value
  return selectionKind === 'draft' || selectionKind === 'override'
}

function normalizeSelectedModelRef(modelRef: ChatComposerModelRef | null) {
  const providerId = modelRef?.providerId.trim() ?? ''
  const modelId = modelRef?.modelId.trim() ?? ''

  if (!providerId || !modelId) {
    return null
  }

  return {
    providerId,
    modelId,
  }
}
