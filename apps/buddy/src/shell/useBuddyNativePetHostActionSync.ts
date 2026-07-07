import type { MaybeRefOrGetter, Ref } from 'vue'
import type { BuddyNativePetHostAction } from '@/pet/buddyHostAction'
import { shallowRef, toValue, watch } from 'vue'
import { controlBuddyNativePetHostAction } from '@/lib/tauriRuntime'

export type BuddyNativePetHostActionController = (
  action: BuddyNativePetHostAction,
) => Promise<void> | void

export type BuddyNativePetHostActionPlaybackKey = number | string

export interface UseBuddyNativePetHostActionSyncOptions {
  action: MaybeRefOrGetter<BuddyNativePetHostAction | null | undefined>
  controlHostAction?: BuddyNativePetHostActionController
  playbackKey?: MaybeRefOrGetter<BuddyNativePetHostActionPlaybackKey | null | undefined>
}

export interface UseBuddyNativePetHostActionSyncResult {
  lastSyncedPlaybackKey: Ref<string | null>
}

export function useBuddyNativePetHostActionSync(
  options: UseBuddyNativePetHostActionSyncOptions,
): UseBuddyNativePetHostActionSyncResult {
  const lastSyncedPlaybackKey = shallowRef<string | null>(null)

  watch(
    () => resolveNativePetHostActionSyncKey(options),
    (syncKey) => {
      if (!syncKey || syncKey === lastSyncedPlaybackKey.value)
        return

      const action = toValue(options.action) ?? null
      if (!action)
        return

      lastSyncedPlaybackKey.value = syncKey

      void Promise.resolve(
        (options.controlHostAction ?? controlBuddyNativePetHostAction)(action),
      ).catch(() => undefined)
    },
    { immediate: true },
  )

  return {
    lastSyncedPlaybackKey,
  }
}

function resolveNativePetHostActionSyncKey(
  options: UseBuddyNativePetHostActionSyncOptions,
): string | null {
  const action = toValue(options.action) ?? null
  if (!action)
    return null

  const playbackKey = toValue(options.playbackKey)
  if (playbackKey !== null && playbackKey !== undefined)
    return String(playbackKey)

  return JSON.stringify(action)
}
