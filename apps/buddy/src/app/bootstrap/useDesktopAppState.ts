import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import { useModelProvidersStore } from '@/modules/models'
import { useNotificationCenterStore } from '@/modules/notifications'
import { useApplicationSettingsStore, useLocalCapabilitiesStore, useUsageStore } from '@/modules/settings'
import { useRuntimeSupervisorStore } from '@/platform/runtime/useRuntimeSupervisorStore'

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

  let initialization: Promise<boolean> | undefined
  let disposed = false

  function initialize(): Promise<boolean> {
    if (disposed)
      return Promise.resolve(false)
    return initialization ??= loadInitialState()
  }

  async function loadInitialState(): Promise<boolean> {
    const results = await Promise.allSettled([
      applicationSettings.load(),
      runtimeSupervisor.loadStatus(),
      modelProviders.loadModelCatalog(true),
      notifications.load(),
    ])
    return !disposed && results.every(result => result.status === 'fulfilled' && result.value !== false)
  }

  function dispose() {
    if (disposed)
      return
    disposed = true
    applicationSettings.dispose()
    localCapabilities.dispose()
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
