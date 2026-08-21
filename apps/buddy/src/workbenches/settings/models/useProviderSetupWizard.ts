import type {
  LocalCustomProvider,
  LocalCustomProviderModel,
  LocalProvider,
} from '@buddy-electron/shared/localChatApi'
import type { ModelProvidersStore } from '@/stores/useModelProvidersStore'
import { computed, reactive, shallowRef, watch } from 'vue'
import { desktopProviderApiOptions } from '@/workbenches/settings/models/desktopProviderApiOptions'

interface ValueRef<T> {
  readonly value: T
}

interface WritableValueRef<T> {
  value: T
}

interface UseProviderSetupWizardOptions {
  onManage: (providerId: string) => void
  providerSettings: ModelProvidersStore
  resumeProviderId: ValueRef<string | null>
  show: WritableValueRef<boolean>
}

export function useProviderSetupWizard(options: UseProviderSetupWizardOptions) {
  const { providerSettings, resumeProviderId, show } = options
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
  const providers = computed(() => providerSettings.providers.value)
  const selectedProvider = computed(() => providers.value.find(
    provider => provider.id === selectedProviderId.value,
  ) ?? null)
  const providerModels = computed(() => providerSettings.registeredModels.value.filter(
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
  const requiresDefaultModel = computed(() => providerSettings.defaultModelId.value === null)
  const stepCount = computed(() => requiresDefaultModel.value ? 4 : 3)
  const canContinueCustom = computed(() => Boolean(
    customForm.displayName.trim()
    && customForm.id.trim()
    && customForm.baseUrl.trim(),
  ))
  const canComplete = computed(() => (
    selectedProvider.value?.storedCredentialType !== null
    && enabledModels.value.length > 0
  ))
  const defaultModelId = shallowRef<string | null>(null)

  watch(show, (visible) => {
    if (!visible) {
      providerSettings.clearModelProviderError()
      return
    }
    providerSettings.clearModelProviderError()
    selectedProviderId.value = resumeProviderId.value
    showManualModelDialog.value = false
    defaultModelId.value = null
    const provider = selectedProvider.value
    sourceTab.value = provider?.custom ? 'custom' : 'builtin'
    if (!provider) {
      resetNewProviderForm()
      resetSteps(1)
      return
    }
    if (provider.custom)
      populateCustomForm(provider)
    const initialStep = !provider.storedCredentialType
      ? 2
      : provider.enabledModelCount === 0
        ? 3
        : requiresDefaultModel.value ? 4 : 3
    resetSteps(initialStep)
  })

  function updateCustomName(value: string) {
    customForm.displayName = value
    if (customIdEdited.value)
      return
    customForm.id = toProviderId(value) || customForm.id
  }

  function closeDialog() {
    providerSettings.clearModelProviderError()
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
    if (!await providerSettings.addProvider(provider.id))
      return
    selectedProviderId.value = provider.id
    advanceToStep(selectedProvider.value?.storedCredentialType ? 3 : 2)
  }

  async function createCustom() {
    if (!canContinueCustom.value)
      return
    const succeeded = await providerSettings.upsertCustomProvider({
      api: customForm.api as LocalCustomProvider['api'],
      baseUrl: customForm.baseUrl.trim(),
      description: customForm.description.trim() || undefined,
      displayName: customForm.displayName.trim(),
      enabled: selectedProvider.value?.enabled ?? false,
      id: customForm.id.trim(),
      models: [],
    })
    if (!succeeded)
      return
    selectedProviderId.value = customForm.id.trim()
    customIdEdited.value = true
    advanceToStep(2)
  }

  async function login(authType: 'api_key' | 'oauth') {
    const provider = selectedProvider.value
    if (!provider || !await providerSettings.loginProvider(provider.id, authType))
      return
    advanceToStep(3)
  }

  async function saveManualModel(model: LocalCustomProviderModel) {
    const provider = selectedProvider.value
    if (!provider)
      return
    savingManualModel.value = true
    if (await providerSettings.upsertManualModel(provider.id, model)) {
      manualFormKey.value += 1
      showManualModelDialog.value = false
    }
    savingManualModel.value = false
  }

  function openManualModelDialog() {
    manualFormKey.value += 1
    showManualModelDialog.value = true
  }

  async function toggleModel(modelId: string, enabled: boolean) {
    const provider = selectedProvider.value
    if (provider)
      await providerSettings.setProviderModelEnabled(provider.id, modelId, enabled)
  }

  async function continueFromModels() {
    if (!canComplete.value)
      return
    if (requiresDefaultModel.value) {
      defaultModelId.value = `${enabledModels.value[0]!.providerId}:${enabledModels.value[0]!.modelId}`
      advanceToStep(4)
      return
    }
    await finish()
  }

  async function finish() {
    const provider = selectedProvider.value
    if (!provider || !canComplete.value)
      return
    if (!await providerSettings.setProviderEnabled(provider.id, true))
      return
    if (requiresDefaultModel.value && !await providerSettings.setDefaultModel(defaultModelId.value))
      return
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
    providerSettings.clearModelProviderError()
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
    defaultModelId,
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
    requiresDefaultModel,
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
