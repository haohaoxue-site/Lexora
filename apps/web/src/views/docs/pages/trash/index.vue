<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { formatDocumentLocation } from '@haohaoxue/samepage-shared'
import { computed } from 'vue'
import { formatDateTime } from '@/utils/dayjs'
import { useDocsTrashPage } from '../../composables/useDocsTrashPage'

const {
  items,
  isLoading,
  errorMessage,
  actionItemId,
  loadItems,
  restoreItem,
  permanentlyDeleteItem,
} = useDocsTrashPage()

const tableItems = computed(() =>
  items.value.map(item => ({
    ...item,
    locationLabel: formatDocumentLocation(item.collection, item.ancestorTitles),
    trashedAtLabel: formatDateTime(item.trashedAt),
  })),
)

const tableHeaderCellStyle: CSSProperties = {
  padding: '1rem 1.25rem',
  borderBottomColor: 'color-mix(in srgb, var(--brand-border-base) 78%, transparent)',
  fontSize: '0.8125rem',
  fontWeight: 600,
}

const tableBodyCellStyle: CSSProperties = {
  padding: '1rem 1.25rem',
  borderBottomColor: 'color-mix(in srgb, var(--brand-border-base) 68%, transparent)',
}

function isItemActing(documentId: string) {
  return actionItemId.value === documentId
}
</script>

<template>
  <section class="docs-trash-page min-h-0 flex-1 overflow-auto p-[clamp(1.25rem,2vw,1.75rem)]">
    <ElTable
      v-loading="isLoading"
      :data="tableItems"
      row-key="id"
      class="docs-trash-table"
      element-loading-text="正在加载回收站"
      :header-cell-style="tableHeaderCellStyle"
      :cell-style="tableBodyCellStyle"
    >
      <template #empty>
        <ElEmpty :description="errorMessage || '暂无已删除文档。'">
          <ElButton v-if="errorMessage" type="primary" @click="loadItems">
            重新加载
          </ElButton>
        </ElEmpty>
      </template>

      <ElTableColumn label="标题" prop="title" min-width="320" show-overflow-tooltip />
      <ElTableColumn label="原位置" prop="locationLabel" min-width="260" show-overflow-tooltip />
      <ElTableColumn label="删除时间" prop="trashedAtLabel" width="180" />

      <ElTableColumn label="操作" width="180" align="right" header-align="right">
        <template #default="{ row }">
          <div class="flex flex-wrap justify-end gap-2">
            <ElButton
              size="small"
              :loading="isItemActing(row.id)"
              :disabled="isItemActing(row.id)"
              @click="restoreItem(row.id)"
            >
              恢复
            </ElButton>

            <ElButton
              size="small"
              type="danger"
              plain
              :loading="isItemActing(row.id)"
              :disabled="isItemActing(row.id)"
              @click="permanentlyDeleteItem(row.id)"
            >
              彻底删除
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped lang="scss">
.docs-trash-page {
  background: var(--brand-bg-base);
}

.docs-trash-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-fill-color-blank: transparent;
  --el-table-border-color: color-mix(in srgb, var(--brand-border-base) 68%, transparent);
  --el-table-header-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 46%, transparent);
  --el-table-header-text-color: var(--brand-text-secondary);
  --el-table-text-color: var(--brand-text-primary);
  --el-table-row-hover-bg-color: color-mix(in srgb, var(--brand-primary) 4%, white);

  :deep(.el-table__inner-wrapper::before) {
    display: none;
  }

  :deep(.el-table__cell .cell) {
    padding: 0;
  }
}
</style>
