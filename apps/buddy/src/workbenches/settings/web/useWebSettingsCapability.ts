import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { WebSearchProvider, WebSettings, WebSettingsSnapshot } from '@buddy-shared/webProtocol'
import type { ShallowRef } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'

export function useWebSettingsCapability(options: {
  api: LexoraDesktopApi['localChat']['web']
  language: Readonly<ShallowRef<BuddyLocale>>
}) {
  const snapshot = shallowRef<WebSettingsSnapshot | null>(null)
  const busy = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const searchSources = computed(() => snapshot.value?.settings.search.filter(source => source.provider !== 'tavily' || snapshot.value?.tavilyKeyConfigured) ?? [])

  async function execute(operation: () => Promise<WebSettingsSnapshot>): Promise<boolean> {
    if (busy.value)
      return false
    busy.value = true
    error.value = null
    try {
      snapshot.value = await operation()
      return true
    }
    catch (cause) {
      error.value = resolveLocalChatErrorMessage(cause, options.language.value)
      return false
    }
    finally { busy.value = false }
  }

  function save(settings: WebSettings): Promise<boolean> {
    if (busy.value || !snapshot.value)
      return Promise.resolve(false)
    const previous = snapshot.value
    const value = { search: settings.search.map(source => ({ provider: source.provider, enabled: source.enabled })), fetch: { render: settings.fetch.render, remote: settings.fetch.remote } }
    snapshot.value = { ...previous, settings: value }
    return execute(async () => {
      try {
        return await options.api.save(value)
      }
      catch (cause) {
        snapshot.value = previous
        throw cause
      }
    })
  }

  function setSearchEnabled(provider: WebSearchProvider, enabled: boolean) {
    const settings = snapshot.value?.settings
    if (settings)
      return save({ ...settings, search: settings.search.map(source => source.provider === provider ? { ...source, enabled } : source) })
  }

  function reorderSearch(provider: WebSearchProvider, target: WebSearchProvider, position: 'before' | 'after') {
    const settings = snapshot.value?.settings
    if (!settings || provider === target)
      return
    const source = settings.search.find(source => source.provider === provider)
    const search = settings.search.filter(source => source.provider !== provider)
    const index = search.findIndex(source => source.provider === target)
    if (!source || index < 0)
      return
    search.splice(index + (position === 'after' ? 1 : 0), 0, source)
    return save({ ...settings, search })
  }

  function setFetchEnabled(name: keyof WebSettings['fetch'], enabled: boolean) {
    const settings = snapshot.value?.settings
    if (settings)
      return save({ ...settings, fetch: { ...settings.fetch, [name]: enabled } })
  }

  return {
    busy: readonly(busy),
    error: readonly(error),
    snapshot: readonly(snapshot),
    searchSources: readonly(searchSources),
    language: options.language,
    load: () => execute(() => options.api.read()),
    setSearchEnabled,
    reorderSearch,
    setFetchEnabled,
    saveCredential: (key: string | null) => execute(() => options.api.saveCredential(key)),
    revealCredential: () => options.api.revealCredential(),
  }
}

export type WebSettingsCapability = ReturnType<typeof useWebSettingsCapability>
