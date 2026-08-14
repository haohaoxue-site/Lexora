import type { Readable, Writable } from 'node:stream'
import type { PetPrimitiveStep } from '../../../shared/petProtocol'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { petPrimitiveStepSchema } from '../../../shared/petProtocol'

const SIDECAR_PROTOCOL_VERSION = 1
const DEFAULT_MAX_LINE_BYTES = 256 * 1024

const sidecarTerminalResponseSchema = z.discriminatedUnion('type', [
  z.object({
    correlationId: z.string().min(1),
    elapsedMs: z.number().int().nonnegative(),
    protocolVersion: z.literal(SIDECAR_PROTOCOL_VERSION),
    stepId: z.string().min(1),
    type: z.literal('stepCompleted'),
  }).strict(),
  z.object({
    code: z.enum([
      'invalidExecuteStep',
      'invalidStepProtocol',
      'interruptRejected',
      'motionTimeout',
      'targetUnavailable',
      'unsupportedStepCapability',
    ]),
    correlationId: z.string().min(1),
    elapsedMs: z.number().int().nonnegative().optional(),
    message: z.string(),
    protocolVersion: z.literal(SIDECAR_PROTOCOL_VERSION),
    stepId: z.string().min(1),
    type: z.literal('stepFailed'),
  }).strict(),
  z.object({
    correlationId: z.string().min(1),
    elapsedMs: z.number().int().nonnegative().optional(),
    protocolVersion: z.literal(SIDECAR_PROTOCOL_VERSION),
    reasonCode: z.literal('admission.preemptedByHigherPriorityPlan'),
    stepId: z.string().min(1),
    type: z.literal('stepInterrupted'),
  }).strict(),
  z.object({
    code: z.enum([
      'invalidExecuteStep',
      'invalidStepProtocol',
      'interruptRejected',
      'motionTimeout',
      'targetUnavailable',
      'unsupportedStepCapability',
    ]),
    correlationId: z.string().min(1).nullable(),
    message: z.string(),
    protocolVersion: z.literal(SIDECAR_PROTOCOL_VERSION),
    stepId: z.string().min(1).nullable(),
    type: z.literal('protocolError'),
  }).strict(),
])

export type NativePetStepResult
  = { elapsedMs: number, status: 'completed', stepId: string }
    | {
      elapsedMs?: number
      reasonCode: 'admission.preemptedByHigherPriorityPlan'
      status: 'interrupted'
      stepId: string
    }
    | { code: 'PET_PROTOCOL_ERROR' | 'PET_STEP_FAILED', elapsedMs?: number, status: 'failed', stepId: string }

interface PendingStep {
  reject: (error: Error) => void
  resolve: (result: NativePetStepResult) => void
  stepId: string
  timeout: ReturnType<typeof setTimeout>
}

interface ReadyWaiter {
  reject: (error: Error) => void
  resolve: () => void
  timeout: ReturnType<typeof setTimeout>
}

export interface NativePetRpcClientOptions {
  maxLineBytes?: number
  readable: Readable
  writable: Writable
}

export class NativePetUnavailableError extends Error {
  readonly code = 'PET_UNAVAILABLE'

  constructor(message = 'Lexora Buddy pet is unavailable') {
    super(message)
    this.name = 'NativePetUnavailableError'
  }
}

export class NativePetProtocolError extends Error {
  readonly code = 'PET_PROTOCOL_ERROR'

  constructor() {
    super('Lexora Buddy pet protocol failed')
    this.name = 'NativePetProtocolError'
  }
}

export class NativePetRpcClient {
  readonly #maxLineBytes: number
  readonly #readable: Readable
  readonly #writable: Writable
  readonly #fatalListeners = new Set<(error: Error) => void>()
  readonly #openDesktopListeners = new Set<() => void>()
  readonly #pending = new Map<string, PendingStep>()
  readonly #readyWaiters = new Set<ReadyWaiter>()
  #buffer = ''
  #closed = false
  #ready = false

  constructor(options: NativePetRpcClientOptions) {
    this.#maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES
    this.#readable = options.readable
    this.#writable = options.writable
    this.#readable.setEncoding('utf8')
    this.#readable.on('data', this.#handleData)
    this.#readable.once('end', this.#handleEnd)
    this.#readable.once('error', this.#handleStreamError)
    this.#writable.once('error', this.#handleStreamError)
  }

  get ready(): boolean {
    return this.#ready && !this.#closed
  }

  onFatalError(listener: (error: Error) => void): () => void {
    this.#fatalListeners.add(listener)
    return () => this.#fatalListeners.delete(listener)
  }

  onOpenDesktop(listener: () => void): () => void {
    this.#openDesktopListeners.add(listener)
    return () => this.#openDesktopListeners.delete(listener)
  }

  waitUntilReady(timeoutMs: number): Promise<void> {
    if (this.ready)
      return Promise.resolve()
    if (this.#closed)
      return Promise.reject(new NativePetUnavailableError())

    return new Promise((resolve, reject) => {
      const waiter: ReadyWaiter = {
        reject,
        resolve,
        timeout: setTimeout(() => {
          this.#readyWaiters.delete(waiter)
          reject(new NativePetUnavailableError('Lexora Buddy pet did not become ready'))
        }, timeoutMs),
      }
      this.#readyWaiters.add(waiter)
    })
  }

  executeStep(step: PetPrimitiveStep, stepId = `step_${randomUUID()}`): Promise<NativePetStepResult> {
    if (!this.ready)
      return Promise.reject(new NativePetUnavailableError())

    const parsedStep = petPrimitiveStepSchema.parse(step)
    const messageId = `message_${randomUUID()}`
    const timeoutMs = parsedStep.timeoutMs + 1000
    const request = {
      messageId,
      protocolVersion: SIDECAR_PROTOCOL_VERSION,
      step: parsedStep,
      stepId,
      type: 'executeStep',
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.#pending.delete(messageId))
          return
        reject(new NativePetUnavailableError('Lexora Buddy pet step timed out'))
      }, timeoutMs)
      this.#pending.set(messageId, { reject, resolve, stepId, timeout })
      try {
        this.#send(request)
      }
      catch (error) {
        clearTimeout(timeout)
        this.#pending.delete(messageId)
        reject(error)
      }
    })
  }

  interruptStep(stepId: string): void {
    if (!this.ready)
      throw new NativePetUnavailableError()
    this.#send({
      messageId: `message_${randomUUID()}`,
      protocolVersion: SIDECAR_PROTOCOL_VERSION,
      reasonCode: 'admission.preemptedByHigherPriorityPlan',
      stepId,
      type: 'interruptStep',
    })
  }

  reloadConfig(): void {
    if (!this.ready)
      throw new NativePetUnavailableError()
    this.#send({ type: 'reload_config' })
  }

  close(reason: Error = new NativePetUnavailableError()): void {
    if (this.#closed)
      return
    this.#closed = true
    this.#ready = false
    this.#readable.off('data', this.#handleData)
    this.#readable.off('end', this.#handleEnd)
    this.#readable.off('error', this.#handleStreamError)
    this.#writable.off('error', this.#handleStreamError)
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(reason)
    }
    this.#pending.clear()
    for (const waiter of this.#readyWaiters) {
      clearTimeout(waiter.timeout)
      waiter.reject(reason)
    }
    this.#readyWaiters.clear()
  }

  #send(message: unknown): void {
    if (this.#closed)
      throw new NativePetUnavailableError()
    const line = `${JSON.stringify(message)}\n`
    if (Buffer.byteLength(line) > this.#maxLineBytes)
      throw new NativePetProtocolError()
    this.#writable.write(line, 'utf8')
  }

  readonly #handleData = (chunk: string): void => {
    this.#buffer += chunk
    while (true) {
      const newline = this.#buffer.indexOf('\n')
      if (newline < 0) {
        if (Buffer.byteLength(this.#buffer) > this.#maxLineBytes)
          this.#fail(new NativePetProtocolError())
        return
      }
      const line = this.#buffer.slice(0, newline).trim()
      this.#buffer = this.#buffer.slice(newline + 1)
      if (Buffer.byteLength(line) > this.#maxLineBytes) {
        this.#fail(new NativePetProtocolError())
        return
      }
      if (line)
        this.#handleLine(line)
      if (this.#closed)
        return
    }
  }

  readonly #handleEnd = (): void => {
    this.close(new NativePetUnavailableError())
  }

  readonly #handleStreamError = (): void => {
    this.#fail(new NativePetProtocolError())
  }

  #handleLine(line: string): void {
    if (line === 'event:ready') {
      this.#ready = true
      for (const waiter of this.#readyWaiters) {
        clearTimeout(waiter.timeout)
        waiter.resolve()
      }
      this.#readyWaiters.clear()
      return
    }
    if (line === 'event:open_chat') {
      for (const listener of this.#openDesktopListeners)
        listener()
      return
    }
    if (line === 'event:restarting' || line.startsWith('event:preset_behavior:'))
      return

    let value: unknown
    try {
      value = JSON.parse(line)
    }
    catch {
      this.#fail(new NativePetProtocolError())
      return
    }
    const parsed = sidecarTerminalResponseSchema.safeParse(value)
    if (!parsed.success) {
      if (isStateSnapshot(value))
        return
      this.#fail(new NativePetProtocolError())
      return
    }
    const response = parsed.data
    const pending = this.#pending.get(response.correlationId ?? '')
    if (!pending || (response.stepId && response.stepId !== pending.stepId))
      return
    if (response.type === 'stepFailed' && response.code === 'interruptRejected')
      return

    clearTimeout(pending.timeout)
    this.#pending.delete(response.correlationId ?? '')
    if (response.type === 'stepCompleted') {
      pending.resolve({
        elapsedMs: response.elapsedMs,
        status: 'completed',
        stepId: response.stepId,
      })
      return
    }
    if (response.type === 'stepInterrupted') {
      pending.resolve({
        ...(response.elapsedMs === undefined ? {} : { elapsedMs: response.elapsedMs }),
        reasonCode: response.reasonCode,
        status: 'interrupted',
        stepId: response.stepId,
      })
      return
    }
    pending.resolve({
      code: response.type === 'protocolError' ? 'PET_PROTOCOL_ERROR' : 'PET_STEP_FAILED',
      ...(response.type === 'stepFailed' && response.elapsedMs !== undefined
        ? { elapsedMs: response.elapsedMs }
        : {}),
      status: 'failed',
      stepId: pending.stepId,
    })
  }

  #fail(error: Error): void {
    this.close(error)
    for (const listener of this.#fatalListeners)
      listener(error)
  }
}

function isStateSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  return Reflect.get(value, 'type') === 'stateSnapshot'
}
