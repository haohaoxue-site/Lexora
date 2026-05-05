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
} from '@/apis/system-admin'
import { formatDateTime } from '@/utils/dayjs'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export type RegistrationGovernanceField = keyof UpdateSystemAuthGovernanceRequest

const governanceFieldLabels: Record<RegistrationGovernanceField, string> = {
  allowPasswordRegistration: '邮箱密码注册',
  allowGithubRegistration: 'GitHub 注册',
  allowLinuxDoRegistration: 'LinuxDo 注册',
}

const registrationSwitches = [
  {
    key: 'allowPasswordRegistration',
    label: '邮箱密码注册',
    description: '是否允许新邮箱账号注册。',
  },
  {
    key: 'allowGithubRegistration',
    label: 'GitHub 注册',
    description: '是否允许新 GitHub 账号注册。',
  },
  {
    key: 'allowLinuxDoRegistration',
    label: 'LinuxDo 注册',
    description: '是否允许新 LinuxDo 账号注册。',
  },
] as const

type RegistrationSwitchKey = (typeof registrationSwitches)[number]['key']

export function useUsers() {
  let userListRequestId = 0

  const users = shallowRef<SystemAdminUserItem[]>([])
  const errorMessage = shallowRef('')
  const isLoading = shallowRef(false)
  const isLoadingUsers = shallowRef(false)
  const keywordInput = shallowRef('')
  const updatingUserId = shallowRef<string | null>(null)
  const totalUsers = shallowRef(0)
  const userQuery = reactive<GetSystemAdminUsersQuery>({
    pageNo: 1,
    pageSize: 20,
    keyword: undefined,
    status: undefined,
    role: undefined,
  })
  const savingGovernanceFields = reactive<Record<RegistrationGovernanceField, boolean>>({
    allowPasswordRegistration: false,
    allowGithubRegistration: false,
    allowLinuxDoRegistration: false,
  })
  const governance = reactive<SystemAuthGovernance>({
    allowPasswordRegistration: false,
    allowGithubRegistration: false,
    allowLinuxDoRegistration: false,
    emailServiceEnabled: false,
    systemAdminEmail: '',
    systemAdminDisplayName: null,
    systemAdminMustChangePassword: false,
    systemAdminLastLoginAt: null,
    systemAdminPasswordUpdatedAt: null,
  })
  const systemAdminStatusText = computed(() => governance.systemAdminMustChangePassword ? '首次密码待修改' : '已完成首次改密')

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
    governance,
    getGovernanceSwitchValue,
    handleGovernanceSwitchChange,
    isLoading,
    isLoadingUsers,
    isGovernanceSwitchDisabled,
    keywordInput,
    loadData,
    loadUsers,
    registrationSwitches,
    savingGovernanceFields,
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
    updatingUserId,
    userQuery,
    users,
  }

  function applyGovernance(nextGovernance: SystemAuthGovernance) {
    Object.assign(governance, nextGovernance)
  }
}
