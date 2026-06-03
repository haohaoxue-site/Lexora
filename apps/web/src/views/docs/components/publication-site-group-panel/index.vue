<script setup lang="ts">
import type {
  DocumentSelectNode,
  PublicationPageForm,
  PublicationSiteGroupPanelEmits,
  PublicationSiteGroupPanelProps,
} from './typing'
import type {
  DocumentSinglePublicationTreeItem,
  PublicationPage,
  PublicationSection,
} from '@/apis/document-publication'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import {
  DOCUMENT_PUBLICATION_ENTRY_STATUS,
  DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE,
  DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE_LABELS,
} from '@haohaoxue/samepage-contracts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, reactive, shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<PublicationSiteGroupPanelProps>(), {
  loading: false,
  mutating: false,
})
const emits = defineEmits<PublicationSiteGroupPanelEmits>()

const selectedPageId = shallowRef('')
const isCreatePageDialogOpen = shallowRef(false)
const pageForm = reactive<PublicationPageForm>({
  sectionId: '',
  documentId: '',
  title: '',
  scope: DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.PAGE,
  order: 0,
})

const activeGroups = computed(() =>
  [...props.groups]
    .filter(group => group.status !== DOCUMENT_PUBLICATION_ENTRY_STATUS.REMOVED)
    .sort(compareOrderedItem),
)
const activePages = computed(() =>
  [...props.pages]
    .filter(page => page.status !== DOCUMENT_PUBLICATION_ENTRY_STATUS.REMOVED)
    .sort(compareOrderedItem),
)
const pagesByGroupId = computed(() => {
  const pageMap = new Map<string, PublicationPage[]>()

  for (const group of activeGroups.value) {
    pageMap.set(group.id, [])
  }

  for (const page of activePages.value) {
    pageMap.get(page.sectionId)?.push(page)
  }

  return pageMap
})
const publishedDocumentIds = computed(() =>
  new Set<string>(activePages.value.map(page => page.documentId)),
)
const documentOptions = computed(() => props.tree.map(item => toDocumentSelectNode(item, publishedDocumentIds.value)))
const selectedPage = computed(() =>
  activePages.value.find(page => page.id === selectedPageId.value) ?? activePages.value[0] ?? null,
)
const selectedSourceDocument = computed(() =>
  selectedPage.value ? findDocumentTreeItem(props.tree, selectedPage.value.documentId) : null,
)
const selectedSourceDocumentTree = computed(() =>
  selectedSourceDocument.value ? [selectedSourceDocument.value] : [],
)

watch(
  activePages,
  (pages) => {
    if (selectedPageId.value && pages.some(page => page.id === selectedPageId.value)) {
      return
    }

    selectedPageId.value = pages[0]?.id ?? ''
  },
  { immediate: true },
)

async function createGroup() {
  const title = await promptText('新建分组', '分组名称', '')

  if (!title) {
    return
  }

  emits('createGroup', title)
}

async function renameGroup(group: PublicationSection) {
  const title = await promptText('重命名分组', '分组名称', group.title)

  if (!title || title === group.title) {
    return
  }

  emits('updateGroup', group.id, { title })
}

function toggleGroupStatus(group: PublicationSection) {
  emits('updateGroup', group.id, {
    status: group.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE
      ? DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN
      : DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE,
  })
}

function toggleGroupCollapsed(group: PublicationSection) {
  emits('updateGroup', group.id, {
    collapsed: !group.collapsed,
  }, { silent: true })
}

async function removeGroup(group: PublicationSection) {
  try {
    await ElMessageBox.confirm('删除分组会同时移除该分组下的站点页面。', '删除分组', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  }
  catch {
    return
  }

  emits('removeGroup', group.id)
}

function openCreatePageDialog(group: PublicationSection) {
  pageForm.sectionId = group.id
  pageForm.documentId = ''
  pageForm.title = ''
  pageForm.scope = DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.PAGE
  pageForm.order = pagesByGroupId.value.get(group.id)?.length ?? 0
  isCreatePageDialogOpen.value = true
}

function submitPage() {
  if (!pageForm.sectionId) {
    ElMessage.warning('请选择分组')
    return
  }

  if (!pageForm.documentId) {
    ElMessage.warning('请选择文档')
    return
  }

  emits('createPage', {
    sectionId: pageForm.sectionId,
    documentId: pageForm.documentId,
    title: pageForm.title.trim() || undefined,
    scope: pageForm.scope,
    order: pageForm.order,
  })
  isCreatePageDialogOpen.value = false
}

function selectPage(page: PublicationPage) {
  selectedPageId.value = page.id
}

function movePage(page: PublicationPage, direction: -1 | 1) {
  const pages = pagesByGroupId.value.get(page.sectionId) ?? []
  const currentIndex = pages.findIndex(item => item.id === page.id)
  const nextIndex = currentIndex + direction

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= pages.length) {
    return
  }

  const nextPages = [...pages]
  const [currentPage] = nextPages.splice(currentIndex, 1)

  if (!currentPage) {
    return
  }

  nextPages.splice(nextIndex, 0, currentPage)
  emits('reorderPages', nextPages.map((item, index) => ({
    pageId: item.id,
    order: index,
  })))
}

function isPageMoveDisabled(page: PublicationPage, direction: -1 | 1) {
  const pages = pagesByGroupId.value.get(page.sectionId) ?? []
  const index = pages.findIndex(item => item.id === page.id)

  return index < 0 || index + direction < 0 || index + direction >= pages.length
}

function resolveSourceTreeIcon(item: DocumentSinglePublicationTreeItem) {
  return item.hasChildren ? 'document-tree-folder' : 'document-tree-file'
}

function findDocumentTreeItem(
  items: DocumentSinglePublicationTreeItem[],
  documentId: string,
): DocumentSinglePublicationTreeItem | null {
  for (const item of items) {
    if (item.id === documentId) {
      return item
    }

    const child = findDocumentTreeItem(item.children, documentId)

    if (child) {
      return child
    }
  }

  return null
}

async function promptText(title: string, placeholder: string, inputValue: string) {
  try {
    const response = await ElMessageBox.prompt(placeholder, title, {
      inputValue,
      inputPattern: /\S+/,
      inputErrorMessage: `${placeholder}不能为空`,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    })

    return response.value.trim()
  }
  catch {
    return ''
  }
}

function toDocumentSelectNode(item: DocumentSinglePublicationTreeItem, publishedIds: Set<string>): DocumentSelectNode {
  return {
    value: item.id,
    label: item.title || '未命名',
    disabled: publishedIds.has(item.id),
    children: item.children.map(child => toDocumentSelectNode(child, publishedIds)),
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
  <section v-loading="loading" class="publication-site-group-panel grid gap-5">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="grid gap-1">
        <h2 class="m-0 text-xl font-semibold leading-7 text-main">
          站点分组
        </h2>
      </div>

      <ElButton type="primary" :loading="mutating" @click="createGroup">
        新建分组
      </ElButton>
    </header>

    <div class="grid grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)] items-start gap-5 max-[1120px]:grid-cols-1">
      <div class="publication-site-group-panel__surface overflow-hidden rounded-xl border bg-surface">
        <ElEmpty v-if="activeGroups.length === 0" description="暂无分组" />

        <div v-else class="grid">
          <section
            v-for="group in activeGroups"
            :key="group.id"
            class="publication-site-group-panel__section"
          >
            <header class="publication-site-group-panel__section-header flex min-h-13 items-center justify-between gap-3 px-4">
              <div class="inline-flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  class="publication-site-group-panel__collapse inline-flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent p-0"
                  :title="group.collapsed ? '展开分组' : '收起分组'"
                  @click="toggleGroupCollapsed(group)"
                >
                  <SvgIcon
                    category="ui"
                    icon="chevron-down"
                    size="0.82rem"
                    class="transition-transform duration-180"
                    :class="{ '-rotate-90': group.collapsed }"
                  />
                </button>
                <SvgIcon category="ui" icon="document-tree-folder" size="1rem" />
                <strong class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-5 text-main">{{ group.title }}</strong>
                <ElTag
                  v-if="group.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN"
                  size="small"
                  type="info"
                  effect="plain"
                >
                  隐藏
                </ElTag>
              </div>

              <div class="inline-flex items-center gap-1">
                <ElButton
                  text
                  class="publication-site-group-panel__icon-button h-7 min-w-7 w-7 rounded-lg p-0"
                  title="向该分组添加页面"
                  @click.stop="openCreatePageDialog(group)"
                >
                  <SvgIcon category="ui" icon="plus" size="0.9rem" />
                </ElButton>
                <ElDropdown trigger="click">
                  <ElButton
                    text
                    class="publication-site-group-panel__icon-button h-7 min-w-7 w-7 rounded-lg p-0"
                    title="分组操作"
                    @click.stop
                  >
                    <SvgIcon category="ui" icon="more" size="0.9rem" />
                  </ElButton>
                  <template #dropdown>
                    <ElDropdownMenu>
                      <ElDropdownItem @click="renameGroup(group)">
                        重命名
                      </ElDropdownItem>
                      <ElDropdownItem @click="toggleGroupStatus(group)">
                        {{ group.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? '隐藏分组' : '显示分组' }}
                      </ElDropdownItem>
                      <ElDropdownItem @click="removeGroup(group)">
                        删除分组
                      </ElDropdownItem>
                    </ElDropdownMenu>
                  </template>
                </ElDropdown>
              </div>
            </header>

            <div
              v-if="!group.collapsed"
              class="grid gap-0 px-4"
            >
              <button
                v-for="page in pagesByGroupId.get(group.id)"
                :key="page.id"
                type="button"
                class="publication-site-group-panel__page-row grid min-h-13 grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left"
                :class="{ 'is-selected': selectedPage?.id === page.id }"
                @click="selectPage(page)"
              >
                <span class="inline-flex min-w-0 items-center gap-2 text-secondary">
                  <SvgIcon category="ui" icon="document-tree-file" size="1rem" />
                  <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                    {{ page.title }}
                  </span>
                </span>
                <span class="text-xs leading-5 text-secondary">
                  {{ DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE_LABELS[page.scope] }}
                </span>
                <ElTag
                  size="small"
                  :type="page.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? 'success' : 'info'"
                  effect="plain"
                >
                  {{ page.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? '显示' : '隐藏' }}
                </ElTag>
                <ElButton
                  text
                  class="publication-site-group-panel__icon-button h-7 min-w-7 w-7 rounded-lg p-0"
                  :icon="ArrowUp"
                  :disabled="mutating || isPageMoveDisabled(page, -1)"
                  title="上移页面"
                  @click.stop="movePage(page, -1)"
                />
                <ElButton
                  text
                  class="publication-site-group-panel__icon-button h-7 min-w-7 w-7 rounded-lg p-0"
                  :icon="ArrowDown"
                  :disabled="mutating || isPageMoveDisabled(page, 1)"
                  title="下移页面"
                  @click.stop="movePage(page, 1)"
                />
              </button>

              <div v-if="(pagesByGroupId.get(group.id)?.length ?? 0) === 0" class="border-t px-3 py-5 text-center text-xs text-secondary">
                暂无页面
              </div>
            </div>
          </section>
        </div>
      </div>

      <aside class="publication-site-group-panel__inspector grid min-h-0 gap-4 rounded-xl border bg-surface p-4">
        <template v-if="selectedPage">
          <section class="grid min-h-0 gap-3">
            <h2 class="m-0 text-base font-semibold leading-6 text-main">
              源文档树
            </h2>

            <div class="publication-site-group-panel__source-tree min-h-0 overflow-hidden rounded-xl border bg-surface">
              <ElScrollbar max-height="18rem">
                <div class="publication-site-group-panel__source-tree-body p-3">
                  <ElTree
                    v-if="selectedSourceDocumentTree.length > 0"
                    :data="selectedSourceDocumentTree"
                    node-key="id"
                    :props="{ label: 'title', children: 'children' }"
                    :indent="18"
                    :expand-on-click-node="false"
                    default-expand-all
                    aria-label="源文档树预览"
                    class="publication-site-group-panel__source-el-tree"
                  >
                    <template #default="{ data }">
                      <span class="publication-site-group-panel__source-tree-node inline-flex min-w-0 items-center gap-2">
                        <SvgIcon category="ui" :icon="resolveSourceTreeIcon(data)" size="1rem" />
                        <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                          {{ data.title || '未命名' }}
                        </span>
                      </span>
                    </template>
                  </ElTree>

                  <ElEmpty v-else description="源文档不可用" />
                </div>
              </ElScrollbar>
            </div>
          </section>

          <div class="publication-site-group-panel__detail-list grid gap-4">
            <div class="publication-site-group-panel__detail-row">
              <span>源文档</span>
              <div class="publication-site-group-panel__detail-value">
                <strong>{{ selectedSourceDocument?.title || selectedPage.title }}</strong>
              </div>
            </div>
            <div class="publication-site-group-panel__detail-row">
              <span>范围</span>
              <div class="publication-site-group-panel__detail-value">
                <strong>{{ DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE_LABELS[selectedPage.scope] }}</strong>
              </div>
            </div>
          </div>
        </template>

        <ElEmpty v-else description="选择一个站点页面" />
      </aside>
    </div>

    <ElDialog
      v-model="isCreatePageDialogOpen"
      title="添加页面"
      width="32rem"
    >
      <div class="grid gap-3">
        <ElForm label-position="top" size="small">
          <ElFormItem label="分组">
            <ElSelect v-model="pageForm.sectionId" disabled>
              <ElOption
                v-for="group in activeGroups"
                :key="group.id"
                :label="group.title"
                :value="group.id"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="源文档">
            <ElTreeSelect
              v-model="pageForm.documentId"
              :data="documentOptions"
              clearable
              filterable
              check-strictly
              default-expand-all
              placeholder="从私有文档选择"
            />
          </ElFormItem>
          <ElFormItem label="站点标题">
            <ElInput v-model="pageForm.title" maxlength="120" placeholder="留空使用文档标题" />
          </ElFormItem>
          <ElFormItem label="范围">
            <ElSelect v-model="pageForm.scope">
              <ElOption
                v-for="(label, value) in DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE_LABELS"
                :key="value"
                :label="label"
                :value="value"
              />
            </ElSelect>
          </ElFormItem>
        </ElForm>
      </div>

      <template #footer>
        <ElButton size="small" :disabled="mutating" @click="isCreatePageDialogOpen = false">
          取消
        </ElButton>
        <ElButton size="small" type="primary" :loading="mutating" @click="submitPage">
          加入站点
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped lang="scss">
.publication-site-group-panel__surface,
.publication-site-group-panel__inspector {
  border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
}

.publication-site-group-panel__surface,
.publication-site-group-panel__inspector {
  box-shadow: var(--brand-shadow-hairline);
}

.publication-site-group-panel__inspector {
  max-height: min(44rem, calc(100vh - 14rem));
  overflow: hidden;
}

.publication-site-group-panel__source-tree {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 86%, var(--brand-text-tertiary) 14%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 42%, transparent);
}

.publication-site-group-panel__source-el-tree {
  --el-tree-bg-color: transparent;
  --el-tree-node-hover-bg-color: color-mix(in srgb, var(--brand-primary) 5%, white);
  --el-tree-node-content-height: 2rem;
  color: var(--brand-text-secondary);
  pointer-events: none;
  user-select: none;

  :deep(.el-tree-node__content) {
    min-width: 0;
    border-radius: 0.5rem;
  }

  :deep(.el-tree-node__expand-icon) {
    color: var(--brand-text-secondary);
  }

  :deep(.el-tree-node__label) {
    min-width: 0;
  }
}

.publication-site-group-panel__source-tree-node {
  color: var(--brand-text-secondary);
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.publication-site-group-panel__icon-button {
  color: var(--brand-text-secondary);

  &:hover {
    color: var(--brand-primary);
    background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
  }
}

.publication-site-group-panel__collapse {
  color: var(--brand-text-secondary);
  cursor: pointer;

  &:hover {
    color: var(--brand-text-primary);
    background: color-mix(in srgb, var(--brand-primary) 6%, transparent);
  }
}

.publication-site-group-panel__section + .publication-site-group-panel__section {
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 58%, transparent);
}

.publication-site-group-panel__section-header {
  background: var(--brand-bg-surface);
}

.publication-site-group-panel__page-row {
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 62%, transparent);
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--brand-primary) 4%, white);
  }

  &.is-selected {
    background: color-mix(in srgb, var(--brand-primary) 6%, white);
  }
}

.publication-site-group-panel__detail-list {
  padding-block: 0.25rem;
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 58%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 58%, transparent);
}

.publication-site-group-panel__detail-row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  min-height: 2.5rem;
  color: var(--brand-text-secondary);
  font-size: 0.875rem;

  & + & {
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 52%, transparent);
  }
}

.publication-site-group-panel__detail-value {
  display: grid;
  justify-items: end;
  min-width: 0;
  text-align: right;

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--brand-text-primary);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
