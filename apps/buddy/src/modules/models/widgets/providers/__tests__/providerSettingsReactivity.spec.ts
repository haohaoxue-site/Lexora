// @vitest-environment jsdom
import type { LocalCustomProviderModel, LocalProvider, LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ModelProvidersStore } from '@/modules/models/state/typing'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, effectScope, h, nextTick, shallowReactive, shallowRef } from 'vue'
import { translateBuddy } from '@/i18n/buddyI18n'
import { useProviderSetupWizard } from '@/modules/models/state/useProviderSetupWizard'
import DesktopModelsSettings from '../DesktopModelsSettings.vue'
import DesktopProviderAddDialog from '../DesktopProviderAddDialog.vue'
import DesktopProviderDetail from '../DesktopProviderDetail.vue'
import { useProviderDetail } from '../useProviderDetail'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

describe('provider settings prop reactivity', () => {
  it.each(['settings', 'detail', 'wizard'] as const)('%s follows catalog refill, replacement props and locale changes', async (surface) => {
    const first = createStore('Alpha')
    first.providers.value = []
    first.registeredModels.value = []
    const current = shallowRef<ModelProvidersStore>(first)
    const root = document.createElement('div')
    document.body.append(root)
    const app = createApp({
      setup() {
        return () => surface === 'settings'
          ? h(DesktopModelsSettings, { providerSettings: current.value })
          : surface === 'detail'
            ? h(DesktopProviderDetail, { providerId: 'service', providerSettings: current.value })
            : h(DesktopProviderAddDialog, { show: true, resumeProviderId: null, providerSettings: current.value })
      },
    })
    app.mount(root)
    cleanups.push(() => {
      app.unmount()
      root.remove()
    })
    await nextTick()
    expect(document.body.textContent).not.toContain('Alpha')
    first.providers.value = [provider('Alpha')]
    first.registeredModels.value = [model('Alpha')]
    await nextTick()
    expect(document.body.textContent).toContain('Alpha')

    const second = createStore('Beta', 'en-US')
    current.value = second
    await nextTick()
    expect(document.body.textContent).toContain('Beta')
    expect(document.body.textContent).not.toContain('Alpha')
    const heading = surface === 'detail' ? 'desktop.providers.models' : 'desktop.providers.addService'
    expect(document.body.textContent).toContain(translateBuddy('en-US', heading))
    first.providers.value = [provider('Stale store')]
    first.registeredModels.value = [model('Stale store')]
    second.providers.value = [provider('Gamma')]
    second.registeredModels.value = [model('Gamma')]
    second.language.value = 'zh-CN'
    await nextTick()
    expect(document.body.textContent).toContain('Gamma')
    expect(document.body.textContent).not.toContain('Stale store')
    expect(document.body.textContent).toContain(translateBuddy('zh-CN', heading))
  })

  it('saves model parameters and provider connections through the replacement store', async () => {
    const first = createStore('Alpha')
    const second = createStore('Beta')
    const props = shallowReactive({ providerSettings: first })
    const scope = effectScope()
    cleanups.push(() => scope.stop())
    const detail = scope.run(() => useProviderDetail(() => props.providerSettings, () => 'service', () => {}))!
    detail.openModelDetail('model')
    props.providerSettings = second
    detail.openModelDetail('model')
    await detail.modelActions.value!.saveParameters({ contextWindow: 8192, maxTokens: 2048 })
    expect(first.registeredModels.value[0]?.maxTokens).toBe(1024)
    expect(second.registeredModels.value[0]?.maxTokens).toBe(2048)
    await detail.connectionActions.save({ api: 'openai-completions', baseUrl: 'https://example.com/v1', displayName: 'Updated', enabled: true, id: 'service', models: [] })
    expect(first.providers.value[0]?.displayName).toBe('Alpha')
    expect(second.providers.value[0]?.displayName).toBe('Updated')
  })

  it('ignores old manual saves after store replacement while allowing the new form to finish', async () => {
    const firstSave = deferred<boolean>()
    const secondSave = deferred<boolean>()
    const first = createStore('Alpha')
    const second = createStore('Beta')
    first.upsertManualModel = () => firstSave.promise
    second.upsertManualModel = () => secondSave.promise
    const props = shallowReactive({ providerSettings: first })
    const scope = effectScope()
    cleanups.push(() => scope.stop())
    const detail = scope.run(() => useProviderDetail(() => props.providerSettings, () => 'service', () => {}))!
    detail.openManualModelDialog()
    const oldRequest = detail.saveManualModel(manualModel())
    props.providerSettings = second
    detail.openManualModelDialog()
    const newRequest = detail.saveManualModel(manualModel())
    firstSave.resolve(true)
    await oldRequest
    expect(detail.showManualModelDialog.value).toBe(true)
    expect(detail.savingManualModel.value).toBe(true)
    secondSave.resolve(true)
    await newRequest
    expect(detail.showManualModelDialog.value).toBe(false)
    expect(detail.savingManualModel.value).toBe(false)
  })

  it('does not navigate away when a removal completes after the owner was disposed', async () => {
    const removed = deferred<boolean>()
    const store = createStore('Alpha')
    store.removeProvider = () => removed.promise
    let navigated = false
    const scope = effectScope()
    const detail = scope.run(() => useProviderDetail(() => store, () => 'service', () => {
      navigated = true
    }))!
    const request = detail.removeProvider()
    scope.stop()
    removed.resolve(true)
    await request
    expect(navigated).toBe(false)
  })
})

describe('provider wizard ownership', () => {
  it('resumes after asynchronous catalog refill without overwriting later connection edits', () => {
    const store = createStore('Alpha')
    store.providers.value = []
    const scope = effectScope()
    cleanups.push(() => scope.stop())
    const wizard = scope.run(() => useProviderSetupWizard({ providerSettings: () => store, show: shallowRef(true), resumeProviderId: shallowRef('service'), onManage: () => {} }))!
    expect(wizard.step.value).toBe(1)
    store.providers.value = [{ ...provider('Alpha'), custom: true, storedCredentialType: null }]
    expect(wizard.step.value).toBe(2)
    expect(wizard.customForm.displayName).toBe('Alpha')
    wizard.customForm.displayName = 'Unsaved name'
    store.providers.value = [{ ...store.providers.value[0]!, modelCount: 2 }]
    expect(wizard.customForm.displayName).toBe('Unsaved name')
  })

  it('targets new store actions and ignores old login and completion responses', async () => {
    const first = createStore('Alpha')
    const second = createStore('Beta')
    first.providers.value = [{ ...provider('Alpha'), storedCredentialType: null }]
    second.providers.value = [{ ...provider('Beta'), storedCredentialType: null }]
    const login = deferred<boolean>()
    first.loginProvider = () => login.promise
    const props = shallowReactive({ providerSettings: first })
    const show = shallowRef(true)
    const scope = effectScope()
    cleanups.push(() => scope.stop())
    const wizard = scope.run(() => useProviderSetupWizard({ providerSettings: () => props.providerSettings, show, resumeProviderId: shallowRef('service'), onManage: () => {} }))!
    const oldLogin = wizard.login('api_key')
    props.providerSettings = second
    login.resolve(true)
    await oldLogin
    expect(wizard.step.value).toBe(2)
    await wizard.toggleModel('model', false)
    expect(first.registeredModels.value[0]?.enabled).toBe(true)
    expect(second.registeredModels.value[0]?.enabled).toBe(false)
    await wizard.toggleModel('model', true)
    second.providers.value = [provider('Beta')]
    const enable = deferred<boolean>()
    second.setProviderEnabled = () => enable.promise
    const oldFinish = wizard.finish()
    show.value = false
    show.value = true
    enable.resolve(true)
    await oldFinish
    expect(show.value).toBe(true)
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function manualModel(): LocalCustomProviderModel {
  return { id: 'manual', name: 'Manual', contextWindow: 4096, maxTokens: 1024, reasoning: false, input: ['text'] }
}

function provider(displayName: string): LocalProvider {
  return {
    activeRunCount: 0,
    added: true,
    api: null,
    authTypes: ['api_key'],
    baseUrl: null,
    canSyncModels: true,
    custom: false,
    description: null,
    displayName,
    enabled: true,
    enabledModelCount: 1,
    id: 'service',
    modelCount: 1,
    setupComplete: true,
    status: 'available',
    storedCredentialType: 'api_key',
    syncUnavailableReason: null,
  }
}

function model(displayName: string): LocalRuntimeModelOption {
  return {
    available: true,
    capabilities: ['text'],
    contextWindow: 4096,
    displayName,
    enabled: true,
    hasParameterOverride: false,
    lastSeenAt: null,
    maxTokens: 1024,
    modelId: 'model',
    overrideContextWindow: null,
    overrideMaxTokens: null,
    providerId: 'service',
    reasoningOptions: [],
    serviceTiers: [],
    source: 'builtin',
    sourceContextWindow: 4096,
    sourceMaxTokens: 1024,
    sourceParametersUpdated: false,
  }
}

function createStore(name: string, locale: BuddyLocale = 'zh-CN') {
  const providers = shallowRef<ReadonlyArray<LocalProvider>>([provider(name)])
  const registeredModels = shallowRef<ReadonlyArray<LocalRuntimeModelOption>>([model(name)])
  const succeed = async () => true
  return {
    authChallenge: shallowRef(null),
    defaultEffort: shallowRef(null),
    defaultModelId: shallowRef(null),
    isAuthenticating: shallowRef(false),
    isLoadingModelCatalog: shallowRef(false),
    language: shallowRef(locale),
    modelProviderError: shallowRef(null),
    models: registeredModels,
    mutatingProviderId: shallowRef(null),
    providers,
    registeredModels,
    syncingProviderId: shallowRef(null),
    acknowledgeModelSourceUpdate: succeed,
    addProvider: succeed,
    cancelAuth: async () => {},
    clearModelProviderError: () => {},
    clearProviderCredential: succeed,
    dispose: () => {},
    loadModelCatalog: succeed,
    loginProvider: succeed,
    logoutProvider: succeed,
    rememberModelSelection: succeed,
    removeProvider: succeed,
    respondToAuth: succeed,
    restoreModelSourceParameters: succeed,
    setDefaultEffort: succeed,
    setDefaultModel: succeed,
    setProviderEnabled: succeed,
    syncProviderModels: succeed,
    upsertManualModel: succeed,
    setModelParameters: async (providerId, modelId, parameters) => {
      registeredModels.value = registeredModels.value.map(item => item.providerId === providerId && item.modelId === modelId ? { ...item, ...parameters } : item)
      return true
    },
    setProviderModelEnabled: async (providerId, modelId, enabled) => {
      registeredModels.value = registeredModels.value.map(item => item.providerId === providerId && item.modelId === modelId ? { ...item, enabled } : item)
      return true
    },
    upsertCustomProvider: async (input) => {
      providers.value = providers.value.map(item => item.id === input.id ? { ...item, displayName: input.displayName } : item)
      return true
    },
  } satisfies ModelProvidersStore
}
