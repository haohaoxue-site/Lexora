import type { Buffer } from 'node:buffer'
import type { SandboxNetworkTarget } from '../../../shared/permissions/shellSandbox'

export interface SandboxExecutionOptions {
  signal: AbortSignal
  approveNetwork: (target: SandboxNetworkTarget) => Promise<boolean>
  onData: (data: Buffer) => void
  onStarted: () => void
}

export class SandboxExecutionLifecycle {
  readonly #controller = new AbortController()
  readonly signal: AbortSignal
  #timer: ReturnType<typeof setTimeout> | undefined
  #startedAt = 0
  #remaining: number
  #waiting = 0
  #phase: 'preparing' | 'running' | 'finished' = 'preparing'
  timedOut = false

  constructor(signal: AbortSignal, timeoutSeconds = 30 * 60, preparationTimeoutMs = 60_000) {
    this.signal = AbortSignal.any([signal, this.#controller.signal])
    this.#remaining = timeoutSeconds * 1_000
    this.#arm(preparationTimeoutMs)
  }

  get started(): boolean { return this.#phase !== 'preparing' }

  start(): void {
    this.signal.throwIfAborted()
    if (this.#phase !== 'preparing')
      return
    this.#clear()
    this.#phase = 'running'
    this.#resume()
  }

  async approve(request: () => Promise<boolean>): Promise<boolean> {
    if (this.#waiting++ === 0 && this.#phase === 'running' && this.#timer) {
      this.#remaining -= performance.now() - this.#startedAt
      this.#clear()
    }
    try {
      this.signal.throwIfAborted()
      const allowed = await request()
      return !this.signal.aborted && allowed
    }
    finally {
      this.#waiting--
      this.#resume()
    }
  }

  finish(): void {
    this.#phase = 'finished'
    this.#clear()
    this.#controller.abort()
  }

  #resume(): void {
    if (this.#phase !== 'running' || this.#waiting || this.signal.aborted)
      return
    this.#startedAt = performance.now()
    this.#arm(this.#remaining)
  }

  #arm(milliseconds: number): void {
    this.#timer = setTimeout(() => {
      this.timedOut = true
      this.#controller.abort()
    }, Math.max(1, milliseconds))
    this.#timer.unref()
  }

  #clear(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }
}
