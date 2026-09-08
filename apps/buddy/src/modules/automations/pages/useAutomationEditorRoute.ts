import type { AutomationDefinitionDraft } from '@buddy-shared/automation'
import type { LocalAutomation } from '@buddy-shared/automation/automationApi'
import type { MaybeRefOrGetter } from 'vue'
import type { AutomationCapability } from '../state/typing'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, readonly, shallowRef, toValue, watch } from 'vue'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'

interface AutomationEditorRouteOptions {
  automationId: MaybeRefOrGetter<string | null>
  automations: Pick<AutomationCapability, 'get' | 'create' | 'update'>
  language: MaybeRefOrGetter<BuddyLocale>
  onSaved: () => void | Promise<void>
  ready: Promise<void>
}

export function useAutomationEditorRoute(options: AutomationEditorRouteOptions) {
  const automation = shallowRef<LocalAutomation | null>(null)
  const error = shallowRef<string | null>(null)
  const isLoading = shallowRef(false)
  const isSaving = shallowRef(false)
  const mode = computed(() => toValue(options.automationId) ? 'edit' : 'create')
  let generation = 0

  watch(() => toValue(options.automationId), async (id, _previous, onCleanup) => {
    const current = ++generation
    onCleanup(() => {
      generation += 1
    })
    automation.value = null
    error.value = null
    isLoading.value = id !== null
    isSaving.value = false
    if (!id)
      return
    try {
      await options.ready
      if (current !== generation)
        return
      const result = await options.automations.get(id)
      if (current === generation)
        automation.value = result
    }
    catch (cause) {
      if (current === generation)
        error.value = resolveLocalChatErrorMessage(cause, toValue(options.language))
    }
    finally {
      if (current === generation)
        isLoading.value = false
    }
  }, { flush: 'sync', immediate: true })

  async function save(draft: AutomationDefinitionDraft): Promise<void> {
    if (isLoading.value || isSaving.value || (mode.value === 'edit' && !automation.value))
      return
    const current = generation
    error.value = null
    isSaving.value = true
    try {
      const result = automation.value
        ? await options.automations.update(automation.value, draft)
        : await options.automations.create(draft)
      if (current !== generation)
        return
      if (result.status === 'failed')
        error.value = result.error
      else if (result.status === 'succeeded')
        await options.onSaved()
    }
    catch (cause) {
      if (current === generation)
        error.value = resolveLocalChatErrorMessage(cause, toValue(options.language))
    }
    finally {
      if (current === generation)
        isSaving.value = false
    }
  }

  return { automation: readonly(automation), error: readonly(error), isLoading: readonly(isLoading), isSaving: readonly(isSaving), mode, save }
}
