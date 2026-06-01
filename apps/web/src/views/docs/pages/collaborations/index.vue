<script setup lang="ts">
import type { DocumentCollaborationLinkInviteState } from '@haohaoxue/samepage-contracts'
import type { CSSProperties } from 'vue'
import {
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE,
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE_LABELS,
  DOCUMENT_COLLABORATION_RANGE_SUMMARY_LABELS,
} from '@haohaoxue/samepage-contracts'
import { computed } from 'vue'
import { formatDateTime } from '@/utils/dayjs'
import { useDocsCollaborationsPage } from '../../composables/useDocsCollaborationsPage'

const {
  errorMessage,
  isLoading,
  items,
  loadItems,
  openCollaborationDetail,
  openDocument,
} = useDocsCollaborationsPage()

const tableItems = computed(() =>
  items.value.map(item => ({
    ...item,
    linkInviteStateLabel: DOCUMENT_COLLABORATION_LINK_INVITE_STATE_LABELS[item.linkInviteState],
    rangeSummaryLabel: DOCUMENT_COLLABORATION_RANGE_SUMMARY_LABELS[item.rangeSummary],
    updatedAtLabel: formatDateTime(item.updatedAt),
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

function resolveLinkInviteTagType(state: DocumentCollaborationLinkInviteState) {
  if (state === DOCUMENT_COLLABORATION_LINK_INVITE_STATE.ENABLED) {
    return 'success'
  }

  if (state === DOCUMENT_COLLABORATION_LINK_INVITE_STATE.DISABLED) {
    return 'info'
  }

  return undefined
}
</script>

<template>
  <section class="docs-collaborations-page min-h-0 flex-1 overflow-auto p-[clamp(1.25rem,2vw,1.75rem)]">
    <ElTable
      v-loading="isLoading"
      :data="tableItems"
      row-key="rootDocument.id"
      class="docs-collaborations-table"
      element-loading-text="正在加载协作管理"
      :header-cell-style="tableHeaderCellStyle"
      :cell-style="tableBodyCellStyle"
    >
      <template #empty>
        <ElEmpty :description="errorMessage || '暂无对外协作的私有文档'">
          <ElButton v-if="errorMessage" type="primary" @click="loadItems">
            重新加载
          </ElButton>
        </ElEmpty>
      </template>

      <ElTableColumn label="文档" min-width="320" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium text-main">
            {{ row.rootDocument.title || '未命名文档' }}
          </span>
        </template>
      </ElTableColumn>

      <ElTableColumn label="协作者" prop="collaboratorCount" width="120" />
      <ElTableColumn label="待处理邀请" prop="pendingInviteCount" width="130" />

      <ElTableColumn label="协作链接" width="130">
        <template #default="{ row }">
          <ElTag
            :type="resolveLinkInviteTagType(row.linkInviteState)"
            effect="plain"
            round
          >
            {{ row.linkInviteStateLabel }}
          </ElTag>
        </template>
      </ElTableColumn>

      <ElTableColumn label="范围" prop="rangeSummaryLabel" width="130" />
      <ElTableColumn label="最近更新" prop="updatedAtLabel" width="180" />

      <ElTableColumn label="操作" width="190" align="right" header-align="right">
        <template #default="{ row }">
          <div class="inline-flex items-center justify-end gap-2">
            <ElButton link type="primary" @click="openCollaborationDetail(row.rootDocument.id)">
              打开详情
            </ElButton>
            <ElButton link @click="openDocument(row.rootDocument.id)">
              打开文档
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped lang="scss">
.docs-collaborations-page {
  background: var(--brand-bg-base);
}

.docs-collaborations-table {
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
