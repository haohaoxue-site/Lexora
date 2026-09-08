import type { LexoraConfig, LexoraConfigPatch } from '@buddy-electron/shared/desktopApi'
import type { DeepReadonly } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export interface ApplicationSettingsProps {
  config: DeepReadonly<LexoraConfig> | null
  error: string | null
  language: BuddyLocale
  updateSettings: (patch: LexoraConfigPatch) => Promise<boolean>
}
