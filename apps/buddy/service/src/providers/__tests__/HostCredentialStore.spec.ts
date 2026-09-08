import type { Credential } from '@earendil-works/pi-ai'
import type { RuntimeRequestHandler, RuntimeRpcPeerContract } from '../../../../shared/runtime/rpcPeer'
import { describe, expect, it } from 'vitest'

import { HostCredentialStore } from '../HostCredentialStore'

describe('hostCredentialStore', () => {
  it('serializes concurrent OAuth refreshes for the same provider', async () => {
    const peer = new CredentialHostPeer({
      anthropic: {
        type: 'oauth',
        access: 'access-0',
        refresh: 'refresh-0',
        expires: 0,
        generation: 0,
      },
    })
    const store = new HostCredentialStore(peer)

    await Promise.all([
      store.modify('anthropic', async (current) => {
        await new Promise(resolve => setTimeout(resolve, 15))
        return nextOAuthCredential(current)
      }),
      store.modify('anthropic', async current => nextOAuthCredential(current)),
    ])

    await expect(store.read('anthropic')).resolves.toMatchObject({
      access: 'access-2',
      generation: 2,
      refresh: 'refresh-2',
    })
  })
})

function nextOAuthCredential(current: Credential | undefined): Credential {
  if (!current || current.type !== 'oauth')
    throw new Error('expected OAuth credential')

  const generation = Number(current.generation ?? 0) + 1
  return {
    ...current,
    access: `access-${generation}`,
    refresh: `refresh-${generation}`,
    generation,
  }
}

class CredentialHostPeer implements RuntimeRpcPeerContract {
  readonly #credentials = new Map<string, Credential>()
  writeCount = 0

  constructor(initial: Record<string, Credential>) {
    for (const [providerId, credential] of Object.entries(initial))
      this.#credentials.set(providerId, structuredClone(credential))
  }

  close(): void {}

  notify(): void {}

  onNotification(): () => void {
    return () => {}
  }

  onRequest(_method: string, _handler: RuntimeRequestHandler): () => void {
    return () => {}
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const input = params as { providerId: string, credential?: Credential }
    if (method === 'host.credentials.read') {
      return {
        ok: true,
        value: structuredClone(this.#credentials.get(input.providerId) ?? null),
      }
    }
    if (method === 'host.credentials.list') {
      return {
        ok: true,
        providers: [...this.#credentials].map(([providerId, credential]) => ({
          providerId,
          type: credential.type,
        })),
      }
    }
    if (method === 'host.credentials.write') {
      this.writeCount += 1
      this.#credentials.set(input.providerId, structuredClone(input.credential!))
      return { ok: true }
    }
    if (method === 'host.credentials.delete') {
      this.#credentials.delete(input.providerId)
      return { ok: true }
    }
    throw new Error(`unexpected method: ${method}`)
  }
}
