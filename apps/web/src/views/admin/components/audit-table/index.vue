<script setup lang="ts">
import type {
  AdminAuditTableEmits,
  AdminAuditTableFilterMap,
  AdminAuditTableProps,
  SystemAdminAuditTargetType,
} from './typing'
import {
  SYSTEM_ADMIN_AUDIT_TARGET_TYPE_LABELS,
  SYSTEM_ADMIN_AUDIT_TARGET_TYPE_VALUES,
} from '@haohaoxue/samepage-contracts/system-admin'
import { computed } from 'vue'
import { formatDateTime } from '@/utils/dayjs'

const props = defineProps<AdminAuditTableProps>()

const emits = defineEmits<AdminAuditTableEmits>()

const PAGINATION_HEIGHT = 73

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

function handleFilterChange(filters: AdminAuditTableFilterMap) {
  const nextTargetType = typeof filters.targetType?.[0] === 'string'
    ? filters.targetType[0] as SystemAdminAuditTargetType
    : null

  emits('updateFilters', {
    targetType: nextTargetType,
  })
}
</script>

<template>
  <div class="audit-table__surface flex h-full min-h-0 flex-col">
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
          <div class="audit-table__metadata-wrap bg-fill-lighter-a70 px-5 py-4">
            <div class="audit-table__metadata-title text-xs font-bold text-main">
              Metadata
            </div>
            <pre class="audit-table__metadata-text mt-2.5 whitespace-pre-wrap break-all font-mono text-[13px] leading-[1.6] text-secondary">{{ formatMetadata(row.metadata) }}</pre>
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
          <span class="audit-table__target-type text-[13px] font-medium text-main">{{ formatTargetType(row.targetType) }}</span>
        </template>
      </ElTableColumn>

      <ElTableColumn label="目标 ID" min-width="160">
        <template #default="{ row }">
          <span class="audit-table__target-id font-mono text-xs text-secondary">{{ row.targetId || '-' }}</span>
        </template>
      </ElTableColumn>

      <ElTableColumn label="操作人" min-width="180">
        <template #default="{ row }">
          <div class="audit-table__actor flex flex-col gap-0.5">
            <span class="audit-table__actor-name text-[13px] font-medium text-main">{{ row.actorDisplayName }}</span>
            <span class="audit-table__actor-id font-mono text-xs text-secondary">{{ row.actorUserId }}</span>
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
