import type { AgentTranslatorTargetLanguage } from '@haohaoxue/samepage-contracts/agent'
import type { ChatComposerSubmitPayload } from '@/components/chat-composer/typing'
import { onMounted, shallowRef, watch } from 'vue'
import { createChatComposerHostState } from '@/composables/chat/createChatComposerHostState'
import { useChatModelSettings } from './useChatModelSettings'
import { useChatRuntimeOverlay } from './useChatRuntimeOverlay'
import { useChatSkillState } from './useChatSkillState'
import { useChatStream } from './useChatStream'

export function useChatInputBox() {
  const model = useChatModelSettings()
  const { cancelRunId, isStreaming } = useChatRuntimeOverlay()
  const { loadSkills, translatorSkillEnabled } = useChatSkillState()
  const { cancelActiveRun, sendMessage } = useChatStream()
  const translatorTargetLanguage = shallowRef<AgentTranslatorTargetLanguage | null>(null)
  const host = createChatComposerHostState({
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

  async function handleSend(payload: ChatComposerSubmitPayload) {
    const sent = await host.handleSend(payload)
    if (sent) {
      translatorTargetLanguage.value = null
    }

    return sent
  }

  return {
    attachments: host.attachments,
    cancelActiveRun,
    cancelRunId,
    composerModelSelectionKind: model.composerModelSelectionKind,
    composerSelectedModelRef: model.composerSelectedModelRef,
    contentJSON: host.contentJSON,
    handlePlaceholderUpload: host.handlePlaceholderUpload,
    handleSend,
    highlightAttachment: host.highlightAttachment,
    highlightAttachmentId: host.highlightAttachmentId,
    isStreaming,
    selectComposerModel: model.selectComposerModel,
    translatorSkillEnabled,
    translatorTargetLanguage,
  }
}
