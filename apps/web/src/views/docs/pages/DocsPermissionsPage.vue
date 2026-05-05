<script setup lang="ts">
import type {
  DocsPermissionsPageEmits,
  DocsPermissionsPageProps,
  DocumentShareProjection,
  DocumentTreeGroup,
  PermissionOverviewItem,
} from './typing'
import { DOCUMENT_COLLECTION, DOCUMENT_SHARE_MODE } from '@haohaoxue/samepage-contracts'
import {
  formatDocumentCollectionLabel,
  getDocumentShareModeLabel,
} from '@haohaoxue/samepage-shared'
import { computed } from 'vue'
import { formatMonthDayTime } from '@/utils/dayjs'

const props = withDefaults(defineProps<DocsPermissionsPageProps>(), {
  treeGroups: () => [],
  isLoading: false,
})
const emits = defineEmits<DocsPermissionsPageEmits>()

const items = computed<PermissionOverviewItem[]>(() =>
  props.treeGroups
    .filter(group => group.id !== DOCUMENT_COLLECTION.COLLABORATION)
    .flatMap(group => collectPermissionItems(group, [], formatDocumentCollectionLabel(group.id))),
)

function openDocumentShareDialog(documentId: string) {
  emits('openShare', documentId)
}

function resolveModeTagType(share: DocumentShareProjection) {
  if (share.localPolicy?.mode === DOCUMENT_SHARE_MODE.PUBLIC) {
    return 'primary'
  }

  if (share.localPolicy?.mode === DOCUMENT_SHARE_MODE.LOGGED_IN) {
    return 'success'
  }

  if (share.localPolicy?.mode === DOCUMENT_SHARE_MODE.NONE) {
    return 'info'
  }

  return 'warning'
}

function collectPermissionItems(
  group: DocumentTreeGroup,
  ancestorTitles: string[],
  collectionLabel: string,
): PermissionOverviewItem[] {
  return group.nodes.flatMap(node => collectPermissionItemsFromNode(node, ancestorTitles, collectionLabel))
}

function collectPermissionItemsFromNode(
  node: DocumentTreeGroup['nodes'][number],
  ancestorTitles: string[],
  collectionLabel: string,
): PermissionOverviewItem[] {
  const nextAncestorTitles = [...ancestorTitles, node.title]
  const children = node.children.flatMap(child =>
    collectPermissionItemsFromNode(child, nextAncestorTitles, collectionLabel),
  )

  if (!node.share?.localPolicy) {
    return children
  }

  const localPolicy = node.share.localPolicy

  return [
    {
      documentId: node.id,
      title: node.title,
      collectionLabel,
      locationLabel: ancestorTitles.length ? ancestorTitles.join(' / ') : '根目录',
      modeLabel: formatShareModeLabel(node.share),
      updatedAt: localPolicy.updatedAt,
      share: node.share,
    },
    ...children,
  ]
}

function formatShareModeLabel(share: DocumentShareProjection) {
  if (!share.localPolicy) {
    return '继承父级分享设置'
  }

  if (share.localPolicy.mode === DOCUMENT_SHARE_MODE.DIRECT_USER) {
    return `${getDocumentShareModeLabel(share.localPolicy.mode)} ${share.localPolicy.directUserCount} 人`
  }

  return getDocumentShareModeLabel(share.localPolicy.mode)
}

function formatUpdatedAt(_row: PermissionOverviewItem, _column: unknown, value: string) {
  return formatMonthDayTime(value)
}
</script>

<template>
  <section v-loading="props.isLoading" class="docs-permissions-page">
    <ElTable
      class="w-full docs-permissions-table"
      stripe border row-key="documentId"
      :data="items"
    >
      <ElTableColumn prop="title" label="文档标题" min-width="240" show-overflow-tooltip />
      <ElTableColumn prop="locationLabel" label="所在位置" min-width="240" show-overflow-tooltip />
      <ElTableColumn prop="collectionLabel" label="分组" width="120" show-overflow-tooltip />
      <ElTableColumn label="分享方式" min-width="220">
        <template #default="{ row }">
          <div class="docs-permissions-table__mode-cell">
            <ElTag
              size="small"
              effect="plain"
              :type="resolveModeTagType(row.share)"
            >
              {{ row.modeLabel }}
            </ElTag>

            <span class="docs-permissions-table__plain-text">
              当前页面设置
            </span>
          </div>
        </template>
      </ElTableColumn>

      <ElTableColumn prop="updatedAt" label="最近更新" width="140" :formatter="formatUpdatedAt" />

      <ElTableColumn label="操作" width="112" align="right" header-align="right">
        <template #default="{ row }">
          <ElButton size="small" @click="openDocumentShareDialog(row.documentId)">
            管理
          </ElButton>
        </template>
      </ElTableColumn>

      <template #empty>
        <ElEmpty description="当前空间还没有已开启分享的文档。" />
      </template>
    </ElTable>
  </section>
</template>

<style scoped lang="scss">
.docs-permissions-page {
  flex: 1 1 0%;
  min-width: 0;
  min-height: 0;
  padding: clamp(1.25rem, 2vw, 1.75rem);
  background: var(--brand-bg-base);
  overflow: auto;
}
</style>
