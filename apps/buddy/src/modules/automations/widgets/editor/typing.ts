import type { AutomationDefinitionDraft } from '@buddy-shared/automation'
import type { LocalAutomation, LocalAutomationPreviewRequest, LocalAutomationPreviewResult } from '@buddy-shared/automation/automationApi'
import type { LocalProvider, LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export type AutomationPreview = (input: LocalAutomationPreviewRequest) => Promise<LocalAutomationPreviewResult>

export type AutomationPreviewState
  = { status: 'idle' | 'loading' }
    | { status: 'ready', result: LocalAutomationPreviewResult }
    | { status: 'failed' }

export interface AutomationEditorProps {
  appSidebarCollapsed: boolean
  automation: LocalAutomation | null
  busy: boolean
  error: string | null
  language: BuddyLocale
  loading: boolean
  mode: 'create' | 'edit'
  models: ReadonlyArray<LocalRuntimeModelOption>
  providers: ReadonlyArray<LocalProvider>
  preview: AutomationPreview
  spaces: ReadonlyArray<LocalSpace>
}

export interface AutomationEditorEmits {
  cancel: []
  save: [draft: AutomationDefinitionDraft]
  toggleAppSidebar: []
}
