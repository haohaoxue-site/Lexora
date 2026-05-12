import type {
  GetSystemAdminUsersQuery,
  SystemAdminUserItem,
  SystemAdminUserRoleFilter,
  SystemAdminUserStatus,
} from '@/apis/system-admin'
import { USER_STATUS } from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { reactive, shallowRef } from 'vue'
import {
  getSystemAdminUsers,
  updateSystemAdminUserStatus,
} from '@/apis/system-admin'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export const useSystemUsers = createSharedComposable(() => {
  let userListRequestId = 0

  const users = shallowRef<SystemAdminUserItem[]>([])
  const errorMessage = shallowRef('')
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

  return {
    errorMessage,
    isLoadingUsers,
    keywordInput,
    loadUsers,
    submitSearch,
    toggleUserStatus,
    totalUsers,
    updateFilters,
    updateKeyword,
    updatePageNo,
    updatePageSize,
    updatingUserId,
    userQuery,
    users,
  }
})
