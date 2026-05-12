import type { ChatModelItem, ChatModelSelection } from '@/apis/chat'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { shallowRef } from 'vue'
import { getChatModels } from '@/apis/chat'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { resolveLoadedChatModelRef } from '../utils/chat-model-selection'
import { useChatRuntimeConfig } from './useChatRuntimeConfig'

export interface RefreshModelsOptions {
  silent?: boolean
  showSuccessMessage?: boolean
  skipRuntimeConfigReload?: boolean
  draftModelRef?: ChatModelSelection['modelRef'] | null
  onDraftModelRefResolved?: (modelRef: ChatModelSelection['modelRef'] | null) => void
}

export const useChatModels = createSharedComposable(() => {
  const { runtimeConfig, loadRuntimeConfig } = useChatRuntimeConfig()
  const modelOptions = shallowRef<ChatModelItem[]>([])
  const isLoadingModels = shallowRef(false)

  async function refreshModels(options: RefreshModelsOptions = {}) {
    const {
      silent = false,
      showSuccessMessage = true,
      skipRuntimeConfigReload = false,
      draftModelRef,
      onDraftModelRefResolved,
    } = options

    const hasRuntimeConfig = skipRuntimeConfigReload
      ? true
      : await loadRuntimeConfig({ silent })

    if (!hasRuntimeConfig) {
      return
    }

    isLoadingModels.value = true

    try {
      const result = await getChatModels()
      modelOptions.value = result.models

      if (onDraftModelRefResolved) {
        const nextDraftModelRef = resolveLoadedChatModelRef(
          draftModelRef ?? null,
          result.models,
          runtimeConfig.value.defaultModel,
        )
        onDraftModelRefResolved(nextDraftModelRef ?? null)
      }

      if (showSuccessMessage) {
        ElMessage.success(result.models.length > 0 ? `已获取 ${result.models.length} 个模型` : '当前未获取到可用模型')
      }
    }
    catch (error) {
      modelOptions.value = []

      if (!silent) {
        ElMessage.error(getRequestErrorDisplayMessage(error, '获取模型列表失败'))
      }
    }
    finally {
      isLoadingModels.value = false
    }
  }

  return {
    isLoadingModels,
    modelOptions,
    refreshModels,
  }
})
