import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalAutomation,
  LocalAutomationOccurrencePage,
  LocalAutomationPage,
  LocalAutomationRunNowResult,
} from '@buddy-electron/shared/localChatApi'
import type { AutomationDefinitionDraft } from '@buddy-shared/automation'
import type { ShallowRef } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useDebounceFn } from '@vueuse/core'
import { useMessage } from 'naive-ui'
import { computed, readonly, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
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

export type AutomationActionResult<T>
  = | { status: 'busy' }
    | { error: string, status: 'failed' }
    | { status: 'succeeded', value: T }

export function useAutomationCapability(options: UseAutomationCapabilityOptions) {
  const message = useMessage()
  const { t } = useBuddyI18n(options.language)
  const automations = shallowRef<LocalAutomationPage>({ items: [], nextCursor: null })
  const occurrences = shallowRef<LocalAutomationOccurrencePage>({ items: [], nextCursor: null })
  const editorError = shallowRef<string | null>(null)
  const loadError = shallowRef<string | null>(null)
  const isLoading = shallowRef(false)
  const isLoadingMoreAutomations = shallowRef(false)
  const isLoadingMoreOccurrences = shallowRef(false)
  const mutationCount = shallowRef(0)
  const editorMutating = shallowRef(false)
  const pendingAutomationIds = shallowRef<ReadonlySet<string>>(new Set())
  const isMutating = computed(() => mutationCount.value > 0)
  let refreshRequested = false
  let stopped = false

  const stopChanged = options.api.automations.onChanged(() => {
    void refresh()
  })
  const refreshFromRunEvent = useDebounceFn(() => {
    void refresh()
  }, 80)
  const stopRunEvent = options.api.chat.onRunEvent((event) => {
    if (event.type === 'run.failed')
      void notifyRunFailure(event.runId)
    if (AUTOMATION_RUN_ACTIVITY_EVENTS.has(event.type))
      refreshFromRunEvent()
  })

  async function notifyRunFailure(runId: string): Promise<void> {
    try {
      const run = await options.api.runs.get(runId)
      if (run.purpose === 'automation')
        message.error(t('desktop.automations.runFailed'))
    }
    catch {}
  }

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
    loadError.value = null
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
      loadError.value = resolveLocalChatErrorMessage(cause, options.language.value)
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
    return mutateEditor(() => options.api.automations.create({
      draft,
      requestId: crypto.randomUUID(),
    }))
  }

  function clearEditorError(): void {
    editorError.value = null
  }

  async function get(automationId: string): Promise<LocalAutomation | null> {
    clearEditorError()
    const current = automations.value.items.find(item => item.id === automationId)
    if (current)
      return current
    try {
      return await options.api.automations.get(automationId)
    }
    catch (cause) {
      editorError.value = resolveLocalChatErrorMessage(cause, options.language.value)
      return null
    }
  }

  async function loadMoreAutomations(): Promise<boolean> {
    const cursor = automations.value.nextCursor
    if (!cursor || stopped || isLoadingMoreAutomations.value)
      return false
    isLoadingMoreAutomations.value = true
    loadError.value = null
    try {
      const page = await options.api.automations.list({ cursor, limit: 100 })
      if (automations.value.nextCursor !== cursor)
        return false
      automations.value = appendPage(automations.value, page)
      return true
    }
    catch (cause) {
      loadError.value = resolveLocalChatErrorMessage(cause, options.language.value)
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
    loadError.value = null
    try {
      const page = await options.api.automations.listOccurrences({ cursor, limit: 100 })
      if (occurrences.value.nextCursor !== cursor)
        return false
      occurrences.value = appendPage(occurrences.value, page)
      return true
    }
    catch (cause) {
      loadError.value = resolveLocalChatErrorMessage(cause, options.language.value)
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
    return mutateEditor(() => options.api.automations.update({
      automationId: automation.id,
      draft,
      expectedRevision: automation.revision,
      requestId: crypto.randomUUID(),
    }))
  }

  async function pause(automation: LocalAutomation): Promise<AutomationActionResult<LocalAutomation>> {
    return mutateDefinition(automation, input => options.api.automations.pause(input))
  }

  async function resume(automation: LocalAutomation): Promise<AutomationActionResult<LocalAutomation>> {
    return mutateDefinition(automation, input => options.api.automations.resume(input))
  }

  async function remove(automation: LocalAutomation): Promise<AutomationActionResult<LocalAutomation>> {
    return mutateDefinition(automation, input => options.api.automations.delete(input))
  }

  async function removeOccurrence(occurrenceId: string): Promise<AutomationActionResult<boolean>> {
    return mutateAction(() => options.api.automations.deleteOccurrence(occurrenceId))
  }

  async function runNow(
    automation: LocalAutomation,
  ): Promise<AutomationActionResult<LocalAutomationRunNowResult>> {
    return mutateTask(
      automation.id,
      () => options.api.automations.runNow(createMutationInput(automation)),
    )
  }

  async function mutateDefinition(
    automation: LocalAutomation,
    operation: (
      input: ReturnType<typeof createMutationInput>,
    ) => Promise<LocalAutomation>,
  ): Promise<AutomationActionResult<LocalAutomation>> {
    return mutateTask(
      automation.id,
      () => operation(createMutationInput(automation)),
    )
  }

  async function mutateEditor<T>(operation: () => Promise<T>): Promise<T | null> {
    if (editorMutating.value)
      return null
    editorMutating.value = true
    mutationCount.value += 1
    editorError.value = null
    try {
      const result = await operation()
      await refresh()
      return result
    }
    catch (cause) {
      editorError.value = resolveLocalChatErrorMessage(cause, options.language.value)
      return null
    }
    finally {
      editorMutating.value = false
      mutationCount.value -= 1
    }
  }

  async function mutateAction<T>(
    operation: () => Promise<T>,
  ): Promise<AutomationActionResult<T>> {
    mutationCount.value += 1
    try {
      const value = await operation()
      await refresh()
      return { status: 'succeeded', value }
    }
    catch (cause) {
      return {
        error: resolveLocalChatErrorMessage(cause, options.language.value),
        status: 'failed',
      }
    }
    finally {
      mutationCount.value -= 1
    }
  }

  async function mutateTask<T>(
    automationId: string,
    operation: () => Promise<T>,
  ): Promise<AutomationActionResult<T>> {
    if (pendingAutomationIds.value.has(automationId))
      return { status: 'busy' }
    setAutomationPending(automationId, true)
    try {
      return await mutateAction(operation)
    }
    finally {
      setAutomationPending(automationId, false)
    }
  }

  function setAutomationPending(automationId: string, pending: boolean): void {
    const next = new Set(pendingAutomationIds.value)
    if (pending)
      next.add(automationId)
    else
      next.delete(automationId)
    pendingAutomationIds.value = next
  }

  function dispose(): void {
    stopped = true
    stopChanged()
    stopRunEvent()
  }

  return {
    automations: readonly(automations),
    clearEditorError,
    create,
    dispose,
    editorError: readonly(editorError),
    get,
    initialize,
    isLoading: readonly(isLoading),
    isLoadingMoreAutomations: readonly(isLoadingMoreAutomations),
    isLoadingMoreOccurrences: readonly(isLoadingMoreOccurrences),
    isMutating,
    loadError: readonly(loadError),
    loadMoreAutomations,
    loadMoreOccurrences,
    occurrences: readonly(occurrences),
    pendingAutomationIds: readonly(pendingAutomationIds),
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
