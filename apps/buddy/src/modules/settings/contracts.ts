import type { LexoraConfig, LexoraConfigPatch } from '@buddy-electron/shared/desktopApi'
import type { DeepReadonly, Ref } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export interface ApplicationSettings {
  config: Readonly<Ref<DeepReadonly<LexoraConfig> | null>>
  language: Readonly<Ref<BuddyLocale>>
  settingsError: Readonly<Ref<string | null>>
  updateSettings: (patch: LexoraConfigPatch) => Promise<boolean>
}
