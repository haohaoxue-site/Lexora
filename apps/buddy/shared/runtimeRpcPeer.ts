import type { RuntimeWireMessage } from './runtimeProtocol'
import { randomUUID } from 'node:crypto'

import { runtimeWireMessageSchema } from './runtimeProtocol'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export interface RuntimeRpcPeerContract {
  notify: (method: string, params: unknown) => void
  onNotification: (listener: (method: string, params: unknown) => void) => () => void
  onRequest: (method: string, handler: RuntimeRequestHandler) => () => void
  request: (method: string, params: unknown, timeoutMs?: number) => Promise<unknown>
  close: (reason: Error) => void
}

export interface RuntimeMessageTransport {
  postMessage: (message: RuntimeWireMessage) => void
  subscribe: (listener: (message: unknown) => void) => () => void
}

export interface RuntimeRpcPeerOptions {
  transport: RuntimeMessageTransport
  defaultTimeoutMs?: number
  onFatalError?: (error: Error) => void
}

export type RuntimeRequestHandler = (params: unknown) => Promise<unknown> | unknown

interface PendingRequest {
  reject: (error: Error) => void
  resolve: (result: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

export class RuntimeProtocolError extends Error {
  readonly code = 'RUNTIME_PROTOCOL_ERROR'

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RuntimeProtocolError'
  }
}

export class RuntimeRequestTimeoutError extends Error {
  readonly code = 'RUNTIME_REQUEST_TIMEOUT'

  constructor(method: string) {
    super(`Runtime request timed out: ${method}`)
    this.name = 'RuntimeRequestTimeoutError'
  }
}

export class RuntimeRemoteError extends Error {
  readonly code: number
  readonly data: unknown

  constructor(error: { code: number, data?: unknown, message: string }) {
    super(error.message)
    this.name = 'RuntimeRemoteError'
    this.code = error.code
    this.data = error.data
  }
}

export class RuntimeRpcPeer implements RuntimeRpcPeerContract {
  readonly #transport: RuntimeMessageTransport
  readonly #defaultTimeoutMs: number
  readonly #onFatalError?: (error: Error) => void
  readonly #handlers = new Map<string, RuntimeRequestHandler>()
  readonly #notifications = new Set<(method: string, params: unknown) => void>()
  readonly #pending = new Map<string, PendingRequest>()
  readonly #unsubscribe: () => void
  #closed = false

  constructor(options: RuntimeRpcPeerOptions) {
    this.#transport = options.transport
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.#onFatalError = options.onFatalError
    this.#unsubscribe = this.#transport.subscribe(message => this.#handleMessage(message))
  }

  notify(method: string, params: unknown): void {
    this.#assertOpen()
    this.#transport.postMessage({ jsonrpc: '2.0', method, params })
  }

  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.#notifications.add(listener)
    return () => this.#notifications.delete(listener)
  }

  onRequest(method: string, handler: RuntimeRequestHandler): () => void {
    if (this.#handlers.has(method))
      throw new Error(`Runtime RPC handler is already registered: ${method}`)

    this.#handlers.set(method, handler)
    return () => this.#handlers.delete(method)
  }

  request(method: string, params: unknown, timeoutMs = this.#defaultTimeoutMs): Promise<unknown> {
    if (this.#closed)
      return Promise.reject(new Error('Runtime RPC peer is closed'))

    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.#pending.delete(id))
          return

        reject(new RuntimeRequestTimeoutError(method))
      }, timeoutMs)
      this.#pending.set(id, { reject, resolve, timeout })
      this.#transport.postMessage({ jsonrpc: '2.0', id, method, params })
    })
  }

  close(reason: Error): void {
    if (this.#closed)
      return

    this.#closed = true
    this.#unsubscribe()
    this.#handlers.clear()
    this.#notifications.clear()
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(reason)
    }
    this.#pending.clear()
  }

  #assertOpen(): void {
    if (this.#closed)
      throw new Error('Runtime RPC peer is closed')
  }

  #handleMessage(message: unknown): void {
    if (this.#closed)
      return

    const parsed = runtimeWireMessageSchema.safeParse(message)
    if (!parsed.success) {
      this.#fail(new RuntimeProtocolError('Runtime emitted an invalid JSON-RPC message'))
      return
    }

    const wireMessage = parsed.data
    if ('method' in wireMessage) {
      if ('id' in wireMessage)
        void this.#handleRequest(wireMessage.id, wireMessage.method, wireMessage.params)
      else
        this.#emitNotification(wireMessage.method, wireMessage.params)
      return
    }

    this.#handleResponse(wireMessage)
  }

  async #handleRequest(id: string, method: string, params: unknown): Promise<void> {
    const handler = this.#handlers.get(method)
    if (!handler) {
      this.#postFailure(id, -32_601, 'Lexora Buddy runtime method is unavailable', {
        code: 'BUDDY_RUNTIME_METHOD_NOT_FOUND',
        retryable: false,
      })
      return
    }

    try {
      const result = await handler(params)
      if (!this.#closed)
        this.#transport.postMessage({ jsonrpc: '2.0', id, result })
    }
    catch (error) {
      this.#postFailure(id, -32_000, 'Lexora Buddy runtime request failed', {
        code: readStableErrorCode(error),
        retryable: false,
      })
    }
  }

  #postFailure(id: string, code: number, message: string, data: unknown): void {
    if (this.#closed)
      return

    this.#transport.postMessage({
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    })
  }

  #emitNotification(method: string, params: unknown): void {
    for (const listener of this.#notifications)
      listener(method, params)
  }

  #handleResponse(message: Exclude<RuntimeWireMessage, { method: string }>): void {
    const pending = this.#pending.get(message.id)
    if (!pending)
      return

    clearTimeout(pending.timeout)
    this.#pending.delete(message.id)
    if ('result' in message) {
      pending.resolve(message.result)
      return
    }

    pending.reject(new RuntimeRemoteError(message.error))
  }

  #fail(error: Error): void {
    this.close(error)
    this.#onFatalError?.(error)
  }
}

function readStableErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error))
    return 'BUDDY_RUNTIME_REQUEST_FAILED'
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,127}$/.test(code)
    ? code
    : 'BUDDY_RUNTIME_REQUEST_FAILED'
}
