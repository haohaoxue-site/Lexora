<script setup lang="ts">
import type {
  DocumentSelectNode,
  FlatDocumentItem,
  PublicationPageForm,
  PublicationSiteContentPanelEmits,
  PublicationSiteContentPanelProps,
} from './typing'
import type {
  DocumentSinglePublicationTreeItem,
  PublicationPage,
  PublicationSection,
  PublicationSitePageScope,
} from '@/apis/document-publication'
import {
  DOCUMENT_PUBLICATION_ENTRY_STATUS,
  DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE,
  DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE_LABELS,
} from '@haohaoxue/samepage-contracts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, reactive, shallowRef } from 'vue'

const props = withDefaults(defineProps<PublicationSiteContentPanelProps>(), {
  loading: false,
  mutating: false,
})
const emits = defineEmits<PublicationSiteContentPanelEmits>()

const newSectionTitle = shallowRef('')
const pageForm = reactive<PublicationPageForm>({
  sectionId: '',
  documentId: '',
  title: '',
  scope: DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.PAGE as PublicationSitePageScope,
  order: 0,
})

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
const publishedDocumentIds = computed(() =>
  new Set<string>(activePages.value.map(page => page.documentId)),
)
const documentOptions = computed(() => props.tree.map(item => toDocumentSelectNode(item, publishedDocumentIds.value)))
const flatDocuments = computed(() => props.tree.flatMap(item => flattenDocument(item)))
const documentTitleById = computed(() =>
  new Map(flatDocuments.value.map(document => [document.id, document.title])),
)
const sectionTitleById = computed(() =>
  new Map(activeSections.value.map(section => [section.id, section.title])),
)
const pageRows = computed(() =>
  activePages.value.map(page => ({
    ...page,
    documentTitle: documentTitleById.value.get(page.documentId) ?? '文档已不可见',
    sectionTitle: sectionTitleById.value.get(page.sectionId) ?? '未分组',
    scopeLabel: DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE_LABELS[page.scope],
  })),
)

async function createSection() {
  const title = newSectionTitle.value.trim()

  if (!title) {
    ElMessage.warning('请输入分组名称')
    return
  }

  emits('createSection', title)
  newSectionTitle.value = ''
}

async function renameSection(section: PublicationSection) {
  const title = await promptText('重命名分组', '分组名称', section.title)

  if (!title || title === section.title) {
    return
  }

  emits('updateSection', section.id, { title })
}

function updateSectionOrder(section: PublicationSection, order: number | undefined) {
  emits('updateSection', section.id, { order: order ?? 0 })
}

function toggleSectionStatus(section: PublicationSection) {
  emits('updateSection', section.id, {
    status: section.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE
      ? DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN
      : DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE,
  })
}

async function removeSection(section: PublicationSection) {
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

  emits('removeSection', section.id)
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
  pageForm.documentId = ''
  pageForm.title = ''
  pageForm.scope = DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE.PAGE
  pageForm.order = 0
}

async function renamePage(page: PublicationPage) {
  const title = await promptText('重命名站点页面', '站点页面标题', page.title)

  if (!title || title === page.title) {
    return
  }

  emits('updatePage', page.id, { title })
}

function updatePageOrder(page: PublicationPage, order: number | undefined) {
  emits('updatePage', page.id, { order: order ?? 0 })
}

function updatePageScope(page: PublicationPage, scope: PublicationSitePageScope) {
  emits('updatePage', page.id, { scope })
}

function updatePageSection(page: PublicationPage, sectionId: string) {
  emits('updatePage', page.id, { sectionId })
}

function togglePageStatus(page: PublicationPage) {
  emits('updatePage', page.id, {
    status: page.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE
      ? DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN
      : DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE,
  })
}

async function removePage(page: PublicationPage) {
  try {
    await ElMessageBox.confirm('移除后该文档不会再出现在站点目录中。', '移除页面', {
      confirmButtonText: '移除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  }
  catch {
    return
  }

  emits('removePage', page.id)
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

function flattenDocument(item: DocumentSinglePublicationTreeItem, depth = 0): FlatDocumentItem[] {
  return [
    {
      id: item.id,
      title: item.title || '未命名',
      depth,
    },
    ...item.children.flatMap(child => flattenDocument(child, depth + 1)),
  ]
}

function compareOrderedItem(left: { order: number, updatedAt: string }, right: { order: number, updatedAt: string }) {
  if (left.order !== right.order) {
    return left.order - right.order
  }

  return right.updatedAt.localeCompare(left.updatedAt)
}
</script>

<template>
  <section v-loading="loading" class="publication-site-content-panel grid gap-4">
    <div>
      <div>
        <h2 class="m-0 text-lg font-semibold text-main">
          站点内容
        </h2>
        <p class="m-0 mt-1 text-sm leading-5 text-secondary">
          分组和站点页面组成公开站点侧边栏；DESCENDANTS 的子页面沿用私有文档树顺序。
        </p>
      </div>
    </div>

    <ElAlert
      title="子页面排序跟随私有文档树"
      description="SITE 内容中只管理 root page 在 section 内的位置，子页面不会在这里单独排序。"
      type="info"
      :closable="false"
      show-icon
    />

    <div class="grid grid-cols-[minmax(20rem,0.8fr)_minmax(24rem,1.2fr)] items-start gap-4 max-[980px]:grid-cols-1">
      <section class="grid gap-3">
        <div class="text-base font-semibold text-main">
          分组
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <ElInput
            v-model="newSectionTitle"
            maxlength="80"
            placeholder="新分组名称"
            @keyup.enter="createSection"
          />
          <ElButton type="primary" :loading="mutating" @click="createSection">
            新建
          </ElButton>
        </div>

        <ElTable
          :data="activeSections"
          row-key="id"
          class="publication-site-content-panel__table"
          :show-header="false"
        >
          <template #empty>
            <ElEmpty description="暂无分组" />
          </template>

          <ElTableColumn min-width="180">
            <template #default="{ row }">
              <div class="inline-flex min-w-0 items-center gap-[0.45rem]">
                <span>{{ row.title }}</span>
                <ElTag
                  v-if="row.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN"
                  size="small"
                  type="info"
                  effect="plain"
                >
                  隐藏
                </ElTag>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn width="96">
            <template #default="{ row }">
              <ElInputNumber
                :model-value="row.order"
                :min="0"
                :controls="false"
                size="small"
                @change="value => updateSectionOrder(row, value)"
              />
            </template>
          </ElTableColumn>
          <ElTableColumn width="190" align="right">
            <template #default="{ row }">
              <div class="inline-flex min-w-0 items-center gap-[0.45rem]">
                <ElButton link type="primary" @click="renameSection(row)">
                  重命名
                </ElButton>
                <ElButton link @click="toggleSectionStatus(row)">
                  {{ row.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? '隐藏' : '显示' }}
                </ElButton>
                <ElButton link type="danger" @click="removeSection(row)">
                  删除
                </ElButton>
              </div>
            </template>
          </ElTableColumn>
        </ElTable>
      </section>

      <section class="grid gap-3">
        <div class="text-base font-semibold text-main">
          添加页面
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 max-[980px]:grid-cols-1">
          <ElSelect v-model="pageForm.sectionId" placeholder="选择分组">
            <ElOption
              v-for="section in activeSections"
              :key="section.id"
              :label="section.title"
              :value="section.id"
            />
          </ElSelect>
          <ElTreeSelect
            v-model="pageForm.documentId"
            :data="documentOptions"
            clearable
            filterable
            check-strictly
            default-expand-all
            placeholder="从私有文档选择"
          />
          <ElInput v-model="pageForm.title" maxlength="120" placeholder="站点标题，留空使用文档标题" />
          <ElSelect v-model="pageForm.scope" placeholder="范围">
            <ElOption
              v-for="(label, value) in DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE_LABELS"
              :key="value"
              :label="label"
              :value="value"
            />
          </ElSelect>
          <ElInputNumber
            v-model="pageForm.order"
            :min="0"
            :controls="false"
            placeholder="排序"
          />
          <ElButton type="primary" :loading="mutating" @click="submitPage">
            加入站点
          </ElButton>
        </div>
      </section>
    </div>

    <ElTable
      :data="pageRows"
      row-key="id"
      class="publication-site-content-panel__table"
    >
      <template #empty>
        <ElEmpty description="暂无站点页面" />
      </template>

      <ElTableColumn label="站点标题" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="inline-flex min-w-0 items-center gap-[0.45rem]">
            <span>{{ row.title }}</span>
            <ElTag
              v-if="row.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.HIDDEN"
              size="small"
              type="info"
              effect="plain"
            >
              隐藏
            </ElTag>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="源文档" prop="documentTitle" min-width="200" show-overflow-tooltip />
      <ElTableColumn label="分组" width="180">
        <template #default="{ row }">
          <ElSelect
            :model-value="row.sectionId"
            size="small"
            @change="value => updatePageSection(row, value)"
          >
            <ElOption
              v-for="section in activeSections"
              :key="section.id"
              :label="section.title"
              :value="section.id"
            />
          </ElSelect>
        </template>
      </ElTableColumn>
      <ElTableColumn label="范围" width="170">
        <template #default="{ row }">
          <ElSelect
            :model-value="row.scope"
            size="small"
            @change="value => updatePageScope(row, value)"
          >
            <ElOption
              v-for="(label, value) in DOCUMENT_SITE_PUBLICATION_PAGE_SCOPE_LABELS"
              :key="value"
              :label="label"
              :value="value"
            />
          </ElSelect>
        </template>
      </ElTableColumn>
      <ElTableColumn label="排序" width="110">
        <template #default="{ row }">
          <ElInputNumber
            :model-value="row.order"
            :min="0"
            :controls="false"
            size="small"
            @change="value => updatePageOrder(row, value)"
          />
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="220" align="right" header-align="right">
        <template #default="{ row }">
          <div class="inline-flex min-w-0 items-center gap-[0.45rem]">
            <ElButton link type="primary" @click="renamePage(row)">
              重命名
            </ElButton>
            <ElButton link @click="togglePageStatus(row)">
              {{ row.status === DOCUMENT_PUBLICATION_ENTRY_STATUS.ACTIVE ? '隐藏' : '显示' }}
            </ElButton>
            <ElButton link type="danger" @click="removePage(row)">
              移除
            </ElButton>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped lang="scss">
.publication-site-content-panel__table {
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
