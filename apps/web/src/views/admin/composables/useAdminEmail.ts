import type { FormInstance, FormItemRule, FormRules } from 'element-plus'
import type { Ref } from 'vue'
import type {
  SystemEmailConfig,
  SystemEmailProvider,
  SystemEmailServiceStatus,
} from '@/apis/system-admin'
import {
  SYSTEM_EMAIL_PROVIDER,
  SYSTEM_EMAIL_PROVIDER_DEFAULTS,
  SYSTEM_EMAIL_PROVIDER_LABELS,
} from '@haohaoxue/samepage-contracts/system-admin'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import {
  getSystemEmailConfig,
  getSystemEmailServiceStatus,
  testSystemEmailConfig,
  updateSystemEmailConfig,
  updateSystemEmailServiceStatus,
} from '@/apis/system-admin'
import { useUserStore } from '@/stores/user'
import { ElMessage } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { createEmailRules } from '@/views/auth/utils/rules'

const providerMeta = {
  [SYSTEM_EMAIL_PROVIDER.TENCENT_EXMAIL]: {
    title: SYSTEM_EMAIL_PROVIDER_LABELS[SYSTEM_EMAIL_PROVIDER.TENCENT_EXMAIL],
    defaults: SYSTEM_EMAIL_PROVIDER_DEFAULTS[SYSTEM_EMAIL_PROVIDER.TENCENT_EXMAIL],
    disabled: false,
  },
  [SYSTEM_EMAIL_PROVIDER.GOOGLE_WORKSPACE]: {
    title: SYSTEM_EMAIL_PROVIDER_LABELS[SYSTEM_EMAIL_PROVIDER.GOOGLE_WORKSPACE],
    defaults: SYSTEM_EMAIL_PROVIDER_DEFAULTS[SYSTEM_EMAIL_PROVIDER.GOOGLE_WORKSPACE],
    disabled: true,
  },
} as const satisfies Record<SystemEmailProvider, {
  title: string
  defaults: {
    smtpHost: string
    smtpPort: number
    smtpSecure: boolean
  }
  disabled: boolean
}>

export function useAdminEmail(options: {
  emailConfigFormRef: Ref<FormInstance | null>
  testEmailFormRef: Ref<FormInstance | null>
}) {
  type RuleValidator = NonNullable<FormItemRule['validator']>

  const userStore = useUserStore()
  const currentConfig = shallowRef<SystemEmailConfig | null>(null)
  const currentServiceStatus = shallowRef<SystemEmailServiceStatus | null>(null)
  const errorMessage = shallowRef('')
  const isLoading = shallowRef(false)
  const isSaving = shallowRef(false)
  const isTesting = shallowRef(false)
  const isTestDialogVisible = shallowRef(false)
  const isUpdatingServiceStatus = shallowRef(false)
  const form = reactive({
    provider: SYSTEM_EMAIL_PROVIDER.TENCENT_EXMAIL as SystemEmailProvider,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUsername: '',
    smtpPassword: '',
    fromName: 'SamePage',
    fromEmail: '',
  })
  const testEmailForm = reactive({
    email: '',
  })

  const providerCards = computed(() => Object.entries(providerMeta).map(([provider, meta]) => ({
    provider: provider as SystemEmailProvider,
    ...meta,
  })))

  const defaultTestRecipientEmail = computed(() => userStore.currentUser?.email?.trim().toLowerCase() ?? '')
  const hasSavedPassword = computed(() => currentConfig.value?.hasPassword ?? false)
  const isEditingPassword = shallowRef(false)

  const validatePassword: RuleValidator = (_rule, value, callback) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : ''
    const shouldRequirePassword = (currentServiceStatus.value?.enabled ?? false) && !hasSavedPassword.value

    if (!normalizedValue && !shouldRequirePassword) {
      callback()
      return
    }

    if (!normalizedValue) {
      callback(new Error('启用发件服务前必须填写发件密码'))
      return
    }

    callback()
  }

  const validateHost: RuleValidator = (_rule, value, callback) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : ''

    if (!normalizedValue) {
      callback(new Error('请输入 SMTP 主机地址'))
      return
    }

    callback()
  }

  const validateUsername: RuleValidator = (_rule, value, callback) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : ''

    if (!normalizedValue) {
      callback(new Error('请输入发件账号'))
      return
    }

    callback()
  }

  const validateFromName: RuleValidator = (_rule, value, callback) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : ''

    if (!normalizedValue) {
      callback(new Error('请输入发件人名称'))
      return
    }

    callback()
  }

  const validatePort: RuleValidator = (_rule, value, callback) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      callback(new Error('请输入合法端口'))
      return
    }

    callback()
  }

  const formRules: FormRules<typeof form> = {
    smtpHost: [{ validator: validateHost }],
    smtpPort: [{ validator: validatePort }],
    smtpUsername: [{ validator: validateUsername }],
    smtpPassword: [{ validator: validatePassword }],
    fromName: [{ validator: validateFromName }],
    fromEmail: createEmailRules('发件邮箱'),
  }
  const testEmailFormRules: FormRules<typeof testEmailForm> = {
    email: createEmailRules('收件邮箱'),
  }

  async function loadConfig() {
    isLoading.value = true
    errorMessage.value = ''

    try {
      const [config, serviceStatus] = await Promise.all([
        getSystemEmailConfig(),
        getSystemEmailServiceStatus(),
      ])
      currentConfig.value = config
      currentServiceStatus.value = serviceStatus
      form.provider = config.provider
      form.smtpHost = config.smtpHost
      form.smtpPort = config.smtpPort
      form.smtpSecure = config.smtpSecure
      form.smtpUsername = config.smtpUsername
      resetPasswordDraft()
      form.fromName = config.fromName
      form.fromEmail = config.fromEmail
    }
    catch (error) {
      errorMessage.value = getRequestErrorDisplayMessage(error, '加载发件配置失败')
    }
    finally {
      isLoading.value = false
    }
  }

  async function saveConfig(formRef: FormInstance | null | undefined) {
    normalizeForm()
    const isValid = formRef ? await formRef.validate().catch(() => false) : false

    if (!isValid) {
      return
    }

    isSaving.value = true

    try {
      currentConfig.value = await updateSystemEmailConfig({
        provider: form.provider,
        smtpHost: form.smtpHost,
        smtpPort: form.smtpPort,
        smtpSecure: form.smtpSecure,
        smtpUsername: form.smtpUsername,
        smtpPassword: form.smtpPassword || undefined,
        fromName: form.fromName,
        fromEmail: form.fromEmail,
      })
      resetPasswordDraft()
      ElMessage.success('发件配置已保存')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存发件配置失败'))
    }
    finally {
      isSaving.value = false
    }
  }

  async function updateServiceStatus(nextEnabled: boolean) {
    const previousStatus = currentServiceStatus.value
    currentServiceStatus.value = { enabled: nextEnabled }
    isUpdatingServiceStatus.value = true

    try {
      const nextStatus = await updateSystemEmailServiceStatus({
        enabled: nextEnabled,
      })

      currentServiceStatus.value = nextStatus

      ElMessage.success(nextEnabled ? '发件服务已启用' : '发件服务已关闭')
    }
    catch (error) {
      currentServiceStatus.value = previousStatus
      ElMessage.error(getRequestErrorDisplayMessage(error, nextEnabled ? '启用发件服务失败' : '关闭发件服务失败'))
    }
    finally {
      isUpdatingServiceStatus.value = false
    }
  }

  function openTestDialog() {
    testEmailForm.email = defaultTestRecipientEmail.value
    isTestDialogVisible.value = true
  }

  function closeTestDialog() {
    isTestDialogVisible.value = false
  }

  function handleServiceStatusChange(value: string | number | boolean) {
    if (typeof value !== 'boolean') {
      return
    }

    void updateServiceStatus(value)
  }

  async function handleSaveConfig() {
    await saveConfig(options.emailConfigFormRef.value)
  }

  async function handleSendTestEmail() {
    await testConfig(options.testEmailFormRef.value)
  }

  function clearPasswordValidation() {
    options.emailConfigFormRef.value?.clearValidate('smtpPassword')
  }

  function handleStartPasswordEdit() {
    startPasswordEdit()
    clearPasswordValidation()
  }

  function handleKeepSavedPassword() {
    keepSavedPassword()
    clearPasswordValidation()
  }

  async function testConfig(formRef: FormInstance | null | undefined) {
    normalizeTestEmailForm()
    const recipientEmail = testEmailForm.email
    const isValid = formRef ? await formRef.validate().catch(() => false) : false

    if (!isValid) {
      return
    }

    isTesting.value = true

    try {
      await testSystemEmailConfig({
        email: recipientEmail,
      })
      isTestDialogVisible.value = false
      ElMessage.success(`测试邮件已发送到 ${recipientEmail}`)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '发送测试邮件失败'))
    }
    finally {
      currentConfig.value = await getSystemEmailConfig().catch(() => currentConfig.value)
      isTesting.value = false
    }
  }

  function selectProvider(provider: SystemEmailProvider) {
    if (providerMeta[provider].disabled) {
      return
    }

    form.provider = provider
    form.smtpHost = providerMeta[provider].defaults.smtpHost
    form.smtpPort = providerMeta[provider].defaults.smtpPort
    form.smtpSecure = providerMeta[provider].defaults.smtpSecure
  }

  function startPasswordEdit() {
    form.smtpPassword = ''
    isEditingPassword.value = true
  }

  function keepSavedPassword() {
    resetPasswordDraft()
  }

  onMounted(loadConfig)

  return {
    currentConfig,
    currentServiceStatus,
    errorMessage,
    form,
    formRules,
    handleKeepSavedPassword,
    handleSaveConfig,
    handleSendTestEmail,
    handleServiceStatusChange,
    handleStartPasswordEdit,
    hasSavedPassword,
    isEditingPassword,
    isLoading,
    isSaving,
    isTestDialogVisible,
    isTesting,
    isUpdatingServiceStatus,
    keepSavedPassword,
    providerCards,
    startPasswordEdit,
    testEmailForm,
    testEmailFormRules,
    closeTestDialog,
    openTestDialog,
    saveConfig,
    selectProvider,
    testConfig,
    updateServiceStatus,
  }

  function normalizeForm() {
    form.smtpHost = form.smtpHost.trim()
    form.smtpUsername = form.smtpUsername.trim()
    form.smtpPassword = form.smtpPassword.trim()
    form.fromName = form.fromName.trim()
    form.fromEmail = form.fromEmail.trim().toLowerCase()
  }

  function normalizeTestEmailForm() {
    testEmailForm.email = testEmailForm.email.trim().toLowerCase()
  }

  function resetPasswordDraft() {
    form.smtpPassword = ''
    isEditingPassword.value = false
  }
}
