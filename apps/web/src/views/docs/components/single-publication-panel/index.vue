<script setup lang="ts">
import type {
  PublicationSiteCollectionInfo,
  SinglePublicationPanelEmits,
  SinglePublicationPanelProps,
  SinglePublicationStateType,
} from './typing'
import type {
  DocumentSinglePublicationEffectiveState,
  DocumentSinglePublicationScope,
  DocumentSinglePublicationState,
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
  DOCUMENT_SINGLE_PUBLICATION_SCOPE_VALUES,
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
const siteCollectionByDocumentId = computed(() => {
  const collectionMap = new Map<string, PublicationSiteCollectionInfo>()

  for (const item of props.tree) {
    collectSiteCollection(item, null, collectionMap)
  }

  return collectionMap
})
const singlePublicationStateOptions = [
  {
    value: DOCUMENT_SINGLE_PUBLICATION_STATE.INHERIT,
    label: '继承父级',
  },
  {
    value: DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED,
    label: '公开链接',
  },
  {
    value: DOCUMENT_SINGLE_PUBLICATION_STATE.DISABLED,
    label: '关闭当前页',
  },
]
const singlePublicationScopeOptions = DOCUMENT_SINGLE_PUBLICATION_SCOPE_VALUES.map(value => ({
  value,
  label: DOCUMENT_SINGLE_PUBLICATION_SCOPE_LABELS[value],
}))

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

function resolveSiteCollectionInfo(documentId: string): PublicationSiteCollectionInfo {
  return siteCollectionByDocumentId.value.get(documentId) ?? {
    state: 'none',
    label: '未加入',
    type: 'info',
    scope: null,
    pageId: null,
  }
}

function resolveSiteScopeLabel(scope: PublicationSitePageScope | null) {
  return scope ? DOCUMENT_SINGLE_PUBLICATION_SCOPE_LABELS[scope] : null
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
    ElMessage.success('页面链接已复制')
  }
  catch {
    ElMessage.error('复制失败')
  }
}

function handleSingleStateCommand(row: DocumentSinglePublicationTreeItem, command: string | number | object) {
  emits(
    'updateState',
    row.id,
    String(command) as DocumentSinglePublicationState,
    row.singlePublicationScope,
  )
}

function handleSingleScopeCommand(row: DocumentSinglePublicationTreeItem, command: string | number | object) {
  emits(
    'updateState',
    row.id,
    DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED,
    String(command) as DocumentSinglePublicationScope,
  )
}

function handleMoreCommand(row: DocumentSinglePublicationTreeItem, command: string | number | object) {
  if (command === 'copySingle') {
    void copySinglePublicationUrl(row.id)
    return
  }

  if (command === 'removeSitePage') {
    const siteInfo = resolveSiteCollectionInfo(row.id)

    if (siteInfo.pageId) {
      emits('removeSitePage', siteInfo.pageId)
    }
  }
}

function removeSitePage(row: DocumentSinglePublicationTreeItem) {
  const pageId = resolveSiteCollectionInfo(row.id).pageId

  if (pageId) {
    emits('removeSitePage', pageId)
  }
}

function collectSiteCollection(
  item: DocumentSinglePublicationTreeItem,
  inheritedScope: PublicationSitePageScope | null,
  collectionMap: Map<string, PublicationSiteCollectionInfo>,
) {
  const directPage = sitePageByDocumentId.value.get(item.id)
  const directActivePage = activeSitePageByDocumentId.value.get(item.id)
  const directHiddenPage = directPage?.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN ? directPage : null
  const nextInheritedScope = directActivePage?.scope === DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.DESCENDANTS
    ? DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.DESCENDANTS
    : inheritedScope

  collectionMap.set(item.id, resolveSiteCollection({
    directActivePage,
    directHiddenPage,
    inheritedScope,
  }))

  for (const child of item.children) {
    collectSiteCollection(child, nextInheritedScope, collectionMap)
  }
}

function resolveSiteCollection(input: {
  directActivePage: PublicationPage | null | undefined
  directHiddenPage: PublicationPage | null
  inheritedScope: PublicationSitePageScope | null
}): PublicationSiteCollectionInfo {
  if (input.directActivePage) {
    return {
      state: 'direct',
      label: '直接加入',
      type: 'success',
      scope: input.directActivePage.scope,
      pageId: input.directActivePage.id,
    }
  }

  if (input.inheritedScope) {
    return {
      state: 'inherited',
      label: '继承收录',
      type: 'primary',
      scope: input.inheritedScope,
      pageId: null,
    }
  }

  if (input.directHiddenPage) {
    return {
      state: 'hidden',
      label: '已隐藏',
      type: 'info',
      scope: input.directHiddenPage.scope,
      pageId: input.directHiddenPage.id,
    }
  }

  return {
    state: 'none',
    label: '未加入',
    type: 'info',
    scope: null,
    pageId: null,
  }
}
</script>

<template>
  <section class="single-publication-panel grid gap-3">
    <div class="flex justify-end">
      <ElButton size="small" :loading="loading" @click="emits('refresh')">
        刷新
      </ElButton>
    </div>

    <div class="single-publication-panel__surface overflow-hidden rounded-lg border bg-surface">
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
            <span class="inline-flex min-w-0 items-center gap-2 text-secondary">
              <SvgIcon
                category="ui"
                :icon="row.hasChildren ? 'document-tree-folder' : 'document-tree-file'"
                size="1rem"
              />
              <span class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{{ row.title || '未命名' }}</span>
            </span>
          </template>
        </ElTableColumn>

        <ElTableColumn label="页面分享" width="170">
          <template #default="{ row }">
            <ElDropdown
              trigger="click"
              @command="command => handleSingleStateCommand(row, command)"
            >
              <ElButton
                text
                size="small"
                class="single-publication-panel__dropdown-trigger gap-1 rounded-lg px-2"
                :loading="updatingDocumentId === row.id"
              >
                <ElTag
                  size="small"
                  :type="resolveSingleStateType(row.effectivePublicationState)"
                  effect="light"
                >
                  {{ resolveSingleStateLabel(row.effectivePublicationState) }}
                </ElTag>
                <SvgIcon category="ui" icon="chevron-down" size="0.78rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="option in singlePublicationStateOptions"
                    :key="option.value"
                    :command="option.value"
                    :disabled="row.singlePublicationState === option.value"
                  >
                    {{ option.label }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </template>
        </ElTableColumn>

        <ElTableColumn label="分享范围" width="150">
          <template #default="{ row }">
            <ElDropdown
              trigger="click"
              :disabled="row.singlePublicationState !== DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED || updatingDocumentId === row.id"
              @command="command => handleSingleScopeCommand(row, command)"
            >
              <ElButton
                text
                size="small"
                class="single-publication-panel__dropdown-trigger min-w-[7.5rem] justify-between gap-1 rounded-lg px-2"
                :disabled="row.singlePublicationState !== DOCUMENT_SINGLE_PUBLICATION_STATE.ENABLED || updatingDocumentId === row.id"
              >
                {{ resolveSingleScopeLabel(row) ?? '继承父级' }}
                <SvgIcon category="ui" icon="chevron-down" size="0.78rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="option in singlePublicationScopeOptions"
                    :key="option.value"
                    :command="option.value"
                    :disabled="row.singlePublicationScope === option.value"
                  >
                    {{ option.label }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </template>
        </ElTableColumn>

        <ElTableColumn label="站点收录" width="230">
          <template #default="{ row }">
            <div class="inline-flex min-w-0 items-center gap-2">
              <ElTag
                size="small"
                :type="resolveSiteCollectionInfo(row.id).type"
                effect="plain"
              >
                {{ resolveSiteCollectionInfo(row.id).label }}
              </ElTag>
              <ElTag
                v-if="resolveSiteScopeLabel(resolveSiteCollectionInfo(row.id).scope)"
                size="small"
                effect="plain"
              >
                {{ resolveSiteScopeLabel(resolveSiteCollectionInfo(row.id).scope) }}
              </ElTag>
              <ElButton
                v-if="resolveSiteCollectionInfo(row.id).pageId"
                link
                type="danger"
                @click="removeSitePage(row)"
              >
                移除
              </ElButton>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="操作" width="96" align="right" header-align="right">
          <template #default="{ row }">
            <ElDropdown
              trigger="click"
              @command="command => handleMoreCommand(row, command)"
            >
              <ElButton
                text
                class="single-publication-panel__more h-7 min-w-7 w-7 rounded-lg p-0"
                title="更多操作"
              >
                <SvgIcon category="ui" icon="more" size="0.95rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem command="copySingle" :disabled="!isSinglePublished(row)">
                    复制页面链接
                  </ElDropdownItem>
                  <ElDropdownItem
                    command="removeSitePage"
                    :disabled="!resolveSiteCollectionInfo(row.id).pageId"
                  >
                    移除站点收录
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>
  </section>
</template>

<style scoped lang="scss">
.single-publication-panel__surface {
  border-color: color-mix(in srgb, var(--brand-border-base) 74%, transparent);
}

.single-publication-panel__table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-fill-color-blank: transparent;
  --el-table-border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  --el-table-header-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 48%, transparent);
  --el-table-header-text-color: var(--brand-text-secondary);
  --el-table-text-color: var(--brand-text-secondary);
  --el-table-row-hover-bg-color: color-mix(in srgb, var(--brand-primary) 4%, white);

  :deep(.el-table__inner-wrapper::before) {
    display: none;
  }

  :deep(.el-table__row .el-table__cell:first-child .cell) {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  :deep(.el-table__indent) {
    flex: 0 0 auto;
  }

  :deep(.el-table__expand-icon),
  :deep(.el-table__placeholder) {
    display: inline-flex;
    flex: 0 0 1rem;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    margin-right: 0.375rem;
    color: var(--brand-text-secondary);
    vertical-align: middle;
  }

  :deep(.el-table__expand-icon .el-icon) {
    font-size: 0.75rem;
  }
}

.single-publication-panel__dropdown-trigger {
  color: var(--brand-text-secondary);
  font-weight: 400;

  &:hover {
    background: color-mix(in srgb, var(--brand-primary) 7%, transparent);
  }
}

.single-publication-panel__more {
  color: var(--brand-text-secondary);
}
</style>
