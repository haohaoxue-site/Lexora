import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type { AiProviderConsoleMode, AiProviderFormController } from '../typing'
import type {
  AiProvider,
  AiProviderModelItem,
  UpsertAiProviderModelRequest,
} from '@/apis/ai'
import { ElMessage } from 'element-plus'
import { computed, nextTick, reactive, shallowRef, toValue } from 'vue'
import {
  discoverPlatformAiProviderModels,
  discoverUserAiProviderModels,
  getPlatformAiProviderModels,
  getUserAiProviderModels,
  upsertPlatformAiProviderModel,
  upsertPlatformAiProviderModels,
  upsertUserAiProviderModel,
  upsertUserAiProviderModels,
} from '@/apis/ai'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

/**
 * 模型列表参数。
 */
export interface UseAiProviderModelsOptions {
  /** 控制台模式 */
  mode: MaybeRefOrGetter<AiProviderConsoleMode>
  /** 当前服务商 */
  selectedProvider: ComputedRef<AiProvider | null>
  /** 是否可编辑地址 */
  canEditEndpoint: ComputedRef<boolean>
  /** 更新模型数量缓存 */
  patchProviderModelCount: (providerId: string, modelCount: number) => void
  /** 保存地址 */
  saveEndpoint: () => Promise<boolean>
  /** 添加模型表单实例 */
  createModelFormRef: Readonly<Ref<AiProviderFormController | null>>
}

export function useAiProviderModels(options: UseAiProviderModelsOptions) {
  const models = shallowRef<AiProviderModelItem[]>([])
  const discoveredModels = shallowRef<AiProviderModelItem[]>([])
  const discoverSearchKeyword = shallowRef('')
  const isLoadingModels = shallowRef(false)
  const isDiscoveringModels = shallowRef(false)
  const isAddingDiscoveredModels = shallowRef(false)
  const isCreatingModel = shallowRef(false)
  const discoverDialogVisible = shallowRef(false)
  const createModelDialogVisible = shallowRef(false)
  const updatingModelIds = shallowRef(new Set<string>())

  const createModelForm = reactive({
    modelId: '',
    modelName: '',
  })

  const createModelRules = {
    modelId: [{ required: true, message: '请输入模型 ID', trigger: 'blur' }],
    modelName: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
  }

  const totalModelCount = computed(() => models.value.length)
  const enabledModelCount = computed(() => models.value.filter(model => model.enabled).length)
  const discoverModelsButtonText = computed(() => '获取模型列表')
  const filteredDiscoveredModels = computed(() => {
    const keyword = discoverSearchKeyword.value.trim().toLowerCase()
    if (!keyword) {
      return discoveredModels.value
    }

    return discoveredModels.value.filter(model =>
      model.modelId.toLowerCase().includes(keyword)
      || model.modelName.toLowerCase().includes(keyword),
    )
  })
  const modelSummaryText = computed(() => {
    if (models.value.length > 0) {
      return `共 ${models.value.length} 个模型，已启用 ${enabledModelCount.value} 个。`
    }

    return '获取模型列表或手动添加模型后可启用服务商。'
  })
  const shouldShowModelsEmptyState = computed(() => !isLoadingModels.value && models.value.length === 0)

  async function loadModelsForSelectedProvider() {
    const provider = options.selectedProvider.value
    clearModels()

    if (!provider) {
      return
    }

    await loadModels(provider.providerId)
  }

  async function loadModels(providerId: string) {
    isLoadingModels.value = true

    try {
      const result = currentMode() === 'platform'
        ? await getPlatformAiProviderModels(providerId)
        : await getUserAiProviderModels(providerId)

      models.value = sortModels(result.models)
      options.patchProviderModelCount(providerId, result.models.length)
    }
    catch (error) {
      models.value = []
      ElMessage.error(getRequestErrorDisplayMessage(error, '加载模型失败'))
    }
    finally {
      isLoadingModels.value = false
    }
  }

  function clearModels() {
    models.value = []
    discoveredModels.value = []
    discoverSearchKeyword.value = ''
  }

  async function openDiscoverModelsDialog() {
    const provider = options.selectedProvider.value
    if (!provider) {
      return
    }

    if (options.canEditEndpoint.value) {
      const saved = await options.saveEndpoint()
      if (!saved) {
        return
      }
    }

    discoverDialogVisible.value = true
    await refreshDiscoveredModels({ showSuccessMessage: false })
  }

  async function refreshDiscoveredModels(optionsOverride: { showSuccessMessage?: boolean } = {}) {
    const provider = options.selectedProvider.value
    if (!provider) {
      return
    }

    isDiscoveringModels.value = true

    try {
      const result = currentMode() === 'platform'
        ? await discoverPlatformAiProviderModels(provider.providerId)
        : await discoverUserAiProviderModels(provider.providerId)

      discoveredModels.value = result.models
      if (optionsOverride.showSuccessMessage ?? true) {
        ElMessage.success(`已发现 ${result.models.length} 个模型`)
      }
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '获取模型列表失败'))
    }
    finally {
      isDiscoveringModels.value = false
    }
  }

  async function addAllDiscoveredModels() {
    const provider = options.selectedProvider.value
    const targetModels = filteredDiscoveredModels.value
    if (!provider || targetModels.length === 0) {
      return
    }

    isAddingDiscoveredModels.value = true

    try {
      const result = currentMode() === 'platform'
        ? await upsertPlatformAiProviderModels(provider.providerId, {
            models: targetModels.map(model => buildUpsertModelPayload(model, true)),
          })
        : await upsertUserAiProviderModels(provider.providerId, {
            models: targetModels.map(model => buildUpsertModelPayload(model, true)),
          })
      const savedModelById = new Map(result.models.map(model => [model.modelId, model]))

      models.value = sortModels(result.models)
      discoveredModels.value = discoveredModels.value.map(model => savedModelById.get(model.modelId) ?? model)
      options.patchProviderModelCount(provider.providerId, result.models.length)
      ElMessage.success(`已添加 ${targetModels.length} 个模型`)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '添加全部模型失败'))
    }
    finally {
      isAddingDiscoveredModels.value = false
    }
  }

  async function updateModelStatus(model: AiProviderModelItem, value: string | number | boolean) {
    await upsertModelStatus(model, Boolean(value), '更新模型状态失败')
  }

  async function upsertModelStatus(model: AiProviderModelItem, enabled: boolean, errorMessage: string) {
    const provider = options.selectedProvider.value
    if (!provider) {
      return null
    }

    const updateKey = getModelUpdateKey(model)
    const nextUpdatingIds = new Set(updatingModelIds.value)
    nextUpdatingIds.add(updateKey)
    updatingModelIds.value = nextUpdatingIds

    try {
      const item = currentMode() === 'platform'
        ? await upsertPlatformAiProviderModel(provider.providerId, buildUpsertModelPayload(model, enabled))
        : await upsertUserAiProviderModel(provider.providerId, buildUpsertModelPayload(model, enabled))

      patchSavedModel(item)
      patchDiscoveredModel(item)
      return item
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, errorMessage))
      return null
    }
    finally {
      const nextIds = new Set(updatingModelIds.value)
      nextIds.delete(updateKey)
      updatingModelIds.value = nextIds
    }
  }

  function openCreateModelDialog() {
    createModelForm.modelId = ''
    createModelForm.modelName = ''
    createModelDialogVisible.value = true
    void nextTick(() => options.createModelFormRef.value?.clearValidate())
  }

  function handleCreateModelIdInput(value: string) {
    const previousModelId = createModelForm.modelId
    const shouldSyncModelName = !createModelForm.modelName || createModelForm.modelName === previousModelId

    createModelForm.modelId = value
    if (shouldSyncModelName) {
      createModelForm.modelName = value
    }
  }

  async function createModel() {
    const provider = options.selectedProvider.value
    if (!provider) {
      return
    }

    const isValid = await options.createModelFormRef.value?.validate().catch(() => false)
    if (!isValid) {
      return
    }

    isCreatingModel.value = true

    try {
      const item = currentMode() === 'platform'
        ? await upsertPlatformAiProviderModel(provider.providerId, {
            modelId: createModelForm.modelId.trim(),
            modelName: createModelForm.modelName.trim(),
            enabled: true,
          })
        : await upsertUserAiProviderModel(provider.providerId, {
            modelId: createModelForm.modelId.trim(),
            modelName: createModelForm.modelName.trim(),
            enabled: true,
          })

      patchSavedModel(item)
      patchDiscoveredModel(item)
      createModelDialogVisible.value = false
      ElMessage.success('模型已添加')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '添加模型失败'))
    }
    finally {
      isCreatingModel.value = false
    }
  }

  function patchSavedModel(item: AiProviderModelItem) {
    const exists = models.value.some(model => model.modelId === item.modelId)
    models.value = sortModels(exists
      ? models.value.map(model => model.modelId === item.modelId ? item : model)
      : [...models.value, item])
    options.patchProviderModelCount(item.providerId, models.value.length)
  }

  function patchDiscoveredModel(item: AiProviderModelItem) {
    if (!discoveredModels.value.some(model => model.modelId === item.modelId)) {
      return
    }

    discoveredModels.value = discoveredModels.value.map(model => model.modelId === item.modelId ? item : model)
  }

  function isModelUpdating(model: AiProviderModelItem) {
    return updatingModelIds.value.has(getModelUpdateKey(model))
  }

  function getModelUpdateKey(model: AiProviderModelItem) {
    return `${model.providerId}:${model.modelId}`
  }

  function buildUpsertModelPayload(model: AiProviderModelItem, enabled: boolean): UpsertAiProviderModelRequest {
    const payload: UpsertAiProviderModelRequest = {
      modelId: model.modelId,
      modelName: model.modelName,
      modelType: model.modelType,
      capabilities: model.capabilities,
      enabled,
    }

    if (model.contextWindow) {
      payload.contextWindow = model.contextWindow
    }
    if (model.maxOutputTokens) {
      payload.maxOutputTokens = model.maxOutputTokens
    }

    return payload
  }

  function sortModels(items: AiProviderModelItem[]) {
    return [...items].sort((left, right) =>
      left.modelType.localeCompare(right.modelType)
      || left.modelName.localeCompare(right.modelName)
      || left.modelId.localeCompare(right.modelId),
    )
  }

  function currentMode() {
    return toValue(options.mode)
  }

  return {
    models,
    discoveredModels,
    discoverSearchKeyword,
    filteredDiscoveredModels,
    isLoadingModels,
    isDiscoveringModels,
    isAddingDiscoveredModels,
    isCreatingModel,
    discoverDialogVisible,
    createModelDialogVisible,
    updatingModelIds,
    createModelForm,
    createModelRules,
    totalModelCount,
    enabledModelCount,
    discoverModelsButtonText,
    modelSummaryText,
    shouldShowModelsEmptyState,
    loadModelsForSelectedProvider,
    clearModels,
    openDiscoverModelsDialog,
    refreshDiscoveredModels,
    addAllDiscoveredModels,
    openCreateModelDialog,
    handleCreateModelIdInput,
    createModel,
    updateModelStatus,
    isModelUpdating,
  }
}
