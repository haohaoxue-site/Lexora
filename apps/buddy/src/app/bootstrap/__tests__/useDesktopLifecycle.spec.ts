import { deferred } from '@buddy-tests/deferred'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useDesktopLifecycle } from '../useDesktopLifecycle'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0))
    cleanup()
})

describe('desktop Runtime readiness during Draft initialization', () => {
  it('replays readiness received during initial recovery before confirming application exit', async () => {
    const initializing = deferred<void>()
    const fixture = createFixture({ initializeTasks: () => initializing.promise })
    await vi.waitFor(() => expect(fixture.tasks.initialize).toHaveBeenCalledOnce())
    fixture.setRuntimeStatus('ready')
    fixture.setRuntimeStatus('starting')
    fixture.setRuntimeStatus('ready')
    const quitting = fixture.beforeQuit()
    initializing.resolve()

    await fixture.lifecycle.ready
    expect(await quitting).toBe(true)
    expect(fixture.tasks.refreshRuntimeDependentState).toHaveBeenCalledOnce()
    expect(fixture.automations.refresh).toHaveBeenCalledOnce()
    expect(fixture.saved.value).toBe(true)
  })

  it('uses initial task loading when readiness arrives before task initialization starts', async () => {
    const initializing = deferred<void>()
    const fixture = createFixture({ initializeApp: () => initializing.promise })
    fixture.setRuntimeStatus('ready')
    initializing.resolve()

    await fixture.lifecycle.ready
    expect(fixture.tasks.initialize).toHaveBeenCalledOnce()
    expect(fixture.tasks.refreshRuntimeDependentState).not.toHaveBeenCalled()
    expect(await fixture.beforeQuit()).toBe(false)
  })

  it('discards queued readiness when the Desktop scope is disposed', async () => {
    const initializing = deferred<void>()
    const fixture = createFixture({ initializeTasks: () => initializing.promise })
    await vi.waitFor(() => expect(fixture.tasks.initialize).toHaveBeenCalledOnce())
    fixture.setRuntimeStatus('ready')
    fixture.dispose()
    initializing.resolve()

    await fixture.lifecycle.ready
    expect(fixture.tasks.refreshRuntimeDependentState).not.toHaveBeenCalled()
    expect(fixture.saved.value).toBe(false)
  })
})

function createFixture(options: { initializeApp?: () => Promise<void>, initializeTasks?: () => Promise<void> } = {}) {
  const runtimeState = shallowRef({ status: 'starting' })
  const saved = shallowRef(false)
  let beforeQuit = async () => false
  const tasks = {
    dispose: vi.fn(),
    flushDrafts: async () => saved.value,
    initialize: vi.fn(options.initializeTasks ?? (async () => {})),
    refreshRuntimeDependentState: vi.fn(async () => saved.value = true),
  }
  const automations = { dispose: vi.fn(), initialize: async () => {}, refresh: vi.fn(async () => {}) }
  const scope = effectScope()
  const lifecycle = scope.run(() => useDesktopLifecycle({
    api: {
      app: {
        onBeforeQuit: (listener: () => Promise<boolean>) => {
          beforeQuit = listener
          return () => {}
        },
        onHidden: () => () => {},
        onOpenTarget: () => () => {},
      },
    },
    appState: {
      dispose: () => {},
      initialize: options.initializeApp ?? (async () => {}),
      stores: { runtimeSupervisor: { runtimeState } },
    },
    automations,
    shell: { initialize: async () => {} },
    tasks,
  } as unknown as Parameters<typeof useDesktopLifecycle>[0]))!
  let disposed = false
  const dispose = () => {
    if (disposed)
      return
    disposed = true
    scope.stop()
  }
  cleanups.push(dispose)
  return { automations, beforeQuit: () => beforeQuit(), dispose, lifecycle, saved, setRuntimeStatus: (status: string) => runtimeState.value = { status }, tasks }
}
