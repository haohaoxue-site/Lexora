import type {
  SystemAuthGovernance,
  UpdateSystemAuthGovernanceRequest,
} from '@/apis/system-admin'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, reactive, shallowRef } from 'vue'
import {
  getSystemAuthGovernance,
  updateSystemAuthGovernance,
  updateSystemAuthInviteCode,
} from '@/apis/system-admin'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export type RegistrationGovernanceField = keyof UpdateSystemAuthGovernanceRequest

interface AuthGovernanceSwitchOption {
  key: RegistrationGovernanceField
  label: string
  description: string
}

export interface AuthGovernanceEntryCard {
  key: 'password' | 'github' | 'linuxDo'
  title: string
  description: string
  switches: readonly AuthGovernanceSwitchOption[]
}

const governanceFieldLabels: Record<RegistrationGovernanceField, string> = {
  allowGithubLogin: 'GitHub 登录',
  allowLinuxDoLogin: 'LinuxDo 登录',
  allowPasswordRegistration: '邮箱密码注册',
  allowGithubRegistration: 'GitHub 注册',
  allowLinuxDoRegistration: 'LinuxDo 注册',
  requirePasswordInviteCode: '邮箱注册邀请码',
  requireGithubInviteCode: 'GitHub 注册邀请码',
  requireLinuxDoInviteCode: 'LinuxDo 注册邀请码',
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
  {
    key: 'github',
    title: 'GitHub',
    description: '登录控制入口和绑定，注册只影响新账号创建。',
    switches: [
      {
        key: 'allowGithubLogin',
        label: '登录',
        description: '允许使用 GitHub 登录或新增绑定。',
      },
      {
        key: 'allowGithubRegistration',
        label: '注册',
        description: '允许新 GitHub 账号注册。',
      },
      {
        key: 'requireGithubInviteCode',
        label: '邀请码',
        description: '首次创建账号时必须先验证邀请码。',
      },
    ],
  },
  {
    key: 'linuxDo',
    title: 'LinuxDo',
    description: '登录控制入口和绑定，注册只影响新账号创建。',
    switches: [
      {
        key: 'allowLinuxDoLogin',
        label: '登录',
        description: '允许使用 LinuxDo 登录或新增绑定。',
      },
      {
        key: 'allowLinuxDoRegistration',
        label: '注册',
        description: '允许新 LinuxDo 账号注册。',
      },
      {
        key: 'requireLinuxDoInviteCode',
        label: '邀请码',
        description: '首次创建账号时必须先验证邀请码。',
      },
    ],
  },
] as const satisfies readonly AuthGovernanceEntryCard[]

export const useSystemAuthGovernance = createSharedComposable(() => {
  const errorMessage = shallowRef('')
  const isInviteCodeDialogVisible = shallowRef(false)
  const isSavingInviteCode = shallowRef(false)
  const inviteCodeForm = reactive({
    inviteCode: '',
  })
  const savingGovernanceFields = reactive<Record<RegistrationGovernanceField, boolean>>({
    allowGithubLogin: false,
    allowLinuxDoLogin: false,
    allowPasswordRegistration: false,
    allowGithubRegistration: false,
    allowLinuxDoRegistration: false,
    requirePasswordInviteCode: false,
    requireGithubInviteCode: false,
    requireLinuxDoInviteCode: false,
  })
  const governance = reactive<SystemAuthGovernance>({
    allowGithubLogin: false,
    allowLinuxDoLogin: false,
    allowPasswordRegistration: false,
    allowGithubRegistration: false,
    allowLinuxDoRegistration: false,
    requirePasswordInviteCode: false,
    requireGithubInviteCode: false,
    requireLinuxDoInviteCode: false,
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
      || governance.requireGithubInviteCode
      || governance.requireLinuxDoInviteCode
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
    const previousValue = governance[field]
    governance[field] = nextValue
    savingGovernanceFields[field] = true

    try {
      const nextGovernance = await updateSystemAuthGovernance({
        [field]: nextValue,
      })

      applyGovernance(nextGovernance)
      ElMessage.success(`${governanceFieldLabels[field]}已更新`)
    }
    catch (error) {
      governance[field] = previousValue
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

    return governance[key]
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
