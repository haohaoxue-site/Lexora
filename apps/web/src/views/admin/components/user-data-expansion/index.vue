<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { UserDataExpansionProps } from './typing'
import { formatDateTime } from '@/utils/dayjs'

const props = defineProps<UserDataExpansionProps>()
const tableCellStyle: CSSProperties = {
  paddingTop: '0.5rem',
  paddingBottom: '0.5rem',
}

function getLimitText(total: number, shown: number, unit: string) {
  if (total <= shown) {
    return `共 ${total} ${unit}`
  }

  return `共 ${total} ${unit}，展示最近 ${shown} ${unit}`
}
</script>

<template>
  <div v-loading="props.loading" class="user-data-expansion min-h-[4.5rem] bg-fill-lighter-a70 px-5 py-4">
    <ElAlert
      v-if="props.errorMessage"
      :title="props.errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="mb-3"
    />

    <div v-if="props.detail" class="flex flex-col gap-4">
      <section class="user-data-expansion__section min-w-0 w-full">
        <div class="user-data-expansion__section-header mb-3 flex items-baseline justify-between gap-3">
          <span class="user-data-expansion__section-title text-[13px] font-bold text-main">文档数据</span>
          <span class="user-data-expansion__section-meta text-xs text-secondary">
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
          :cell-style="tableCellStyle"
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

      <section class="user-data-expansion__section min-w-0 w-full">
        <div class="user-data-expansion__section-header mb-3 flex items-baseline justify-between gap-3">
          <span class="user-data-expansion__section-title text-[13px] font-bold text-main">对话数据</span>
          <span class="user-data-expansion__section-meta text-xs text-secondary">
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
          :cell-style="tableCellStyle"
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
