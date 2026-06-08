import { createChatComposerHostState } from '@/composables/chat/createChatComposerHostState'
import { useChatModelSettings } from './useChatModelSettings'
import { useChatRuntimeOverlay } from './useChatRuntimeOverlay'
import { useChatStream } from './useChatStream'

export function useChatInputBox() {
  const model = useChatModelSettings()
  const { cancelRunId, isStreaming } = useChatRuntimeOverlay()
  const { cancelActiveRun, sendMessage } = useChatStream()
  const host = createChatComposerHostState({
    model,
    sendMessage,
  })

  return {
    attachments: host.attachments,
    cancelActiveRun,
    cancelRunId,
    composerModelSelectionKind: model.composerModelSelectionKind,
    composerSelectedModelRef: model.composerSelectedModelRef,
    contentJSON: host.contentJSON,
    handlePlaceholderCommand: host.handlePlaceholderCommand,
    handlePlaceholderUpload: host.handlePlaceholderUpload,
    handleSend: host.handleSend,
    highlightAttachment: host.highlightAttachment,
    highlightAttachmentId: host.highlightAttachmentId,
    isStreaming,
    selectComposerModel: model.selectComposerModel,
  }
}
