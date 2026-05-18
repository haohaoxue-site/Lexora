import type { AuthProviderName, SystemAuthProviderGovernance } from '@haohaoxue/samepage-contracts'
import type {
  SystemAuthGovernance,
  UpdateSystemAuthGovernanceRequest,
} from '@/apis/system-admin'
import { AUTH_PROVIDER_VALUES } from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, reactive, shallowRef } from 'vue'
import {
  getSystemAuthGovernance,
  updateSystemAuthGovernance,
  updateSystemAuthInviteCode,
} from '@/apis/system-admin'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { AUTH_PROVIDER_UI_META } from '@/views/auth/utils/provider-ui'

export type RegistrationGovernanceField = 'allowPasswordRegistration' | 'requirePasswordInviteCode' | `oauth:${AuthProviderName}:${'allowLogin' | 'allowRegistration' | 'requireInviteCode'}`

interface AuthGovernanceSwitchOption {
  key: RegistrationGovernanceField
  label: string
  description: string
}

export interface AuthGovernanceEntryCard {
  key: 'password' | AuthProviderName
  title: string
  description: string
  switches: readonly AuthGovernanceSwitchOption[]
}

const governanceFieldLabels: Record<string, string> = {
  allowPasswordRegistration: '邮箱密码注册',
  requirePasswordInviteCode: '邮箱注册邀请码',
  ...Object.fromEntries(AUTH_PROVIDER_VALUES.flatMap((provider) => {
    const title = AUTH_PROVIDER_UI_META[provider].title

    return [
      [`oauth:${provider}:allowLogin`, `${title} 登录`],
      [`oauth:${provider}:allowRegistration`, `${title} 注册`],
      [`oauth:${provider}:requireInviteCode`, `${title} 注册邀请码`],
    ]
  })),
}

const authGovernanceCards = [
  {
    key: 'password',
    title: '邮箱密码',
    description: '邮箱注册依赖发件服务，只影响新邮箱账号创建。',
    switches: [
      {
        key: 'allowPasswordRegistration',
        label: '注册',
        description: '允许新邮箱账号注册。',
      },
      {
        key: 'requirePasswordInviteCode',
        label: '邀请码',
        description: '邮箱密码注册时必须先验证邀请码。',
      },
    ],
  },
  ...createOAuthGovernanceCards(),
] as const satisfies readonly AuthGovernanceEntryCard[]

function createOAuthGovernanceCards(): AuthGovernanceEntryCard[] {
  return AUTH_PROVIDER_VALUES.map((provider) => {
    const title = AUTH_PROVIDER_UI_META[provider].title

    return {
      key: provider,
      title,
      description: '登录控制入口和绑定，注册只影响新账号创建。',
      switches: [
        {
          key: `oauth:${provider}:allowLogin` as RegistrationGovernanceField,
          label: '登录',
          description: `允许使用 ${title} 登录或新增绑定。`,
        },
        {
          key: `oauth:${provider}:allowRegistration` as RegistrationGovernanceField,
          label: '注册',
          description: `允许新 ${title} 账号注册。`,
        },
        {
          key: `oauth:${provider}:requireInviteCode` as RegistrationGovernanceField,
          label: '邀请码',
          description: '首次创建账号时必须先验证邀请码。',
        },
      ],
    }
  })
}

function createDefaultOAuthProviderGovernance(): Record<AuthProviderName, SystemAuthProviderGovernance> {
  return Object.fromEntries(AUTH_PROVIDER_VALUES.map(provider => [provider, {
    allowLogin: false,
    allowRegistration: false,
    requireInviteCode: false,
  }])) as Record<AuthProviderName, SystemAuthProviderGovernance>
}

function parseOAuthGovernanceField(field: RegistrationGovernanceField): {
  provider: AuthProviderName
  option: keyof SystemAuthProviderGovernance
} {
  const [, provider, option] = field.split(':') as [
    'oauth',
    AuthProviderName,
    keyof SystemAuthProviderGovernance,
  ]

  return {
    provider,
    option,
  }
}

function buildGovernanceUpdatePayload(
  field: RegistrationGovernanceField,
  value: boolean,
): UpdateSystemAuthGovernanceRequest {
  if (field === 'allowPasswordRegistration' || field === 'requirePasswordInviteCode') {
    return { [field]: value }
  }

  const { provider, option } = parseOAuthGovernanceField(field)

  return {
    oauthProviders: {
      [provider]: {
        [option]: value,
      },
    },
  }
}

function setGovernanceSwitchValue(
  governance: SystemAuthGovernance,
  field: RegistrationGovernanceField,
  value: boolean,
) {
  if (field === 'allowPasswordRegistration' || field === 'requirePasswordInviteCode') {
    governance[field] = value
    return
  }

  const { provider, option } = parseOAuthGovernanceField(field)
  governance.oauthProviders[provider][option] = value
}

export const useSystemAuthGovernance = createSharedComposable(() => {
  const errorMessage = shallowRef('')
  const isInviteCodeDialogVisible = shallowRef(false)
  const isSavingInviteCode = shallowRef(false)
  const inviteCodeForm = reactive({
    inviteCode: '',
  })
  const savingGovernanceFields = reactive<Record<string, boolean>>({
    allowPasswordRegistration: false,
    requirePasswordInviteCode: false,
    ...Object.fromEntries(AUTH_PROVIDER_VALUES.flatMap(provider => [
      [`oauth:${provider}:allowLogin`, false],
      [`oauth:${provider}:allowRegistration`, false],
      [`oauth:${provider}:requireInviteCode`, false],
    ])),
  })
  const governance = reactive<SystemAuthGovernance>({
    allowPasswordRegistration: false,
    requirePasswordInviteCode: false,
    oauthProviders: createDefaultOAuthProviderGovernance(),
    hasRegistrationInviteCode: false,
    registrationInviteCode: null,
    emailServiceEnabled: false,
    systemAdminEmail: '',
    systemAdminDisplayName: null,
    systemAdminMustChangePassword: false,
    systemAdminLastLoginAt: null,
    systemAdminPasswordUpdatedAt: null,
  })
  const shouldShowMissingInviteCodeWarning = computed(() =>
    !governance.hasRegistrationInviteCode
    && (
      governance.requirePasswordInviteCode
      || AUTH_PROVIDER_VALUES.some(provider => governance.oauthProviders[provider].requireInviteCode)
    ),
  )

  function applyGovernance(nextGovernance: SystemAuthGovernance) {
    Object.assign(governance, nextGovernance)
  }

  async function loadGovernance() {
    try {
      const nextGovernance = await getSystemAuthGovernance()
      applyGovernance(nextGovernance)
    }
    catch (error) {
      errorMessage.value = getRequestErrorDisplayMessage(error, '加载注册配置失败')
      throw error
    }
  }

  async function updateGovernanceOption(
    field: RegistrationGovernanceField,
    nextValue: boolean,
  ) {
    const previousValue = getGovernanceSwitchValue(field)
    setGovernanceSwitchValue(governance, field, nextValue)
    savingGovernanceFields[field] = true

    try {
      const nextGovernance = await updateSystemAuthGovernance(buildGovernanceUpdatePayload(field, nextValue))

      applyGovernance(nextGovernance)
      ElMessage.success(`${governanceFieldLabels[field]}已更新`)
    }
    catch (error) {
      setGovernanceSwitchValue(governance, field, previousValue)
      ElMessage.error(getRequestErrorDisplayMessage(error, `更新${governanceFieldLabels[field]}失败`))
    }
    finally {
      savingGovernanceFields[field] = false
    }
  }

  function shouldShowEmailServiceHint(key: RegistrationGovernanceField) {
    return key === 'allowPasswordRegistration' && !governance.emailServiceEnabled
  }

  function getGovernanceSwitchValue(key: RegistrationGovernanceField) {
    if (key === 'allowPasswordRegistration' && !governance.emailServiceEnabled) {
      return false
    }

    if (key === 'allowPasswordRegistration' || key === 'requirePasswordInviteCode') {
      return governance[key]
    }

    const field = parseOAuthGovernanceField(key)
    return governance.oauthProviders[field.provider][field.option]
  }

  function isGovernanceSwitchDisabled(key: RegistrationGovernanceField) {
    if (key === 'allowPasswordRegistration' && !governance.emailServiceEnabled) {
      return true
    }

    return savingGovernanceFields[key]
  }

  function handleGovernanceSwitchChange(
    key: RegistrationGovernanceField,
    value: string | number | boolean,
  ) {
    if (typeof value !== 'boolean') {
      return
    }

    void updateGovernanceOption(key, value)
  }

  function openInviteCodeDialog() {
    inviteCodeForm.inviteCode = governance.registrationInviteCode ?? ''
    isInviteCodeDialogVisible.value = true
  }

  async function updateInviteCode() {
    const inviteCode = inviteCodeForm.inviteCode.trim()

    if (inviteCode && inviteCode.length < 4) {
      ElMessage.error('邀请码至少 4 位')
      return
    }

    isSavingInviteCode.value = true

    try {
      const nextGovernance = await updateSystemAuthInviteCode({ inviteCode })
      applyGovernance(nextGovernance)
      isInviteCodeDialogVisible.value = false
      inviteCodeForm.inviteCode = ''
      ElMessage.success(inviteCode ? '邀请码已更新' : '邀请码已清空')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '更新邀请码失败'))
    }
    finally {
      isSavingInviteCode.value = false
    }
  }

  return {
    authGovernanceCards,
    errorMessage,
    getGovernanceSwitchValue,
    governance,
    handleGovernanceSwitchChange,
    inviteCodeForm,
    isGovernanceSwitchDisabled,
    isInviteCodeDialogVisible,
    isSavingInviteCode,
    loadGovernance,
    openInviteCodeDialog,
    savingGovernanceFields,
    shouldShowEmailServiceHint,
    shouldShowMissingInviteCodeWarning,
    updateGovernanceOption,
    updateInviteCode,
  }
})
