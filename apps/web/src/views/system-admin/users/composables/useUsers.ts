import type {
  GetSystemAdminUsersQuery,
  SystemAdminUserItem,
  SystemAdminUserRoleFilter,
  SystemAdminUserStatus,
  SystemAuthGovernance,
  UpdateSystemAuthGovernanceRequest,
} from '@/apis/system-admin'
import {
  USER_STATUS,
} from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import {
  getSystemAdminUsers,
  getSystemAuthGovernance,
  updateSystemAdminUserStatus,
  updateSystemAuthGovernance,
  updateSystemAuthInviteCode,
} from '@/apis/system-admin'
import { formatDateTime } from '@/utils/dayjs'
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

type RegistrationSwitchKey = RegistrationGovernanceField

export function useUsers() {
  let userListRequestId = 0

  const users = shallowRef<SystemAdminUserItem[]>([])
  const errorMessage = shallowRef('')
  const isLoading = shallowRef(false)
  const isLoadingUsers = shallowRef(false)
  const keywordInput = shallowRef('')
  const updatingUserId = shallowRef<string | null>(null)
  const isInviteCodeDialogVisible = shallowRef(false)
  const isSavingInviteCode = shallowRef(false)
  const totalUsers = shallowRef(0)
  const inviteCodeForm = reactive({
    inviteCode: '',
  })
  const userQuery = reactive<GetSystemAdminUsersQuery>({
    pageNo: 1,
    pageSize: 20,
    keyword: undefined,
    status: undefined,
    role: undefined,
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
  const systemAdminStatusText = computed(() => governance.systemAdminMustChangePassword ? '首次密码待修改' : '已完成首次改密')
  const shouldShowMissingInviteCodeWarning = computed(() =>
    !governance.hasRegistrationInviteCode
    && (
      governance.requirePasswordInviteCode
      || governance.requireGithubInviteCode
      || governance.requireLinuxDoInviteCode
    ),
  )

  async function loadData() {
    isLoading.value = true
    errorMessage.value = ''

    try {
      await Promise.all([
        loadUsers(),
        loadGovernance(),
      ])
    }
    catch (error) {
      errorMessage.value = getRequestErrorDisplayMessage(error, '加载用户管理数据失败')
    }
    finally {
      isLoading.value = false
    }
  }

  async function loadGovernance() {
    const nextGovernance = await getSystemAuthGovernance()
    applyGovernance(nextGovernance)
  }

  async function loadUsers() {
    const requestId = ++userListRequestId
    isLoadingUsers.value = true

    try {
      const response = await getSystemAdminUsers(userQuery)

      if (requestId !== userListRequestId) {
        return
      }

      const maxPageNo = response.total > 0
        ? Math.ceil(response.total / userQuery.pageSize)
        : 1

      if (response.items.length === 0 && userQuery.pageNo > maxPageNo) {
        userQuery.pageNo = maxPageNo
        await loadUsers()
        return
      }

      users.value = response.items
      totalUsers.value = response.total
    }
    catch (error) {
      if (requestId === userListRequestId) {
        errorMessage.value = getRequestErrorDisplayMessage(error, '加载用户列表失败')
      }
      throw error
    }
    finally {
      if (requestId === userListRequestId) {
        isLoadingUsers.value = false
      }
    }
  }

  async function toggleUserStatus(
    user: SystemAdminUserItem,
    nextStatus: SystemAdminUserStatus,
  ) {
    updatingUserId.value = user.id

    try {
      const updated = await updateSystemAdminUserStatus(user.id, {
        status: nextStatus,
      })
      ElMessage.success(nextStatus === USER_STATUS.ACTIVE ? '用户已恢复' : '用户已禁用')
      await loadUsers().catch(() => {
        users.value = users.value.map(item =>
          item.id === user.id
            ? {
                ...item,
                status: updated.status,
              }
            : item,
        )
      })
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '更新用户状态失败'))
    }
    finally {
      updatingUserId.value = null
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

  function shouldShowEmailServiceHint(key: RegistrationSwitchKey) {
    return key === 'allowPasswordRegistration' && !governance.emailServiceEnabled
  }

  function getGovernanceSwitchValue(key: RegistrationSwitchKey) {
    if (key === 'allowPasswordRegistration' && !governance.emailServiceEnabled) {
      return false
    }

    return governance[key]
  }

  function isGovernanceSwitchDisabled(key: RegistrationSwitchKey) {
    if (key === 'allowPasswordRegistration' && !governance.emailServiceEnabled) {
      return true
    }

    return savingGovernanceFields[key]
  }

  function handleGovernanceSwitchChange(
    key: RegistrationSwitchKey,
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

  function formatDate(value: string | null) {
    if (!value) {
      return '暂无'
    }

    return formatDateTime(value)
  }

  function updateFilters(filters: {
    status: SystemAdminUserStatus | null
    role: SystemAdminUserRoleFilter | null
  }) {
    userQuery.status = filters.status ?? undefined
    userQuery.role = filters.role ?? undefined
    userQuery.pageNo = 1
    errorMessage.value = ''
    void loadUsers().catch(() => {})
  }

  function updatePageNo(pageNo: number) {
    userQuery.pageNo = pageNo
    errorMessage.value = ''
    void loadUsers().catch(() => {})
  }

  function updatePageSize(pageSize: number) {
    userQuery.pageSize = pageSize
    userQuery.pageNo = 1
    errorMessage.value = ''
    void loadUsers().catch(() => {})
  }

  function updateKeyword(keyword: string) {
    keywordInput.value = keyword
  }

  function submitSearch() {
    const nextKeyword = keywordInput.value.trim()
    userQuery.keyword = nextKeyword || undefined
    userQuery.pageNo = 1
    errorMessage.value = ''
    void loadUsers().catch(() => {})
  }

  onMounted(loadData)

  return {
    errorMessage,
    formatDate,
    authGovernanceCards,
    governance,
    getGovernanceSwitchValue,
    handleGovernanceSwitchChange,
    inviteCodeForm,
    isInviteCodeDialogVisible,
    isLoading,
    isLoadingUsers,
    isGovernanceSwitchDisabled,
    isSavingInviteCode,
    keywordInput,
    loadData,
    loadUsers,
    openInviteCodeDialog,
    savingGovernanceFields,
    shouldShowMissingInviteCodeWarning,
    shouldShowEmailServiceHint,
    submitSearch,
    systemAdminStatusText,
    totalUsers,
    toggleUserStatus,
    updateKeyword,
    updateFilters,
    updatePageNo,
    updatePageSize,
    updateGovernanceOption,
    updateInviteCode,
    updatingUserId,
    userQuery,
    users,
  }

  function applyGovernance(nextGovernance: SystemAuthGovernance) {
    Object.assign(governance, nextGovernance)
  }
}
