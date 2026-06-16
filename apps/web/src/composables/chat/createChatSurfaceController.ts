import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { ChatComposerHostModel } from './createChatComposerHostState'
import type { SendChatComposerMessageInput } from './createChatStreamController'
import type { ChatModelItem } from '@/apis/chat'
import type {
  ChatComposerModelRef,
  ChatComposerModelSelectionKind,
  ChatComposerSubmitPayload,
} from '@/components/chat-composer'
import { computed, toValue } from 'vue'
import { createChatComposerHostState } from './createChatComposerHostState'
import { useChatComposerSkillControls } from './useChatComposerSkillControls'
import { useChatMessageActions } from './useChatMessageActions'

export interface ChatSurfaceSessionPort {
  activeSessionId: MaybeRefOrGetter<string | null | undefined>
}

export interface ChatSurfaceStreamPort {
  isStreaming: MaybeRefOrGetter<boolean>
  retryMessage?: (messageId: string) => Promise<boolean>
  sendMessage: (input: SendChatComposerMessageInput) => Promise<boolean>
  switchBranch?: (messageId: string) => Promise<boolean>
}

export interface ChatSurfaceModelPort extends ChatComposerHostModel {
  composerModelSelectionKind: ComputedRef<ChatComposerModelSelectionKind>
  composerSelectedModel: ComputedRef<ChatModelItem | null>
  composerSelectedModelRef: ComputedRef<ChatComposerModelRef | null>
  isConfigured: ComputedRef<boolean>
  selectComposerModel: (modelRef: ChatComposerModelRef | null) => Promise<boolean>
}

export interface CreateChatSurfaceControllerOptions {
  isReadonly?: MaybeRefOrGetter<boolean>
  model: ChatSurfaceModelPort
  sessions: ChatSurfaceSessionPort
  stream: ChatSurfaceStreamPort
  workspaceId: ComputedRef<string | null | undefined>
}

export function createChatSurfaceController(options: CreateChatSurfaceControllerOptions) {
  const activeSessionId = computed(() => toValue(options.sessions.activeSessionId) ?? null)
  const isReadonly = computed(() => Boolean(toValue(options.isReadonly)))
  const isStreaming = computed(() => Boolean(toValue(options.stream.isStreaming)))
  const composerHost = createChatComposerHostState({
    workspaceId: options.workspaceId,
    model: options.model,
    sendMessage: options.stream.sendMessage,
  })
  const skillControls = useChatComposerSkillControls({
    activeSessionId,
  })
  const messageActions = useChatMessageActions({
    isReadonly,
    isStreaming,
    retryMessage: options.stream.retryMessage,
    switchBranch: options.stream.switchBranch,
  })

  async function handleSend(payload: ChatComposerSubmitPayload) {
    if (isReadonly.value) {
      return false
    }

    const isNewSessionSend = !activeSessionId.value
    const newSessionWebSearchEnabled = skillControls.webSearchForRunEnabled.value
    const sent = await composerHost.handleSend(payload)
    if (!sent) {
      return false
    }

    skillControls.clearTranslatorTargetLanguage()
    if (isNewSessionSend && activeSessionId.value) {
      skillControls.setSessionWebSearchForRunEnabled(activeSessionId.value, newSessionWebSearchEnabled)
      skillControls.resetNewSessionWebSearchForRunEnabled()
    }

    return true
  }

  function resetNewSessionComposerState() {
    composerHost.resetComposer()
    options.model.clearNewSessionModelDraft()
    skillControls.resetNewSessionWebSearchForRunEnabled()
  }

  return {
    composer: {
      attachments: composerHost.attachments,
      composerModelSelectionKind: options.model.composerModelSelectionKind,
      composerSelectedModelRef: options.model.composerSelectedModelRef,
      contentJSON: composerHost.contentJSON,
      handleSend,
      handleUploadAttachmentFiles: composerHost.handleUploadAttachmentFiles,
      handleUploadImageFiles: composerHost.handleUploadImageFiles,
      highlightAttachment: composerHost.highlightAttachment,
      highlightAttachmentId: composerHost.highlightAttachmentId,
      isConfigured: options.model.isConfigured,
      isStreaming,
      loadSkills: skillControls.loadSkills,
      registerBeforeSendHandler: composerHost.registerBeforeSendHandler,
      resetComposer: composerHost.resetComposer,
      resetNewSessionComposerState,
      selectComposerModel: options.model.selectComposerModel,
      translatorSkillEnabled: skillControls.translatorSkillEnabled,
      translatorTargetLanguage: skillControls.translatorTargetLanguage,
      uploadAvailability: composerHost.uploadAvailability,
      webSearchForRunEnabled: skillControls.webSearchForRunEnabled,
      webSearchSkillEnabled: skillControls.webSearchSkillEnabled,
    },
    messages: {
      actions: messageActions,
      isStreaming,
    },
  }
}
