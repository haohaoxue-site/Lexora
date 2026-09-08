import type { DesktopTaskPinnedItem } from '@buddy-electron/shared/desktopApi'
import type { Ref } from 'vue'
import { computed, readonly, shallowRef, watch } from 'vue'

interface TaskPinnedItemsSettings {
  config: Readonly<Ref<{ desktop: { taskSidebarPinnedItems: readonly DesktopTaskPinnedItem[] } } | null>>
  updateSettings: (patch: { desktop: { taskSidebarPinnedItems: DesktopTaskPinnedItem[] } }) => Promise<boolean>
}

export function useTaskPinnedItems(settings: TaskPinnedItemsSettings) {
  const persistedTaskSidebarPinnedItems = computed(() =>
    settings.config.value?.desktop.taskSidebarPinnedItems ?? [],
  )
  const pinnedItems = shallowRef<ReadonlyArray<DesktopTaskPinnedItem>>([])
  let pendingPinnedItemsWrites = 0
  let pinnedItemsWriteQueue = Promise.resolve()

  watch(
    persistedTaskSidebarPinnedItems,
    (value) => {
      if (pendingPinnedItemsWrites === 0)
        pinnedItems.value = cloneDesktopTaskPinnedItems(value)
    },
    { immediate: true },
  )

  function setPinnedItems(
    value: DesktopTaskPinnedItem[],
  ) {
    const nextValue = cloneDesktopTaskPinnedItems(value)
    pinnedItems.value = nextValue
    pendingPinnedItemsWrites += 1

    const update = pinnedItemsWriteQueue.then(() =>
      settings.updateSettings({ desktop: { taskSidebarPinnedItems: nextValue } }),
    )
    const result = update.then((saved) => {
      pendingPinnedItemsWrites -= 1
      if (pendingPinnedItemsWrites === 0) {
        pinnedItems.value = saved
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

  return {
    pinnedItems: readonly(pinnedItems),
    setPinnedItems,
  }
}

function cloneDesktopTaskPinnedItems(
  items: ReadonlyArray<DesktopTaskPinnedItem>,
): DesktopTaskPinnedItem[] {
  return items.map(item => ({ id: item.id, kind: item.kind }))
}
