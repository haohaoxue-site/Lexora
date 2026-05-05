import type { AuthProviderName } from '@haohaoxue/samepage-contracts'
import type { FormInstance, FormRules } from 'element-plus'
import type { ShallowRef } from 'vue'
import { AUTH_PROVIDER_VALUES } from '@haohaoxue/samepage-contracts'
import { computed, onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { buildOAuthStartUrl } from '@/apis/auth'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useAuthStore } from '@/stores/auth'
import { useAuthCapabilities } from '../../composables/useAuthCapabilities'
import { completeAuthNavigation, syncPendingRedirect } from '../../utils/navigation'
import { AUTH_PROVIDER_UI_META } from '../../utils/provider-ui'
import { createEmailRules, createPasswordRules, isValidEmail, isValidPassword } from '../../utils/rules'

export function useLogin(options: { passwordFormRef: ShallowRef<FormInstance | null> }) {
  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const passwordForm = reactive({
    email: '',
    password: '',
  })
  const passwordFormRules: FormRules<typeof passwordForm> = {
    email: createEmailRules(),
    password: createPasswordRules(),
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

      return {
        provider,
        acceptingNewUsers,
        description: acceptingNewUsers ? '支持首次登录' : `仅限已绑定 ${providerMeta.title} 的账号`,
        ...providerMeta,
      }
    }))
  const hasOauthProviders = computed(() => providers.value.length > 0)

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

  function startLogin(provider: AuthProviderName) {
    syncPendingRedirect(route.query.redirect, authStore)
    window.location.assign(buildOAuthStartUrl(provider))
  }

  async function handleSubmitPasswordLogin() {
    await submitPasswordLogin(options.passwordFormRef.value)
  }

  onMounted(() => {
    syncPendingRedirect(route.query.redirect, authStore)
    void loadCapabilities()
  })

  return {
    handleSubmitPasswordLogin,
    hasOauthProviders,
    isLoadingCapabilities,
    isPasswordSubmitting,
    loadErrorMessage,
    passwordRegistrationEnabled,
    passwordForm,
    passwordFormRules,
    providers,
    startLogin,
    submitPasswordLogin,
  }
}
