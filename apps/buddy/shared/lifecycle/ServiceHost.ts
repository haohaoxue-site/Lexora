import type { ComponentEvent, OperationEvent } from '../observability/ApplicationEvents'
import { readDiagnosticErrorCode } from '../diagnostics/applicationDiagnostic'
import { ApplicationEvents } from '../observability/ApplicationEvents'

type Cleanup = () => void | Promise<void>

export interface ServiceScope {
  events: ApplicationEvents
  defer: (cleanup: Cleanup) => void
}

interface Component {
  kind: 'service' | 'operation'
  id: string
  events: ApplicationEvents
  cleanups: Cleanup[]
  status: 'starting' | 'ready' | 'failed' | 'stopped'
  pending: Promise<unknown> | null
}

export class ServiceHost {
  readonly events: ApplicationEvents
  readonly #components = new Map<string, Component>()
  #stopping = false
  #stopPromise: Promise<void> | null = null

  constructor(events = new ApplicationEvents()) {
    this.events = events
  }

  start<T>(id: string, initialize: (scope: ServiceScope) => T | Promise<T>, dependencies: readonly string[] = []): Promise<T> {
    return this.#start(id, initialize, dependencies, 'service')
  }

  step<T>(id: string, initialize: () => T | Promise<T>, dependencies: readonly string[] = []): Promise<T> {
    return this.#start(id, initialize, dependencies, 'operation')
  }

  #start<T>(id: string, initialize: (scope: ServiceScope) => T | Promise<T>, dependencies: readonly string[], kind: Component['kind']): Promise<T> {
    if (this.#stopping)
      return Promise.reject(new Error('Service host is stopping'))
    if (this.#components.has(id))
      return Promise.reject(new Error(`Component already registered: ${id}`))
    for (const dependency of dependencies) {
      if (this.#components.get(dependency)?.status !== 'ready')
        return Promise.reject(new Error(`Component dependency is not ready: ${dependency}`))
    }
    const component: Component = {
      kind,
      id,
      events: this.events.scope({ component: id, operationId: crypto.randomUUID() }),
      cleanups: [],
      status: 'starting',
      pending: null,
    }
    this.#components.set(id, component)
    if (kind === 'service')
      this.#publish(component, 'component.registered')
    this.#publish(component, kind === 'service' ? 'component.starting' : 'startup.step.started')
    const startedAt = performance.now()
    const pending = Promise.resolve().then(() => initialize({
      events: component.events,
      defer: cleanup => component.cleanups.push(cleanup),
    })).then((value) => {
      component.status = 'ready'
      if (kind === 'operation' || !this.#stopping)
        this.#publish(component, kind === 'service' ? 'component.ready' : 'startup.step.completed', startedAt)
      return value
    }, (error: unknown) => {
      component.status = 'failed'
      this.#publish(component, kind === 'service' ? 'component.start_failed' : 'startup.step.failed', startedAt, error)
      throw error
    })
    component.pending = pending
    return pending
  }

  stop(): Promise<void> {
    this.#stopping = true
    return this.#stopPromise ??= this.#stop()
  }

  async #stop(): Promise<void> {
    const failures: unknown[] = []
    for (const component of [...this.#components.values()].reverse()) {
      await component.pending?.catch(() => {})
      if (component.kind === 'operation')
        continue
      const startedAt = performance.now()
      this.#publish(component, 'component.stopping')
      const componentFailures: unknown[] = []
      for (const cleanup of component.cleanups.splice(0).reverse()) {
        try {
          await cleanup()
        }
        catch (error) {
          componentFailures.push(error)
        }
      }
      component.status = componentFailures.length ? 'failed' : 'stopped'
      if (componentFailures.length) {
        const error = new AggregateError(componentFailures, 'Component cleanup failed')
        this.#publish(component, 'component.stop_failed', startedAt, error)
        failures.push(error)
      }
      else {
        this.#publish(component, 'component.stopped', startedAt)
      }
    }
    if (failures.length)
      throw new AggregateError(failures, 'Service host cleanup failed')
  }

  #publish(component: Component, event: ComponentEvent | OperationEvent, startedAt?: number, error?: unknown): void {
    component.events.publish({
      event,
      level: event.endsWith('failed') ? 'error' : 'info',
      ...(startedAt === undefined ? {} : { durationMs: Math.round(performance.now() - startedAt) }),
      ...(error === undefined ? {} : { errorCode: readDiagnosticErrorCode(error) }),
    })
  }
}
