import type { MaybeRefOrGetter, Ref } from 'vue'
import type { BuddyAnimationName } from '@/pet/buddyAnimation'
import { shallowRef, toValue, watch } from 'vue'
import { setBuddyNativePetAnimation } from '@/lib/tauriRuntime'

export type BuddyNativePetAnimationSetter = (
  animation: BuddyAnimationName,
) => Promise<void> | void

export type BuddyNativePetAnimationPlaybackKey = number | string

export interface UseBuddyNativePetAnimationSyncOptions {
  animation: MaybeRefOrGetter<BuddyAnimationName | null | undefined>
  playbackKey?: MaybeRefOrGetter<BuddyNativePetAnimationPlaybackKey | null | undefined>
  setAnimation?: BuddyNativePetAnimationSetter
}

export interface UseBuddyNativePetAnimationSyncResult {
  lastSyncedAnimation: Ref<BuddyAnimationName | null>
}

export function useBuddyNativePetAnimationSync(
  options: UseBuddyNativePetAnimationSyncOptions,
): UseBuddyNativePetAnimationSyncResult {
  const lastSyncedAnimation = shallowRef<BuddyAnimationName | null>(null)

  watch(
    () => resolveNativePetAnimationSyncKey(options),
    (syncKey) => {
      if (!syncKey)
        return

      const animation = toValue(options.animation) ?? null
      if (!animation)
        return

      lastSyncedAnimation.value = animation

      void Promise.resolve(
        (options.setAnimation ?? setBuddyNativePetAnimation)(animation),
      ).catch(() => undefined)
    },
    { immediate: true },
  )

  return {
    lastSyncedAnimation,
  }
}

function resolveNativePetAnimationSyncKey(
  options: UseBuddyNativePetAnimationSyncOptions,
): string | null {
  const animation = toValue(options.animation) ?? null
  if (!animation)
    return null

  const playbackKey = toValue(options.playbackKey) ?? animation
  return `${animation}:${playbackKey}`
}
