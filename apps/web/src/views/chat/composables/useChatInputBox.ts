import type {
  ChatInputBoxProps,
} from '../typing'
import { computed, shallowRef } from 'vue'

export function useChatInputBox(
  props: ChatInputBoxProps,
  onSend: (content: string) => void,
) {
  const inputText = shallowRef('')
  const isSendDisabled = computed(() => !inputText.value.trim() || props.disabled)

  function handleSend() {
    const text = inputText.value.trim()

    if (!text) {
      return
    }

    onSend(text)
    inputText.value = ''
  }

  function handleKeydown(event: Event | KeyboardEvent) {
    if (!(event instanceof KeyboardEvent)) {
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return {
    handleKeydown,
    handleSend,
    inputText,
    isSendDisabled,
  }
}
