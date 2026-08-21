import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalBuddyServiceSupervisorState } from '@buddy-electron/shared/localChatApi'
import type { ShallowRef } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, readonly, shallowRef } from 'vue'
import { translateBuddy } from '@/i18n/buddyI18n'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'

interface UseRuntimeSupervisorStoreOptions {
  api: LexoraDesktopApi['localChat']['runtime']
  language: Readonly<ShallowRef<BuddyLocale>>
}

const RUNTIME_FAILURE_MESSAGE_KEYS = {
  EVENT_LOG_CORRUPTED: 'runtime.failure.EVENT_LOG_CORRUPTED',
  EVENT_PROJECTION_FAILED: 'runtime.failure.EVENT_PROJECTION_FAILED',
  EVENT_STORAGE_FAILED: 'runtime.failure.EVENT_STORAGE_FAILED',
  RUNTIME_PROTOCOL_FAILED: 'runtime.failure.RUNTIME_PROTOCOL_FAILED',
  RUNTIME_PROTOCOL_INCOMPATIBLE: 'runtime.failure.RUNTIME_PROTOCOL_INCOMPATIBLE',
  RUNTIME_READINESS_TIMEOUT: 'runtime.failure.RUNTIME_READINESS_TIMEOUT',
  RUNTIME_SPAWN_FAILED: 'runtime.failure.RUNTIME_SPAWN_FAILED',
  RUNTIME_START_FAILED: 'runtime.failure.RUNTIME_START_FAILED',
  RUNTIME_STOPPED: 'runtime.failure.RUNTIME_STOPPED',
  RUNTIME_TERMINATION_FAILED: 'runtime.failure.RUNTIME_TERMINATION_FAILED',
} as const

export function useRuntimeSupervisorStore(options: UseRuntimeSupervisorStoreOptions) {
  const runtimeState = shallowRef<LocalBuddyServiceSupervisorState>({
    lastError: null,
    pid: null,
    restartAttempt: 0,
    status: 'stopped',
  })
  const restartError = shallowRef<string | null>(null)
  let stateGeneration = 0

  const runtimeError = computed(() => {
    const code = runtimeState.value.lastError
    return code ? translateBuddy(options.language.value, RUNTIME_FAILURE_MESSAGE_KEYS[code]) : null
  })
  const stopRuntimeState = options.api.onStateChanged((state) => {
    stateGeneration += 1
    runtimeState.value = state
  })

  async function loadStatus() {
    const generation = stateGeneration
    const state = await options.api.getStatus()
    if (generation === stateGeneration)
      runtimeState.value = state
  }

  async function restartRuntime() {
    restartError.value = null
    const generation = stateGeneration
    try {
      const state = await options.api.restart()
      if (generation === stateGeneration)
        runtimeState.value = state
      return true
    }
    catch (error) {
      restartError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
  }

  function clearRestartError() {
    restartError.value = null
  }

  return {
    clearRestartError,
    dispose: stopRuntimeState,
    loadStatus,
    restartError: readonly(restartError),
    restartRuntime,
    runtimeError: readonly(runtimeError),
    runtimeState: readonly(runtimeState),
  }
}

export type RuntimeSupervisorStore = ReturnType<typeof useRuntimeSupervisorStore>
