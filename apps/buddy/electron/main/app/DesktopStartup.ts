import type { ApplicationDiagnostic } from '../../../shared/diagnostics/applicationDiagnostic'
import type { ApplicationStartupState } from '../../../shared/diagnostics/applicationStartup'
import type { ApplicationEvents } from '../../../shared/observability/ApplicationEvents'

const REQUIRED_HOSTS = ['desktop', 'runtime.connection', 'renderer'] as const
const COMPONENT_STATUSES = {
  'startup.step.started': 'running',
  'startup.step.completed': 'completed',
  'startup.step.failed': 'failed',
  'component.registered': 'pending',
  'component.starting': 'running',
  'component.ready': 'completed',
  'component.start_failed': 'failed',
} as const

export class DesktopStartup {
  readonly #events: ApplicationEvents
  readonly #startedAt = performance.now()
  readonly #listeners = new Set<(state: ApplicationStartupState) => void>()
  #state: ApplicationStartupState = {
    revision: 0,
    generation: null,
    hasBeenReady: false,
    status: 'starting',
    stages: REQUIRED_HOSTS.map(stage => ({ stage, status: 'pending' })),
  }

  constructor(events: ApplicationEvents) {
    this.#events = events
  }

  get state(): ApplicationStartupState {
    return structuredClone(this.#state)
  }

  onStateChange(listener: (state: ApplicationStartupState) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  stopping(): void {
    if (!this.#state.hasBeenReady)
      this.#events.publish({ event: 'app.start_cancelled', level: 'info' })
    this.#state = { ...this.#state, status: 'stopping' }
    this.#publishState()
  }

  stopped(): void {
    this.#state = { ...this.#state, status: 'stopped' }
    this.#publishState()
  }

  readonly observe = (event: ApplicationDiagnostic, source?: { sourceId: string }): void => {
    if (['runtime.restarting', 'runtime.offline', 'runtime.stopping'].includes(event.event) && !['stopping', 'stopped'].includes(this.#state.status)) {
      const failed = event.event === 'runtime.offline'
      if (failed && this.#state.status !== 'failed')
        this.#events.publish({ event: this.#state.hasBeenReady ? 'app.degraded' : 'app.start_failed', level: 'error', component: 'runtime.connection', errorCode: event.errorCode })
      this.#state = { ...this.#state, status: failed ? 'failed' : 'starting', stages: this.#state.stages.map(stage => stage.stage === 'runtime.connection' ? { ...stage, status: failed ? 'failed' : 'running', errorCode: event.errorCode } : stage) }
      this.#publishState()
      return
    }
    const component = event.component
    if (!component || !(event.event in COMPONENT_STATUSES) || ['stopping', 'stopped'].includes(this.#state.status))
      return
    const status = COMPONENT_STATUSES[event.event as keyof typeof COMPONENT_STATUSES]
    let stages = this.#state.stages
    if (component === 'runtime.connection' && status === 'running') {
      const generation = event.operationId ?? source?.sourceId ?? null
      stages = stages.filter(stage => !stage.stage.startsWith('runtime.') && !stage.stage.startsWith('renderer.'))
        .map(stage => stage.stage === 'renderer' ? { stage: stage.stage, status: 'pending' as const } : stage)
      this.#state = { ...this.#state, generation }
    }
    else if (component.startsWith('runtime.') && source?.sourceId !== this.#state.generation) {
      return
    }
    if ((component === 'renderer' || component.startsWith('renderer.')) && event.generation !== this.#state.generation)
      return
    if (component === 'renderer' && status === 'running')
      stages = stages.filter(stage => !stage.stage.startsWith('renderer.'))
    const previous = stages.find(stage => stage.stage === component)
    if (status !== 'pending' && status !== 'running' && previous?.operationId !== event.operationId)
      return
    const next = { stage: component, status, operationId: event.operationId, durationMs: event.durationMs, errorCode: event.errorCode }
    stages = previous ? stages.map(stage => stage === previous ? next : stage) : [...stages, next]
    const ready = REQUIRED_HOSTS.every(id => stages.some(stage => stage.stage === id && stage.status === 'completed'))
    const failed = stages.some(stage => stage.status === 'failed')
    const stateStatus = failed ? 'failed' : ready ? 'ready' : 'starting'
    const wasReady = this.#state.hasBeenReady
    const previousStatus = this.#state.status
    this.#state = { ...this.#state, status: stateStatus, stages, hasBeenReady: wasReady || ready }
    if (ready && previousStatus !== 'ready')
      this.#events.publish({ event: wasReady ? 'app.recovered' : 'app.ready', level: 'info', durationMs: Math.round(performance.now() - this.#startedAt) })
    else if (stateStatus === 'failed' && previousStatus !== 'failed')
      this.#events.publish({ event: wasReady ? 'app.degraded' : 'app.start_failed', level: 'error', component, errorCode: event.errorCode })
    this.#publishState()
  }

  #publishState(): void {
    this.#state = { ...this.#state, revision: this.#state.revision + 1 }
    for (const listener of this.#listeners) {
      try {
        listener(this.state)
      }
      catch {}
    }
  }
}
