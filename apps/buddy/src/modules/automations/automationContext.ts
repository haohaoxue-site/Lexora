import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'

import type { Ref } from 'vue'
import type { AutomationCapability } from './state/typing'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ModelProvidersStore } from '@/modules/models'
import { createInjectionContext } from '@/shared/composables/createInjectionContext'

export interface AutomationContext {
  automations: AutomationCapability
  language: Readonly<Ref<BuddyLocale>>
  openTask: (conversationId: string) => Promise<void>
  providerSettings: Pick<ModelProvidersStore, 'models' | 'providers'>
  ready: Promise<void>
  refreshTasks: () => Promise<void>
  spaces: Readonly<Ref<ReadonlyArray<LocalSpace>>>
}

export const { key: automationContextKey, useContext: useAutomationContext }
  = createInjectionContext<AutomationContext>('Automation')
