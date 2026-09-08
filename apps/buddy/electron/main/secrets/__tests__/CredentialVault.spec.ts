import type { SecretCipher } from '../CredentialVault'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'

import { describe, expect, it, vi } from 'vitest'
import { RuntimeRpcPeer } from '../../../../platform/ipc/runtimeRpcPeer'
import {
  createCredentialVault,
  CredentialStoreUnavailableError,
  isSafeStorageBackendSecure,
} from '../CredentialVault'
import { isAllowedExternalUrl, registerCredentialHostRpc } from '../registerCredentialHostRpc'

const reversibleCipher: SecretCipher = {
  available: () => true,
  decrypt: value => Buffer.from([...value].map(byte => byte ^ 0xA5)).toString('utf8'),
  encrypt: value => Buffer.from([...Buffer.from(value, 'utf8')].map(byte => byte ^ 0xA5)),
}

describe('credentialVault', () => {
  it('atomically persists encrypted provider credentials with private permissions', async () => {
    const buddyHome = await createTemporaryDirectory('lexora-buddy-vault-')
    const vault = createCredentialVault({ buddyHome, cipher: reversibleCipher })

    await vault.write('providers', 'openai-codex', {
      type: 'api_key',
      key: 'sk-test-secret',
    })

    await expect(vault.read('providers', 'openai-codex')).resolves.toEqual({
      type: 'api_key',
      key: 'sk-test-secret',
    })
    await expect(vault.listProviders()).resolves.toEqual([
      { providerId: 'openai-codex', type: 'api_key' },
    ])

    const providerDirectory = join(buddyHome, 'secrets', 'providers')
    const files = await readdir(providerDirectory)
    expect(files).toHaveLength(1)
    const persisted = await readFile(join(providerDirectory, files[0]!))
    expect(persisted.includes(Buffer.from('sk-test-secret'))).toBe(false)
    expect((await stat(providerDirectory)).mode & 0o777).toBe(0o700)
    expect((await stat(join(providerDirectory, files[0]!))).mode & 0o777).toBe(0o600)
  })

  it('keeps provider and connector namespaces isolated', async () => {
    const buddyHome = await createTemporaryDirectory('lexora-buddy-vault-')
    const vault = createCredentialVault({ buddyHome, cipher: reversibleCipher })

    await vault.write('providers', 'shared-id', { type: 'oauth', access: 'access', refresh: 'refresh', expires: 1 })
    await vault.write('connectors', 'shared-id', { bearer: 'connector-secret' })

    await expect(vault.read('providers', 'shared-id')).resolves.toMatchObject({ type: 'oauth' })
    await expect(vault.read('connectors', 'shared-id')).resolves.toEqual({ bearer: 'connector-secret' })
    await vault.delete('providers', 'shared-id')
    await expect(vault.read('providers', 'shared-id')).resolves.toBeNull()
    await expect(vault.read('connectors', 'shared-id')).resolves.toEqual({ bearer: 'connector-secret' })
  })

  it('never falls back to plaintext when host encryption is unavailable', async () => {
    const buddyHome = await createTemporaryDirectory('lexora-buddy-vault-')
    const vault = createCredentialVault({
      buddyHome,
      cipher: {
        ...reversibleCipher,
        available: () => false,
      },
    })

    await expect(vault.write('providers', 'anthropic', {
      type: 'api_key',
      key: 'sk-test-secret',
    })).rejects.toBeInstanceOf(CredentialStoreUnavailableError)
    await expect(readdir(join(buddyHome, 'secrets', 'providers'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects the Linux basic_text safeStorage backend', () => {
    expect(isSafeStorageBackendSecure({
      backend: 'basic_text',
      encryptionAvailable: true,
      platform: 'linux',
    })).toBe(false)
    expect(isSafeStorageBackendSecure({
      backend: 'gnome_libsecret',
      encryptionAvailable: true,
      platform: 'linux',
    })).toBe(true)
    expect(isSafeStorageBackendSecure({
      backend: 'basic_text',
      encryptionAvailable: true,
      platform: 'win32',
    })).toBe(true)
  })

  it.each([
    { available: false, code: 'CREDENTIAL_STORE_UNAVAILABLE' },
    { available: true, code: 'CREDENTIAL_STORE_FAILURE' },
  ])('returns only a safe RPC error when encryption fails: $code', async ({ available, code }) => {
    const buddyHome = await createTemporaryDirectory('lexora-buddy-vault-')
    const secret = 'fixture-private-credential'
    const vault = createCredentialVault({
      buddyHome,
      cipher: {
        ...reversibleCipher,
        available: () => available,
        encrypt: (value) => { throw new Error(`cipher rejected ${value}`) },
      },
    })
    const incoming = new EventEmitter()
    const responses: unknown[] = []
    const peer = new RuntimeRpcPeer({
      transport: {
        postMessage: message => responses.push(message),
        subscribe(listener) {
          incoming.on('message', listener)
          return () => {
            incoming.off('message', listener)
          }
        },
      },
    })
    const dispose = registerCredentialHostRpc(peer, vault)
    try {
      incoming.emit('message', {
        jsonrpc: '2.0',
        id: 'credential-write',
        method: 'host.credentials.write',
        params: { providerId: 'fixture', credential: { type: 'api_key', key: secret } },
      })
      await vi.waitFor(() => expect(responses).toEqual([{
        jsonrpc: '2.0',
        id: 'credential-write',
        result: { ok: false, error: { code } },
      }]))
      expect(await readdir(join(buddyHome, 'secrets', 'providers')).catch(() => [])).toEqual([])
    }
    finally {
      dispose()
      peer.close(new Error('test completed'))
    }
  })

  it('only lets the Electron host open HTTPS and loopback callback URLs', () => {
    expect(isAllowedExternalUrl('https://auth.openai.com/authorize')).toBe(true)
    expect(isAllowedExternalUrl('http://127.0.0.1:1455/callback')).toBe(true)
    expect(isAllowedExternalUrl('http://localhost:1455/callback')).toBe(true)
    expect(isAllowedExternalUrl('http://auth.example.test/authorize')).toBe(false)
    expect(isAllowedExternalUrl('file:///tmp/credential')).toBe(false)
    expect(isAllowedExternalUrl('not-a-url')).toBe(false)
  })
})
