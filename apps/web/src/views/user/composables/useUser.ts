import type {
  AppearancePreference,
  AuthProviderName,
  DeleteCurrentUserRequest,
  LanguagePreference,
  UserSettings,
} from '@haohaoxue/samepage-contracts'
import type { Ref, ShallowRef } from 'vue'
import type { AuthCapabilities } from '@/apis/capabilities'
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  AUTH_PROVIDER,
  OAUTH_REDIRECT_BIND_STATUS,
  OAUTH_REDIRECT_QUERY,
  PERMISSIONS,
} from '@haohaoxue/samepage-contracts'
import { formatAuthMethod, normalizeAuthProviderName } from '@haohaoxue/samepage-shared'
import { ElMessage } from 'element-plus'
import { computed, nextTick, onMounted, reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAuthCapabilities } from '@/apis/capabilities'
import { deleteCurrentUser, requestBindEmailCode, startOauthBinding } from '@/apis/user'
import { resetAdminRoutes } from '@/router'
import { useAuthStore } from '@/stores/auth'
import { useUserStore } from '@/stores/user'
import { resolveOAuthRedirectErrorMessage } from '@/utils/oauth-redirect'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

const DEFAULT_AUTH_CAPABILITIES: AuthCapabilities = {
  emailBindingEnabled: false,
  passwordRegistrationEnabled: false,
  passwordRegistrationInviteCodeRequired: false,
  providers: {
    [AUTH_PROVIDER.GITHUB]: {
      enabled: false,
      allowRegistration: false,
      inviteCodeRequired: false,
    },
    [AUTH_PROVIDER.LINUX_DO]: {
      enabled: false,
      allowRegistration: false,
      inviteCodeRequired: false,
    },
  },
}
const DELETE_ACCOUNT_CONFIRMATION_PHRASE: DeleteCurrentUserRequest['confirmationPhrase'] = ACCOUNT_DELETION_CONFIRMATION_PHRASE

function createDefaultAccount(): UserSettings['account'] {
  return {
    email: null,
    userCode: '',
    hasPasswordAuth: false,
    emailVerified: false,
    github: {
      connected: false,
      username: null,
    },
    linuxDo: {
      connected: false,
      username: null,
    },
  }
}

export function useUser(options: {
  userAccountSectionRef: Ref<{ clearEmailValidation: () => void } | null>
}) {
  const router = useRouter()
  const authStore = useAuthStore()
  const userStore = useUserStore()
  const authCapabilities = shallowRef<AuthCapabilities>(DEFAULT_AUTH_CAPABILITIES)
  const errorMessage = shallowRef('')
  const isLoading = shallowRef(false)
  const isDeletingAccount = shallowRef(false)
  const profileState = useUserProfileState()
  const accountState = useUserAccountState({
    authCapabilities,
  })
  const preferenceState = useUserPreferenceState()
  const currentUser = computed(() => userStore.currentUser)
  const canEditDisplayName = computed(() => !userStore.isSystemAdmin)
  const deleteAccountConfirmationMode = computed<'email' | 'displayName'>(() =>
    accountState.account.value.email ? 'email' : 'displayName',
  )
  const deleteAccountConfirmationTarget = computed(() =>
    accountState.account.value.email ?? currentUser.value?.displayName ?? '',
  )
  const canDeleteAccount = computed(() =>
    currentUser.value?.permissions.includes(PERMISSIONS.USER_DELETE_SELF) ?? false,
  )
  const shouldShowDeleteAccountSection = computed(() =>
    canDeleteAccount.value && !userStore.isSystemAdmin,
  )

  async function loadView() {
    isLoading.value = true
    errorMessage.value = ''
    authCapabilities.value = DEFAULT_AUTH_CAPABILITIES

    try {
      const [, nextAuthCapabilities] = await Promise.all([
        userStore.refreshContext(),
        getAuthCapabilities().catch(() => null),
      ])

      authCapabilities.value = nextAuthCapabilities ?? DEFAULT_AUTH_CAPABILITIES
      profileState.syncProfileForm()
      accountState.syncEmailForm()
      await accountState.consumeRouteFeedback()
    }
    catch (error) {
      errorMessage.value = getRequestErrorDisplayMessage(error, '加载用户设置失败')
    }
    finally {
      isLoading.value = false
    }
  }

  async function handleConfirmEmail() {
    const isSuccess = await accountState.bindEmail()

    if (!isSuccess) {
      return
    }

    await nextTick()
    options.userAccountSectionRef.value?.clearEmailValidation()
  }

  async function deleteAccount(payload: DeleteCurrentUserRequest) {
    if (!shouldShowDeleteAccountSection.value) {
      return false
    }

    isDeletingAccount.value = true

    try {
      await deleteCurrentUser(payload)
      authStore.clearSession()
      ElMessage.success('账号已删除')

      try {
        await router.replace({ name: 'login' })
      }
      finally {
        resetAdminRoutes(router)
      }

      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '删除账号失败'))
      return false
    }
    finally {
      isDeletingAccount.value = false
    }
  }

  onMounted(loadView)

  return {
    account: accountState.account,
    appearancePreference: preferenceState.appearancePreference,
    avatarUrl: profileState.avatarUrl,
    bindingProvider: accountState.bindingProvider,
    canDisconnectGithub: accountState.canDisconnectGithub,
    canDisconnectLinuxDo: accountState.canDisconnectLinuxDo,
    canStartGithubBinding: accountState.canStartGithubBinding,
    canStartLinuxDoBinding: accountState.canStartLinuxDoBinding,
    canEditDisplayName,
    connectOauth: accountState.connectOauth,
    deleteAccount,
    deleteAccountConfirmationMode,
    deleteAccountConfirmationPhrase: DELETE_ACCOUNT_CONFIRMATION_PHRASE,
    deleteAccountConfirmationTarget,
    disconnectOauth: accountState.disconnectOauth,
    disconnectingProvider: accountState.disconnectingProvider,
    emailBindingEnabled: accountState.emailBindingEnabled,
    emailForm: accountState.emailForm,
    errorMessage,
    handleConfirmEmail,
    isBindingEmail: accountState.isBindingEmail,
    isDeletingAccount,
    isLoading,
    isSavingAppearance: preferenceState.isSavingAppearance,
    isSavingDisplayName: profileState.isSavingDisplayName,
    isSavingLanguage: preferenceState.isSavingLanguage,
    isSendingEmailCode: accountState.isSendingEmailCode,
    isUploadingAvatar: profileState.isUploadingAvatar,
    languagePreference: preferenceState.languagePreference,
    profileForm: profileState.profileForm,
    saveDisplayName: profileState.saveDisplayName,
    sendEmailCode: accountState.sendEmailCode,
    shouldShowDeleteAccountSection,
    uploadAvatar: profileState.uploadAvatar,
  }
}

function useUserProfileState() {
  const userStore = useUserStore()
  const isSavingDisplayName = shallowRef(false)
  const isUploadingAvatar = shallowRef(false)
  const profileForm = reactive({
    displayName: '',
  })

  const avatarUrl = computed(() => userStore.settings?.profile.avatarUrl ?? userStore.currentUser?.avatarUrl ?? null)

  function syncProfileForm() {
    const nextSettings = userStore.settings

    if (!nextSettings) {
      return
    }

    profileForm.displayName = nextSettings.profile.displayName
  }

  async function saveDisplayName() {
    isSavingDisplayName.value = true

    try {
      await userStore.updateProfile(profileForm.displayName.trim())
      profileForm.displayName = userStore.currentUser?.displayName ?? profileForm.displayName
      ElMessage.success('显示名称已更新')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存显示名称失败'))
    }
    finally {
      isSavingDisplayName.value = false
    }
  }

  async function uploadAvatar(file: File) {
    isUploadingAvatar.value = true

    try {
      await userStore.updateAvatar(file)
      ElMessage.success('头像已更新')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '上传头像失败'))
    }
    finally {
      isUploadingAvatar.value = false
    }
  }

  return {
    avatarUrl,
    isSavingDisplayName,
    isUploadingAvatar,
    profileForm,
    saveDisplayName,
    syncProfileForm,
    uploadAvatar,
  }
}

function useUserAccountState(options: { authCapabilities: ShallowRef<AuthCapabilities> }) {
  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
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
  const emailBindingEnabled = computed(() => options.authCapabilities.value.emailBindingEnabled)
  const canStartGithubBinding = computed(() => options.authCapabilities.value.providers[AUTH_PROVIDER.GITHUB].enabled)
  const canStartLinuxDoBinding = computed(() => options.authCapabilities.value.providers[AUTH_PROVIDER.LINUX_DO].enabled)
  const canDisconnectGithub = computed(() =>
    account.value.github.connected && (account.value.hasPasswordAuth || account.value.linuxDo.connected),
  )
  const canDisconnectLinuxDo = computed(() =>
    account.value.linuxDo.connected && (account.value.hasPasswordAuth || account.value.github.connected),
  )

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
      const result = await startOauthBinding(provider)
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
    canDisconnectGithub,
    canDisconnectLinuxDo,
    canStartGithubBinding,
    canStartLinuxDoBinding,
    connectOauth,
    consumeRouteFeedback,
    disconnectOauth,
    disconnectingProvider,
    emailBindingEnabled,
    emailForm,
    isBindingEmail,
    isSendingEmailCode,
    sendEmailCode,
    syncEmailForm,
  }
}

function useUserPreferenceState() {
  const userStore = useUserStore()
  const isSavingLanguage = computed(() => userStore.isSavingLanguage)
  const isSavingAppearance = computed(() => userStore.isSavingAppearance)
  const languagePreference = computed<LanguagePreference>({
    get: () => userStore.preferences.language,
    set: (value) => {
      void saveLanguagePreference(value)
    },
  })
  const appearancePreference = computed<AppearancePreference>({
    get: () => userStore.preferences.appearance,
    set: (value) => {
      void saveAppearancePreference(value)
    },
  })

  async function saveLanguagePreference(value: LanguagePreference) {
    try {
      await userStore.updateLanguagePreference(value)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存语言偏好失败'))
    }
  }

  async function saveAppearancePreference(value: AppearancePreference) {
    try {
      await userStore.updateAppearancePreference(value)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存外观偏好失败'))
    }
  }

  return {
    appearancePreference,
    isSavingAppearance,
    isSavingLanguage,
    languagePreference,
  }
}

function formatProviderLabel(provider: string) {
  const normalizedProvider = normalizeAuthProviderName(provider)

  if (normalizedProvider) {
    return formatAuthMethod(normalizedProvider)
  }

  return '第三方账号'
}
