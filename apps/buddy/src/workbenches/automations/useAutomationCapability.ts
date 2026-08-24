import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalAutomation,
  LocalAutomationOccurrence,
  LocalAutomationOccurrencePage,
  LocalAutomationPage,
} from '@buddy-electron/shared/localChatApi'
import type { AutomationDefinitionDraft } from '@buddy-shared/automation'
import type { ShallowRef } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useDebounceFn } from '@vueuse/core'
import { readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'

const AUTOMATION_RUN_ACTIVITY_EVENTS = new Set([
  'approval.requested',
  'approval.resolved',
  'run.cancelled',
  'run.completed',
  'run.failed',
  'run.started',
])

interface UseAutomationCapabilityOptions {
  api: LexoraDesktopApi['localChat']
  language: Readonly<ShallowRef<BuddyLocale>>
}

export function useAutomationCapability(options: UseAutomationCapabilityOptions) {
  const automations = shallowRef<LocalAutomationPage>({ items: [], nextCursor: null })
  const occurrences = shallowRef<LocalAutomationOccurrencePage>({ items: [], nextCursor: null })
  const error = shallowRef<string | null>(null)
  const isLoading = shallowRef(false)
  const isLoadingMoreAutomations = shallowRef(false)
  const isLoadingMoreOccurrences = shallowRef(false)
  const isMutating = shallowRef(false)
  let refreshRequested = false
  let stopped = false

  const stopChanged = options.api.automations.onChanged(() => {
    void refresh()
  })
  const refreshFromRunEvent = useDebounceFn(() => {
    void refresh()
  }, 80)
  const stopRunEvent = options.api.chat.onRunEvent((event) => {
    if (AUTOMATION_RUN_ACTIVITY_EVENTS.has(event.type))
      refreshFromRunEvent()
  })

  async function initialize(): Promise<void> {
    await refresh()
  }

  async function refresh(): Promise<boolean> {
    if (stopped)
      return false
    if (isLoading.value) {
      refreshRequested = true
      return false
    }
    isLoading.value = true
    error.value = null
    try {
      const [nextAutomations, nextOccurrences] = await Promise.all([
        options.api.automations.list({ limit: 100 }),
        options.api.automations.listOccurrences({ limit: 100 }),
      ])
      automations.value = nextAutomations
      occurrences.value = nextOccurrences
      return true
    }
    catch (cause) {
      error.value = resolveLocalChatErrorMessage(cause, options.language.value)
      return false
    }
    finally {
      isLoading.value = false
      if (refreshRequested) {
        refreshRequested = false
        void refresh()
      }
    }
  }

  async function create(draft: AutomationDefinitionDraft): Promise<LocalAutomation | null> {
    return mutate(() => options.api.automations.create({ draft, requestId: crypto.randomUUID() }))
  }

  async function get(automationId: string): Promise<LocalAutomation | null> {
    const current = automations.value.items.find(item => item.id === automationId)
    if (current)
      return current
    error.value = null
    try {
      return await options.api.automations.get(automationId)
    }
    catch (cause) {
      error.value = resolveLocalChatErrorMessage(cause, options.language.value)
      return null
    }
  }

  async function loadMoreAutomations(): Promise<boolean> {
    const cursor = automations.value.nextCursor
    if (!cursor || stopped || isLoadingMoreAutomations.value)
      return false
    isLoadingMoreAutomations.value = true
    error.value = null
    try {
      const page = await options.api.automations.list({ cursor, limit: 100 })
      if (automations.value.nextCursor !== cursor)
        return false
      automations.value = appendPage(automations.value, page)
      return true
    }
    catch (cause) {
      error.value = resolveLocalChatErrorMessage(cause, options.language.value)
      return false
    }
    finally {
      isLoadingMoreAutomations.value = false
    }
  }

  async function loadMoreOccurrences(): Promise<boolean> {
    const cursor = occurrences.value.nextCursor
    if (!cursor || stopped || isLoadingMoreOccurrences.value)
      return false
    isLoadingMoreOccurrences.value = true
    error.value = null
    try {
      const page = await options.api.automations.listOccurrences({ cursor, limit: 100 })
      if (occurrences.value.nextCursor !== cursor)
        return false
      occurrences.value = appendPage(occurrences.value, page)
      return true
    }
    catch (cause) {
      error.value = resolveLocalChatErrorMessage(cause, options.language.value)
      return false
    }
    finally {
      isLoadingMoreOccurrences.value = false
    }
  }

  async function update(
    automation: LocalAutomation,
    draft: AutomationDefinitionDraft,
  ): Promise<LocalAutomation | null> {
    return mutate(() => options.api.automations.update({
      automationId: automation.id,
      draft,
      expectedRevision: automation.revision,
      requestId: crypto.randomUUID(),
    }))
  }

  async function pause(automation: LocalAutomation): Promise<LocalAutomation | null> {
    return mutateDefinition(automation, input => options.api.automations.pause(input))
  }

  async function resume(automation: LocalAutomation): Promise<LocalAutomation | null> {
    return mutateDefinition(automation, input => options.api.automations.resume(input))
  }

  async function remove(automation: LocalAutomation): Promise<LocalAutomation | null> {
    return mutateDefinition(automation, input => options.api.automations.delete(input))
  }

  async function removeOccurrence(occurrenceId: string): Promise<boolean> {
    return (await mutate(() => options.api.automations.deleteOccurrence(occurrenceId))) ?? false
  }

  async function runNow(automation: LocalAutomation): Promise<LocalAutomationOccurrence | null> {
    return mutate(() => options.api.automations.runNow(createMutationInput(automation)))
  }

  async function mutateDefinition(
    automation: LocalAutomation,
    operation: (
      input: ReturnType<typeof createMutationInput>,
    ) => Promise<LocalAutomation>,
  ): Promise<LocalAutomation | null> {
    return mutate(() => operation(createMutationInput(automation)))
  }

  async function mutate<T>(operation: () => Promise<T>): Promise<T | null> {
    if (isMutating.value)
      return null
    isMutating.value = true
    error.value = null
    try {
      const result = await operation()
      await refresh()
      return result
    }
    catch (cause) {
      error.value = resolveLocalChatErrorMessage(cause, options.language.value)
      return null
    }
    finally {
      isMutating.value = false
    }
  }

  function dispose(): void {
    stopped = true
    stopChanged()
    stopRunEvent()
  }

  return {
    automations: readonly(automations),
    create,
    dispose,
    error: readonly(error),
    get,
    initialize,
    isLoading: readonly(isLoading),
    isLoadingMoreAutomations: readonly(isLoadingMoreAutomations),
    isLoadingMoreOccurrences: readonly(isLoadingMoreOccurrences),
    isMutating: readonly(isMutating),
    loadMoreAutomations,
    loadMoreOccurrences,
    occurrences: readonly(occurrences),
    pause,
    preview: options.api.automations.preview,
    refresh,
    remove,
    removeOccurrence,
    resume,
    runNow,
    update,
  }
}

function appendPage<T extends { id: string }>(
  current: { items: ReadonlyArray<T>, nextCursor: string | null },
  next: { items: ReadonlyArray<T>, nextCursor: string | null },
): { items: T[], nextCursor: string | null } {
  const items = new Map(current.items.map(item => [item.id, item]))
  for (const item of next.items)
    items.set(item.id, item)
  return { items: [...items.values()], nextCursor: next.nextCursor }
}

function createMutationInput(automation: LocalAutomation) {
  return {
    automationId: automation.id,
    expectedRevision: automation.revision,
    requestId: crypto.randomUUID(),
  }
}

export type AutomationCapability = ReturnType<typeof useAutomationCapability>
