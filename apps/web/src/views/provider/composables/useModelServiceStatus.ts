import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { ModelServiceConsoleMode } from '../typing'
import type { AiModelServiceConfigSummary } from '@/apis/ai'
import { ElMessage } from 'element-plus'
import { shallowRef, toValue } from 'vue'
import { updateSystemAiModelService, updateUserAiModelService } from '@/apis/ai'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

/**
 * 模型服务状态参数。
 */
export interface UseModelServiceStatusOptions {
  /** 控制台模式 */
  mode: MaybeRefOrGetter<ModelServiceConsoleMode>
  /** 当前服务 */
  selectedService: ComputedRef<AiModelServiceConfigSummary | null>
  /** 当前模型总数 */
  totalModelCount: ComputedRef<number>
  /** 确保当前服务已保存 */
  ensureSelectedService: () => Promise<AiModelServiceConfigSummary>
  /** 更新服务缓存 */
  patchService: (service: AiModelServiceConfigSummary) => void
}

export function useModelServiceStatus(options: UseModelServiceStatusOptions) {
  const isUpdatingServiceStatus = shallowRef(false)

  async function updateServiceEnabled(value: string | number | boolean) {
    const enabled = Boolean(value)
    if (options.selectedService.value?.enabled === enabled) {
      return
    }

    if (enabled && options.totalModelCount.value === 0) {
      ElMessage.warning('请先同步模型后再启用服务商')
      return
    }

    isUpdatingServiceStatus.value = true

    try {
      const service = await options.ensureSelectedService()
      const nextService = currentMode() === 'system'
        ? await updateSystemAiModelService(service.configId, { enabled })
        : await updateUserAiModelService(service.configId, { enabled })

      options.patchService(nextService)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '更新服务状态失败'))
    }
    finally {
      isUpdatingServiceStatus.value = false
    }
  }

  function currentMode() {
    return toValue(options.mode)
  }

  return {
    isUpdatingServiceStatus,
    updateServiceEnabled,
  }
}
