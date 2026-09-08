import type { WebSearchProvider, WebSearchSource, WebSettings, WebSettingsSnapshot } from '@buddy-shared/network/webProtocol'
import type { DeepReadonly } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export interface WebSettingsProps {
  busy: boolean
  error: string | null
  language: BuddyLocale
  snapshot: DeepReadonly<WebSettingsSnapshot> | null
  searchSources: readonly Readonly<WebSearchSource>[]
  load: () => Promise<boolean>
  setSearchEnabled: (provider: WebSearchProvider, enabled: boolean) => Promise<boolean> | undefined
  reorderSearch: (provider: WebSearchProvider, target: WebSearchProvider, position: 'before' | 'after') => Promise<boolean> | undefined
  setFetchEnabled: (name: keyof WebSettings['fetch'], enabled: boolean) => Promise<boolean> | undefined
  saveCredential: (key: string | null) => Promise<boolean>
  revealCredential: () => Promise<string | null>
}
