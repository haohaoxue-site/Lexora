import type {
  LexoraConfig,
  LexoraConfigPatch,
  LexoraDesktopApi,
} from '@buddy-electron/shared/desktopApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { readonly, shallowRef } from 'vue'
import { resolveBuddyLocale, translateBuddy } from '@/i18n/buddyI18n'

export function useApplicationSettingsStore(api: LexoraDesktopApi['settings']) {
  const config = shallowRef<LexoraConfig | null>(null)
  const language = shallowRef<BuddyLocale>('zh-CN')
  const settingsError = shallowRef<string | null>(null)

  async function load() {
    apply(await api.get())
  }

  async function updateSettings(patch: LexoraConfigPatch) {
    settingsError.value = null
    try {
      apply(await api.update(patch))
      return true
    }
    catch {
      settingsError.value = translateBuddy(language.value, 'desktop.settings.saveFailed')
      return false
    }
  }

  function apply(nextConfig: LexoraConfig) {
    config.value = nextConfig
    language.value = resolveBuddyLocale(nextConfig.desktop.language)
    document.documentElement.lang = language.value
  }

  return {
    config: readonly(config),
    language: readonly(language),
    load,
    settingsError: readonly(settingsError),
    updateSettings,
  }
}

export type ApplicationSettingsStore = ReturnType<typeof useApplicationSettingsStore>
