import type { AgentTranslatorTargetLanguage } from '@haohaoxue/lexora-contracts/agent'
import type { MaybeRefOrGetter } from 'vue'
import type { ChatComposerSubmitPayload } from '@/components/chat-composer/typing'
import { computed, onMounted, shallowRef, toValue, watch } from 'vue'
import { createChatComposerHostState } from '@/composables/chat/createChatComposerHostState'
import { useWorkspaceStore } from '@/stores/workspace'
import { useChatModelSettings } from './useChatModelSettings'
import { useChatRuntimeOverlay } from './useChatRuntimeOverlay'
import { useChatSessions } from './useChatSessions'
import { useChatSkillState } from './useChatSkillState'
import { useChatStream } from './useChatStream'

export interface UseChatInputBoxOptions {
  isReadonly?: MaybeRefOrGetter<boolean>
}

export function useChatInputBox(options: UseChatInputBoxOptions = {}) {
  const workspaceStore = useWorkspaceStore()
  const model = useChatModelSettings()
  const { activeSessionId } = useChatSessions()
  const { cancelRunId, isStreaming } = useChatRuntimeOverlay()
  const { loadSkills, translatorSkillEnabled, webSearchSkillEnabled } = useChatSkillState()
  const { cancelActiveRun, sendMessage } = useChatStream()
  const translatorTargetLanguage = shallowRef<AgentTranslatorTargetLanguage | null>(null)
  const newSessionWebSearchForRunEnabled = shallowRef(true)
  const webSearchForRunEnabledBySessionId = shallowRef(new Map<string, boolean>())
  const webSearchForRunEnabled = computed({
    get() {
      const sessionId = activeSessionId.value
      if (!sessionId) {
        return newSessionWebSearchForRunEnabled.value
      }

      return webSearchForRunEnabledBySessionId.value.get(sessionId) ?? true
    },
    set(enabled: boolean) {
      const sessionId = activeSessionId.value
      if (!sessionId) {
        newSessionWebSearchForRunEnabled.value = enabled
        return
      }

      setWebSearchForRunEnabled(sessionId, enabled)
    },
  })
  const isReadonly = computed(() => Boolean(toValue(options.isReadonly)))
  const workspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? null)
  const host = createChatComposerHostState({
    workspaceId,
    model,
    sendMessage,
  })

  onMounted(() => {
    void loadSkills({ silent: true })
  })

  watch(translatorSkillEnabled, (enabled) => {
    if (!enabled) {
      translatorTargetLanguage.value = null
    }
  })

  watch(activeSessionId, (sessionId) => {
    if (!sessionId) {
      newSessionWebSearchForRunEnabled.value = true
    }
  })

  async function handleSend(payload: ChatComposerSubmitPayload) {
    if (isReadonly.value) {
      return false
    }

    const isNewSessionSend = !activeSessionId.value
    const newSessionWebSearchEnabled = newSessionWebSearchForRunEnabled.value
    const sent = await host.handleSend(payload)
    if (sent) {
      translatorTargetLanguage.value = null
      if (isNewSessionSend && activeSessionId.value) {
        setWebSearchForRunEnabled(activeSessionId.value, newSessionWebSearchEnabled)
        newSessionWebSearchForRunEnabled.value = true
      }
    }

    return sent
  }

  function setWebSearchForRunEnabled(sessionId: string, enabled: boolean) {
    const nextValues = new Map(webSearchForRunEnabledBySessionId.value)
    if (enabled) {
      nextValues.delete(sessionId)
    }
    else {
      nextValues.set(sessionId, false)
    }
    webSearchForRunEnabledBySessionId.value = nextValues
  }

  return {
    attachments: host.attachments,
    cancelActiveRun,
    cancelRunId,
    composerModelSelectionKind: model.composerModelSelectionKind,
    composerSelectedModelRef: model.composerSelectedModelRef,
    contentJSON: host.contentJSON,
    handleSend,
    handleUploadAttachmentFiles: host.handleUploadAttachmentFiles,
    handleUploadImageFiles: host.handleUploadImageFiles,
    highlightAttachment: host.highlightAttachment,
    highlightAttachmentId: host.highlightAttachmentId,
    isStreaming,
    selectComposerModel: model.selectComposerModel,
    translatorSkillEnabled,
    translatorTargetLanguage,
    uploadAvailability: host.uploadAvailability,
    webSearchForRunEnabled,
    webSearchSkillEnabled,
  }
}
