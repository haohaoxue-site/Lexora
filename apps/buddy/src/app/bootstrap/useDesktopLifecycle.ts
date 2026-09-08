import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { useDesktopShellState } from '../shell/useDesktopShellState'
import type { DesktopAppState } from './useDesktopAppState'
import type { AutomationCapability } from '@/modules/automations'
import type { TaskCapability } from '@/modules/tasks'
import { onScopeDispose, watch } from 'vue'

interface DesktopLifecycleOptions {
  api: LexoraDesktopApi
  appState: DesktopAppState
  automations: AutomationCapability
  shell: ReturnType<typeof useDesktopShellState>
  tasks: TaskCapability
}

export function useDesktopLifecycle(options: DesktopLifecycleOptions) {
  const { api, appState, automations, shell, tasks } = options
  let initializationSettled = false
  let tasksInitializing = false
  let pendingRuntimeReady = false
  let disposed = false
  const stopRuntimeReadyWatch = watch(appState.stores.runtimeSupervisor.runtimeState, (state, previousState) => {
    if (previousState.status === 'ready' || state.status !== 'ready')
      return
    if (!initializationSettled) {
      pendingRuntimeReady ||= tasksInitializing
      return
    }
    void tasks.refreshRuntimeDependentState()
    void automations.refresh()
  }, { flush: 'sync' })

  const ready = initialize()
  const stopHiddenListener = api.app.onHidden(() => {
    void ready.then(() => !disposed && tasks.flushDrafts()).catch(() => undefined)
  })
  const stopBeforeQuitListener = api.app.onBeforeQuit(async () => {
    try {
      await ready
      return !disposed && await tasks.flushDrafts()
    }
    catch {
      return false
    }
  })

  async function initialize(): Promise<void> {
    await appState.initialize()
    if (disposed)
      return
    tasksInitializing = true
    await Promise.all([automations.initialize(), tasks.initialize(), shell.initialize()])
    if (disposed)
      return
    initializationSettled = true
    if (pendingRuntimeReady && !disposed) {
      pendingRuntimeReady = false
      await Promise.all([tasks.refreshRuntimeDependentState(), automations.refresh()])
    }
  }

  onScopeDispose(() => {
    disposed = true
    stopHiddenListener()
    stopBeforeQuitListener()
    stopRuntimeReadyWatch()
    automations.dispose()
    tasks.dispose()
    appState.dispose()
  })

  return { ready }
}
