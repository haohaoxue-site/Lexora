<script setup lang="ts">
import type { SystemAdminUserDetail } from '@/apis/system-admin'
import { formatDateTime } from '@/utils/dayjs'

const props = defineProps<{
  detail: SystemAdminUserDetail | null
  loading: boolean
  errorMessage: string
}>()

function getLimitText(total: number, shown: number, unit: string) {
  if (total <= shown) {
    return `共 ${total} ${unit}`
  }

  return `共 ${total} ${unit}，展示最近 ${shown} ${unit}`
}
</script>

<template>
  <div v-loading="props.loading" class="user-data-expansion">
    <ElAlert
      v-if="props.errorMessage"
      :title="props.errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="mb-3"
    />

    <div v-if="props.detail" class="flex flex-col gap-4">
      <section class="user-data-expansion__section w-full">
        <div class="user-data-expansion__section-header">
          <span class="user-data-expansion__section-title">文档数据</span>
          <span class="user-data-expansion__section-meta">
            {{ getLimitText(props.detail.documentTotal, props.detail.documents.length, '篇') }}
          </span>
        </div>

        <ElTable
          :data="props.detail.documents"
          size="small"
          border
          row-key="id"
          empty-text="暂无文档"
          class="user-data-expansion__table"
        >
          <ElTableColumn label="标题" min-width="160">
            <template #default="{ row }">
              <span class="text-xs font-medium text-main">{{ row.title || '未命名文档' }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="创建时间" width="160">
            <template #default="{ row }">
              <span class="text-xs text-secondary">{{ formatDateTime(row.createdAt) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="更新时间" width="160">
            <template #default="{ row }">
              <span class="text-xs text-secondary">{{ formatDateTime(row.updatedAt) }}</span>
            </template>
          </ElTableColumn>
        </ElTable>
      </section>

      <section class="user-data-expansion__section w-full">
        <div class="user-data-expansion__section-header">
          <span class="user-data-expansion__section-title">对话数据</span>
          <span class="user-data-expansion__section-meta">
            {{ getLimitText(props.detail.chatSessionTotal, props.detail.chatSessions.length, '条') }}
          </span>
        </div>

        <ElTable
          :data="props.detail.chatSessions"
          size="small"
          border
          row-key="id"
          empty-text="暂无对话"
          class="user-data-expansion__table"
        >
          <ElTableColumn label="标题" min-width="180">
            <template #default="{ row }">
              <span class="text-xs font-medium text-main">{{ row.title }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="创建时间" width="160">
            <template #default="{ row }">
              <span class="text-xs text-secondary">{{ formatDateTime(row.createdAt) }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="更新时间" width="160">
            <template #default="{ row }">
              <span class="text-xs text-secondary">{{ formatDateTime(row.updatedAt) }}</span>
            </template>
          </ElTableColumn>
        </ElTable>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.user-data-expansion {
  min-height: 4.5rem;
  padding: 1rem 1.25rem;
  background: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);

  &__section {
    min-width: 0;
  }

  &__section-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  &__section-title {
    color: var(--brand-text-primary);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  &__section-meta {
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
  }

  &__table {
    :deep(.el-table__cell) {
      padding-block: 0.5rem;
    }
  }
}
</style>
