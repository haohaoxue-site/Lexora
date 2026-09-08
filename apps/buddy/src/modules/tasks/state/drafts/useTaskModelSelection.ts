import type { LocalConversation } from '@buddy-shared/conversation/conversationApi'
import type { BuddyServiceTier, BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'
import type { TaskModelSelection } from './typing'
import type { ModelProvidersStore } from '@/modules/models'
import { computed, readonly, shallowRef, watch } from 'vue'
import { modelKey, resolveConcreteEffort } from '@/modules/models'

type ConversationModelSelection = LocalConversation['modelSelection']

export function useTaskModelSelection(catalog: ModelProvidersStore): TaskModelSelection {
  const configuration = shallowRef<ConversationModelSelection>(null)
  const selectedModelId = computed(() => configuration.value ? modelKey(configuration.value) : null)
  const selectedEffort = computed(() => configuration.value?.reasoning ?? null)
  const selectedServiceTier = computed(() => configuration.value?.serviceTier ?? null)
  const selectedModel = computed(() => catalog.models.value.find(model => modelKey(model) === selectedModelId.value) ?? null)
  const selectedModelOption = computed(() => catalog.registeredModels.value.find(model => modelKey(model) === selectedModelId.value) ?? null)

  const stopCatalogSync = watch(
    () => [catalog.registeredModels.value, catalog.isLoadingModelCatalog.value] as const,
    ([, loading]) => {
      if (!loading && !configuration.value)
        selectDefaultModel()
    },
    { immediate: true },
  )

  function selectDefaultModel() {
    const model = catalog.models.value.find(item => modelKey(item) === catalog.defaultModelId.value)
    configuration.value = model
      ? {
          modelId: model.modelId,
          providerId: model.providerId,
          reasoning: resolveConcreteEffort(model, catalog.defaultEffort.value),
          serviceTier: null,
        }
      : null
  }

  function restoreConversationModelSelection(value: ConversationModelSelection) {
    if (!value) {
      selectDefaultModel()
      return
    }
    configuration.value = { ...value }
  }

  async function selectModel(value: string): Promise<boolean> {
    const model = catalog.models.value.find(item => modelKey(item) === value)
    if (!model)
      return false
    configuration.value = {
      modelId: model.modelId,
      providerId: model.providerId,
      reasoning: resolveConcreteEffort(model, null),
      serviceTier: null,
    }
    return rememberSelection()
  }

  async function setSelectedEffort(value: BuddyThinkingLevel | null): Promise<boolean> {
    const model = selectedModel.value
    if (!model || !configuration.value)
      return false
    configuration.value = { ...configuration.value, reasoning: resolveConcreteEffort(model, value) }
    return rememberSelection()
  }

  function setSelectedServiceTier(value: BuddyServiceTier | null) {
    if (configuration.value)
      configuration.value = { ...configuration.value, serviceTier: value }
  }

  function rememberSelection(): Promise<boolean> {
    const value = configuration.value
    return value
      ? catalog.rememberModelSelection({ modelId: value.modelId, providerId: value.providerId, reasoning: value.reasoning })
      : Promise.resolve(false)
  }

  return {
    currentSelection: () => configuration.value,
    dispose: stopCatalogSync,
    restoreConversationModelSelection,
    selectDefaultModel,
    selectedEffort: readonly(selectedEffort),
    selectedModel: readonly(selectedModel),
    selectedModelId: readonly(selectedModelId),
    selectedModelOption: readonly(selectedModelOption),
    selectedServiceTier: readonly(selectedServiceTier),
    selectModel,
    setSelectedEffort,
    setSelectedServiceTier,
  }
}
