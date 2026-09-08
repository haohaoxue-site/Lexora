import type { UseChatComposerOptions } from './typing'
import type { ChatComposerContextOptions, ChatComposerTrigger, ChatPromptContextOption } from '@/modules/prompt-input'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { createChatComposerSourceOptions, createChatComposerSuggestions, shouldSubmitChatComposerKey } from '@/modules/prompt-input'

export function useChatComposerSuggestions(
  options: Pick<UseChatComposerOptions, 'draftId' | 'language' | 'loadContextOptions'>,
  onSelect: (option: ChatPromptContextOption | undefined) => void,
) {
  const { t } = useBuddyI18n(options.language)
  const contextOptions = shallowRef<ChatComposerContextOptions>({ files: [], skills: [] })
  const activeTrigger = shallowRef<ChatComposerTrigger | null>(null)
  const activeSuggestionIndex = shallowRef(0)
  const isLoadingContext = shallowRef(false)
  let contextRequestId = 0

  const suggestions = computed(() => createChatComposerSuggestions(activeTrigger.value, contextOptions.value, key => t(key)))
  const sourceOptions = computed(() => createChatComposerSourceOptions(contextOptions.value.files))

  function invalidateQuery() {
    contextRequestId += 1
    isLoadingContext.value = false
  }

  watch(activeTrigger, (trigger) => {
    activeSuggestionIndex.value = 0
    if (!trigger || trigger.kind === 'slash') {
      invalidateQuery()
      return
    }
    void loadContextOptions(trigger.kind === 'mention' ? trigger.query : null)
  })
  watch(options.draftId, () => {
    activeTrigger.value = null
    contextOptions.value = { files: [], skills: [] }
    invalidateQuery()
  }, { flush: 'sync' })
  onScopeDispose(invalidateQuery)

  async function loadContextOptions(fileQuery: string | null): Promise<void> {
    const requestId = ++contextRequestId
    isLoadingContext.value = true
    try {
      const context = await options.loadContextOptions(fileQuery)
      if (requestId === contextRequestId)
        contextOptions.value = context
    }
    catch {
      if (requestId === contextRequestId)
        contextOptions.value = { files: [], skills: [] }
    }
    finally {
      if (requestId === contextRequestId)
        isLoadingContext.value = false
    }
  }

  function handleKeydown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && activeTrigger.value) {
      event.preventDefault()
      activeTrigger.value = null
      return true
    }
    if (!suggestions.value.length)
      return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      activeSuggestionIndex.value = (activeSuggestionIndex.value + delta + suggestions.value.length) % suggestions.value.length
      return true
    }
    if (event.key === 'Tab' || shouldSubmitChatComposerKey(event)) {
      event.preventDefault()
      onSelect(suggestions.value[activeSuggestionIndex.value]?.option)
      return true
    }
    return false
  }

  return {
    activeSuggestionIndex,
    activeTrigger,
    closeSuggestions: () => { activeTrigger.value = null },
    contextOptions,
    handleKeydown,
    isLoadingContext,
    loadContextOptions,
    sourceOptions,
    suggestions,
  }
}
