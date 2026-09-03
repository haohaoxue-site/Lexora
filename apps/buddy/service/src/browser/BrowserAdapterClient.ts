import type {
  BrowserAdapterFailureCode,
  BrowserAdapterLease,
  BrowserAdapterRecoveryAction,
  BrowserAdapterRequest,
  BrowserAdapterResponse,
  BrowserAdapterSuccessResult,
} from '../../../shared/browserAdapterProtocol'
import type {
  BrowserCapabilityActParams,
  BrowserObservation,
  BrowserStateSnapshot,
} from '../../../shared/browserProtocol'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createConnection } from 'node:net'
import {
  BROWSER_ADAPTER_MAX_REQUEST_BYTES,
  BROWSER_ADAPTER_PROTOCOL_VERSION,
  browserAdapterLeaseSchema,
  browserAdapterRequestSchema,
  browserAdapterResponseSchema,
} from '../../../shared/browserAdapterProtocol'

type BrowserAdapterSnapshotParams = Extract<
  BrowserAdapterRequest,
  { method: 'snapshot' }
>['params']

type BrowserAdapterActionResult = Omit<
  Extract<BrowserAdapterSuccessResult, { kind: 'action' }>,
  'kind'
>

interface BrowserAdapterRequestOptions {
  signal?: AbortSignal
}

interface BrowserAdapterClientOptions {
  createRequestId?: () => string
  now?: () => number
}

export class BrowserAdapterClient {
  readonly #createRequestId: () => string
  readonly #lease: BrowserAdapterLease
  readonly #now: () => number
  #closed = false

  constructor(rawLease: BrowserAdapterLease, options: BrowserAdapterClientOptions = {}) {
    this.#lease = browserAdapterLeaseSchema.parse(rawLease)
    this.#createRequestId = options.createRequestId ?? randomUUID
    this.#now = options.now ?? Date.now
  }

  async state(options: BrowserAdapterRequestOptions = {}): Promise<BrowserStateSnapshot> {
    const result = await this.#request('state', {}, options)
    if (result.kind !== 'state')
      throw invalidResponse()
    return result.state
  }

  async snapshot(
    params: BrowserAdapterSnapshotParams = {},
    options: BrowserAdapterRequestOptions = {},
  ): Promise<BrowserObservation> {
    const result = await this.#request('snapshot', params, options)
    if (result.kind !== 'snapshot')
      throw invalidResponse()
    return result.observation
  }

  async action(
    params: BrowserCapabilityActParams,
    options: BrowserAdapterRequestOptions = {},
  ): Promise<BrowserAdapterActionResult> {
    const result = await this.#request('action', params, options)
    if (result.kind !== 'action')
      throw invalidResponse()
    return {
      actionKind: result.actionKind,
      observation: result.observation,
      state: result.state,
    }
  }

  async close(options: BrowserAdapterRequestOptions = {}): Promise<void> {
    const result = await this.#request('close', {}, options)
    if (result.kind !== 'close' || !result.revoked)
      throw invalidResponse()
    this.#closed = true
  }

  async #request(
    method: BrowserAdapterRequest['method'],
    params: unknown,
    options: BrowserAdapterRequestOptions,
  ): Promise<BrowserAdapterSuccessResult> {
    this.#assertUsable()
    const request = browserAdapterRequestSchema.parse({
      id: this.#createRequestId(),
      method,
      params,
      protocolVersion: BROWSER_ADAPTER_PROTOCOL_VERSION,
      token: this.#lease.token,
    })
    const response = await exchange(
      this.#lease.socketPath,
      request,
      options.signal,
    )
    if (response.id !== request.id)
      throw invalidResponse()
    if (!response.ok)
      throw new BrowserAdapterClientError(response.error.code, response.error.recovery)
    return response.result
  }

  #assertUsable(): void {
    if (this.#closed) {
      throw new BrowserAdapterClientError(
        'BROWSER_ADAPTER_AUTH_FAILED',
        'request_new_adapter_lease',
      )
    }
    if (Date.parse(this.#lease.expiresAt) <= this.#now()) {
      throw new BrowserAdapterClientError(
        'BROWSER_ADAPTER_LEASE_EXPIRED',
        'request_new_adapter_lease',
      )
    }
  }
}

export class BrowserAdapterClientError extends Error {
  readonly code: BrowserAdapterFailureCode
  readonly recovery: BrowserAdapterRecoveryAction | null

  constructor(
    code: BrowserAdapterFailureCode,
    recovery: BrowserAdapterRecoveryAction | null,
  ) {
    super(code)
    this.code = code
    this.name = 'BrowserAdapterClientError'
    this.recovery = recovery
  }
}

function exchange(
  socketPath: string,
  request: BrowserAdapterRequest,
  signal: AbortSignal | undefined,
): Promise<BrowserAdapterResponse> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let settled = false
    const socket = createConnection(socketPath)

    function finish(
      result: { response: BrowserAdapterResponse } | { error: Error },
    ) {
      if (settled)
        return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      socket.destroy()
      if ('response' in result)
        resolve(result.response)
      else
        reject(result.error)
    }
    function fail() {
      finish({ error: invalidResponse() })
    }
    function onAbort() {
      finish({ error: abortedRequest() })
    }

    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    socket.setEncoding('utf8')
    socket.once('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`)
    })
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (Buffer.byteLength(buffer, 'utf8') > BROWSER_ADAPTER_MAX_REQUEST_BYTES) {
        fail()
        return
      }
      const newline = buffer.indexOf('\n')
      if (newline < 0)
        return
      let raw: unknown
      try {
        raw = JSON.parse(buffer.slice(0, newline))
      }
      catch {
        fail()
        return
      }
      const response = browserAdapterResponseSchema.safeParse(raw)
      if (!response.success) {
        fail()
        return
      }
      finish({ response: response.data })
    })
    socket.once('end', fail)
    socket.once('error', fail)
  })
}

function invalidResponse(): BrowserAdapterClientError {
  return new BrowserAdapterClientError(
    'BROWSER_ADAPTER_REQUEST_INVALID',
    null,
  )
}

function abortedRequest(): Error {
  const error = new Error('Browser adapter request aborted')
  error.name = 'AbortError'
  return error
}
