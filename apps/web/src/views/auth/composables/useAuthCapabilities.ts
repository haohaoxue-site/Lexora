import type { AuthCapabilities } from '@/apis/capabilities'
import { computed, shallowRef } from 'vue'
import { getAuthCapabilities } from '@/apis/capabilities'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export function useAuthCapabilities() {
  const authCapabilities = shallowRef<AuthCapabilities | null>(null)
  const loadErrorMessage = shallowRef('')
  const isLoadingCapabilities = shallowRef(true)
  const passwordRegistrationEnabled = computed(() => authCapabilities.value?.passwordRegistrationEnabled ?? false)

  async function loadCapabilities() {
    isLoadingCapabilities.value = true
    loadErrorMessage.value = ''

    try {
      authCapabilities.value = await getAuthCapabilities()
    }
    catch (error) {
      loadErrorMessage.value = getRequestErrorDisplayMessage(error, '加载可用登录方式失败')
    }
    finally {
      isLoadingCapabilities.value = false
    }
  }

  return {
    authCapabilities,
    isLoadingCapabilities,
    loadCapabilities,
    loadErrorMessage,
    passwordRegistrationEnabled,
  }
}
