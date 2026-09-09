import type { ApplicationDiagnostic } from '../../../../shared/diagnostics/applicationDiagnostic'
import { describe, expect, it } from 'vitest'
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
