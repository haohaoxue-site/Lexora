import type { AuthProviderName } from '@haohaoxue/samepage-contracts'
import type { FormInstance, FormRules } from 'element-plus'
import type { ShallowRef } from 'vue'
import { AUTH_PROVIDER_VALUES } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createRegistrationInviteGrant, startOAuthLogin } from '@/apis/auth'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useAuthStore } from '@/stores/auth'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { useAuthCapabilities } from '../../composables/useAuthCapabilities'
import { completeAuthNavigation, syncPendingRedirect } from '../../utils/navigation'
import { AUTH_PROVIDER_UI_META } from '../../utils/provider-ui'
import { createEmailRules, createPasswordRules, isValidEmail, isValidPassword } from '../../utils/rules'

export function useLogin(options: {
  oauthInviteFormRef: ShallowRef<FormInstance | null>
  passwordFormRef: ShallowRef<FormInstance | null>
}) {
  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const selectedOauthProvider = shallowRef<AuthProviderName | null>(null)
  const isOauthInviteDialogVisible = shallowRef(false)
  const startingOauthProvider = shallowRef<AuthProviderName | null>(null)
  const passwordForm = reactive({
    email: '',
    password: '',
  })
  const oauthInviteForm = reactive({
    inviteCode: '',
  })
  const passwordFormRules: FormRules<typeof passwordForm> = {
    email: createEmailRules(),
    password: createPasswordRules(),
  }
  const oauthInviteFormRules: FormRules<typeof oauthInviteForm> = {
    inviteCode: [
      {
        required: true,
        message: '请输入邀请码',
      },
      {
        min: 4,
        message: '邀请码至少 4 位',
      },
    ],
  }
  const {
    authCapabilities,
    isLoadingCapabilities,
    loadErrorMessage,
    loadCapabilities,
    passwordRegistrationEnabled,
  } = useAuthCapabilities()

  const providers = computed(() => AUTH_PROVIDER_VALUES
    .filter(provider => authCapabilities.value?.providers[provider].enabled ?? false)
    .map((provider) => {
      const providerMeta = AUTH_PROVIDER_UI_META[provider]
      const acceptingNewUsers = authCapabilities.value?.providers[provider].allowRegistration ?? false
      const inviteCodeRequired = authCapabilities.value?.providers[provider].inviteCodeRequired ?? false

      return {
        provider,
        acceptingNewUsers,
        inviteCodeRequired,
        description: resolveProviderDescription(providerMeta.title, acceptingNewUsers, inviteCodeRequired),
        ...providerMeta,
      }
    }))
  const hasOauthProviders = computed(() => providers.value.length > 0)
  const selectedOauthProviderMeta = computed(() =>
    selectedOauthProvider.value ? AUTH_PROVIDER_UI_META[selectedOauthProvider.value] : null,
  )

  const { isSubmitting: isPasswordSubmitting, submit: submitPasswordLogin } = useFormSubmit({
    validate: () => isValidEmail(passwordForm.email) && isValidPassword(passwordForm.password),
    action: async () => {
      syncPendingRedirect(route.query.redirect, authStore)
      passwordForm.email = passwordForm.email.trim()
      await authStore.passwordLogin(passwordForm.email, passwordForm.password)
    },
    fallbackError: '登录失败',
    onSuccess: () => completeAuthNavigation(router, authStore),
  })

  async function startLogin(provider: AuthProviderName, registrationInviteGrantToken?: string) {
    syncPendingRedirect(route.query.redirect, authStore)
    startingOauthProvider.value = provider

    try {
      const result = await startOAuthLogin(provider, registrationInviteGrantToken
        ? { registrationInviteGrantToken }
        : {})
      window.location.assign(result.authorizeUrl)
    }
    catch (error) {
      startingOauthProvider.value = null
      ElMessage.error(getRequestErrorDisplayMessage(error, '发起第三方登录失败'))
    }
  }

  function handleStartLogin(provider: AuthProviderName) {
    const targetProvider = providers.value.find(item => item.provider === provider)

    if (targetProvider?.acceptingNewUsers && targetProvider.inviteCodeRequired) {
      selectedOauthProvider.value = provider
      oauthInviteForm.inviteCode = ''
      options.oauthInviteFormRef.value?.clearValidate()
      isOauthInviteDialogVisible.value = true
      return
    }

    void startLogin(provider)
  }

  async function continueOauthWithInviteCode() {
    const provider = selectedOauthProvider.value

    if (!provider) {
      return
    }

    const isValid = await options.oauthInviteFormRef.value?.validate().catch(() => false)

    if (!isValid) {
      return
    }

    startingOauthProvider.value = provider

    try {
      const grant = await createRegistrationInviteGrant({
        method: provider,
        inviteCode: oauthInviteForm.inviteCode.trim(),
      })
      isOauthInviteDialogVisible.value = false
      await startLogin(provider, grant.grantToken)
    }
    catch (error) {
      startingOauthProvider.value = null
      ElMessage.error(getRequestErrorDisplayMessage(error, '验证邀请码失败'))
    }
  }

  function continueOauthAsExistingAccount() {
    const provider = selectedOauthProvider.value

    if (!provider) {
      return
    }

    isOauthInviteDialogVisible.value = false
    void startLogin(provider)
  }

  async function handleSubmitPasswordLogin() {
    await submitPasswordLogin(options.passwordFormRef.value)
  }

  onMounted(() => {
    syncPendingRedirect(route.query.redirect, authStore)
    void loadCapabilities()
  })

  return {
    continueOauthAsExistingAccount,
    continueOauthWithInviteCode,
    handleSubmitPasswordLogin,
    handleStartLogin,
    hasOauthProviders,
    isOauthInviteDialogVisible,
    isLoadingCapabilities,
    isPasswordSubmitting,
    loadErrorMessage,
    oauthInviteForm,
    oauthInviteFormRules,
    passwordRegistrationEnabled,
    passwordForm,
    passwordFormRules,
    providers,
    selectedOauthProviderMeta,
    startLogin,
    startingOauthProvider,
    submitPasswordLogin,
  }
}

function resolveProviderDescription(title: string, acceptingNewUsers: boolean, inviteCodeRequired: boolean) {
  if (!acceptingNewUsers) {
    return `仅限已绑定 ${title} 的账号`
  }

  if (inviteCodeRequired) {
    return '新用户需邀请码'
  }

  return '支持首次登录'
}
