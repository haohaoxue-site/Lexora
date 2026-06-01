<script setup lang="ts">
import type {
  CreatePageDraft,
  PublicationManagementTab,
  SiteSettingsDraft,
  UpdatePageDraft,
  UpdateSectionDraft,
} from './typing'
import type {
  DocumentSinglePublicationScope,
  DocumentSinglePublicationState,
  DocumentSinglePublicationTreeItem,
  PublicationNavItemInput,
  PublicationPage,
  PublicationSection,
  PublicationSite,
  PublicationSiteManagementResponse,
  ReplacePublicationNavItemsRequest,
} from '@/apis/document-publication'
import { DOCUMENT_SITE_PUBLICATION_ROUTE_PREFIX } from '@haohaoxue/samepage-contracts'
import { useClipboard } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'
import {
  createPublicationPage,
  createPublicationSection,
  getPublicationSiteManagement,
  listDocumentSinglePublications,
  removePublicationPage,
  removePublicationSection,
  replacePublicationNavItems,
  updateDocumentSinglePublication,
  updatePublicationPage,
  updatePublicationSection,
  updatePublicationSiteSettings,
} from '@/apis/document-publication'
import { useWorkspaceStore } from '@/stores/workspace'
import PublicationSiteContentPanel from '../../components/publication-site-content-panel'
import PublicationSiteNavPanel from '../../components/publication-site-nav-panel'
import PublicationSiteSettingsPanel from '../../components/publication-site-settings-panel'
import SinglePublicationPanel from '../../components/single-publication-panel'

const workspaceStore = useWorkspaceStore()
const { copy, isSupported: isClipboardSupported } = useClipboard({
  legacy: true,
})

const activeTab = shallowRef<PublicationManagementTab>('single')
const singleTree = shallowRef<DocumentSinglePublicationTreeItem[]>([])
const siteManagement = shallowRef<PublicationSiteManagementResponse | null>(null)
const isLoading = shallowRef(false)
const isSiteMutating = shallowRef(false)
const updatingSingleDocumentId = shallowRef<string | null>(null)
const errorMessage = shallowRef('')

const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? '')
const site = computed<PublicationSite | null>(() => siteManagement.value?.site ?? null)
const sections = computed<PublicationSection[]>(() => siteManagement.value?.sections ?? [])
const pages = computed<PublicationPage[]>(() => siteManagement.value?.pages ?? [])
const navItems = computed(() => siteManagement.value?.navItems ?? [])
const siteUrl = computed(() => site.value
  ? new URL(`${DOCUMENT_SITE_PUBLICATION_ROUTE_PREFIX}/${site.value.id}`, window.location.origin).toString()
  : '',
)

watch(
  currentWorkspaceId,
  () => {
    void loadPublicationManagement()
  },
  { immediate: true },
)

async function loadPublicationManagement() {
  if (!currentWorkspaceId.value || isLoading.value) {
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const [singleResponse, siteResponse] = await Promise.all([
      listDocumentSinglePublications(currentWorkspaceId.value),
      getPublicationSiteManagement(currentWorkspaceId.value),
    ])

    singleTree.value = singleResponse.tree
    siteManagement.value = siteResponse
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载发布管理失败'
  }
  finally {
    isLoading.value = false
  }
}

async function reloadSinglePublications() {
  if (!currentWorkspaceId.value) {
    return
  }

  const response = await listDocumentSinglePublications(currentWorkspaceId.value)
  singleTree.value = response.tree
}

async function updateSinglePublicationState(
  documentId: string,
  state: DocumentSinglePublicationState,
  scope?: DocumentSinglePublicationScope,
) {
  if (updatingSingleDocumentId.value) {
    return
  }

  updatingSingleDocumentId.value = documentId

  try {
    await updateDocumentSinglePublication(documentId, {
      state,
      ...(scope ? { scope } : {}),
    })
    await reloadSinglePublications()
    ElMessage.success('单页公开状态已更新')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新单页公开状态失败')
  }
  finally {
    updatingSingleDocumentId.value = null
  }
}

async function saveSiteSettings(payload: SiteSettingsDraft) {
  await runSiteMutation(async () => {
    siteManagement.value = await updatePublicationSiteSettings({
      workspaceId: currentWorkspaceId.value,
      ...payload,
    })
    ElMessage.success('站点设置已保存')
  }, '保存站点设置失败')
}

async function createSection(title: string) {
  await runSiteMutation(async () => {
    siteManagement.value = await createPublicationSection({
      workspaceId: currentWorkspaceId.value,
      title,
      order: sections.value.length,
    })
    ElMessage.success('分组已创建')
  }, '创建分组失败')
}

async function updateSection(sectionId: string, payload: UpdateSectionDraft) {
  await runSiteMutation(async () => {
    siteManagement.value = await updatePublicationSection(sectionId, {
      workspaceId: currentWorkspaceId.value,
      ...payload,
    })
    ElMessage.success('分组已更新')
  }, '更新分组失败')
}

async function deleteSection(sectionId: string) {
  await runSiteMutation(async () => {
    siteManagement.value = await removePublicationSection(sectionId, currentWorkspaceId.value)
    ElMessage.success('分组已删除')
  }, '删除分组失败')
}

async function createPage(payload: CreatePageDraft) {
  await runSiteMutation(async () => {
    siteManagement.value = await createPublicationPage({
      workspaceId: currentWorkspaceId.value,
      ...payload,
    })
    ElMessage.success('页面已加入站点')
  }, '添加站点页面失败')
}

async function updatePage(pageId: string, payload: UpdatePageDraft) {
  await runSiteMutation(async () => {
    siteManagement.value = await updatePublicationPage(pageId, {
      workspaceId: currentWorkspaceId.value,
      ...payload,
    })
    ElMessage.success('站点页面已更新')
  }, '更新站点页面失败')
}

async function deletePage(pageId: string) {
  await runSiteMutation(async () => {
    siteManagement.value = await removePublicationPage(pageId, currentWorkspaceId.value)
    ElMessage.success('站点页面已移除')
  }, '移除站点页面失败')
}

async function saveNavItems(items: PublicationNavItemInput[]) {
  await runSiteMutation(async () => {
    const payload: ReplacePublicationNavItemsRequest = {
      workspaceId: currentWorkspaceId.value,
      items,
    }

    siteManagement.value = await replacePublicationNavItems(payload)
    ElMessage.success('顶部导航已保存')
  }, '保存顶部导航失败')
}

async function copySiteUrl() {
  if (!siteUrl.value) {
    return
  }

  if (!isClipboardSupported.value) {
    ElMessage.error('当前环境不支持复制')
    return
  }

  try {
    await copy(siteUrl.value)
    ElMessage.success('站点链接已复制')
  }
  catch {
    ElMessage.error('复制失败')
  }
}

function openSiteUrl() {
  if (!siteUrl.value) {
    return
  }

  window.open(siteUrl.value, '_blank', 'noopener,noreferrer')
}

async function runSiteMutation(action: () => Promise<void>, errorText: string) {
  if (!currentWorkspaceId.value || isSiteMutating.value) {
    return
  }

  isSiteMutating.value = true

  try {
    await action()
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : errorText)
  }
  finally {
    isSiteMutating.value = false
  }
}
</script>

<template>
  <section class="docs-publication-settings-page flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto p-[clamp(1.25rem,2vw,1.75rem)]">
    <header class="flex items-start justify-between gap-4 max-[760px]:flex-col max-[760px]:items-stretch">
      <div>
        <h1 class="m-0 text-xl font-bold text-main">
          发布
        </h1>
        <p class="m-0 mt-1 text-sm leading-5 text-secondary">
          单页公开和站点发布相互独立；协作权限不会自动进入发布配置。
        </p>
      </div>

      <div class="inline-flex shrink-0 gap-2 max-[760px]:flex-col">
        <ElButton :disabled="!siteUrl" @click="copySiteUrl">
          复制站点链接
        </ElButton>
        <ElButton :disabled="!siteUrl" type="primary" @click="openSiteUrl">
          查看站点
        </ElButton>
      </div>
    </header>

    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      :closable="false"
      show-icon
    >
      <template #default>
        <ElButton link type="primary" @click="loadPublicationManagement">
          重新加载
        </ElButton>
      </template>
    </ElAlert>

    <ElTabs v-model="activeTab" class="docs-publication-settings-page__tabs">
      <ElTabPane label="单页公开" name="single">
        <SinglePublicationPanel
          :tree="singleTree"
          :site-pages="pages"
          :loading="isLoading"
          :updating-document-id="updatingSingleDocumentId"
          @refresh="reloadSinglePublications"
          @update-state="updateSinglePublicationState"
        />
      </ElTabPane>

      <ElTabPane label="站点设置" name="site-settings">
        <PublicationSiteSettingsPanel
          :site="site"
          :tree="singleTree"
          :loading="isLoading"
          :saving="isSiteMutating"
          @save="saveSiteSettings"
        />
      </ElTabPane>

      <ElTabPane label="站点内容" name="site-content">
        <PublicationSiteContentPanel
          :tree="singleTree"
          :sections="sections"
          :pages="pages"
          :loading="isLoading"
          :mutating="isSiteMutating"
          @create-section="createSection"
          @update-section="updateSection"
          @remove-section="deleteSection"
          @create-page="createPage"
          @update-page="updatePage"
          @remove-page="deletePage"
        />
      </ElTabPane>

      <ElTabPane label="顶部导航" name="site-nav">
        <PublicationSiteNavPanel
          :sections="sections"
          :pages="pages"
          :nav-items="navItems"
          :saving="isSiteMutating"
          @save="saveNavItems"
        />
      </ElTabPane>
    </ElTabs>
  </section>
</template>

<style scoped lang="scss">
.docs-publication-settings-page {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--brand-fill-lighter) 22%, transparent), transparent 16rem),
    var(--brand-bg-base);
}

.docs-publication-settings-page__tabs {
  min-width: 0;

  :deep(.el-tabs__header) {
    margin-bottom: 1.25rem;
  }

  :deep(.el-tabs__content) {
    overflow: visible;
  }
}
</style>
