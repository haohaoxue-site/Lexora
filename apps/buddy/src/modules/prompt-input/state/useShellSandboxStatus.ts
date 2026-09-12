import type { SandboxEnvironmentStatus, SandboxSetupResult } from '@buddy-shared/permissions/shellSandbox'
import type { Ref } from 'vue'
import { sandboxAvailability, sandboxEnvironmentStatusSchema, sandboxSetupResultSchema } from '@buddy-shared/permissions/shellSandbox'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

export function useShellSandboxStatus(open: Ref<boolean>) {
  const status = shallowRef<SandboxEnvironmentStatus | 'unknown' | 'checking'>('checking')
  const isSettingUp = shallowRef(false)
  const setupResult = shallowRef<SandboxSetupResult>()
  const availability = computed(() => sandboxAvailability(status.value))
  let disposed = false
  let revision = 0
  onScopeDispose(() => {
    disposed = true
  })

  async function refresh() {
    const current = ++revision
    try {
      const desktop = window.lexoraDesktop
      if (!desktop)
        throw new Error('Desktop API is unavailable')
      const next = sandboxEnvironmentStatusSchema.parse(await desktop.app.getSandboxStatus())
      if (!disposed && current === revision)
        status.value = next
    }
    catch {
      if (!disposed && current === revision)
        status.value = 'unknown'
    }
  }

  async function setup() {
    if (isSettingUp.value || !availability.value.action)
      return
    isSettingUp.value = true
    setupResult.value = undefined
    revision++
    try {
      const result = sandboxSetupResultSchema.parse(await window.lexoraDesktop?.app.setupSandbox())
      if (!disposed)
        setupResult.value = result
    }
    catch {
      if (!disposed)
        setupResult.value = 'failed'
    }
    finally {
      if (!disposed) {
        isSettingUp.value = false
        await refresh()
      }
    }
  }

  watch(open, (visible) => {
    if ((visible || status.value === 'checking') && !isSettingUp.value)
      void refresh()
  }, { immediate: true })
  return { availability, isSettingUp, setupResult, setup }
}
