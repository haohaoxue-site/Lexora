import type { LocalChatApi, LocalNotification } from '@buddy-electron/shared/localChatApi'
import { computed, readonly, shallowRef } from 'vue'

export type NotificationFilter = 'all' | 'unseen'

export function filterNotifications(
  items: ReadonlyArray<LocalNotification>,
  filter: NotificationFilter,
): ReadonlyArray<LocalNotification> {
  return filter === 'unseen'
    ? items.filter(item => item.attention === 'unseen')
    : items
}

export function useNotificationCenterStore(api: LocalChatApi) {
  const items = shallowRef<ReadonlyArray<LocalNotification>>([])
  const unseenCount = shallowRef(0)
  const isLoading = shallowRef(false)
  const error = shallowRef<unknown>(null)
  let loadPromise: Promise<boolean> | null = null
  let refreshRequested = false
  let stopped = false
  const stopRunEvent = api.chat.onRunEvent((event) => {
    if (event.type === 'run.completed' || event.type === 'run.failed')
      void load()
  })
  const stopAutomationChanged = api.automations.onChanged(() => void load())

  const hasNotifications = computed(() => items.value.length > 0)

  function apply(value: Awaited<ReturnType<LocalChatApi['notifications']['list']>>) {
    items.value = value.items
    unseenCount.value = value.unseenCount
  }

  function load(): Promise<boolean> {
    if (stopped)
      return Promise.resolve(false)
    if (loadPromise) {
      refreshRequested = true
      return loadPromise
    }
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
        if (refreshRequested) {
          refreshRequested = false
          void load()
        }
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

  function dispose(): void {
    stopped = true
    stopAutomationChanged()
    stopRunEvent()
  }

  return {
    error: readonly(error),
    dispose,
    hasNotifications: readonly(hasNotifications),
    isLoading: readonly(isLoading),
    items: readonly(items),
    load,
    markAllSeen,
    markSeen,
    unseenCount: readonly(unseenCount),
  }
}

export type NotificationCenterStore = ReturnType<typeof useNotificationCenterStore>
