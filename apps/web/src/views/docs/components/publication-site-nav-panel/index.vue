<script setup lang="ts">
import type {
  NavItemDraft,
  PublicationSiteNavPanelEmits,
  PublicationSiteNavPanelProps,
} from './typing'
import type {
  PublicationNavItem,
  PublicationNavItemInput,
} from '@/apis/document-publication'
import {
  DOCUMENT_PUBLICATION_ENTRY_STATUS,
  DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET,
  DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET,
  DOCUMENT_PUBLICATION_NAV_ITEM_TYPE,
} from '@haohaoxue/samepage-contracts'
import { normalizePublicationHref } from '@haohaoxue/samepage-shared'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<PublicationSiteNavPanelProps>(), {
  saving: false,
})
const emits = defineEmits<PublicationSiteNavPanelEmits>()

const drafts = shallowRef<NavItemDraft[]>([])
const activeSections = computed(() =>
  [...props.sections]
    .filter(section => section.status !== DOCUMENT_PUBLICATION_ENTRY_STATUS.REMOVED)
    .sort(compareOrderedItem),
)
const activePages = computed(() =>
  [...props.pages]
    .filter(page => page.status !== DOCUMENT_PUBLICATION_ENTRY_STATUS.REMOVED)
    .sort(compareOrderedItem),
)

watch(
  () => props.navItems,
  () => {
    drafts.value = [...props.navItems]
      .sort(compareOrderedItem)
      .map(toDraft)
  },
  { immediate: true },
)

function addInternalItem() {
  drafts.value = [
    ...drafts.value,
    {
      localId: crypto.randomUUID(),
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
}

function addExternalItem() {
  drafts.value = [
    ...drafts.value,
    {
      localId: crypto.randomUUID(),
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
}

function patchDraft(localId: string, patch: Partial<NavItemDraft>) {
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

    return nextItem
  })
}

function removeDraft(localId: string) {
  drafts.value = drafts.value.filter(item => item.localId !== localId)
}

function toggleDraftStatus(item: NavItemDraft) {
  patchDraft(item.localId, {
    status: item.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE
      ? DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN
      : DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE,
  })
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

function saveNavItems() {
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

function resolveTargetOptions(item: NavItemDraft) {
  if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.SECTION) {
    return activeSections.value.map(section => ({
      label: section.title,
      value: section.id,
    }))
  }

  if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.PAGE) {
    return activePages.value.map(page => ({
      label: page.title,
      value: page.id,
    }))
  }

  return []
}

function toDraft(item: PublicationNavItem): NavItemDraft {
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
  <section class="publication-site-nav-panel grid gap-4">
    <div class="flex items-start justify-between gap-4 max-[900px]:flex-col max-[900px]:items-stretch">
      <div>
        <h2 class="m-0 text-lg font-semibold text-main">
          顶部导航
        </h2>
        <p class="m-0 mt-1 text-sm leading-5 text-secondary">
          顶部导航可以指向站点内部首页、分组、页面，也可以跳转外部链接。
        </p>
      </div>
      <div class="inline-flex min-w-0 items-center gap-2 max-[900px]:flex-col max-[900px]:items-stretch">
        <ElButton @click="addInternalItem">
          添加内部链接
        </ElButton>
        <ElButton @click="addExternalItem">
          添加外部链接
        </ElButton>
        <ElButton type="primary" :loading="saving" @click="saveNavItems">
          保存导航
        </ElButton>
      </div>
    </div>

    <ElTable
      :data="drafts"
      row-key="localId"
      class="publication-site-nav-panel__table"
    >
      <template #empty>
        <ElEmpty description="暂无顶部导航" />
      </template>

      <ElTableColumn label="名称" min-width="160">
        <template #default="{ row }">
          <ElInput
            :model-value="row.label"
            maxlength="40"
            @update:model-value="value => patchDraft(row.localId, { label: value })"
          />
        </template>
      </ElTableColumn>

      <ElTableColumn label="类型" width="140">
        <template #default="{ row }">
          <ElSelect
            :model-value="row.type"
            @change="value => patchDraft(row.localId, { type: value })"
          >
            <ElOption label="内部" :value="DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.INTERNAL" />
            <ElOption label="外部" :value="DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL" />
          </ElSelect>
        </template>
      </ElTableColumn>

      <ElTableColumn label="目标" min-width="280">
        <template #default="{ row }">
          <div
            v-if="row.type === DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.INTERNAL"
            class="inline-flex w-full min-w-0 items-center gap-2 max-[900px]:flex-col max-[900px]:items-stretch"
          >
            <ElSelect
              class="flex-1"
              :model-value="row.target"
              @change="value => patchDraft(row.localId, { target: value, targetId: '' })"
            >
              <ElOption label="首页" :value="DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME" />
              <ElOption label="分组" :value="DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.SECTION" />
              <ElOption label="页面" :value="DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.PAGE" />
            </ElSelect>
            <ElSelect
              v-if="row.target !== DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME"
              class="flex-1"
              :model-value="row.targetId"
              placeholder="选择目标"
              @change="value => patchDraft(row.localId, { targetId: value })"
            >
              <ElOption
                v-for="option in resolveTargetOptions(row)"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </ElSelect>
          </div>
          <div
            v-else
            class="inline-flex w-full min-w-0 items-center gap-2 max-[900px]:flex-col max-[900px]:items-stretch"
          >
            <ElInput
              class="flex-1"
              :model-value="row.url"
              placeholder="https://example.com"
              @update:model-value="value => patchDraft(row.localId, { url: value })"
            />
            <ElSelect
              class="flex-1"
              :model-value="row.openTarget"
              @change="value => patchDraft(row.localId, { openTarget: value })"
            >
              <ElOption label="当前页" :value="DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET.SELF" />
              <ElOption label="新窗口" :value="DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET.BLANK" />
            </ElSelect>
          </div>
        </template>
      </ElTableColumn>

      <ElTableColumn label="状态" width="100">
        <template #default="{ row }">
          <ElTag
            size="small"
            :type="row.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? 'success' : 'info'"
            effect="plain"
          >
            {{ row.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? '显示' : '隐藏' }}
          </ElTag>
        </template>
      </ElTableColumn>

      <ElTableColumn label="操作" width="260" align="right" header-align="right">
        <template #default="{ row, $index }">
          <div class="inline-flex min-w-0 items-center gap-2">
            <ElButton link :disabled="$index === 0" @click="moveDraft(row.localId, -1)">
              上移
            </ElButton>
            <ElButton link :disabled="$index === drafts.length - 1" @click="moveDraft(row.localId, 1)">
              下移
            </ElButton>
            <ElButton link @click="toggleDraftStatus(row)">
              {{ row.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? '隐藏' : '显示' }}
            </ElButton>
            <ElButton link type="danger" @click="removeDraft(row.localId)">
              删除
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped lang="scss">
.publication-site-nav-panel__table {
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
