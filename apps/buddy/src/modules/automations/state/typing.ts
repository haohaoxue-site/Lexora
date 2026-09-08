import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { AutomationDefinitionDraft } from '@buddy-shared/automation'
import type { LocalAutomation, LocalAutomationOccurrencePage, LocalAutomationPage, LocalAutomationRunNowResult } from '@buddy-shared/automation/automationApi'
import type { Ref } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export interface AutomationCapabilityOptions {
  api: LocalChatApi
  language: Readonly<Ref<BuddyLocale>>
  onRunFailure?: (errorMessage: string) => void
}

export type AutomationActionResult<T>
  = { status: 'busy' }
    | { error: string, status: 'failed' }
    | { status: 'succeeded', value: T }

export interface AutomationCapability {
  automations: Readonly<Ref<LocalAutomationPage>>
  occurrences: Readonly<Ref<LocalAutomationOccurrencePage>>
  isLoading: Readonly<Ref<boolean>>
  isLoadingMoreAutomations: Readonly<Ref<boolean>>
  isLoadingMoreOccurrences: Readonly<Ref<boolean>>
  isMutating: Readonly<Ref<boolean>>
  loadError: Readonly<Ref<string | null>>
  pendingAutomationIds: Readonly<Ref<ReadonlySet<string>>>
  initialize: () => Promise<void>
  dispose: () => void
  refresh: () => Promise<boolean>
  loadMoreAutomations: () => Promise<boolean>
  loadMoreOccurrences: () => Promise<boolean>
  get: (automationId: string) => Promise<LocalAutomation>
  preview: LocalChatApi['automations']['preview']
  create: (draft: AutomationDefinitionDraft) => Promise<AutomationActionResult<LocalAutomation>>
  update: (automation: LocalAutomation, draft: AutomationDefinitionDraft) => Promise<AutomationActionResult<LocalAutomation>>
  pause: (automation: LocalAutomation) => Promise<AutomationActionResult<LocalAutomation>>
  resume: (automation: LocalAutomation) => Promise<AutomationActionResult<LocalAutomation>>
  remove: (automation: LocalAutomation) => Promise<AutomationActionResult<LocalAutomation>>
  removeOccurrence: (occurrenceId: string) => Promise<AutomationActionResult<boolean>>
  runNow: (automation: LocalAutomation) => Promise<AutomationActionResult<LocalAutomationRunNowResult>>
}
