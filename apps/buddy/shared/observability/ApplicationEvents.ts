import type { ApplicationDiagnostic, ApplicationDiagnosticReporter } from '../diagnostics/applicationDiagnostic'
import { readDiagnosticErrorCode } from '../diagnostics/applicationDiagnostic'

export type ComponentEvent = `component.${'registered' | 'starting' | 'ready' | 'start_failed' | 'stopping' | 'stopped' | 'stop_failed'}`
export type OperationName = 'startup.step' | 'shutdown.step' | 'rpc.request' | 'rpc.handler' | 'session.open' | 'session.close' | 'session.resources' | 'session.recovery' | 'automation.dispatch' | 'provider.refresh' | 'connector.connect'
export type OperationEvent = `${OperationName}.${'started' | 'completed' | 'failed' | 'cancelled'}`
export type EventContext = Omit<ApplicationDiagnostic, 'event' | 'level' | 'durationMs' | 'errorCode' | 'errorType' | 'count' | 'attempt' | 'sourceSequence' | 'occurredAt'>
type Listener = (event: Readonly<ApplicationDiagnostic>) => unknown

interface EventChannel {
  sequence: number
  listeners: Set<Listener>
}

export class ApplicationEvents {
  readonly #channel: EventChannel
  readonly #context: EventContext

  constructor(context: EventContext = {}, channel?: EventChannel) {
    this.#context = Object.freeze({ ...context })
    this.#channel = channel ?? { sequence: 0, listeners: new Set() }
  }

  scope(context: EventContext): ApplicationEvents {
    return new ApplicationEvents({ ...this.#context, ...context }, this.#channel)
  }

  subscribe(listener: Listener): () => void {
    this.#channel.listeners.add(listener)
    return () => this.#channel.listeners.delete(listener)
  }

  readonly publish: ApplicationDiagnosticReporter = (input) => {
    const event = Object.freeze({
      ...this.#context,
      ...input,
      sourceSequence: ++this.#channel.sequence,
      occurredAt: new Date().toISOString(),
    })
    for (const listener of [...this.#channel.listeners]) {
      try {
        const result = listener(event)
        void Promise.resolve(result).catch(() => this.#failedListener(listener))
      }
      catch {
        this.#failedListener(listener)
      }
    }
  }

  #failedListener(listener: Listener): void {
    if (this.#channel.listeners.delete(listener))
      this.publish({ event: 'observer.failed', component: 'observability', level: 'warn' })
  }

  async operation<T>(name: OperationName, operation: (events: ApplicationEvents) => T | Promise<T>): Promise<T> {
    const operationId = crypto.randomUUID()
    const events = this.scope({ operationId, parentOperationId: this.#context.operationId })
    const startedAt = performance.now()
    events.publish({ event: `${name}.started`, level: 'info' })
    try {
      const result = await operation(events)
      events.publish({ event: `${name}.completed`, level: 'info', durationMs: Math.round(performance.now() - startedAt) })
      return result
    }
    catch (error) {
      const cancelled = error instanceof Error && error.name === 'AbortError'
      events.publish({
        event: `${name}.${cancelled ? 'cancelled' : 'failed'}`,
        level: cancelled ? 'info' : 'error',
        durationMs: Math.round(performance.now() - startedAt),
        errorCode: readDiagnosticErrorCode(error),
      })
      throw error
    }
  }
}
