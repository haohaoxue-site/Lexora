import type { AuthProviderName } from '@haohaoxue/samepage-contracts/auth'
import type { UserSettings } from '@haohaoxue/samepage-contracts/user'
import {
  AUTH_PROVIDER_VALUES,
  OAUTH_REDIRECT_BIND_STATUS,
  OAUTH_REDIRECT_QUERY,
} from '@haohaoxue/samepage-contracts/auth/constants'
import { formatAuthMethod, normalizeAuthProviderName } from '@haohaoxue/samepage-shared/auth'
import { createSharedComposable } from '@vueuse/core'
import { computed, reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { requestBindEmailCode, startOauthBinding } from '@/apis/user'
import { useUserStore } from '@/stores/user'
import { ElMessage } from '@/utils/element-plus'
import { resolveOAuthRedirectErrorMessage } from '@/utils/oauth-redirect'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { useSettingsAuthCapabilities } from './useSettingsAuthCapabilities'

function createDefaultAccount(): UserSettings['account'] {
  return {
    email: null,
    userCode: '',
    hasPasswordAuth: false,
    emailVerified: false,
    oauthProviders: Object.fromEntries(AUTH_PROVIDER_VALUES.map(provider => [provider, {
      connected: false,
      username: null,
    }])) as UserSettings['account']['oauthProviders'],
  }
}

function formatProviderLabel(provider: string) {
  const normalizedProvider = normalizeAuthProviderName(provider)

  if (normalizedProvider) {
    return formatAuthMethod(normalizedProvider)
  }

  return '第三方账号'
}

export const useSettingsUserAccount = createSharedComposable(() => {
  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const { authCapabilities } = useSettingsAuthCapabilities()
  const isSendingEmailCode = shallowRef(false)
  const isBindingEmail = shallowRef(false)
  const bindingProvider = shallowRef<AuthProviderName | null>(null)
  const disconnectingProvider = shallowRef<AuthProviderName | null>(null)
  const emailForm = reactive({
    email: '',
    code: '',
    newPassword: '',
    confirmPassword: '',
  })

  const settings = computed(() => userStore.settings)
  const account = computed<UserSettings['account']>(() => settings.value?.account ?? createDefaultAccount())
  const emailBindingEnabled = computed(() => authCapabilities.value.emailBindingEnabled)
  const oauthProviderBindingState = computed(() => Object.fromEntries(AUTH_PROVIDER_VALUES.map((provider) => {
    const connectedOauthCount = AUTH_PROVIDER_VALUES.filter(item => account.value.oauthProviders[item].connected).length

    return [provider, {
      canStartBinding: authCapabilities.value.providers[provider].enabled,
      canDisconnect: account.value.oauthProviders[provider].connected
        && (account.value.hasPasswordAuth || connectedOauthCount > 1),
    }]
  })) as Record<AuthProviderName, { canStartBinding: boolean, canDisconnect: boolean }>)

  function syncEmailForm() {
    const nextSettings = userStore.settings

    if (!nextSettings) {
      return
    }

    emailForm.email = nextSettings.account.email || ''
    emailForm.code = ''
    emailForm.newPassword = ''
    emailForm.confirmPassword = ''
  }

  async function sendEmailCode() {
    isSendingEmailCode.value = true

    try {
      await requestBindEmailCode({
        email: emailForm.email.trim(),
      })
      ElMessage.success('验证码已发送，请前往邮箱查看')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '发送验证码失败'))
    }
    finally {
      isSendingEmailCode.value = false
    }
  }

  async function bindEmail() {
    isBindingEmail.value = true
    const hadEmail = Boolean(account.value.email)

    try {
      await userStore.bindEmail({
        email: emailForm.email.trim(),
        code: emailForm.code.trim(),
        newPassword: emailForm.newPassword.trim() || undefined,
      })

      syncEmailForm()
      ElMessage.success(hadEmail ? '邮箱已更新' : '邮箱已绑定')
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '绑定邮箱失败'))
      return false
    }
    finally {
      isBindingEmail.value = false
    }
  }

  async function connectOauth(provider: AuthProviderName) {
    bindingProvider.value = provider

    try {
      const result = await startOauthBinding(provider, {
        redirectPath: route.fullPath,
      })
      window.location.assign(result.authorizeUrl)
    }
    catch (error) {
      bindingProvider.value = null
      ElMessage.error(getRequestErrorDisplayMessage(error, '发起账号绑定失败'))
    }
  }

  async function disconnectOauth(provider: AuthProviderName) {
    disconnectingProvider.value = provider

    try {
      await userStore.disconnectOauth(provider)
      syncEmailForm()
      ElMessage.success(`${formatProviderLabel(provider)} 已解绑`)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '解绑失败'))
    }
    finally {
      disconnectingProvider.value = null
    }
  }

  async function consumeRouteFeedback() {
    const bindStatus = ((route.query[OAUTH_REDIRECT_QUERY.BIND_STATUS] as string | null | undefined) ?? '').trim()
    const provider = ((route.query[OAUTH_REDIRECT_QUERY.PROVIDER] as string | null | undefined) ?? '').trim()
    const bindErrorCode = ((route.query[OAUTH_REDIRECT_QUERY.BIND_ERROR_CODE] as string | null | undefined) ?? '').trim()

    if (!bindStatus) {
      return
    }

    const nextQuery = { ...route.query }
    delete nextQuery[OAUTH_REDIRECT_QUERY.BIND_STATUS]
    delete nextQuery[OAUTH_REDIRECT_QUERY.PROVIDER]
    delete nextQuery[OAUTH_REDIRECT_QUERY.BIND_ERROR_CODE]
    await router.replace({ query: nextQuery })

    if (bindStatus === OAUTH_REDIRECT_BIND_STATUS.SUCCESS) {
      ElMessage.success(`${formatProviderLabel(provider)} 账号已绑定`)
      return
    }

    ElMessage.error(resolveOAuthRedirectErrorMessage(bindErrorCode, {
      purpose: 'bind',
      providerLabel: formatProviderLabel(provider),
      fallbackMessage: `${formatProviderLabel(provider)} 账号绑定失败`,
    }))
  }

  return {
    account,
    bindEmail,
    bindingProvider,
    connectOauth,
    consumeRouteFeedback,
    disconnectOauth,
    disconnectingProvider,
    emailBindingEnabled,
    emailForm,
    isBindingEmail,
    isSendingEmailCode,
    oauthProviderBindingState,
    sendEmailCode,
    syncEmailForm,
  }
})
