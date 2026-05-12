import { computed, shallowRef } from 'vue'
import { useChatModelSettings } from './useChatModelSettings'
import { useChatRuntimeOverlay } from './useChatRuntimeOverlay'
import { useChatStream } from './useChatStream'

export function useChatInputBox() {
  const { inputPlaceholder, isConfigured } = useChatModelSettings()
  const { cancelRunId, isStreaming } = useChatRuntimeOverlay()
  const { cancelActiveRun, sendMessage } = useChatStream()

  const inputText = shallowRef('')
  const isDisabled = computed(() => isStreaming.value || !isConfigured.value)
  const isSendDisabled = computed(() => !inputText.value.trim() || isDisabled.value)

  async function handleSend() {
    const text = inputText.value.trim()

    if (!text) {
      return
    }

    if (await sendMessage(text)) {
      inputText.value = ''
    }
  }

  function handleKeydown(event: Event | KeyboardEvent) {
    if (!(event instanceof KeyboardEvent)) {
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  return {
    cancelActiveRun,
    handleKeydown,
    handleSend,
    inputPlaceholder,
    inputText,
    cancelRunId,
    isDisabled,
    isSendDisabled,
    isStreaming,
  }
}
