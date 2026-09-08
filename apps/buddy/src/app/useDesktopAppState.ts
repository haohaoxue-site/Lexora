import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import { useApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import { useLocalCapabilitiesStore } from '@/stores/useLocalCapabilitiesStore'
import { useModelProvidersStore } from '@/stores/useModelProvidersStore'
import { useNotificationCenterStore } from '@/stores/useNotificationCenterStore'
import { useRuntimeSupervisorStore } from '@/stores/useRuntimeSupervisorStore'
import { useUsageStore } from '@/stores/useUsageStore'

export interface UseDesktopAppStateOptions {
  api: LexoraDesktopApi
}

export function useDesktopAppState(options: UseDesktopAppStateOptions) {
  const applicationSettings = useApplicationSettingsStore(options.api.settings)
  const notifications = useNotificationCenterStore(options.api.localChat)
  const modelProviders = useModelProvidersStore({
    api: options.api.localChat.providers,
    language: applicationSettings.language,
    onCatalogChanged: () => void notifications.load(),
  })
  const runtimeSupervisor = useRuntimeSupervisorStore({
    api: options.api.localChat.runtime,
    language: applicationSettings.language,
  })
  const localCapabilities = useLocalCapabilitiesStore({
    api: options.api.localChat,
    language: applicationSettings.language,
  })
  const usage = useUsageStore({
    api: options.api.localChat.usage,
    language: applicationSettings.language,
  })
  const stores = {
    applicationSettings,
    localCapabilities,
    modelProviders,
    notifications,
    runtimeSupervisor,
    usage,
  } as const

  async function initialize(): Promise<boolean> {
    const results = await Promise.allSettled([
      applicationSettings.load(),
      runtimeSupervisor.loadStatus(),
      modelProviders.loadModelCatalog(true),
      notifications.load(),
    ])
    return results.every(result => result.status === 'fulfilled')
  }

  function dispose() {
    modelProviders.dispose()
    notifications.dispose()
    runtimeSupervisor.dispose()
  }

  return {
    dispose,
    initialize,
    stores,
  }
}

export type DesktopAppState = ReturnType<typeof useDesktopAppState>
export type DesktopStores = DesktopAppState['stores']
