import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalUsageSnapshot } from '@buddy-electron/shared/localChatApi'
import type { ShallowRef } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'

interface UseUsageStoreOptions {
  api: LexoraDesktopApi['localChat']['usage']
  language: Readonly<ShallowRef<BuddyLocale>>
}

export function useUsageStore(options: UseUsageStoreOptions) {
  const usageSnapshot = shallowRef<LocalUsageSnapshot | null>(null)
  const isLoadingUsage = shallowRef(false)
  const usageError = shallowRef<string | null>(null)

  async function loadUsage(): Promise<boolean> {
    isLoadingUsage.value = true
    usageError.value = null
    try {
      usageSnapshot.value = await options.api.getSnapshot()
      return true
    }
    catch (error) {
      usageError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
    finally {
      isLoadingUsage.value = false
    }
  }

  return {
    isLoadingUsage: readonly(isLoadingUsage),
    loadUsage,
    usageError: readonly(usageError),
    usageSnapshot: readonly(usageSnapshot),
  }
}

export type UsageStore = ReturnType<typeof useUsageStore>
