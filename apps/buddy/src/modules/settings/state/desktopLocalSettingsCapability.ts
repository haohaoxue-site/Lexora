import type { Ref } from 'vue'
import type { DesktopLocalSettingsCapability, LocalCapabilitiesStore } from './typing'

export function createDesktopLocalSettingsCapability(
  store: LocalCapabilitiesStore,
  spaceId: Readonly<Ref<string | null>>,
): DesktopLocalSettingsCapability {
  return { ...store, spaceId }
}
