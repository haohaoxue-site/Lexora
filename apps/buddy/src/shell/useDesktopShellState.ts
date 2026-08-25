import type {
  DesktopAppInfo,
  DesktopTaskPinnedItem,
  LexoraDesktopApi,
} from '@buddy-electron/shared/desktopApi'
import type { ApplicationSettingsStore } from '@/stores/useApplicationSettingsStore'
import { computed, readonly, shallowRef, watch } from 'vue'

export function useDesktopShellState(settings: ApplicationSettingsStore) {
  const api = requireDesktopApi()
  const appInfo = shallowRef<DesktopAppInfo | null>(null)
  const appSidebarCollapsed = computed(() => settings.config.value?.desktop.sidebarCollapsed ?? false)
  const persistedTaskSidebarPinnedItems = computed(() =>
    settings.config.value?.desktop.taskSidebarPinnedItems ?? [],
  )
  const taskSidebarPinnedItems = shallowRef<ReadonlyArray<DesktopTaskPinnedItem>>([])
  let pendingPinnedItemsWrites = 0
  let pinnedItemsWriteQueue = Promise.resolve()

  watch(
    persistedTaskSidebarPinnedItems,
    (value) => {
      if (pendingPinnedItemsWrites === 0)
        taskSidebarPinnedItems.value = cloneDesktopTaskPinnedItems(value)
    },
    { immediate: true },
  )

  async function initialize() {
    appInfo.value = await api.app.getInfo().catch(() => null)
  }

  function setTaskSidebarPinnedItems(
    value: DesktopTaskPinnedItem[],
  ) {
    const nextValue = cloneDesktopTaskPinnedItems(value)
    taskSidebarPinnedItems.value = nextValue
    pendingPinnedItemsWrites += 1

    const update = pinnedItemsWriteQueue.then(() =>
      settings.updateSettings({ desktop: { taskSidebarPinnedItems: nextValue } }),
    )
    const result = update.then((saved) => {
      pendingPinnedItemsWrites -= 1
      if (pendingPinnedItemsWrites === 0) {
        taskSidebarPinnedItems.value = saved
          ? cloneDesktopTaskPinnedItems(
              settings.config.value?.desktop.taskSidebarPinnedItems ?? nextValue,
            )
          : cloneDesktopTaskPinnedItems(persistedTaskSidebarPinnedItems.value)
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
    taskSidebarPinnedItems: readonly(taskSidebarPinnedItems),
    initialize,
    setAppSidebarCollapsed,
    setTaskSidebarPinnedItems,
  }
}

function cloneDesktopTaskPinnedItems(
  items: ReadonlyArray<DesktopTaskPinnedItem>,
): DesktopTaskPinnedItem[] {
  return items.map(item => ({ id: item.id, kind: item.kind }))
}

function requireDesktopApi(): LexoraDesktopApi {
  const api = window.lexoraDesktop
  if (!api)
    throw new Error('Lexora Buddy Desktop API is unavailable')
  return api
}
