<script setup lang="ts">
import type { Component } from 'vue'
import type {
  CreatePageDraft,
  PublicationSettingsTab,
  SiteConfigDraft,
  UpdateGroupDraft,
  UpdatePageDraft,
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
  PublicationSiteMediaKind,
  ReplacePublicationNavItemsRequest,
} from '@/apis/document-publication'
import { Collection, DataAnalysis, Guide, Setting } from '@element-plus/icons-vue'
import {
  DOCUMENT_PUBLICATION_SITE_MEDIA_KIND,
  DOCUMENT_PUBLICATION_SITE_STATUS,
} from '@haohaoxue/samepage-contracts/document/publication/constants'
import { useRouteQuery } from '@vueuse/router'
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createPublicationPage,
  createPublicationSection,
  getPublicationSiteManagement,
  listDocumentSinglePublications,
  removePublicationPage,
  removePublicationSection,
  removePublicationSiteMedia,
  replacePublicationNavItems,
  updateDocumentSinglePublication,
  updatePublicationPage,
  updatePublicationSection,
  updatePublicationSiteMedia,
  updatePublicationSiteSettings,
} from '@/apis/document-publication'
import { useWorkspaceStore } from '@/stores/workspace'
import { ElMessage } from '@/utils/element-plus'
import PublicationOpenOverviewPanel from '../../components/publication-open-overview-panel'
import PublicationSiteConfigPanel from '../../components/publication-site-config-panel'
import PublicationSiteGroupPanel from '../../components/publication-site-group-panel'
import PublicationSiteNavigationPanel from '../../components/publication-site-navigation-panel'

const PUBLICATION_SITE_STATE_EVENT = 'samepage:publication-site-state-change'
const DEFAULT_PUBLICATION_SETTINGS_TAB: PublicationSettingsTab = 'open-overview'
const PUBLICATION_SETTINGS_TAB_VALUES = [
  'open-overview',
  'site-config',
  'site-groups',
  'site-navigation',
] as const satisfies PublicationSettingsTab[]

const workspaceStore = useWorkspaceStore()
const route = useRoute()
const router = useRouter()

const activeTab = useRouteQuery<string | string[] | undefined, PublicationSettingsTab>(
  'tab',
  undefined,
  {
    mode: 'replace',
    route,
    router,
    transform: {
      get: resolveRouteTab,
      set: tab => tab,
    },
  },
)
syncInitialActiveTabQuery()
const publicationOpenOverviewTree = shallowRef<DocumentSinglePublicationTreeItem[]>([])
const siteManagement = shallowRef<PublicationSiteManagementResponse | null>(null)
const isLoading = shallowRef(false)
const isSiteMutating = shallowRef(false)
const uploadingSiteMediaKind = shallowRef<PublicationSiteMediaKind | null>(null)
const updatingPublicationOpenOverviewDocumentId = shallowRef<string | null>(null)
const errorMessage = shallowRef('')

const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? '')
const site = computed<PublicationSite | null>(() => siteManagement.value?.site ?? null)
const siteGroups = computed<PublicationSection[]>(() => siteManagement.value?.sections ?? [])
const pages = computed<PublicationPage[]>(() => siteManagement.value?.pages ?? [])
const navItems = computed(() => siteManagement.value?.navItems ?? [])
const navigationItems = [
  {
    name: 'open-overview',
    label: '公开概览',
    icon: DataAnalysis,
  },
  {
    name: 'site-config',
    label: '站点配置',
    icon: Setting,
  },
  {
    name: 'site-groups',
    label: '站点分组',
    icon: Collection,
  },
  {
    name: 'site-navigation',
    label: '站点导航',
    icon: Guide,
  },
] satisfies Array<{ name: PublicationSettingsTab, label: string, icon: Component }>

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
    const [publicationOpenResponse, siteResponse] = await Promise.all([
      listDocumentSinglePublications(currentWorkspaceId.value),
      getPublicationSiteManagement(currentWorkspaceId.value),
    ])

    publicationOpenOverviewTree.value = publicationOpenResponse.tree
    applySiteManagement(siteResponse)
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载发布管理失败'
  }
  finally {
    isLoading.value = false
  }
}

async function reloadPublicationOpenOverviewTree() {
  if (!currentWorkspaceId.value) {
    return
  }

  const response = await listDocumentSinglePublications(currentWorkspaceId.value)
  publicationOpenOverviewTree.value = response.tree
}

async function updatePublicationOpenOverviewState(
  documentId: string,
  state: DocumentSinglePublicationState,
  scope?: DocumentSinglePublicationScope,
) {
  if (updatingPublicationOpenOverviewDocumentId.value) {
    return
  }

  updatingPublicationOpenOverviewDocumentId.value = documentId

  try {
    await updateDocumentSinglePublication(documentId, {
      state,
      ...(scope ? { scope } : {}),
    })
    await reloadPublicationOpenOverviewTree()
    ElMessage.success('公开状态已更新')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新公开状态失败')
  }
  finally {
    updatingPublicationOpenOverviewDocumentId.value = null
  }
}

async function saveSiteConfig(payload: SiteConfigDraft) {
  await runSiteMutation(async () => {
    applySiteManagement(await updatePublicationSiteSettings({
      workspaceId: currentWorkspaceId.value,
      ...payload,
    }))
    ElMessage.success('站点配置已保存')
  }, '保存站点配置失败')
}

async function uploadSiteMedia(kind: PublicationSiteMediaKind, file: File) {
  if (!currentWorkspaceId.value || isSiteMutating.value) {
    return
  }

  uploadingSiteMediaKind.value = kind

  try {
    await runSiteMutation(async () => {
      applySiteManagement(await updatePublicationSiteMedia(currentWorkspaceId.value, kind, file))
      ElMessage.success(kind === DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.LOGO ? '站点 Logo 已上传' : '首页 Logo 已上传')
    }, '上传站点图片失败')
  }
  finally {
    uploadingSiteMediaKind.value = null
  }
}

async function removeSiteMedia(kind: PublicationSiteMediaKind) {
  if (!currentWorkspaceId.value || isSiteMutating.value) {
    return
  }

  uploadingSiteMediaKind.value = kind

  try {
    await runSiteMutation(async () => {
      applySiteManagement(await removePublicationSiteMedia(currentWorkspaceId.value, kind))
      ElMessage.success(kind === DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.LOGO ? '站点 Logo 已移除' : '首页 Logo 已移除')
    }, '移除站点图片失败')
  }
  finally {
    uploadingSiteMediaKind.value = null
  }
}

async function createGroup(title: string) {
  await runSiteMutation(async () => {
    applySiteManagement(await createPublicationSection({
      workspaceId: currentWorkspaceId.value,
      title,
      order: siteGroups.value.length,
    }))
    ElMessage.success('分组已创建')
  }, '创建分组失败')
}

async function updateGroup(groupId: string, payload: UpdateGroupDraft, options?: { silent?: boolean }) {
  await runSiteMutation(async () => {
    applySiteManagement(await updatePublicationSection(groupId, {
      workspaceId: currentWorkspaceId.value,
      ...payload,
    }))

    if (!options?.silent) {
      ElMessage.success('分组已更新')
    }
  }, '更新分组失败')
}

async function deleteGroup(groupId: string) {
  await runSiteMutation(async () => {
    applySiteManagement(await removePublicationSection(groupId, currentWorkspaceId.value))
    ElMessage.success('分组已删除')
  }, '删除分组失败')
}

async function createPage(payload: CreatePageDraft) {
  await runSiteMutation(async () => {
    applySiteManagement(await createPublicationPage({
      workspaceId: currentWorkspaceId.value,
      ...payload,
    }))
    ElMessage.success('页面已加入站点')
  }, '添加站点页面失败')
}

async function updatePage(pageId: string, payload: UpdatePageDraft) {
  await runSiteMutation(async () => {
    applySiteManagement(await updatePublicationPage(pageId, {
      workspaceId: currentWorkspaceId.value,
      ...payload,
    }))
    ElMessage.success('站点页面已更新')
  }, '更新站点页面失败')
}

async function removePage(pageId: string) {
  await runSiteMutation(async () => {
    applySiteManagement(await removePublicationPage(pageId, currentWorkspaceId.value))
    ElMessage.success('页面已移出站点')
  }, '移出站点页面失败')
}

async function reorderPages(orders: Array<{ pageId: string, order: number }>) {
  await runSiteMutation(async () => {
    let nextSiteManagement: PublicationSiteManagementResponse | null = null

    for (const item of orders) {
      nextSiteManagement = await updatePublicationPage(item.pageId, {
        workspaceId: currentWorkspaceId.value,
        order: item.order,
      })
    }

    if (nextSiteManagement) {
      applySiteManagement(nextSiteManagement)
    }

    ElMessage.success('站点页面顺序已更新')
  }, '更新站点页面顺序失败')
}

async function saveSiteNavigationItems(items: PublicationNavItemInput[]) {
  await runSiteMutation(async () => {
    const payload: ReplacePublicationNavItemsRequest = {
      workspaceId: currentWorkspaceId.value,
      items,
    }

    applySiteManagement(await replacePublicationNavItems(payload))
    ElMessage.success('站点导航已保存')
  }, '保存站点导航失败')
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

function syncPublicationSiteState(nextSite: PublicationSite | null) {
  window.dispatchEvent(new CustomEvent(PUBLICATION_SITE_STATE_EVENT, {
    detail: nextSite
      ? {
          id: nextSite.id,
          active: nextSite.status === DOCUMENT_PUBLICATION_SITE_STATUS.ACTIVE,
        }
      : null,
  }))
}

function applySiteManagement(nextSiteManagement: PublicationSiteManagementResponse) {
  siteManagement.value = nextSiteManagement
  syncPublicationSiteState(nextSiteManagement.site)
}

function resolveRouteTab(tabQuery: unknown): PublicationSettingsTab {
  const tab = Array.isArray(tabQuery) ? tabQuery[0] : tabQuery

  if (typeof tab !== 'string') {
    return DEFAULT_PUBLICATION_SETTINGS_TAB
  }

  return isPublicationSettingsTab(tab) ? tab : DEFAULT_PUBLICATION_SETTINGS_TAB
}

function syncInitialActiveTabQuery() {
  if (!isRouteTabQueryValid(route.query.tab)) {
    activeTab.value = DEFAULT_PUBLICATION_SETTINGS_TAB
  }
}

function isRouteTabQueryValid(tabQuery: unknown): boolean {
  const tab = Array.isArray(tabQuery) ? tabQuery[0] : tabQuery

  return typeof tab === 'string' && isPublicationSettingsTab(tab)
}

function isPublicationSettingsTab(tab: string): tab is PublicationSettingsTab {
  return PUBLICATION_SETTINGS_TAB_VALUES.includes(tab as PublicationSettingsTab)
}
</script>

<template>
  <section class="docs-publication-settings-page flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-[clamp(1rem,2vw,1.5rem)]">
    <ElAlert
      v-if="errorMessage"
      class="docs-publication-settings-page__alert mx-auto w-full max-w-[96rem]"
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

    <div class="docs-publication-settings-page__shell mx-auto w-full overflow-hidden rounded-[1.35rem] border bg-surface">
      <div class="docs-publication-settings-page__layout grid min-h-[40rem] grid-cols-[12.25rem_minmax(0,1fr)] max-[920px]:grid-cols-1">
        <nav class="docs-publication-settings-page__nav flex flex-col gap-1 border-r px-3 py-4 max-[920px]:border-r-0 max-[920px]:border-b">
          <button
            v-for="item in navigationItems"
            :key="item.name"
            type="button"
            class="docs-publication-settings-page__nav-item flex min-h-12 items-center gap-3 rounded-xl border-0 bg-transparent px-3.5 text-left text-sm font-medium text-secondary"
            :class="{ 'is-active': activeTab === item.name }"
            @click="activeTab = item.name"
          >
            <ElIcon class="text-base">
              <component :is="item.icon" />
            </ElIcon>
            <span class="truncate">{{ item.label }}</span>
          </button>
        </nav>

        <main class="docs-publication-settings-page__main min-w-0 p-6 max-[920px]:p-4">
          <PublicationOpenOverviewPanel
            v-if="activeTab === 'open-overview'"
            :tree="publicationOpenOverviewTree"
            :loading="isLoading"
            :updating-document-id="updatingPublicationOpenOverviewDocumentId"
            @update-state="updatePublicationOpenOverviewState"
          />

          <PublicationSiteConfigPanel
            v-else-if="activeTab === 'site-config'"
            :site="site"
            :loading="isLoading"
            :saving="isSiteMutating"
            :uploading-media-kind="uploadingSiteMediaKind"
            @save="saveSiteConfig"
            @upload-media="uploadSiteMedia"
            @remove-media="removeSiteMedia"
          />

          <PublicationSiteGroupPanel
            v-else-if="activeTab === 'site-groups'"
            :tree="publicationOpenOverviewTree"
            :groups="siteGroups"
            :pages="pages"
            :loading="isLoading"
            :mutating="isSiteMutating"
            @create-group="createGroup"
            @update-group="updateGroup"
            @remove-group="deleteGroup"
            @create-page="createPage"
            @update-page="updatePage"
            @remove-page="removePage"
            @reorder-pages="reorderPages"
          />

          <PublicationSiteNavigationPanel
            v-else
            :sections="siteGroups"
            :pages="pages"
            :nav-items="navItems"
            :saving="isSiteMutating"
            @save="saveSiteNavigationItems"
          />
        </main>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.docs-publication-settings-page {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--brand-fill-lighter) 38%, transparent), transparent 14rem),
    var(--brand-bg-base);
}

.docs-publication-settings-page__alert {
  margin-bottom: 1rem;
}

.docs-publication-settings-page__shell {
  border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  box-shadow: var(--brand-shadow-hairline);
}

.docs-publication-settings-page__nav {
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 88%, var(--brand-text-tertiary) 12%);
  background: color-mix(in srgb, var(--brand-bg-surface) 88%, var(--brand-fill-lighter));
  box-shadow: 1px 0 0 color-mix(in srgb, var(--brand-border-base) 88%, var(--brand-text-tertiary) 12%);
}

.docs-publication-settings-page__main {
  background: var(--brand-bg-surface);
}

.docs-publication-settings-page__nav-item {
  position: relative;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    color: var(--brand-text-primary);
    background: color-mix(in srgb, var(--brand-primary) 6%, transparent);
  }

  &.is-active {
    color: var(--brand-text-primary);
    background: color-mix(in srgb, var(--brand-primary) 12%, var(--brand-bg-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-primary) 20%, transparent);
  }
}

@media (max-width: 920px) {
  .docs-publication-settings-page__nav {
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 88%, var(--brand-text-tertiary) 12%);
    box-shadow: 0 1px 0 color-mix(in srgb, var(--brand-border-base) 88%, var(--brand-text-tertiary) 12%);
  }
}
</style>
