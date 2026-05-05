import { OAUTH_REDIRECT_QUERY } from '@haohaoxue/samepage-contracts'
import { computed, onMounted, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { resolveOAuthRedirectErrorMessage } from '@/utils/oauth-redirect'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { completeAuthNavigation } from '../../utils/navigation'

export function useCallback() {
  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const statusLabel = shallowRef('正在完成登录...')
  const errorMessage = shallowRef('')
  const pageDescription = computed(() => errorMessage.value ? '请返回登录页后重试。' : '正在处理第三方登录，请稍候。')

  async function handleCallback() {
    const redirectErrorCode = ((route.query[OAUTH_REDIRECT_QUERY.ERROR_CODE] as string | null | undefined) ?? '').trim()
    const code = ((route.query[OAUTH_REDIRECT_QUERY.LOGIN_CODE] as string | null | undefined) ?? '').trim()

    if (redirectErrorCode) {
      statusLabel.value = '登录失败'
      errorMessage.value = resolveOAuthRedirectErrorMessage(redirectErrorCode, {
        purpose: 'login',
      })
      return
    }

    if (!code) {
      statusLabel.value = '登录信息无效'
      errorMessage.value = '缺少登录凭证，请重新发起登录。'
      return
    }

    try {
      await authStore.login(code)
      statusLabel.value = '登录成功，正在跳转...'
      await completeAuthNavigation(router, authStore)
    }
    catch (error) {
      statusLabel.value = '登录失败'
      errorMessage.value = getRequestErrorDisplayMessage(error, '登录失败')
    }
  }

  onMounted(handleCallback)

  return {
    pageDescription,
    statusLabel,
    errorMessage,
  }
}
