<script setup lang="ts">
import type {
  PublicationSiteNavigationPanelEmits,
  PublicationSiteNavigationPanelProps,
  SiteNavigationItemDraft,
} from './typing'
import type {
  PublicationNavItem,
  PublicationNavItemInput,
  PublicationPage,
} from '@/apis/document-publication'
import {
  ArrowDown,
  ArrowUp,
  Document,
  FolderOpened,
  HomeFilled,
  Link,
  MoreFilled,
  Plus,
} from '@element-plus/icons-vue'
import {
  DOCUMENT_PUBLICATION_ENTRY_STATUS,
  DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET,
  DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET,
  DOCUMENT_PUBLICATION_NAV_ITEM_TYPE,
} from '@haohaoxue/samepage-contracts/document/publication/constants'
import { normalizePublicationHref } from '@haohaoxue/samepage-shared/document'
import { computed, shallowRef, watch } from 'vue'
import Empty from '@/components/empty'
import { ElMessage } from '@/utils/element-plus'

const props = withDefaults(defineProps<PublicationSiteNavigationPanelProps>(), {
  saving: false,
})
const emits = defineEmits<PublicationSiteNavigationPanelEmits>()

const drafts = shallowRef<SiteNavigationItemDraft[]>([])
const selectedLocalId = shallowRef('')
const activeSections = computed(() =>
  [...props.sections]
    .filter(section => section.status !== DOCUMENT_PUBLICATION_ENTRY_STATUS.REMOVED)
    .sort(compareOrderedItem),
)
const selectableSections = computed(() =>
  activeSections.value.filter(section => section.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE),
)
const activePages = computed(() =>
  [...props.pages]
    .filter(page => page.status !== DOCUMENT_PUBLICATION_ENTRY_STATUS.REMOVED)
    .sort(compareOrderedItem),
)
const selectablePages = computed(() =>
  activePages.value.filter(page => page.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE),
)
const sectionTitleById = computed(() =>
  new Map(activeSections.value.map(section => [section.id, section.title])),
)
const pageById = computed(() =>
  new Map(activePages.value.map(page => [page.id, page])),
)
const selectedDraft = computed(() =>
  drafts.value.find(item => item.localId === selectedLocalId.value) ?? drafts.value[0] ?? null,
)

watch(
  () => props.navItems,
  () => {
    drafts.value = [...props.navItems]
      .sort(compareOrderedItem)
      .map(toDraft)
    selectedLocalId.value = drafts.value[0]?.localId ?? ''
  },
  { immediate: true },
)

function addInternalItem() {
  const localId = crypto.randomUUID()

  drafts.value = [
    ...drafts.value,
    {
      localId,
      type: DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.INTERNAL,
      label: '首页',
      target: DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME,
      targetId: '',
      url: '',
      openTarget: DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET.BLANK,
      order: drafts.value.length,
      status: DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE,
    },
  ]
  selectedLocalId.value = localId
}

function addExternalItem() {
  const localId = crypto.randomUUID()

  drafts.value = [
    ...drafts.value,
    {
      localId,
      type: DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL,
      label: '外部链接',
      target: DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME,
      targetId: '',
      url: 'https://',
      openTarget: DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET.BLANK,
      order: drafts.value.length,
      status: DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE,
    },
  ]
  selectedLocalId.value = localId
}

function patchDraft(localId: string, patch: Partial<SiteNavigationItemDraft>) {
  drafts.value = drafts.value.map((item) => {
    if (item.localId !== localId) {
      return item
    }

    const nextItem = {
      ...item,
      ...patch,
    }

    if (patch.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME) {
      nextItem.targetId = ''
    }

    if (patch.type === DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL) {
      nextItem.target = DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME
      nextItem.targetId = ''
      nextItem.url = nextItem.url || 'https://'
    }

    return nextItem
  })
}

function updateDraftType(item: SiteNavigationItemDraft, value: unknown) {
  if (
    value !== DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.INTERNAL
    && value !== DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL
  ) {
    return
  }

  patchDraft(item.localId, { type: value })
}

function moveDraft(localId: string, direction: -1 | 1) {
  const currentIndex = drafts.value.findIndex(item => item.localId === localId)
  const nextIndex = currentIndex + direction

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= drafts.value.length) {
    return
  }

  const nextDrafts = [...drafts.value]
  const [current] = nextDrafts.splice(currentIndex, 1)

  if (!current) {
    return
  }

  nextDrafts.splice(nextIndex, 0, current)
  drafts.value = nextDrafts.map((item, index) => ({
    ...item,
    order: index,
  }))
}

function isDraftMoveDisabled(item: SiteNavigationItemDraft, direction: -1 | 1) {
  const index = drafts.value.findIndex(draft => draft.localId === item.localId)

  return index < 0 || index + direction < 0 || index + direction >= drafts.value.length
}

function removeDraft(localId: string) {
  const currentIndex = drafts.value.findIndex(item => item.localId === localId)

  if (currentIndex < 0) {
    return
  }

  const nextDrafts = drafts.value
    .filter(item => item.localId !== localId)
    .map((item, index) => ({
      ...item,
      order: index,
    }))

  drafts.value = nextDrafts
  selectedLocalId.value = nextDrafts[currentIndex]?.localId ?? nextDrafts[currentIndex - 1]?.localId ?? ''
}

function toggleDraftStatus(item: SiteNavigationItemDraft) {
  patchDraft(item.localId, {
    status: item.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE
      ? DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN
      : DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE,
  })
}

function handleCreateCommand(command: string | number | object) {
  if (command === 'internal') {
    addInternalItem()
    return
  }

  if (command === 'external') {
    addExternalItem()
  }
}

function saveSiteNavigationItems() {
  const items: PublicationNavItemInput[] = []

  for (const [index, draft] of drafts.value.entries()) {
    const label = draft.label.trim()

    if (!label) {
      ElMessage.warning('导航名称不能为空')
      return
    }

    if (draft.type === DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL) {
      const url = draft.url.trim()

      if (!url) {
        ElMessage.warning(`请填写「${label}」的外部链接`)
        return
      }

      const safeUrl = normalizePublicationHref(url)

      if (!safeUrl) {
        ElMessage.warning(`「${label}」只支持 http(s) 链接或站内路径`)
        return
      }

      items.push({
        id: draft.id,
        type: DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL,
        label,
        url: safeUrl,
        openTarget: draft.openTarget,
        order: index,
        status: draft.status,
      })
      continue
    }

    const targetId = draft.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME
      ? null
      : draft.targetId.trim()

    if (draft.target !== DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME && !targetId) {
      ElMessage.warning(`请选择「${label}」的内部目标`)
      return
    }

    if (draft.target !== DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME) {
      const isAvailableTarget = resolveTargetOptions(draft)
        .some(option => option.value === targetId)

      if (!isAvailableTarget) {
        ElMessage.warning(`「${label}」的内部目标当前不可用`)
        return
      }
    }

    items.push({
      id: draft.id,
      type: DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.INTERNAL,
      label,
      target: draft.target,
      targetId,
      order: index,
      status: draft.status,
    })
  }

  emits('save', items)
}

function resolveTargetOptions(item: SiteNavigationItemDraft) {
  if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.SECTION) {
    return selectableSections.value.map(section => ({
      label: section.title,
      value: section.id,
    }))
  }

  if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.PAGE) {
    return selectablePages.value.map(page => ({
      label: resolvePageTargetLabel(page),
      value: page.id,
    }))
  }

  return []
}

function resolvePageTargetLabel(page: PublicationPage) {
  const sectionTitle = sectionTitleById.value.get(page.sectionId)

  return sectionTitle ? `${sectionTitle} / ${page.title}` : page.title
}

function resolveTypeLabel(item: SiteNavigationItemDraft) {
  return item.type === DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.INTERNAL ? '内部链接' : '外部链接'
}

function resolveStatusLabel(item: SiteNavigationItemDraft) {
  return item.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? '显示' : '隐藏'
}

function resolveTargetLabel(item: SiteNavigationItemDraft) {
  if (item.type === DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL) {
    return item.url || '未填写链接'
  }

  if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME) {
    return '站点首页'
  }

  if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.SECTION) {
    return sectionTitleById.value.get(item.targetId) ?? '未选择分组'
  }

  const page = pageById.value.get(item.targetId)

  if (!page) {
    return '未选择页面'
  }

  return resolvePageTargetLabel(page)
}

function resolveNavIcon(item: SiteNavigationItemDraft) {
  if (item.type === DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL) {
    return Link
  }

  if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.SECTION) {
    return FolderOpened
  }

  if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.PAGE) {
    return Document
  }

  return HomeFilled
}

function selectDraft(localId: string) {
  selectedLocalId.value = localId
}

function handleRowClick(row: SiteNavigationItemDraft) {
  selectDraft(row.localId)
}

function resolveRowClassName({ row }: { row: SiteNavigationItemDraft }) {
  return selectedDraft.value?.localId === row.localId ? 'is-selected' : ''
}

function toDraft(item: PublicationNavItem): SiteNavigationItemDraft {
  if (item.type === DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL) {
    return {
      localId: item.id,
      id: item.id,
      type: item.type,
      label: item.label,
      target: DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME,
      targetId: '',
      url: item.url,
      openTarget: item.openTarget ?? DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET.BLANK,
      order: item.order,
      status: item.status,
    }
  }

  return {
    localId: item.id,
    id: item.id,
    type: item.type,
    label: item.label,
    target: item.target,
    targetId: item.targetId ?? '',
    url: '',
    openTarget: DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET.BLANK,
    order: item.order,
    status: item.status,
  }
}

function compareOrderedItem(left: { order: number, updatedAt: string }, right: { order: number, updatedAt: string }) {
  if (left.order !== right.order) {
    return left.order - right.order
  }

  return right.updatedAt.localeCompare(left.updatedAt)
}
</script>

<template>
  <section class="publication-site-navigation-panel grid gap-5">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="grid gap-1">
        <h2 class="m-0 text-xl font-semibold leading-7 text-main">
          站点导航
        </h2>
      </div>

      <div class="inline-flex flex-wrap items-center justify-end gap-2">
        <ElDropdown trigger="click" @command="handleCreateCommand">
          <ElButton :icon="Plus">
            新增导航项
          </ElButton>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="internal">
                内部链接
              </ElDropdownItem>
              <ElDropdownItem command="external">
                外部链接
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <ElButton type="primary" :loading="saving" @click="saveSiteNavigationItems">
          保存站点导航
        </ElButton>
      </div>
    </header>

    <div class="grid grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] items-start gap-5 max-[1120px]:grid-cols-1">
      <div class="publication-site-navigation-panel__surface overflow-hidden rounded-xl border bg-surface">
        <ElTable
          :data="drafts"
          row-key="localId"
          class="publication-site-navigation-panel__table"
          :row-class-name="resolveRowClassName"
          @row-click="handleRowClick"
        >
          <template #empty>
            <Empty compact description="暂无站点导航" />
          </template>

          <ElTableColumn label="导航项" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="flex min-w-0 items-center gap-3">
                <span class="publication-site-navigation-panel__item-icon flex h-9 w-9 items-center justify-center rounded-lg">
                  <ElIcon size="18">
                    <component :is="resolveNavIcon(row)" />
                  </ElIcon>
                </span>
                <span class="grid min-w-0 gap-0.5">
                  <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-5">
                    {{ row.label }}
                  </span>
                </span>
              </span>
            </template>
          </ElTableColumn>

          <ElTableColumn label="类型" width="96">
            <template #default="{ row }">
              <ElTag size="small" effect="plain">
                {{ resolveTypeLabel(row) }}
              </ElTag>
            </template>
          </ElTableColumn>

          <ElTableColumn label="目标" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="text-sm leading-5 text-secondary">
                {{ resolveTargetLabel(row) }}
              </span>
            </template>
          </ElTableColumn>

          <ElTableColumn label="状态" width="78">
            <template #default="{ row }">
              <ElTag
                size="small"
                :type="row.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? 'success' : 'info'"
                effect="plain"
              >
                {{ resolveStatusLabel(row) }}
              </ElTag>
            </template>
          </ElTableColumn>

          <ElTableColumn label="操作" width="128" align="right" header-align="right">
            <template #default="{ row }">
              <div class="inline-flex items-center justify-end gap-1">
                <ElButton
                  text
                  class="publication-site-navigation-panel__icon-button h-7 min-w-7 w-7 rounded-lg p-0"
                  :icon="ArrowUp"
                  :disabled="isDraftMoveDisabled(row, -1)"
                  title="上移"
                  @click.stop="moveDraft(row.localId, -1)"
                />
                <ElButton
                  text
                  class="publication-site-navigation-panel__icon-button h-7 min-w-7 w-7 rounded-lg p-0"
                  :icon="ArrowDown"
                  :disabled="isDraftMoveDisabled(row, 1)"
                  title="下移"
                  @click.stop="moveDraft(row.localId, 1)"
                />
                <ElDropdown trigger="click">
                  <ElButton
                    text
                    class="publication-site-navigation-panel__icon-button h-7 min-w-7 w-7 rounded-lg p-0"
                    :icon="MoreFilled"
                    title="更多操作"
                    @click.stop
                  />
                  <template #dropdown>
                    <ElDropdownMenu>
                      <ElDropdownItem @click="toggleDraftStatus(row)">
                        {{ row.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? '隐藏导航项' : '显示导航项' }}
                      </ElDropdownItem>
                      <ElDropdownItem @click="removeDraft(row.localId)">
                        删除导航项
                      </ElDropdownItem>
                    </ElDropdownMenu>
                  </template>
                </ElDropdown>
              </div>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>

      <aside>
        <section v-if="selectedDraft" class="publication-site-navigation-panel__panel grid gap-4 rounded-xl border bg-surface p-4">
          <div class="grid gap-1">
            <h2 class="m-0 text-base font-semibold leading-6 text-main">
              编辑导航项
            </h2>
            <p class="m-0 text-xs leading-5 text-tertiary">
              调整当前导航项的名称和目标。
            </p>
          </div>

          <ElForm label-position="top">
            <ElFormItem label="名称">
              <ElInput
                :model-value="selectedDraft.label"
                maxlength="40"
                @update:model-value="value => patchDraft(selectedDraft.localId, { label: value })"
              />
            </ElFormItem>

            <ElFormItem label="类型">
              <ElRadioGroup
                :model-value="selectedDraft.type"
                class="publication-site-navigation-panel__type-group"
                @change="value => updateDraftType(selectedDraft, value)"
              >
                <ElRadioButton
                  label="内部链接"
                  :value="DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.INTERNAL"
                />
                <ElRadioButton
                  label="外部链接"
                  :value="DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL"
                />
              </ElRadioGroup>
            </ElFormItem>

            <template v-if="selectedDraft.type === DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.INTERNAL">
              <ElFormItem label="内部目标">
                <ElSelect
                  :model-value="selectedDraft.target"
                  @change="value => patchDraft(selectedDraft.localId, { target: value, targetId: '' })"
                >
                  <ElOption label="站点首页" :value="DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME" />
                  <ElOption label="分组" :value="DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.SECTION" />
                  <ElOption label="页面" :value="DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.PAGE" />
                </ElSelect>
              </ElFormItem>

              <ElFormItem
                v-if="selectedDraft.target !== DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME"
                label="目标"
              >
                <ElSelect
                  :model-value="selectedDraft.targetId"
                  placeholder="选择目标"
                  no-data-text="暂无可选目标"
                  @change="value => patchDraft(selectedDraft.localId, { targetId: value })"
                >
                  <ElOption
                    v-for="option in resolveTargetOptions(selectedDraft)"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </ElSelect>
              </ElFormItem>
            </template>

            <template v-else>
              <ElFormItem label="目标">
                <ElInput
                  :model-value="selectedDraft.url"
                  placeholder="https://example.com"
                  @update:model-value="value => patchDraft(selectedDraft.localId, { url: value })"
                />
              </ElFormItem>
            </template>
          </ElForm>
        </section>

        <section v-else class="publication-site-navigation-panel__panel rounded-xl border bg-surface p-4">
          <Empty compact description="选择一个导航项" />
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped lang="scss">
.publication-site-navigation-panel__surface,
.publication-site-navigation-panel__panel {
  border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
}

.publication-site-navigation-panel__surface,
.publication-site-navigation-panel__panel {
  box-shadow: var(--brand-shadow-hairline);
}

.publication-site-navigation-panel__surface {
  min-height: 34rem;
}

.publication-site-navigation-panel__table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: color-mix(in srgb, var(--brand-fill-lighter) 34%, white);
  --el-table-border-color: color-mix(in srgb, var(--brand-border-base) 58%, transparent);
  --el-table-row-hover-bg-color: color-mix(in srgb, var(--brand-primary) 4%, white);

  :deep(th.el-table__cell) {
    height: 3.25rem;
    color: var(--brand-text-tertiary);
    font-weight: 600;
  }

  :deep(td.el-table__cell) {
    height: 4rem;
  }

  :deep(.el-table__row) {
    cursor: pointer;
  }

  :deep(.el-table__row.is-selected > td.el-table__cell) {
    background: color-mix(in srgb, var(--brand-primary) 6%, white);
  }
}

.publication-site-navigation-panel__item-icon {
  background: color-mix(in srgb, var(--brand-primary) 10%, white);
  color: var(--brand-primary);
}

.publication-site-navigation-panel__icon-button {
  transition: background 0.18s ease, color 0.18s ease;

  &:hover {
    background: color-mix(in srgb, var(--brand-primary) 10%, white);
    color: var(--brand-primary);
  }
}

.publication-site-navigation-panel__type-group {
  width: 100%;

  :deep(.el-radio-button) {
    flex: 1;
  }

  :deep(.el-radio-button__inner) {
    width: 100%;
  }
}
</style>
