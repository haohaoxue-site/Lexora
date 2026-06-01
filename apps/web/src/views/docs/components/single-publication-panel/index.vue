<script setup lang="ts">
import type {
  PublicationSiteScopeByDocumentId,
  SinglePublicationPanelEmits,
  SinglePublicationPanelProps,
  SinglePublicationStateType,
} from './typing'
import type {
  DocumentSinglePublicationEffectiveState,
  DocumentSinglePublicationTreeItem,
  PublicationPage,
  PublicationSitePageScope,
} from '@/apis/document-publication'
import {
  DOCUMENT_PUBLICATION_ENTRY_STATUS,
  DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE,
  DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE_LABELS,
  DOCUMENT_SINGLE_PUBLICATION_ROUTE_PREFIX,
  DOCUMENT_SINGLE_PUBLICATION_SCOPE_LABELS,
  DOCUMENT_SINGLE_PUBLICATION_STATE,
  DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE,
} from '@haohaoxue/samepage-contracts'
import { useClipboard } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'

const props = withDefaults(defineProps<SinglePublicationPanelProps>(), {
  loading: false,
  updatingDocumentId: null,
})
const emits = defineEmits<SinglePublicationPanelEmits>()
const { copy, isSupported: isClipboardSupported } = useClipboard({
  legacy: true,
})

const sitePageByDocumentId = computed(() => {
  const pageMap = new Map<string, PublicationPage>()

  for (const page of props.sitePages) {
    if (page.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.REMOVED) {
      continue
    }

    pageMap.set(page.documentId, page)
  }

  return pageMap
})
const activeSitePageByDocumentId = computed(() => {
  const pageMap = new Map<string, PublicationPage>()

  for (const page of props.sitePages) {
    if (page.status !== DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE) {
      continue
    }

    pageMap.set(page.documentId, page)
  }

  return pageMap
})
const siteScopeByDocumentId = computed(() => {
  const scopeMap = new Map<string, PublicationSitePageScope>()

  for (const item of props.tree) {
    collectSiteScope(item, null, scopeMap)
  }

  return scopeMap
})

function resolveSingleStateType(state: DocumentSinglePublicationEffectiveState): SinglePublicationStateType {
  if (state === DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.ENABLED) {
    return 'success'
  }

  if (state === DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.INHERITED_ENABLED) {
    return 'primary'
  }

  if (state === DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.DISABLED) {
    return 'warning'
  }

  return 'info'
}

function resolveSingleStateLabel(state: DocumentSinglePublicationEffectiveState) {
  return DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE_LABELS[state]
}

function resolveSingleScopeLabel(row: DocumentSinglePublicationTreeItem) {
  if (row.singlePublicationState !== DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED) {
    return null
  }

  return DOCUMENT_SINGLE_PUBLICATION_SCOPE_LABELS[row.singlePublicationScope]
}

function resolveSiteScopeLabel(documentId: string) {
  const scope = siteScopeByDocumentId.value.get(documentId)

  if (!scope) {
    return '未加入站点'
  }

  return scope === DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.DESCENDANTS
    ? 'SITE DESCENDANTS'
    : 'SITE PAGE'
}

function resolveSiteScopeType(documentId: string) {
  const scope = siteScopeByDocumentId.value.get(documentId)

  if (!scope) {
    return 'info'
  }

  return scope === DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.DESCENDANTS
    ? 'success'
    : 'primary'
}

function isSinglePublished(row: DocumentSinglePublicationTreeItem) {
  return row.effectivePublicationState === DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.ENABLED
    || row.effectivePublicationState === DOCUMENT_SINGLE_PUBLICATION_EFFECTIVE_STATE.INHERITED_ENABLED
}

async function copySinglePublicationUrl(documentId: string) {
  if (!isClipboardSupported.value) {
    ElMessage.error('当前环境不支持复制')
    return
  }

  try {
    await copy(new URL(`${DOCUMENT_SINGLE_PUBLICATION_ROUTE_PREFIX}/${documentId}`, window.location.origin).toString())
    ElMessage.success('单页链接已复制')
  }
  catch {
    ElMessage.error('复制失败')
  }
}

function collectSiteScope(
  item: DocumentSinglePublicationTreeItem,
  inheritedScope: PublicationSitePageScope | null,
  scopeMap: PublicationSiteScopeByDocumentId,
) {
  const directPage = sitePageByDocumentId.value.get(item.id)
  const directActivePage = activeSitePageByDocumentId.value.get(item.id)
  const currentScope = directPage?.scope ?? inheritedScope
  const nextInheritedScope = directActivePage?.scope === DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.DESCENDANTS
    ? DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.DESCENDANTS
    : inheritedScope

  if (currentScope) {
    scopeMap.set(item.id, currentScope)
  }

  for (const child of item.children) {
    collectSiteScope(child, nextInheritedScope, scopeMap)
  }
}
</script>

<template>
  <section class="single-publication-panel grid gap-4">
    <div class="flex items-start justify-between gap-4 max-[760px]:flex-col max-[760px]:items-stretch">
      <div>
        <h2 class="m-0 text-lg font-semibold text-main">
          单页公开
        </h2>
        <p class="m-0 mt-1 text-sm leading-5 text-secondary">
          用于生成无站点框架的独立阅读链接，路径为 /p/:documentId。
        </p>
      </div>
      <ElButton :loading="loading" @click="emits('refresh')">
        刷新
      </ElButton>
    </div>

    <ElTable
      v-loading="loading"
      :data="tree"
      row-key="id"
      class="single-publication-panel__table"
      :tree-props="{ children: 'children' }"
      default-expand-all
    >
      <template #empty>
        <ElEmpty description="暂无私有文档" />
      </template>

      <ElTableColumn label="文档" min-width="260" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="inline-flex min-w-0 items-center gap-[0.45rem] text-main">
            <SvgIcon
              category="ui"
              :icon="row.hasChildren ? 'document-tree-folder' : 'document-tree-file'"
              size="1rem"
            />
            <span>{{ row.title || '未命名' }}</span>
          </span>
        </template>
      </ElTableColumn>

      <ElTableColumn label="单页状态" width="220">
        <template #default="{ row }">
          <div class="inline-flex min-w-0 items-center gap-[0.45rem]">
            <ElTag
              size="small"
              :type="resolveSingleStateType(row.effectivePublicationState)"
              effect="light"
            >
              {{ resolveSingleStateLabel(row.effectivePublicationState) }}
            </ElTag>
            <ElTag
              v-if="resolveSingleScopeLabel(row)"
              size="small"
              effect="plain"
            >
              {{ resolveSingleScopeLabel(row) }}
            </ElTag>
          </div>
        </template>
      </ElTableColumn>

      <ElTableColumn label="站点收录" width="170">
        <template #default="{ row }">
          <div class="inline-flex min-w-0 items-center gap-[0.45rem]">
            <ElTag
              size="small"
              :type="resolveSiteScopeType(row.id)"
              effect="plain"
            >
              {{ resolveSiteScopeLabel(row.id) }}
            </ElTag>
            <ElTag
              v-if="sitePageByDocumentId.get(row.id)?.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN"
              size="small"
              type="info"
              effect="plain"
            >
              已隐藏
            </ElTag>
          </div>
        </template>
      </ElTableColumn>

      <ElTableColumn label="操作" width="330" align="right" header-align="right">
        <template #default="{ row }">
          <div class="inline-flex min-w-0 items-center gap-[0.45rem]">
            <ElButton
              link
              type="primary"
              :loading="updatingDocumentId === row.id"
              :disabled="row.singlePublicationState === DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED"
              @click="emits('updateState', row.id, DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED, row.singlePublicationScope)"
            >
              开启
            </ElButton>
            <ElButton
              link
              :loading="updatingDocumentId === row.id"
              :disabled="row.singlePublicationState === DOCUMENT_SINGLE_PUBLICATION_STATE.DISABLED"
              @click="emits('updateState', row.id, DOCUMENT_SINGLE_PUBLICATION_STATE.DISABLED)"
            >
              关闭
            </ElButton>
            <ElButton
              link
              :loading="updatingDocumentId === row.id"
              :disabled="row.singlePublicationState === DOCUMENT_SINGLE_PUBLICATION_STATE.INHERIT"
              @click="emits('updateState', row.id, DOCUMENT_SINGLE_PUBLICATION_STATE.INHERIT)"
            >
              继承
            </ElButton>
            <ElButton
              link
              :disabled="!isSinglePublished(row)"
              @click="copySinglePublicationUrl(row.id)"
            >
              复制链接
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped lang="scss">
.single-publication-panel__table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-fill-color-blank: transparent;
  --el-table-border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  --el-table-header-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 48%, transparent);
  --el-table-header-text-color: var(--brand-text-secondary);
  --el-table-row-hover-bg-color: color-mix(in srgb, var(--brand-primary) 4%, white);

  :deep(.el-table__inner-wrapper::before) {
    display: none;
  }
}
</style>
