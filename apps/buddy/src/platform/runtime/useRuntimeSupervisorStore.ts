import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalBuddyServiceSupervisorState } from '@buddy-shared/runtime/serviceState'

import type { ShallowRef } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, readonly, shallowRef } from 'vue'
import { translateBuddy } from '@/i18n/buddyI18n'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'

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
  let disposed = false

  const canRestartRuntime = computed(() => (
    runtimeState.value.status === 'offline' && runtimeState.value.pid === null
  ))
  const runtimeError = computed(() => {
    const code = runtimeState.value.lastError
    return code ? translateBuddy(options.language.value, RUNTIME_FAILURE_MESSAGE_KEYS[code]) : null
  })
  const stopRuntimeState = options.api.onStateChanged((state) => {
    if (disposed)
      return
    stateGeneration += 1
    runtimeState.value = state
  })

  async function loadStatus() {
    if (disposed)
      return
    const generation = stateGeneration
    const state = await options.api.getStatus()
    if (!disposed && generation === stateGeneration)
      runtimeState.value = state
  }

  async function restartRuntime() {
    if (disposed)
      return false
    restartError.value = null
    const generation = stateGeneration
    try {
      const state = await options.api.restart()
      if (!disposed && generation === stateGeneration)
        runtimeState.value = state
      return true
    }
    catch (error) {
      if (!disposed)
        restartError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
  }

  function clearRestartError() {
    restartError.value = null
  }

  return {
    canRestartRuntime,
    clearRestartError,
    dispose() {
      if (disposed)
        return
      disposed = true
      stateGeneration += 1
      stopRuntimeState()
    },
    loadStatus,
    restartError: readonly(restartError),
    restartRuntime,
    runtimeError: readonly(runtimeError),
    runtimeState: readonly(runtimeState),
  }
}

export type RuntimeSupervisorStore = ReturnType<typeof useRuntimeSupervisorStore>
