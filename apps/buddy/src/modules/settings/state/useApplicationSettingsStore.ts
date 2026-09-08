import type {
  LexoraConfig,
  LexoraConfigPatch,
  LexoraDesktopApi,
} from '@buddy-electron/shared/desktopApi'
import type { ApplicationSettings } from '../contracts'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { readonly, shallowRef } from 'vue'
import { resolveBuddyLocale, translateBuddy } from '@/i18n/buddyI18n'

export interface ApplicationSettingsStore extends ApplicationSettings {
  load: () => Promise<void>
  dispose: () => void
}

export function useApplicationSettingsStore(api: LexoraDesktopApi['settings']): ApplicationSettingsStore {
  let disposed = false
  const config = shallowRef<LexoraConfig | null>(null)
  const language = shallowRef<BuddyLocale>('zh-CN')
  const settingsError = shallowRef<string | null>(null)

  async function load() {
    if (!disposed)
      apply(await api.get())
  }

  async function updateSettings(patch: LexoraConfigPatch) {
    if (disposed)
      return false
    settingsError.value = null
    try {
      apply(await api.update(patch))
      return true
    }
    catch {
      if (!disposed)
        settingsError.value = translateBuddy(language.value, 'desktop.settings.saveFailed')
      return false
    }
  }

  function apply(nextConfig: LexoraConfig) {
    if (disposed)
      return
    config.value = nextConfig
    language.value = resolveBuddyLocale(nextConfig.desktop.language)
    document.documentElement.lang = language.value
  }

  return {
    dispose: () => { disposed = true },
    config: readonly(config),
    language: readonly(language),
    load,
    settingsError: readonly(settingsError),
    updateSettings,
  }
}
