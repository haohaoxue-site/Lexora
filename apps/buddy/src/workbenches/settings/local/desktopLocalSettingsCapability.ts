import type { Ref } from 'vue'
import type { LocalCapabilitiesStore } from '@/stores/useLocalCapabilitiesStore'

export function createDesktopLocalSettingsCapability(
  store: LocalCapabilitiesStore,
  projectId: Readonly<Ref<string | null>>,
) {
  return {
    ...store,
    projectId,
  }
}

export type DesktopLocalSettingsCapability = ReturnType<
  typeof createDesktopLocalSettingsCapability
>
