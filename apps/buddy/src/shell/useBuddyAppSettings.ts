import type {
  BuddyAppSettings,
  UpdateBuddyAppSettingsRequest,
} from '@/lib/tauriRuntime'
import { onMounted, onUnmounted, readonly, shallowRef } from 'vue'
import { isTauriRuntime, normalizeBuddyCommandError } from '@/lib/invokeClient'
import {
  createBrowserAppSettings,
  listenBuddyAppSettingsChanged,
  loadBuddyAppSettings,
  updateBuddyAppSettings,
  writeBrowserAppSettings,
} from '@/lib/tauriRuntime'

export function useBuddyAppSettings() {
  const appSettings = shallowRef<BuddyAppSettings>(createBrowserAppSettings())
  const errorMessage = shallowRef<string | null>(null)
  const isUpdatingAppSettings = shallowRef(false)
  let unlistenAppSettingsChanged: (() => void) | null = null

  async function refreshAppSettings() {
    try {
      appSettings.value = await loadBuddyAppSettings()
      errorMessage.value = null
    }
    catch (error) {
      errorMessage.value = normalizeBuddyCommandError(error).message
    }
  }

  async function updateAppSettings(request: UpdateBuddyAppSettingsRequest) {
    isUpdatingAppSettings.value = true
    errorMessage.value = null

    try {
      if (!isTauriRuntime()) {
        const nextSettings = {
          ...appSettings.value,
          ...request,
          runtimeDialogVisibility: request.runtimeDialogVisibility
            ?? appSettings.value.runtimeDialogVisibility,
        }
        appSettings.value = nextSettings
        writeBrowserAppSettings(nextSettings)
        return
      }

      appSettings.value = await updateBuddyAppSettings(request)
    }
    catch (error) {
      errorMessage.value = normalizeBuddyCommandError(error).message
    }
    finally {
      isUpdatingAppSettings.value = false
    }
  }

  onMounted(() => {
    void refreshAppSettings()
    void listenBuddyAppSettingsChanged((settings) => {
      appSettings.value = settings
    }).then((unlisten) => {
      unlistenAppSettingsChanged = unlisten
    }).catch((error) => {
      console.error('Lexora settings listener failed', error)
    })
  })

  onUnmounted(() => {
    unlistenAppSettingsChanged?.()
    unlistenAppSettingsChanged = null
  })

  return {
    appSettings: readonly(appSettings),
    errorMessage: readonly(errorMessage),
    isUpdatingAppSettings: readonly(isUpdatingAppSettings),
    refreshAppSettings,
    updateAppSettings,
  }
}
