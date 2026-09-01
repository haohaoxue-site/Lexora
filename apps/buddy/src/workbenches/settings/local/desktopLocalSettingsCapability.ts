import type { Ref } from 'vue'
import type { LocalCapabilitiesStore } from '@/stores/useLocalCapabilitiesStore'

export function createDesktopLocalSettingsCapability(
  store: LocalCapabilitiesStore,
  spaceId: Readonly<Ref<string | null>>,
) {
  return {
    ...store,
    spaceId,
  }
}

export type DesktopLocalSettingsCapability = ReturnType<
  typeof createDesktopLocalSettingsCapability
>
