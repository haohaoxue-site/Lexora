<script setup lang="ts">
import type {
  DocumentCollaborationConsoleTreeItem,
  DocumentCollaborationLinkInviteState,
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
} from '@haohaoxue/samepage-contracts'
import type { CSSProperties } from 'vue'
import {
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE,
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE_LABELS,
  DOCUMENT_COLLABORATION_PERMISSION_LABELS,
  DOCUMENT_COLLABORATION_SCOPE_LABELS,
} from '@haohaoxue/samepage-contracts'
import { computed } from 'vue'
import { formatDateTime } from '@/utils/dayjs'
import { useDocsCollaborationsPage } from '../../composables/useDocsCollaborationsPage'

const {
  errorMessage,
  isLoading,
  tree,
  loadItems,
  openCollaborationDetail,
  openDocument,
  updatingDocumentId,
  copyCollaborationLink,
  updateLinkEnabled,
  updateLinkPermission,
  updateLinkScope,
} = useDocsCollaborationsPage()

type CollaborationConsoleTableItem = DocumentCollaborationConsoleTreeItem & {
  linkInviteStateLabel: string
  linkPermissionLabel: string
  linkScopeLabel: string
  updatedAtLabel: string
  children: CollaborationConsoleTableItem[]
}

const tableTree = computed(() => tree.value.map(toTableItem))
const permissionOptions = Object.entries(DOCUMENT_COLLABORATION_PERMISSION_LABELS).map(([value, label]) => ({
  value: value as DocumentCollaborationPermission,
  label,
}))
const scopeOptions = Object.entries(DOCUMENT_COLLABORATION_SCOPE_LABELS).map(([value, label]) => ({
  value: value as DocumentCollaborationScope,
  label,
}))

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

function toTableItem(item: DocumentCollaborationConsoleTreeItem): CollaborationConsoleTableItem {
  return {
    ...item,
    linkInviteStateLabel: DOCUMENT_COLLABORATION_LINK_INVITE_STATE_LABELS[item.linkInviteState],
    linkPermissionLabel: item.linkInvite
      ? DOCUMENT_COLLABORATION_PERMISSION_LABELS[item.linkInvite.permission]
      : '可阅读',
    linkScopeLabel: item.linkInvite
      ? DOCUMENT_COLLABORATION_SCOPE_LABELS[item.linkInvite.scope]
      : '仅当前页面',
    updatedAtLabel: formatDateTime(item.updatedAt),
    children: item.children.map(toTableItem),
  }
}

function isLinkActive(row: CollaborationConsoleTableItem) {
  return row.linkInviteState === DOCUMENT_COLLABORATION_LINK_INVITE_STATE.ENABLED
}

function handleLinkStateCommand(row: CollaborationConsoleTableItem, command: string | number | object) {
  void updateLinkEnabled(row.id, String(command) === 'enabled')
}

function handlePermissionCommand(row: CollaborationConsoleTableItem, command: string | number | object) {
  void updateLinkPermission(row.id, String(command) as DocumentCollaborationPermission)
}

function handleScopeCommand(row: CollaborationConsoleTableItem, command: string | number | object) {
  void updateLinkScope(row.id, String(command) as DocumentCollaborationScope)
}

function handleMoreCommand(row: CollaborationConsoleTableItem, command: string | number | object) {
  if (command === 'copy') {
    void copyCollaborationLink(row.id)
    return
  }

  if (command === 'detail') {
    openCollaborationDetail(row.id)
    return
  }

  if (command === 'document') {
    void openDocument(row.id)
  }
}
</script>

<template>
  <section class="docs-collaborations-page min-h-0 flex-1 overflow-auto p-[clamp(1.25rem,2vw,1.75rem)]">
    <div class="docs-collaborations-page__surface mx-auto w-full max-w-[var(--page-mode-table-max-width)] overflow-hidden rounded-lg">
      <ElTable
        v-loading="isLoading"
        :data="tableTree"
        row-key="id"
        class="docs-collaborations-table"
        :tree-props="{ children: 'children' }"
        default-expand-all
        element-loading-text="正在加载协作管理"
        :header-cell-style="tableHeaderCellStyle"
        :cell-style="tableBodyCellStyle"
      >
        <template #empty>
          <ElEmpty :description="errorMessage || '暂无私有文档'">
            <ElButton v-if="errorMessage" type="primary" @click="loadItems">
              重新加载
            </ElButton>
          </ElEmpty>
        </template>

        <ElTableColumn label="文档" min-width="320" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="inline-flex min-w-0 items-center gap-2 text-secondary">
              <SvgIcon
                category="ui"
                :icon="row.hasChildren ? 'document-tree-folder' : 'document-tree-file'"
                size="1rem"
              />
              <span class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {{ row.title || '未命名文档' }}
              </span>
            </span>
          </template>
        </ElTableColumn>

        <ElTableColumn label="链接协作" width="150">
          <template #default="{ row }">
            <ElDropdown
              trigger="click"
              @command="command => handleLinkStateCommand(row, command)"
            >
              <ElButton
                text
                size="small"
                class="docs-collaborations-table__dropdown-trigger gap-1 rounded-lg px-2"
                :loading="updatingDocumentId === row.id"
              >
                <ElTag
                  :type="resolveLinkInviteTagType(row.linkInviteState)"
                  effect="plain"
                  round
                >
                  {{ row.linkInviteStateLabel }}
                </ElTag>
                <SvgIcon category="ui" icon="chevron-down" size="0.78rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    command="disabled"
                    :disabled="row.linkInviteState !== DOCUMENT_COLLABORATION_LINK_INVITE_STATE.ENABLED"
                  >
                    {{ row.linkInviteState === DOCUMENT_COLLABORATION_LINK_INVITE_STATE.NONE ? '未开启' : '已关闭' }}
                  </ElDropdownItem>
                  <ElDropdownItem
                    command="enabled"
                    :disabled="row.linkInviteState === DOCUMENT_COLLABORATION_LINK_INVITE_STATE.ENABLED"
                  >
                    获得链接的人
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </template>
        </ElTableColumn>

        <ElTableColumn label="权限" width="120">
          <template #default="{ row }">
            <ElDropdown
              trigger="click"
              :disabled="!isLinkActive(row) || updatingDocumentId === row.id"
              @command="command => handlePermissionCommand(row, command)"
            >
              <ElButton
                text
                size="small"
                class="docs-collaborations-table__dropdown-trigger min-w-20 justify-between gap-1 rounded-lg px-2"
                :disabled="!isLinkActive(row) || updatingDocumentId === row.id"
              >
                {{ row.linkPermissionLabel }}
                <SvgIcon category="ui" icon="chevron-down" size="0.78rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="option in permissionOptions"
                    :key="option.value"
                    :command="option.value"
                    :disabled="row.linkInvite?.permission === option.value"
                  >
                    {{ option.label }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </template>
        </ElTableColumn>

        <ElTableColumn label="范围" width="150">
          <template #default="{ row }">
            <ElDropdown
              trigger="click"
              :disabled="!isLinkActive(row) || updatingDocumentId === row.id"
              @command="command => handleScopeCommand(row, command)"
            >
              <ElButton
                text
                size="small"
                class="docs-collaborations-table__dropdown-trigger min-w-[7.5rem] justify-between gap-1 rounded-lg px-2"
                :disabled="!isLinkActive(row) || updatingDocumentId === row.id"
              >
                {{ row.linkScopeLabel }}
                <SvgIcon category="ui" icon="chevron-down" size="0.78rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="option in scopeOptions"
                    :key="option.value"
                    :command="option.value"
                    :disabled="row.linkInvite?.scope === option.value"
                  >
                    {{ option.label }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </template>
        </ElTableColumn>

        <ElTableColumn label="协作者" prop="collaboratorCount" width="100" />
        <ElTableColumn label="待处理邀请" prop="pendingInviteCount" width="120" />
        <ElTableColumn label="最近更新" prop="updatedAtLabel" width="180" />

        <ElTableColumn label="操作" width="88" align="right" header-align="right">
          <template #default="{ row }">
            <ElDropdown
              trigger="click"
              @command="command => handleMoreCommand(row, command)"
            >
              <ElButton
                text
                class="docs-collaborations-table__more h-7 min-w-7 w-7 rounded-lg p-0"
                title="更多操作"
              >
                <SvgIcon category="ui" icon="more" size="0.95rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem command="copy" :disabled="!isLinkActive(row)">
                    复制协作链接
                  </ElDropdownItem>
                  <ElDropdownItem command="detail">
                    打开详情
                  </ElDropdownItem>
                  <ElDropdownItem command="document">
                    打开文档
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
.docs-collaborations-page {
  background: var(--brand-bg-base);
}

.docs-collaborations-page__surface {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
  background: var(--brand-bg-surface);
  box-shadow: var(--brand-shadow-hairline);
}

.docs-collaborations-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-fill-color-blank: transparent;
  --el-table-border-color: color-mix(in srgb, var(--brand-border-base) 68%, transparent);
  --el-table-header-bg-color: color-mix(in srgb, var(--brand-fill-light) 86%, var(--brand-bg-surface));
  --el-table-header-text-color: var(--brand-text-secondary);
  --el-table-text-color: var(--brand-text-secondary);
  --el-table-row-hover-bg-color: color-mix(in srgb, var(--brand-primary) 4%, var(--brand-bg-surface));

  :deep(.el-table__inner-wrapper::before) {
    display: none;
  }

  :deep(.el-table__cell .cell) {
    padding: 0;
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

.docs-collaborations-table__dropdown-trigger {
  color: var(--brand-text-secondary);
  font-weight: 400;

  &:hover {
    background: color-mix(in srgb, var(--brand-primary) 7%, transparent);
  }
}

.docs-collaborations-table__more {
  color: var(--brand-text-secondary);
}
</style>
