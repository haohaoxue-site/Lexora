import type { ChatRuntimeConfig } from '@/apis/chat'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { shallowRef } from 'vue'
import { getChatRuntimeConfig } from '@/apis/chat'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { createEmptyRuntimeConfig } from './utils/chat-model-selection'

export const useChatRuntimeConfig = createSharedComposable(() => {
  const runtimeConfig = shallowRef<ChatRuntimeConfig>(createEmptyRuntimeConfig())
  const isLoadingRuntimeConfig = shallowRef(true)

  async function loadRuntimeConfig(options: { silent?: boolean } = {}) {
    const { silent = false } = options
    isLoadingRuntimeConfig.value = true

    try {
      runtimeConfig.value = await getChatRuntimeConfig()
      return true
    }
    catch (error) {
      if (!silent) {
        ElMessage.error(getRequestErrorDisplayMessage(error, '加载 AI 服务状态失败'))
      }

      return false
    }
    finally {
      isLoadingRuntimeConfig.value = false
    }
  }

  return {
    isLoadingRuntimeConfig,
    loadRuntimeConfig,
    runtimeConfig,
  }
})
