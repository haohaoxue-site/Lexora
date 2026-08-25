import type {
  DesktopAppInfo,
  DesktopChatPinnedItem,
  LexoraDesktopApi,
} from '@buddy-electron/shared/desktopApi'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import { computed, readonly, shallowRef, watch } from 'vue'

export function useDesktopShellState(settings: ApplicationSettingsStore) {
  const api = requireDesktopApi()
  const appInfo = shallowRef<DesktopAppInfo | null>(null)
  const appSidebarCollapsed = computed(() => settings.config.value?.desktop.sidebarCollapsed ?? false)
  const persistedChatSidebarPinnedItems = computed(() =>
    settings.config.value?.desktop.chatSidebarPinnedItems ?? [],
  )
  const chatSidebarPinnedItems = shallowRef<ReadonlyArray<DesktopChatPinnedItem>>([])
  let pendingPinnedItemsWrites = 0
  let pinnedItemsWriteQueue = Promise.resolve()

  watch(
    persistedChatSidebarPinnedItems,
    (value) => {
      if (pendingPinnedItemsWrites === 0)
        chatSidebarPinnedItems.value = cloneDesktopChatPinnedItems(value)
    },
    { immediate: true },
  )

  async function initialize() {
    appInfo.value = await api.app.getInfo().catch(() => null)
  }

  function setChatSidebarPinnedItems(
    value: DesktopChatPinnedItem[],
  ) {
    const nextValue = cloneDesktopChatPinnedItems(value)
    chatSidebarPinnedItems.value = nextValue
    pendingPinnedItemsWrites += 1

    const update = pinnedItemsWriteQueue.then(() =>
      settings.updateSettings({ desktop: { chatSidebarPinnedItems: nextValue } }),
    )
    const result = update.then((saved) => {
      pendingPinnedItemsWrites -= 1
      if (pendingPinnedItemsWrites === 0) {
        chatSidebarPinnedItems.value = saved
          ? cloneDesktopChatPinnedItems(
              settings.config.value?.desktop.chatSidebarPinnedItems ?? nextValue,
            )
          : cloneDesktopChatPinnedItems(persistedChatSidebarPinnedItems.value)
      }
      return saved
    })
    pinnedItemsWriteQueue = result.then(() => undefined)
    return result
  }

  async function setAppSidebarCollapsed(value: boolean) {
    if (appSidebarCollapsed.value === value)
      return true
    return settings.updateSettings({ desktop: { sidebarCollapsed: value } })
  }

  return {
    appInfo: readonly(appInfo),
    appSidebarCollapsed: readonly(appSidebarCollapsed),
    chatSidebarPinnedItems: readonly(chatSidebarPinnedItems),
    initialize,
    setAppSidebarCollapsed,
    setChatSidebarPinnedItems,
  }
}

function cloneDesktopChatPinnedItems(
  items: ReadonlyArray<DesktopChatPinnedItem>,
): DesktopChatPinnedItem[] {
  return items.map(item => ({ id: item.id, kind: item.kind }))
}

function requireDesktopApi(): LexoraDesktopApi {
  const api = window.lexoraDesktop
  if (!api)
    throw new Error('Lexora Buddy Desktop API is unavailable')
  return api
}
