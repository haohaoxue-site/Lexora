import type { ProviderWebFetch, PublicWebGet } from '../../../shared/network/publicWebTransport'
import type { RuntimeRpcPeerContract } from '../../../shared/runtimeRpcPeer'
import type { WebNetworkRequest, WebRenderResult } from '../../../shared/webProtocol'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { readResponseBytes } from '../../../shared/network/publicWebTransport'
import { WebError, webNetworkChunkSchema, webNetworkHeadSchema, webRenderResultSchema } from '../../../shared/webProtocol'

export class WebHostClient {
  readonly peer: Pick<RuntimeRpcPeerContract, 'request' | 'notify' | 'onNotification'>

  constructor(peer: Pick<RuntimeRpcPeerContract, 'request' | 'notify' | 'onNotification'>) { this.peer = peer }

  async authorize(url: string): Promise<void> {
    const result = z.discriminatedUnion('ok', [
      z.object({ ok: z.literal(true) }),
      webRenderResultSchema.options[1],
    ]).parse(await this.peer.request('host.web.authorize', { url }))
    if (!result.ok)
      throw new WebError(result.code)
  }

  get: PublicWebGet = async (url, signal, limit = 12 * 1024 * 1024) => {
    const result = await this.#request({ url, scope: 'public', method: 'GET', headers: {}, limit }, signal)
    return { bytes: await readResponseBytes(result.response, limit), headers: result.response.headers, status: result.response.status, url: result.url }
  }

  providerFetch: ProviderWebFetch = async (url, init) => {
    const result = await this.#request({ url, scope: 'provider', method: init.method, headers: Object.fromEntries(new Headers(init.headers)), body: init.body, limit: 12 * 1024 * 1024 }, init.signal)
    return result.response
  }

  async render(url: string, signal: AbortSignal): Promise<WebRenderResult> {
    signal.throwIfAborted()
    const requestId = randomUUID()
    const cancel = () => this.#cancel(requestId)
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const result = await this.peer.request('host.web.render', { url, requestId }, 25_000)
      signal.throwIfAborted()
      return webRenderResultSchema.parse(result)
    }
    finally {
      signal.removeEventListener('abort', cancel)
      cancel()
    }
  }

  async #request(input: Omit<WebNetworkRequest, 'requestId'>, signal: AbortSignal): Promise<{ response: Response, url: string }> {
    signal.throwIfAborted()
    const requestId = randomUUID()
    let controller: ReadableStreamDefaultController<Uint8Array>
    let finished = false
    let unsubscribe = () => {}
    const cancelRequest = () => this.#cancel(requestId)
    function cleanup() {
      if (finished)
        return
      finished = true
      unsubscribe()
      signal.removeEventListener('abort', cancel)
    }
    function cancel() {
      if (!finished) {
        controller.error(new WebError('WEB_CANCELLED'))
        cleanup()
      }
      cancelRequest()
    }
    const stream = new ReadableStream<Uint8Array>({
      start(value) { controller = value },
      cancel: () => {
        cleanup()
        cancelRequest()
      },
    })
    let received = 0
    unsubscribe = this.peer.onNotification((method, params) => {
      if (method !== 'host.web.chunk' || finished)
        return
      const parsed = webNetworkChunkSchema.safeParse(params)
      if (!parsed.success || parsed.data.requestId !== requestId)
        return
      const message = parsed.data
      if (message.code) {
        controller.error(new WebError(message.code))
        cleanup()
      }
      else if (message.done) {
        controller.close()
        cleanup()
      }
      else if (message.chunk) {
        const bytes = Buffer.from(message.chunk, 'base64')
        received += bytes.byteLength
        if (received > input.limit) {
          controller.error(new WebError('WEB_RESPONSE_TOO_LARGE'))
          cleanup()
          this.#cancel(requestId)
        }
        else { controller.enqueue(bytes) }
      }
    })
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const result = webNetworkHeadSchema.parse(await this.peer.request('host.web.request', { ...input, requestId }, 60_000))
      signal.throwIfAborted()
      if (!result.ok)
        throw new WebError(result.code)
      const response = new Response([204, 205, 304].includes(result.status) ? null : stream, { status: result.status, headers: result.headers })
      return { response, url: result.url }
    }
    catch (error) {
      cleanup()
      await stream.cancel().catch(() => {})
      this.#cancel(requestId)
      throw error
    }
  }

  #cancel(requestId: string): void {
    try {
      this.peer.notify('host.web.cancel', { requestId })
    }
    catch {}
  }
}
