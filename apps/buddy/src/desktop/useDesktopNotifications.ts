import type { LocalChatApi, LocalNotification } from '../../electron/shared/localChatApi'
import { computed, readonly, shallowRef } from 'vue'

export type DesktopNotificationFilter = 'all' | 'unseen'

export function filterDesktopNotifications(
  items: ReadonlyArray<LocalNotification>,
  filter: DesktopNotificationFilter,
): ReadonlyArray<LocalNotification> {
  return filter === 'unseen'
    ? items.filter(item => item.attention === 'unseen')
    : items
}

export function useDesktopNotifications(api: LocalChatApi) {
  const items = shallowRef<ReadonlyArray<LocalNotification>>([])
  const unseenCount = shallowRef(0)
  const isLoading = shallowRef(false)
  const error = shallowRef<unknown>(null)
  let loadPromise: Promise<boolean> | null = null

  const hasNotifications = computed(() => items.value.length > 0)

  function apply(value: Awaited<ReturnType<LocalChatApi['notifications']['list']>>) {
    items.value = value.items
    unseenCount.value = value.unseenCount
  }

  function load(): Promise<boolean> {
    if (loadPromise)
      return loadPromise
    isLoading.value = true
    error.value = null
    loadPromise = api.notifications.list()
      .then((value) => {
        apply(value)
        return true
      })
      .catch((loadError) => {
        error.value = loadError
        return false
      })
      .finally(() => {
        isLoading.value = false
        loadPromise = null
      })
    return loadPromise
  }

  async function markSeen(notification: LocalNotification): Promise<boolean> {
    try {
      apply(await api.notifications.markSeen(notification.id, notification.revision))
      return true
    }
    catch (markError) {
      error.value = markError
      return false
    }
  }

  async function markAllSeen(): Promise<boolean> {
    try {
      apply(await api.notifications.markAllSeen())
      return true
    }
    catch (markError) {
      error.value = markError
      return false
    }
  }

  return {
    error: readonly(error),
    hasNotifications: readonly(hasNotifications),
    isLoading: readonly(isLoading),
    items: readonly(items),
    load,
    markAllSeen,
    markSeen,
    unseenCount: readonly(unseenCount),
  }
}
