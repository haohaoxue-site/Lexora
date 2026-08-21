import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from '@earendil-works/pi-ai'
import type { RuntimeRpcPeerContract } from '../../../shared/runtimeRpcPeer'
import {
  credentialMutationResultSchema,
  credentialProviderListResultSchema,
  credentialReadResultSchema,
} from '../../../shared/credentialProtocol'

import { credentialSchema } from './providerSchemas'

export class HostCredentialStoreError extends Error {
  readonly code: string

  constructor(code: string) {
    super('Lexora Buddy credential storage failed')
    this.name = 'HostCredentialStoreError'
    this.code = code
  }
}

export class HostCredentialStore implements CredentialStore {
  readonly #peer: RuntimeRpcPeerContract
  readonly #providerLocks = new Map<string, Promise<void>>()

  constructor(peer: RuntimeRpcPeerContract) {
    this.#peer = peer
  }

  async read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted()
    const response = credentialReadResultSchema.parse(await this.#peer.request(
      'host.credentials.read',
      { providerId },
    ))
    assertSuccess(response)
    options?.signal?.throwIfAborted()
    return response.value === null ? undefined : credentialSchema.parse(response.value) as Credential
  }

  async list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    options?.signal?.throwIfAborted()
    const response = credentialProviderListResultSchema.parse(await this.#peer.request(
      'host.credentials.list',
      {},
    ))
    assertSuccess(response)
    options?.signal?.throwIfAborted()
    return response.providers
  }

  modify(
    providerId: string,
    operation: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    return this.#withProviderLock(providerId, async () => {
      options?.signal?.throwIfAborted()
      const current = await this.read(providerId, options)
      const next = await operation(structuredClone(current))
      options?.signal?.throwIfAborted()
      if (next === undefined)
        return current

      const credential = credentialSchema.parse(next) as Credential
      const response = credentialMutationResultSchema.parse(await this.#peer.request(
        'host.credentials.write',
        { providerId, credential },
      ))
      assertSuccess(response)
      return credential
    })
  }

  delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
    return this.#withProviderLock(providerId, async () => {
      options?.signal?.throwIfAborted()
      const response = credentialMutationResultSchema.parse(await this.#peer.request(
        'host.credentials.delete',
        { providerId },
      ))
      assertSuccess(response)
    })
  }

  #withProviderLock<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#providerLocks.get(providerId) ?? Promise.resolve()
    const result = previous.catch(() => {}).then(operation)
    const tail = result.then(() => {}, () => {})
    this.#providerLocks.set(providerId, tail)
    void tail.then(() => {
      if (this.#providerLocks.get(providerId) === tail)
        this.#providerLocks.delete(providerId)
    })
    return result
  }
}

function assertSuccess<T extends { error?: { code: string }, ok: boolean }>(
  response: T,
): asserts response is T & { ok: true } {
  if (!response.ok)
    throw new HostCredentialStoreError(response.error?.code ?? 'CREDENTIAL_STORE_FAILURE')
}
