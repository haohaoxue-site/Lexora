import type { AuthProviderName } from '@haohaoxue/samepage-contracts'
import type { FormInstance } from 'element-plus'
import type { Ref } from 'vue'
import type { UserAccountSectionProps } from '../typing'
import { AUTH_PROVIDER } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, reactive } from 'vue'
import { AUTH_PROVIDER_UI_META } from '@/views/auth/utils/provider-ui'
import {
  createConfirmPasswordRules,
  createEmailRules,
  createPasswordRules,
  isValidEmail,
  isValidPassword,
} from '@/views/auth/utils/rules'

const EMAIL_CODE_RE = /^\d{6}$/

export function useUserAccountSection(options: {
  code: Ref<string>
  confirmPassword: Ref<string>
  email: Ref<string>
  emailFormRef: Ref<FormInstance | null>
  newPassword: Ref<string>
  onConfirmEmail: () => void
  onDisconnectOauthBinding: (provider: AuthProviderName) => void
  onSendCode: () => void
  onStartOauthBinding: (provider: AuthProviderName) => void
  props: UserAccountSectionProps
}) {
  const form = reactive({
    email: options.email,
    code: options.code,
    newPassword: options.newPassword,
    confirmPassword: options.confirmPassword,
  })

  const requiresPasswordSetup = computed(() => !options.props.account.hasPasswordAuth)
  const hasEmailAccountInfo = computed(() => Boolean(options.props.account.email) || options.props.account.hasPasswordAuth)
  const showEmailStatus = computed(() => options.props.emailBindingEnabled || hasEmailAccountInfo.value)
  const collabCodeDescription = computed(() => options.props.account.email
    ? '用于多人协作时精确识别你，邀请与分享场景会优先使用它。'
    : '用于多人协作时精确识别你，即使只绑定了第三方登录也会一直保留。')
  const normalizedEmail = computed(() => form.email.trim())
  const normalizedCode = computed(() => form.code.trim())
  const sectionDescription = computed(() => {
    if (options.props.emailBindingEnabled) {
      return '管理邮箱、GitHub 与 LinuxDo 登录方式。解绑第三方账号前，系统会校验是否仍保留可用登录方式。'
    }

    if (hasEmailAccountInfo.value) {
      return '查看邮箱与密码登录状态，并管理 GitHub 与 LinuxDo 登录方式。解绑第三方账号前，系统会校验是否仍保留可用登录方式。'
    }

    return '管理 GitHub 与 LinuxDo 登录方式。解绑第三方账号前，系统会校验是否仍保留可用登录方式。'
  })

  const emailFormRules = computed(() => ({
    email: createEmailRules('邮箱'),
    code: [
      {
        required: true,
        message: '请输入 6 位验证码',
      },
      {
        pattern: EMAIL_CODE_RE,
        message: '验证码需为 6 位数字',
      },
    ],
    newPassword: requiresPasswordSetup.value ? createPasswordRules('登录密码') : [],
    confirmPassword: requiresPasswordSetup.value
      ? createConfirmPasswordRules(() => form.newPassword, '确认登录密码')
      : [],
  }))

  const oauthRows = computed(() => [
    {
      provider: AUTH_PROVIDER.GITHUB,
      ...AUTH_PROVIDER_UI_META[AUTH_PROVIDER.GITHUB],
      connected: options.props.account.github.connected,
      username: options.props.account.github.username,
      canDisconnect: options.props.canDisconnectGithub,
    },
    {
      provider: AUTH_PROVIDER.LINUX_DO,
      ...AUTH_PROVIDER_UI_META[AUTH_PROVIDER.LINUX_DO],
      connected: options.props.account.linuxDo.connected,
      username: options.props.account.linuxDo.username,
      canDisconnect: options.props.canDisconnectLinuxDo,
    },
  ])

  const emailButtonText = computed(() => {
    if (requiresPasswordSetup.value) {
      return options.props.account.email ? '更新邮箱并保留密码登录' : '绑定邮箱并启用密码登录'
    }

    return options.props.account.email ? '更新邮箱' : '绑定邮箱'
  })
  const isSendCodeDisabled = computed(() =>
    options.props.isSendingCode || options.props.isBindingEmail || !isValidEmail(normalizedEmail.value),
  )
  const isConfirmEmailDisabled = computed(() =>
    options.props.isBindingEmail
    || options.props.isSendingCode
    || !isValidEmail(normalizedEmail.value)
    || !EMAIL_CODE_RE.test(normalizedCode.value)
    || (requiresPasswordSetup.value && !isValidPassword(form.newPassword))
    || (
      requiresPasswordSetup.value
      && (!form.confirmPassword || form.confirmPassword !== form.newPassword)
    ),
  )

  async function handleConfirmEmail() {
    const isValid = await options.emailFormRef.value?.validate().catch(() => false)

    if (!isValid) {
      return
    }

    options.onConfirmEmail()
  }

  function handleStartOauthBinding(provider: AuthProviderName) {
    options.onStartOauthBinding(provider)
  }

  function handleSendCode() {
    if (isSendCodeDisabled.value) {
      return
    }

    options.onSendCode()
  }

  function handleDisconnect(provider: AuthProviderName) {
    options.onDisconnectOauthBinding(provider)
  }

  async function handleCopyUserCode() {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
      ElMessage.error('当前环境不支持复制')
      return
    }

    await navigator.clipboard.writeText(options.props.account.userCode)
    ElMessage.success('协作码已复制')
  }

  function clearEmailValidation() {
    options.emailFormRef.value?.clearValidate()
  }

  return {
    collabCodeDescription,
    clearEmailValidation,
    emailButtonText,
    emailFormRules,
    form,
    handleConfirmEmail,
    handleCopyUserCode,
    handleDisconnect,
    handleSendCode,
    handleStartOauthBinding,
    isConfirmEmailDisabled,
    isSendCodeDisabled,
    oauthRows,
    requiresPasswordSetup,
    sectionDescription,
    showEmailStatus,
  }
}
