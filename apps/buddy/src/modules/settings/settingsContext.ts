import type { DesktopAppInfo } from '@buddy-electron/shared/desktopApi'
import type { BuddyCapabilities } from '@buddy-shared/platform'
import type { Ref } from 'vue'
import type { ApplicationSettings } from './contracts'
import type { DesktopDataSettingsCapability } from './state/desktopDataSettingsCapability'
import type { WebSettingsCapability } from './state/useWebSettingsCapability'
import type { ModelProvidersStore } from '@/modules/models'
import { createInjectionContext } from '@/shared/composables/createInjectionContext'

export interface SettingsContext {
  appInfo: Readonly<Ref<DesktopAppInfo | null>>
  applicationSettings: ApplicationSettings
  appSidebarCollapsed: Readonly<Ref<boolean>>
  dataSettings: DesktopDataSettingsCapability
  platformCapabilities: Readonly<Ref<BuddyCapabilities | null>>
  providerSettings: ModelProvidersStore
  ready: Promise<void>
  openTask: (conversationId: string) => Promise<void>
  webSettings: WebSettingsCapability
}

export const { key: settingsContextKey, useContext: useSettingsContext }
  = createInjectionContext<SettingsContext>('Settings')
