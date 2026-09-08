import type { DesktopAppInfo, LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { BuddyCapabilities } from '@buddy-shared/platform'
import { BUDDY_FEATURES, buddyCapabilitiesSchema, supportsBuddyFeature } from '@buddy-shared/platform'

const snapshots = new WeakMap<LexoraDesktopApi, Promise<DesktopAppInfo>>()

export function loadDesktopAppInfo(api = window.lexoraDesktop): Promise<DesktopAppInfo> {
  if (!api)
    return Promise.reject(new Error('Lexora Buddy Desktop API is unavailable'))
  const cached = snapshots.get(api)
  if (cached)
    return cached
  const loading = api.app.getInfo().then(info => ({ ...info, capabilities: buddyCapabilitiesSchema.parse(info.capabilities) })).catch((error) => {
    snapshots.delete(api)
    throw error
  })
  snapshots.set(api, loading)
  return loading
}

export function supportsSettingsCategory(capabilities: BuddyCapabilities | null, category: string): boolean {
  const required = Object.entries(BUDDY_FEATURES).find(([, feature]) => feature.settingsCategory === category)
  return !required || (!!capabilities && supportsBuddyFeature(capabilities, required[0] as keyof typeof BUDDY_FEATURES))
}
