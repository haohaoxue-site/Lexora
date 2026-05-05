import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { ModelServiceConsoleMode } from '../typing'
import type { AiModelProviderTemplate, AiModelServiceConfigSummary } from '@/apis/ai'
import {
  AI_MODEL_AUTH_MODE,
  AI_MODEL_ENDPOINT_MODE,
  AI_MODEL_SERVICE_STATUS,
} from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, reactive, shallowRef, toValue } from 'vue'
import { updateSystemAiModelService, updateUserAiModelService } from '@/apis/ai'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { isValidUrl } from '../utils/modelService'

/**
 * 模型服务凭证参数。
 */
export interface UseModelServiceCredentialsOptions {
  /** 控制台模式 */
  mode: MaybeRefOrGetter<ModelServiceConsoleMode>
  /** 当前服务 */
  selectedService: ComputedRef<AiModelServiceConfigSummary | null>
  /** 当前模板 */
  selectedTemplate: ComputedRef<AiModelProviderTemplate | null>
  /** 确保当前服务已保存 */
  ensureSelectedService: () => Promise<AiModelServiceConfigSummary>
  /** 更新服务缓存 */
  patchService: (service: AiModelServiceConfigSummary) => void
}

export function useModelServiceCredentials(options: UseModelServiceCredentialsOptions) {
  const isSavingEndpoint = shallowRef(false)
  const isSavingApiKey = shallowRef(false)
  const isEditingApiKey = shallowRef(false)

  const endpointForm = reactive({
    endpoint: '',
  })

  const apiKeyForm = reactive({
    apiKey: '',
  })

  const canEditEndpoint = computed(() => options.selectedTemplate.value?.endpointMode === AI_MODEL_ENDPOINT_MODE.CUSTOM)
  const requiresApiKey = computed(() => options.selectedTemplate.value?.authMode !== AI_MODEL_AUTH_MODE.NONE)
  const hasSavedApiKey = computed(() => options.selectedService.value?.credentialStatus === AI_MODEL_SERVICE_STATUS.CONFIGURED)
  const shouldShowApiKeyInput = computed(() => requiresApiKey.value && (!hasSavedApiKey.value || isEditingApiKey.value))

  function syncCredentialForms() {
    endpointForm.endpoint = options.selectedService.value?.endpoint ?? ''
    apiKeyForm.apiKey = ''
    isEditingApiKey.value = false
  }

  function startApiKeyEdit() {
    apiKeyForm.apiKey = ''
    isEditingApiKey.value = true
  }

  function keepSavedApiKey() {
    apiKeyForm.apiKey = ''
    isEditingApiKey.value = false
  }

  async function saveApiKey() {
    if (!apiKeyForm.apiKey.trim()) {
      ElMessage.warning('请输入 API Key')
      return
    }

    isSavingApiKey.value = true

    try {
      const service = await options.ensureSelectedService()
      const nextService = currentMode() === 'system'
        ? await updateSystemAiModelService(service.configId, { apiKey: apiKeyForm.apiKey.trim() })
        : await updateUserAiModelService(service.configId, { apiKey: apiKeyForm.apiKey.trim() })

      options.patchService(nextService)
      apiKeyForm.apiKey = ''
      isEditingApiKey.value = false
      ElMessage.success('API Key 已保存')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存 API Key 失败'))
    }
    finally {
      isSavingApiKey.value = false
    }
  }

  async function saveEndpoint() {
    if (!canEditEndpoint.value) {
      return true
    }

    const endpoint = endpointForm.endpoint.trim()
    if (!endpoint) {
      ElMessage.warning('请输入 API 地址')
      return false
    }

    if (!isValidUrl(endpoint)) {
      ElMessage.warning('请输入合法的 API 地址')
      return false
    }

    const currentEndpoint = options.selectedService.value?.endpoint ?? ''
    if (currentEndpoint === endpoint) {
      return true
    }

    isSavingEndpoint.value = true

    try {
      const service = await options.ensureSelectedService()
      const nextService = currentMode() === 'system'
        ? await updateSystemAiModelService(service.configId, { endpoint })
        : await updateUserAiModelService(service.configId, { endpoint })

      options.patchService(nextService)
      endpointForm.endpoint = nextService.endpoint ?? endpoint
      ElMessage.success('API 地址已保存')
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存 API 地址失败'))
      return false
    }
    finally {
      isSavingEndpoint.value = false
    }
  }

  function currentMode() {
    return toValue(options.mode)
  }

  return {
    isSavingEndpoint,
    isSavingApiKey,
    isEditingApiKey,
    endpointForm,
    apiKeyForm,
    canEditEndpoint,
    requiresApiKey,
    hasSavedApiKey,
    shouldShowApiKeyInput,
    syncCredentialForms,
    startApiKeyEdit,
    keepSavedApiKey,
    saveApiKey,
    saveEndpoint,
  }
}
