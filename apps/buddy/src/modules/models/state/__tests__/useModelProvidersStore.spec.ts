import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalProvider, LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'

import { deferred } from '@buddy-tests/deferred'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { filterAvailableModels, useModelProvidersStore } from '../useModelProvidersStore'

describe('filterAvailableModels', () => {
  it('exposes models only for enabled and authenticated providers', () => {
    const providers = [
      provider('ready', true, 'available'),
      provider('login', true, 'authentication_required'),
      provider('disabled', false, 'available'),
    ]
    const models = [
      model('ready'),
      model('login'),
      model('disabled'),
      { ...model('ready'), enabled: false, modelId: 'model-disabled' },
      { ...model('ready'), available: false, modelId: 'model-missing' },
    ]

    expect(filterAvailableModels(providers, models).map(item => item.providerId)).toEqual(['ready'])
  })
})

describe('useModelProvidersStore', () => {
  it('shares initial catalog loading and refreshes a mutation that completes during that load', async () => {
    const initial = deferred<LocalProvider[]>()
    const changed = provider('ready', false, 'available')
    const api = {
      list: vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValue([changed]),
      listModels: async () => [model('ready')],
      getDefaultModel: async () => null,
      setDefaultModel: async () => {},
      setEnabled: async () => {},
      onAuthChallenge: () => () => {},
    } as unknown as LexoraDesktopApi['localChat']['providers']
    const store = useModelProvidersStore({ api, language: shallowRef('zh-CN') })
    const loading = store.loadModelCatalog()
    expect(store.loadModelCatalog(true)).toBe(loading)
    const changing = store.setProviderEnabled('ready', false)
    initial.resolve([provider('ready', true, 'available')])
    await expect(loading).resolves.toBe(true)
    await expect(changing).resolves.toBe(true)
    expect(store.providers.value).toEqual([changed])
    expect(store.models.value).toEqual([])
    expect(store.isLoadingModelCatalog.value).toBe(false)

    vi.mocked(api.list).mockRejectedValueOnce(new Error('RUNTIME_OFFLINE'))
    await expect(store.loadModelCatalog(true)).resolves.toBe(false)
    expect(store.providers.value).toEqual([changed])
    await expect(store.loadModelCatalog(true)).resolves.toBe(true)
    expect(store.modelProviderError.value).toBeNull()
    store.dispose()
  })

  it('does not expose a provider login cancellation as a provider error', async () => {
    const api = {
      localChat: {
        automations: emptyAutomationApi(),
        chat: emptyChatApi(),
        providers: {
          login: () => Promise.reject(
            new Error('LEXORA_LOCAL_CHAT_ERROR:PROVIDER_LOGIN_CANCELLED:0'),
          ),
          onAuthChallenge: () => () => {},
        },
        runtime: {
          onStateChanged: () => () => {},
        },
      },
    } as unknown as LexoraDesktopApi
    const store = useModelProvidersStore({ api: api.localChat.providers, language: shallowRef('zh-CN') })

    expect(await store.loginProvider('openai-codex', 'oauth')).toBe(false)
    expect(store.modelProviderError.value).toBeNull()

    store.dispose()
  })

  it('serializes provider login through one model provider store', async () => {
    let loginCalls = 0
    let resolveFirstLogin: (() => void) | undefined
    const api = {
      localChat: {
        automations: emptyAutomationApi(),
        chat: emptyChatApi(),
        notifications: emptyNotificationApi(),
        providers: {
          list: async () => [],
          listModels: async () => [],
          login: () => {
            loginCalls += 1
            if (loginCalls > 1)
              return Promise.resolve()
            return new Promise<void>(resolve => resolveFirstLogin = resolve)
          },
          onAuthChallenge: () => () => {},
        },
        runtime: {
          onStateChanged: () => () => {},
        },
      },
    } as unknown as LexoraDesktopApi
    const store = useModelProvidersStore({ api: api.localChat.providers, language: shallowRef('zh-CN') })

    const firstLogin = store.loginProvider('anthropic', 'api_key')
    expect(store.isAuthenticating.value).toBe(true)
    await expect(store.loginProvider('openai-codex', 'oauth')).resolves.toBe(false)
    expect(loginCalls).toBe(1)

    resolveFirstLogin?.()
    await expect(firstLogin).resolves.toBe(true)
    expect(store.isAuthenticating.value).toBe(false)
    store.dispose()
  })
})

function provider(
  id: string,
  enabled: boolean,
  status: LocalProvider['status'],
): LocalProvider {
  return {
    activeRunCount: 0,
    added: true,
    api: null,
    authTypes: ['api_key'],
    baseUrl: null,
    canSyncModels: true,
    custom: false,
    description: null,
    displayName: id,
    enabled,
    enabledModelCount: enabled && status === 'available' ? 1 : 0,
    id,
    modelCount: 1,
    setupComplete: enabled && status === 'available',
    status,
    storedCredentialType: null,
    syncUnavailableReason: null,
  }
}

function model(providerId: string): LocalRuntimeModelOption {
  return {
    available: true,
    capabilities: ['text'],
    contextWindow: 4096,
    displayName: providerId,
    enabled: true,
    hasParameterOverride: false,
    lastSeenAt: '2026-08-19T00:00:00.000Z',
    maxTokens: 1024,
    modelId: 'model-1',
    overrideContextWindow: null,
    overrideMaxTokens: null,
    providerId,
    reasoningOptions: [],
    serviceTiers: [],
    source: 'builtin',
    sourceContextWindow: 4096,
    sourceMaxTokens: 1024,
    sourceParametersUpdated: false,
  }
}

function emptyNotificationApi() {
  return {
    list: async () => ({ items: [], unseenCount: 0 }),
  }
}

function emptyAutomationApi() {
  return {
    onChanged: () => () => {},
  }
}

function emptyChatApi() {
  return {
    onRunEvent: () => () => {},
  }
}
