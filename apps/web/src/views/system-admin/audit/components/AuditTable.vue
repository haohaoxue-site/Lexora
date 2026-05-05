<script setup lang="ts">
import type {
  SystemAdminAuditLogItem,
  SystemAdminAuditTargetType,
} from '@/apis/system-admin'
import {
  SYSTEM_ADMIN_AUDIT_TARGET_TYPE_LABELS,
  SYSTEM_ADMIN_AUDIT_TARGET_TYPE_VALUES,
} from '@haohaoxue/samepage-contracts'
import { computed } from 'vue'
import { formatDateTime } from '@/utils/dayjs'

const props = defineProps<AuditTableProps>()

const emits = defineEmits<AuditTableEmits>()

const PAGINATION_HEIGHT = 73

/**
 * 审计表格属性。
 */
interface AuditTableProps {
  logs: SystemAdminAuditLogItem[]
  total: number
  pageNo: number
  pageSize: number
  loading: boolean
  targetType: SystemAdminAuditTargetType | null
}

/**
 * 审计表格事件。
 */
interface AuditTableEmits {
  updateFilters: [filters: {
    targetType: SystemAdminAuditTargetType | null
  }]
  updatePageNo: [pageNo: number]
  updatePageSize: [pageSize: number]
}

type AuditTableFilterMap = Partial<Record<'targetType', Array<string | number | boolean>>>

const targetTypeColumnFilters = SYSTEM_ADMIN_AUDIT_TARGET_TYPE_VALUES.map(value => ({
  text: SYSTEM_ADMIN_AUDIT_TARGET_TYPE_LABELS[value],
  value,
}))

const filteredTargetTypeValues = computed(() => props.targetType ? [props.targetType] : [])
const tableHeight = `calc(100% - ${PAGINATION_HEIGHT}px)`

function formatTargetType(targetType: string) {
  return SYSTEM_ADMIN_AUDIT_TARGET_TYPE_LABELS[targetType as SystemAdminAuditTargetType] ?? targetType
}

function formatMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) {
    return '无附加信息'
  }

  return JSON.stringify(metadata, null, 2)
}

function handleFilterChange(filters: AuditTableFilterMap) {
  const nextTargetType = typeof filters.targetType?.[0] === 'string'
    ? filters.targetType[0] as SystemAdminAuditTargetType
    : null

  emits('updateFilters', {
    targetType: nextTargetType,
  })
}
</script>

<template>
  <div class="audit-table__surface min-h-0 h-full">
    <ElTable
      v-loading="props.loading"
      :data="props.logs"
      :height="tableHeight"
      row-key="id" stripe border
      class="admin-table audit-table"
      @filter-change="handleFilterChange"
    >
      <ElTableColumn type="expand" width="56">
        <template #default="{ row }">
          <div class="audit-table__metadata-wrap">
            <div class="audit-table__metadata-title">
              Metadata
            </div>
            <pre class="audit-table__metadata-text">{{ formatMetadata(row.metadata) }}</pre>
          </div>
        </template>
      </ElTableColumn>

      <ElTableColumn label="操作时间" width="180">
        <template #default="{ row }">
          <span class="text-xs text-secondary">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </ElTableColumn>

      <ElTableColumn label="动作" min-width="220">
        <template #default="{ row }">
          <span class="font-medium text-main">{{ row.action }}</span>
        </template>
      </ElTableColumn>

      <ElTableColumn
        label="对象类型"
        width="140"
        column-key="targetType"
        :filters="targetTypeColumnFilters"
        :filter-multiple="false"
        :filtered-value="filteredTargetTypeValues"
      >
        <template #default="{ row }">
          <span class="audit-table__target-type">{{ formatTargetType(row.targetType) }}</span>
        </template>
      </ElTableColumn>

      <ElTableColumn label="目标 ID" min-width="160">
        <template #default="{ row }">
          <span class="audit-table__target-id">{{ row.targetId || '-' }}</span>
        </template>
      </ElTableColumn>

      <ElTableColumn label="操作人" min-width="180">
        <template #default="{ row }">
          <div class="audit-table__actor">
            <span class="audit-table__actor-name">{{ row.actorDisplayName }}</span>
            <span class="audit-table__actor-id">{{ row.actorUserId }}</span>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>

    <div class="audit-table__pagination flex justify-end border-t border-border-a80 bg-fill-lighter/55 px-5 py-4">
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
.audit-table {
  &__surface {
    display: flex;
    flex-direction: column;
  }

  &__metadata-wrap {
    padding: 1rem 1.25rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);
  }

  &__metadata-title {
    color: var(--brand-text-primary);
    font-size: 0.75rem;
    font-weight: 700;
  }

  &__metadata-text {
    margin: 0.625rem 0 0;
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: var(--el-font-family-monospace, var(--el-font-family));
  }

  &__target-type {
    color: var(--brand-text-primary);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  &__target-id {
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    font-family: var(--el-font-family-monospace, var(--el-font-family));
  }

  &__actor {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  &__actor-name {
    color: var(--brand-text-primary);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  &__actor-id {
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    font-family: var(--el-font-family-monospace, var(--el-font-family));
  }
}
</style>
