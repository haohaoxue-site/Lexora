<script setup lang="ts">
import type {
  SystemAdminUserItem,
  SystemAdminUserRoleFilter,
  SystemAdminUserStatus,
} from '@/apis/system-admin'
import {
  SYSTEM_ADMIN_USER_ROLE_FILTER,
  SYSTEM_ADMIN_USER_ROLE_FILTER_LABELS,
  USER_STATUS,
} from '@haohaoxue/samepage-contracts'
import { formatAuthMethod } from '@haohaoxue/samepage-shared'
import { computed } from 'vue'
import { formatDateTime } from '@/utils/dayjs'
import UserIdentityCell from './UserIdentityCell.vue'

/**
 * 用户表格属性。
 */
interface UserTableProps {
  users: SystemAdminUserItem[]
  total: number
  pageNo: number
  pageSize: number
  loading: boolean
  keyword: string
  statusFilter: SystemAdminUserStatus | null
  roleFilter: SystemAdminUserRoleFilter | null
  updatingUserId: string | null
}

/**
 * 用户表格事件。
 */
interface UserTableEmits {
  updateKeyword: [keyword: string]
  search: []
  updateFilters: [filters: {
    status: SystemAdminUserStatus | null
    role: SystemAdminUserRoleFilter | null
  }]
  updatePageNo: [pageNo: number]
  updatePageSize: [pageSize: number]
  toggleStatus: [user: SystemAdminUserItem, nextStatus: SystemAdminUserStatus]
}

type UserTableFilterMap = Partial<Record<'status' | 'role', Array<string | number | boolean>>>

const props = defineProps<UserTableProps>()
const emits = defineEmits<UserTableEmits>()

const statusColumnFilters = [
  {
    text: '正常',
    value: USER_STATUS.ACTIVE,
  },
  {
    text: '已禁用',
    value: USER_STATUS.DISABLED,
  },
] satisfies Array<{ text: string, value: SystemAdminUserStatus }>

const roleColumnFilters = [
  {
    text: SYSTEM_ADMIN_USER_ROLE_FILTER_LABELS[SYSTEM_ADMIN_USER_ROLE_FILTER.SYSTEM_ADMIN],
    value: SYSTEM_ADMIN_USER_ROLE_FILTER.SYSTEM_ADMIN,
  },
  {
    text: SYSTEM_ADMIN_USER_ROLE_FILTER_LABELS[SYSTEM_ADMIN_USER_ROLE_FILTER.REGULAR_USER],
    value: SYSTEM_ADMIN_USER_ROLE_FILTER.REGULAR_USER,
  },
] satisfies Array<{ text: string, value: SystemAdminUserRoleFilter }>

const filteredStatusValues = computed(() => props.statusFilter ? [props.statusFilter] : [])
const filteredRoleValues = computed(() => props.roleFilter ? [props.roleFilter] : [])

function formatDate(value: string | null) {
  if (!value) {
    return '暂无'
  }

  return formatDateTime(value)
}

function getStatusStateClass(status: SystemAdminUserStatus) {
  return status === USER_STATUS.ACTIVE ? 'active' : 'disabled'
}

function getAdminRoleText(isSystemAdmin: boolean) {
  return isSystemAdmin ? '系统管理员' : ''
}

function resolveNextStatus(status: SystemAdminUserStatus): SystemAdminUserStatus {
  return status === USER_STATUS.ACTIVE
    ? USER_STATUS.DISABLED
    : USER_STATUS.ACTIVE
}

function handleFilterChange(filters: UserTableFilterMap) {
  const nextStatus = typeof filters.status?.[0] === 'string'
    ? filters.status[0] as SystemAdminUserStatus
    : null
  const nextRole = typeof filters.role?.[0] === 'string'
    ? filters.role[0] as SystemAdminUserRoleFilter
    : null

  emits('updateFilters', {
    status: nextStatus,
    role: nextRole,
  })
}
</script>

<template>
  <div class="user-table__surface overflow-hidden border border-border-a80 bg-surface">
    <div class="user-table__toolbar flex items-center justify-between gap-3 border-b border-border-a80 px-5 py-4">
      <ElInput
        :model-value="props.keyword"
        clearable
        placeholder="搜索名字、邮箱或编号"
        class="min-w-0 max-w-96"
        @update:model-value="emits('updateKeyword', $event)"
        @keyup.enter="emits('search')"
      />

      <ElButton type="primary" :loading="props.loading" @click="emits('search')">
        查询
      </ElButton>
    </div>

    <ElTable
      v-loading="props.loading"
      :data="props.users"
      row-key="id" stripe border
      class="admin-table user-table"
      @filter-change="handleFilterChange"
    >
      <ElTableColumn label="用户信息" min-width="240">
        <template #default="{ row }">
          <UserIdentityCell :user="row" />
        </template>
      </ElTableColumn>

      <ElTableColumn
        label="账号状态"
        width="120"
        column-key="status"
        :filters="statusColumnFilters"
        :filter-multiple="false"
        :filtered-value="filteredStatusValues"
      >
        <template #default="{ row }">
          <div class="user-table__status">
            <div class="user-table__status-dot" :class="getStatusStateClass(row.status)" />
            <span class="user-table__status-label" :class="getStatusStateClass(row.status)">
              {{ row.status === USER_STATUS.ACTIVE ? '正常' : '已禁用' }}
            </span>
          </div>
        </template>
      </ElTableColumn>

      <ElTableColumn label="文档数据" width="180">
        <template #default="{ row }">
          <div class="flex flex-col gap-0.5">
            <span class="text-xs text-main">拥有 {{ row.ownedDocumentCount }} 篇</span>
            <span class="text-xs text-secondary">注册于 {{ formatDate(row.createdAt) }}</span>
          </div>
        </template>
      </ElTableColumn>

      <ElTableColumn label="最近活跃" width="180">
        <template #default="{ row }">
          <span class="text-xs text-secondary">{{ formatDate(row.lastLoginAt) }}</span>
        </template>
      </ElTableColumn>

      <ElTableColumn
        label="后台权限"
        width="180"
        column-key="role"
        :filters="roleColumnFilters"
        :filter-multiple="false"
        :filtered-value="filteredRoleValues"
      >
        <template #default="{ row }">
          <span class="user-table__admin-role">
            {{ getAdminRoleText(row.isSystemAdmin) }}
          </span>
        </template>
      </ElTableColumn>

      <ElTableColumn label="登录方式" min-width="120">
        <template #default="{ row }">
          <div class="user-table__auth-methods">
            <ElTag
              v-for="method in row.authMethods"
              :key="method"
              size="small"
              effect="plain"
              class="rounded-md"
            >
              {{ formatAuthMethod(method) }}
            </ElTag>
          </div>
        </template>
      </ElTableColumn>

      <ElTableColumn label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <div class="user-table__actions">
            <ElButton
              v-if="!row.isSystemAdmin"
              link
              :type="row.status === USER_STATUS.ACTIVE ? 'danger' : 'success'"
              :disabled="props.updatingUserId === row.id"
              @click="emits('toggleStatus', row, resolveNextStatus(row.status))"
            >
              {{ row.status === USER_STATUS.ACTIVE ? '禁用' : '激活' }}
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>

    <div class="user-table__pagination flex justify-end border-t border-border-a80 bg-fill-lighter/55 px-5 py-4">
      <ElPagination
        :current-page="props.pageNo"
        :page-size="props.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="props.total"
        background
        layout="total, sizes, prev, pager, next"
        @current-change="emits('updatePageNo', $event)"
        @size-change="emits('updatePageSize', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.admin-table {
  --el-table-header-bg-color: var(--brand-fill-lighter);
  --el-table-header-text-color: var(--brand-text-regular);
  --el-table-row-hover-bg-color: var(--brand-fill-lighter);

  :deep(.el-table__header) {
    th {
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
  }
}

.user-table {
  &__surface {
    background: var(--brand-bg-surface);
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  &__status-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 9999px;

    &.active {
      background: var(--brand-success);
    }

    &.disabled {
      background: var(--brand-error);
    }
  }

  &__status-label {
    font-size: 0.75rem;
    font-weight: 500;

    &.active {
      color: var(--brand-success);
    }

    &.disabled {
      color: var(--brand-error);
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.5rem;
  }

  &__auth-methods {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  &__admin-role {
    color: var(--brand-text-primary);
    font-size: 0.8125rem;
    font-weight: 600;
  }
}

@media (max-width: 960px) {
  .user-table {
    &__toolbar {
      flex-wrap: wrap;
      align-items: stretch;
    }

    &__pagination {
      justify-content: flex-start;
      overflow-x: auto;
    }
  }
}
</style>
