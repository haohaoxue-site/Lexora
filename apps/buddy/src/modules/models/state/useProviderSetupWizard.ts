import type { LocalCustomProvider, LocalCustomProviderModel, LocalProvider } from '@buddy-shared/providers/providerApi'

import type { ModelProvidersStore } from '@/modules/models/state/typing'
import { computed, onScopeDispose, reactive, shallowRef, watch } from 'vue'
import { desktopProviderApiOptions } from '@/modules/models/model/desktopProviderApiOptions'

interface ValueRef<T> {
  readonly value: T
}

interface WritableValueRef<T> {
  value: T
}

interface UseProviderSetupWizardOptions {
  onManage: (providerId: string) => void
  providerSettings: () => ModelProvidersStore
  resumeProviderId: ValueRef<string | null>
  show: WritableValueRef<boolean>
}

export function useProviderSetupWizard(options: UseProviderSetupWizardOptions) {
  const { providerSettings, resumeProviderId, show } = options
  let generation = 0
  const step = shallowRef(1)
  const furthestStep = shallowRef(1)
  const sourceTab = shallowRef<'builtin' | 'custom'>('builtin')
  const providerQuery = shallowRef('')
  const selectedProviderId = shallowRef<string | null>(null)
  const manualFormKey = shallowRef(0)
  const showManualModelDialog = shallowRef(false)
  const savingManualModel = shallowRef(false)
  const customIdEdited = shallowRef(false)
  const customForm = reactive({
    api: desktopProviderApiOptions[0]!.value,
    baseUrl: 'https://api.example.com/v1',
    description: '',
    displayName: '',
    id: createCustomId(),
  })
  const providers = computed(() => providerSettings().providers.value)
  const resumeProviderAvailable = computed(() => providers.value.some(provider => provider.id === resumeProviderId.value))
  const selectedProvider = computed(() => providers.value.find(
    provider => provider.id === selectedProviderId.value,
  ) ?? null)
  const providerModels = computed(() => providerSettings().registeredModels.value.filter(
    model => model.providerId === selectedProviderId.value,
  ))
  const enabledModels = computed(() => providerModels.value.filter(
    model => model.enabled && model.available,
  ))
  const filteredProviders = computed(() => {
    const query = providerQuery.value.trim().toLocaleLowerCase()
    return providers.value.filter(provider => !provider.custom && (
      !query
      || provider.displayName.toLocaleLowerCase().includes(query)
      || provider.id.toLocaleLowerCase().includes(query)
    ))
  })
  const stepCount = computed(() => 3)
  const canContinueCustom = computed(() => Boolean(
    customForm.displayName.trim()
    && customForm.id.trim()
    && customForm.baseUrl.trim(),
  ))
  const canComplete = computed(() => (
    selectedProvider.value?.storedCredentialType !== null
    && enabledModels.value.length > 0
  ))

  watch([show, providerSettings, () => resumeProviderId.value, resumeProviderAvailable], ([visible], [wasVisible]) => {
    generation += 1
    savingManualModel.value = false
    showManualModelDialog.value = false
    if (visible || wasVisible)
      providerSettings().clearModelProviderError()
    if (!visible)
      return
    selectedProviderId.value = resumeProviderId.value
    const provider = selectedProvider.value
    sourceTab.value = provider?.custom ? 'custom' : 'builtin'
    if (!provider) {
      resetNewProviderForm()
      resetSteps(1)
      return
    }
    if (provider.custom)
      populateCustomForm(provider)
    resetSteps(provider.storedCredentialType ? 3 : 2)
  }, { flush: 'sync', immediate: true })

  onScopeDispose(() => {
    generation += 1
  })

  function updateCustomName(value: string) {
    customForm.displayName = value
    if (customIdEdited.value)
      return
    customForm.id = toProviderId(value) || customForm.id
  }

  function closeDialog() {
    providerSettings().clearModelProviderError()
    show.value = false
  }

  async function addBuiltin(provider: LocalProvider) {
    if (provider.added) {
      if (provider.id === selectedProviderId.value && furthestStep.value > 1) {
        navigateToReachedStep(2)
        return
      }
      closeDialog()
      options.onManage(provider.id)
      return
    }
    const requestGeneration = generation
    if (!await providerSettings().addProvider(provider.id) || requestGeneration !== generation)
      return
    selectedProviderId.value = provider.id
    advanceToStep(selectedProvider.value?.storedCredentialType ? 3 : 2)
  }

  async function createCustom() {
    if (!canContinueCustom.value)
      return
    const requestGeneration = generation
    const input: LocalCustomProvider = {
      api: customForm.api as LocalCustomProvider['api'],
      baseUrl: customForm.baseUrl.trim(),
      description: customForm.description.trim() || undefined,
      displayName: customForm.displayName.trim(),
      enabled: selectedProvider.value?.enabled ?? false,
      id: customForm.id.trim(),
      models: [],
    }
    const succeeded = await providerSettings().upsertCustomProvider(input)
    if (!succeeded || requestGeneration !== generation)
      return
    selectedProviderId.value = input.id
    customIdEdited.value = true
    advanceToStep(2)
  }

  async function login(authType: 'api_key' | 'oauth') {
    const provider = selectedProvider.value
    if (!provider)
      return
    const requestGeneration = generation
    const succeeded = await providerSettings().loginProvider(provider.id, authType)
    if (succeeded && requestGeneration === generation && selectedProviderId.value === provider.id)
      advanceToStep(3)
  }

  async function saveManualModel(model: LocalCustomProviderModel) {
    const provider = selectedProvider.value
    if (!provider || savingManualModel.value)
      return
    const requestGeneration = generation
    const formKey = manualFormKey.value
    savingManualModel.value = true
    try {
      const saved = await providerSettings().upsertManualModel(provider.id, model)
      if (requestGeneration !== generation || formKey !== manualFormKey.value || selectedProviderId.value !== provider.id)
        return
      if (saved)
        showManualModelDialog.value = false
    }
    finally {
      if (requestGeneration === generation && formKey === manualFormKey.value)
        savingManualModel.value = false
    }
  }

  function openManualModelDialog() {
    manualFormKey.value += 1
    savingManualModel.value = false
    showManualModelDialog.value = true
  }

  async function toggleModel(modelId: string, enabled: boolean) {
    const provider = selectedProvider.value
    if (provider)
      await providerSettings().setProviderModelEnabled(provider.id, modelId, enabled)
  }

  async function continueFromModels() {
    if (!canComplete.value)
      return
    await finish()
  }

  async function finish() {
    const provider = selectedProvider.value
    if (!provider || !canComplete.value)
      return
    const requestGeneration = generation
    const succeeded = await providerSettings().setProviderEnabled(provider.id, true)
    if (succeeded && requestGeneration === generation && selectedProviderId.value === provider.id)
      closeDialog()
  }

  function goToPreviousStep() {
    navigateToReachedStep(step.value - 1)
  }

  function advanceToStep(nextStep: number) {
    step.value = nextStep
    furthestStep.value = Math.max(furthestStep.value, nextStep)
  }

  function navigateToReachedStep(nextStep: number) {
    if (nextStep < 1 || nextStep > Math.min(furthestStep.value, stepCount.value))
      return
    providerSettings().clearModelProviderError()
    if (nextStep === 1 && selectedProvider.value?.custom)
      populateCustomForm(selectedProvider.value)
    step.value = nextStep
  }

  function resetSteps(initialStep: number) {
    step.value = initialStep
    furthestStep.value = initialStep
  }

  function populateCustomForm(provider: LocalProvider) {
    customForm.api = provider.api as LocalCustomProvider['api']
    customForm.baseUrl = provider.baseUrl ?? ''
    customForm.description = provider.description ?? ''
    customForm.displayName = provider.displayName
    customForm.id = provider.id
    customIdEdited.value = true
  }

  function resetNewProviderForm() {
    sourceTab.value = 'builtin'
    providerQuery.value = ''
    selectedProviderId.value = null
    customIdEdited.value = false
    customForm.api = desktopProviderApiOptions[0]!.value
    customForm.baseUrl = 'https://api.example.com/v1'
    customForm.description = ''
    customForm.displayName = ''
    customForm.id = createCustomId()
  }

  return {
    addBuiltin,
    canComplete,
    canContinueCustom,
    closeDialog,
    continueFromModels,
    createCustom,
    customForm,
    customIdEdited,
    enabledModels,
    filteredProviders,
    finish,
    furthestStep,
    goToPreviousStep,
    login,
    manualFormKey,
    navigateToReachedStep,
    openManualModelDialog,
    providerModels,
    providerQuery,
    saveManualModel,
    savingManualModel,
    selectedProvider,
    selectedProviderId,
    showManualModelDialog,
    sourceTab,
    step,
    stepCount,
    toggleModel,
    updateCustomName,
  }
}

function toProviderId(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

function createCustomId(): string {
  return `custom-${crypto.randomUUID().slice(0, 8)}`
}
