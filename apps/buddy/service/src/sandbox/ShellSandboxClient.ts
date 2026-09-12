import type { BashOperations } from '@earendil-works/pi-coding-agent'
import type { SandboxCommand, SandboxNetworkTarget } from '../../../shared/permissions/shellSandbox'
import type { RuntimeRpcPeerContract } from '../../../shared/runtime/rpcPeer'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { SANDBOX_RPC_TIMEOUT_MS, sandboxNetworkRequestSchema, sandboxOutputSchema, sandboxResultSchema, ShellSandboxError } from '../../../shared/permissions/shellSandbox'

type ExecOptions = Parameters<BashOperations['exec']>[2]

export class ShellSandboxClient {
  readonly #peer: RuntimeRpcPeerContract
  readonly #pending = new Map<string, (target: SandboxNetworkTarget) => Promise<boolean>>()
  readonly #dispose: () => void

  constructor(peer: RuntimeRpcPeerContract) {
    this.#peer = peer
    this.#dispose = peer.onRequest('sandbox.network', async (params) => {
      const { requestId, ...target } = sandboxNetworkRequestSchema.parse(params)
      return { allowed: await this.#pending.get(requestId)?.(target) ?? false }
    })
  }

  async exec(
    input: Omit<SandboxCommand, 'requestId'>,
    options: ExecOptions,
    approveNetwork: (target: SandboxNetworkTarget) => Promise<boolean>,
  ): Promise<{ exitCode: number | null }> {
    options.signal?.throwIfAborted()
    const requestId = randomUUID()
    const cancel = () => {
      try {
        this.#peer.notify('host.sandbox.cancel', { requestId })
      }
      catch {}
    }
    const unsubscribe = this.#peer.onNotification((method, params) => {
      if (method !== 'host.sandbox.output')
        return
      const parsed = sandboxOutputSchema.safeParse(params)
      if (parsed.success && parsed.data.requestId === requestId && !options.signal?.aborted)
        options.onData(Buffer.from(parsed.data.data, 'base64'))
    })
    this.#pending.set(requestId, approveNetwork)
    options.signal?.addEventListener('abort', cancel, { once: true })
    try {
      const result = sandboxResultSchema.parse(await this.#peer.request('host.sandbox.exec', { ...input, requestId }, SANDBOX_RPC_TIMEOUT_MS))
      options.signal?.throwIfAborted()
      if (!result.ok)
        throw new ShellSandboxError(result.code)
      return { exitCode: result.exitCode }
    }
    finally {
      cancel()
      unsubscribe()
      this.#pending.delete(requestId)
      options.signal?.removeEventListener('abort', cancel)
    }
  }

  dispose(): void {
    this.#dispose()
    for (const requestId of this.#pending.keys()) {
      try {
        this.#peer.notify('host.sandbox.cancel', { requestId })
      }
      catch {}
    }
    this.#pending.clear()
  }
}
