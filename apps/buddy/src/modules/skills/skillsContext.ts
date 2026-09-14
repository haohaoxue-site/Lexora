import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { Ref } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { createInjectionContext } from '@/shared/composables/createInjectionContext'

export interface SkillsContext {
  api: LocalChatApi['skills']
  language: Readonly<Ref<BuddyLocale>>
  spaces: Readonly<Ref<readonly LocalSpace[]>>
  ready: Promise<void>
  writeClipboardText: (text: string) => Promise<void>
}

export const { key: skillsContextKey, useContext: useSkillsContext }
  = createInjectionContext<SkillsContext>('Skills')
