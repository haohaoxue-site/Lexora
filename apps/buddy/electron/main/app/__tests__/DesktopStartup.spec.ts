import type { ApplicationDiagnostic } from '../../../../shared/diagnostics/applicationDiagnostic'
import { describe, expect, it } from 'vitest'
import { PrivateDirectoryError } from '../../../../platform/windows/privateDirectories'
import { ServiceHost } from '../../../../shared/lifecycle/ServiceHost'
import { ApplicationEvents } from '../../../../shared/observability/ApplicationEvents'
import { DesktopStartup } from '../DesktopStartup'

function fixture() {
  const events: ApplicationDiagnostic[] = []
  const publisher = new ApplicationEvents()
  const startup = new DesktopStartup(publisher)
  publisher.subscribe((event) => {
    events.push(event)
  })
  const send = (component: string, event: string, operationId = component, generation = 'runtime-1') => startup.observe({ component, event, level: 'info', operationId, generation }, { sourceId: generation })
  const complete = (component: string, generation = 'runtime-1') => {
    const operationId = component === 'runtime.connection' ? generation : component
    send(component, 'component.starting', operationId, generation)
    send(component, 'component.ready', operationId, generation)
  }
  return { events, startup, send, complete }
}

describe('application lifecycle snapshot', () => {
  it('retains the first failure and its operation without relabeling cleanup as cancellation', async () => {
    const events = new ApplicationEvents()
    const records: ApplicationDiagnostic[] = []
    const startup = new DesktopStartup(events)
    events.subscribe(event => records.push(event))
    events.subscribe(startup.observe)
    const host = new ServiceHost(events)
    const error = new PrivateDirectoryError('PRIVATE_DIRECTORIES_UNSAFE', { kind: 'private_directories', operation: 'validate_acl', directoryRole: 'session_data', exitCode: 1 })
    await expect(host.start('desktop', () => host.step('desktop.environment', () => {
      throw error
    }))).rejects.toBe(error)
    startup.failed(error)
    startup.stopping()
    await host.stop()
    startup.stopped()
    const operation = records.find(record => record.event === 'startup.step.failed')!
    expect(records.filter(record => record.event === 'app.start_failed')).toEqual([
      expect.objectContaining({ component: 'desktop.environment', parentOperationId: operation.operationId, errorCode: error.code, failure: error.failure }),
    ])
    expect(records.some(record => record.event === 'app.start_cancelled')).toBe(false)
    expect(startup.state.status).toBe('stopped')
  })

  it('reports a failure outside a managed operation once', () => {
    const { startup, events } = fixture()
    startup.failed(Object.assign(new Error('fixture-private-path'), { code: 'EACCES' }))
    startup.failed(new Error('subsequent failure'))
    startup.stopping()
    expect(events.filter(event => event.event === 'app.start_failed')).toEqual([expect.objectContaining({ errorCode: 'EACCES' })])
    expect(events.some(event => event.event === 'app.start_cancelled')).toBe(false)
    expect(JSON.stringify(events)).not.toContain('fixture-private')
  })

  it('reports an actual startup cancellation once and ignores delayed completion', () => {
    const { startup, events, complete } = fixture()
    startup.stopping()
    startup.stopping()
    complete('desktop')
    expect(events.filter(event => event.event === 'app.start_cancelled')).toHaveLength(1)
    expect(events.some(event => event.event === 'app.start_failed' || event.event === 'app.ready')).toBe(false)
  })

  it('waits for renderer hydration, recovers, and publishes readiness once', () => {
    const { startup, events, complete, send } = fixture()
    complete('desktop')
    complete('runtime.connection')
    send('renderer', 'component.starting')
    send('renderer.providers', 'component.starting')
    send('renderer.providers', 'component.start_failed')
    expect(startup.state.status).toBe('failed')
    expect(startup.state.hasBeenReady).toBe(false)
    complete('renderer')
    expect(startup.state.status).toBe('ready')
    expect(startup.state.hasBeenReady).toBe(true)
    expect(events.filter(event => event.event === 'app.ready')).toHaveLength(1)
    const snapshot = startup.state
    Object.assign(snapshot.stages[0]!, { status: 'failed' })
    expect(startup.state.stages[0]?.status).toBe('completed')
  })

  it('rejects delayed events from both the old runtime and its renderer refresh', () => {
    const { startup, send, complete } = fixture()
    complete('desktop')
    complete('runtime.connection')
    complete('renderer')
    const revision = startup.state.revision
    send('runtime.connection', 'component.starting', 'runtime-2', 'runtime-2')
    send('runtime.database', 'component.ready', 'old', 'runtime-1')
    complete('renderer', 'runtime-1')
    expect(startup.state.status).toBe('starting')
    expect(startup.state.revision).toBe(revision + 1)
    complete('runtime.connection', 'runtime-2')
    complete('renderer', 'runtime-2')
    expect(startup.state.status).toBe('ready')
  })

  it('does not announce readiness after shutdown has begun', () => {
    const { startup, events, complete } = fixture()
    complete('desktop')
    complete('runtime.connection')
    startup.stopping()
    complete('renderer')
    expect(startup.state.status).toBe('stopping')
    expect(events.some(event => event.event === 'app.ready')).toBe(false)
  })
})
