import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { ModelServiceConsoleMode, ModelServiceProviderRow } from '../typing'
import type { AiModelItem, AiModelServiceConfigSummary } from '@/apis/ai'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, toValue } from 'vue'
import {
  getSystemAiModelItems,
  getUserAiModelItems,
  syncSystemAiModelItems,
  syncUserAiModelItems,
  updateSystemAiModelItem,
  updateUserAiModelItem,
} from '@/apis/ai'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

/**
 * 模型列表参数。
 */
export interface UseModelServiceModelsOptions {
  /** 控制台模式 */
  mode: MaybeRefOrGetter<ModelServiceConsoleMode>
  /** 当前服务商行 */
  selectedRow: ComputedRef<ModelServiceProviderRow | null>
  /** 当前服务 */
  selectedService: ComputedRef<AiModelServiceConfigSummary | null>
  /** 是否可编辑地址 */
  canEditEndpoint: ComputedRef<boolean>
  /** 确保当前服务已保存 */
  ensureSelectedService: () => Promise<AiModelServiceConfigSummary>
  /** 更新模型数量缓存 */
  patchServiceModelCount: (configId: string, modelCount: number) => void
  /** 保存地址 */
  saveEndpoint: () => Promise<boolean>
}

export function useModelServiceModels(options: UseModelServiceModelsOptions) {
  const models = shallowRef<AiModelItem[]>([])
  const isLoadingModels = shallowRef(false)
  const isSyncingModels = shallowRef(false)
  const updatingModelIds = shallowRef(new Set<string>())

  const totalModelCount = computed(() => options.selectedService.value?.modelCount ?? models.value.length)
  const enabledModelCount = computed(() => models.value.filter(model => model.enabled).length)
  const syncModelsButtonText = computed(() => '同步模型')
  const modelSummaryText = computed(() => {
    if (models.value.length > 0) {
      return `共 ${models.value.length} 个模型，已启用 ${enabledModelCount.value} 个。`
    }

    if (totalModelCount.value > 0) {
      return `已记录 ${totalModelCount.value} 个模型，加载后可继续启停。`
    }

    return '首次接入或修改地址后，需要先同步一次模型列表。'
  })
  const shouldShowModelsEmptyState = computed(() => !isLoadingModels.value && models.value.length === 0)

  async function loadModelsForSelectedService() {
    const service = options.selectedService.value
    clearModels()

    if (!service?.modelCount) {
      return
    }

    await loadModels(service.configId)
  }

  async function loadModels(configId: string) {
    isLoadingModels.value = true

    try {
      models.value = currentMode() === 'system'
        ? await getSystemAiModelItems(configId)
        : await getUserAiModelItems(configId)
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
  }

  async function syncModels() {
    if (!options.selectedRow.value) {
      return
    }

    if (options.canEditEndpoint.value) {
      const saved = await options.saveEndpoint()
      if (!saved) {
        return
      }
    }

    isSyncingModels.value = true

    try {
      const service = await options.ensureSelectedService()
      const result = currentMode() === 'system'
        ? await syncSystemAiModelItems(service.configId)
        : await syncUserAiModelItems(service.configId)

      models.value = result.models
      options.patchServiceModelCount(service.configId, result.models.length)
      ElMessage.success('模型列表已同步')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '同步模型失败'))
    }
    finally {
      isSyncingModels.value = false
    }
  }

  async function updateModelStatus(model: AiModelItem, value: string | number | boolean) {
    const service = options.selectedService.value
    if (!service) {
      return
    }

    const nextUpdatingIds = new Set(updatingModelIds.value)
    nextUpdatingIds.add(model.modelItemId)
    updatingModelIds.value = nextUpdatingIds

    try {
      const item = currentMode() === 'system'
        ? await updateSystemAiModelItem(service.configId, model.modelItemId, { enabled: Boolean(value) })
        : await updateUserAiModelItem(service.configId, model.modelItemId, { enabled: Boolean(value) })

      models.value = models.value.map(current => current.modelItemId === item.modelItemId ? item : current)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '更新模型状态失败'))
    }
    finally {
      const nextIds = new Set(updatingModelIds.value)
      nextIds.delete(model.modelItemId)
      updatingModelIds.value = nextIds
    }
  }

  function currentMode() {
    return toValue(options.mode)
  }

  return {
    models,
    isLoadingModels,
    isSyncingModels,
    updatingModelIds,
    totalModelCount,
    syncModelsButtonText,
    modelSummaryText,
    shouldShowModelsEmptyState,
    loadModelsForSelectedService,
    clearModels,
    syncModels,
    updateModelStatus,
  }
}
