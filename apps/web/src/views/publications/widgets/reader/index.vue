<script setup lang="ts">
import type {
  PublicationRenderedDocument,
  PublicationSingleDocumentResponse,
  PublicationSiteRenderResponse,
  TiptapJsonContent,
} from '@haohaoxue/samepage-contracts'
import {
  collectDocumentAssetIds,
  hydrateDocumentAssetAttributes,
} from '@haohaoxue/samepage-shared'
import { computed, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  getPublicationSiteRender,
  getSinglePublicDocument,
  resolveDocumentPublicationAssets,
  resolveSinglePublicationAssets,
} from '@/apis/document-publication'
import { usePublicationDocumentMeta } from '../../composables/usePublicationDocumentMeta'
import PublicationTopNav from '../../layouts/top-nav'
import {
  resolvePublicationNavItems,
  rewritePublicationInternalLinks,
} from '../../utils/publicationRendering'
import PublicationHomePage from '../home-page'
import PublicationSingleDocumentPage from '../single-document-page'
import PublicationSiteDocumentPage from '../site-document-page'

const route = useRoute()
const isLoading = shallowRef(true)
const errorMessage = shallowRef('')
const singleDocument = shallowRef<PublicationRenderedDocument | null>(null)
const siteRender = shallowRef<PublicationSiteRenderResponse | null>(null)
const hydratedBody = shallowRef<TiptapJsonContent>([])
let loadToken = 0

const publicationMode = computed(() => route.name === 'publication-single' ? 'single' : 'site')
const singleDocumentId = computed(() => typeof route.params.documentId === 'string' ? route.params.documentId : '')
const siteId = computed(() => typeof route.params.siteId === 'string' ? route.params.siteId : '')
const siteDocumentId = computed(() =>
  publicationMode.value === 'site' && typeof route.params.documentId === 'string'
    ? route.params.documentId
    : null,
)
const resolvedNavItems = computed(() => siteRender.value
  ? resolvePublicationNavItems({
      groups: siteRender.value.sidebarGroups,
      items: siteRender.value.navItems,
      siteId: siteRender.value.site.id,
    })
  : [],
)
const activeDocument = computed(() => publicationMode.value === 'single'
  ? singleDocument.value
  : siteRender.value?.currentPage ?? null,
)
const pageTitle = computed(() => {
  if (publicationMode.value === 'single') {
    return singleDocument.value?.title || '公开文档'
  }

  const site = siteRender.value?.site

  if (!site) {
    return '公开文档'
  }

  return siteRender.value?.currentPage
    ? `${siteRender.value.currentPage.title} - ${site.title}`
    : site.title
})
const allowIndexing = computed(() =>
  publicationMode.value === 'site' && Boolean(siteRender.value?.site.allowIndexing),
)

watch(
  () => route.fullPath,
  () => {
    void loadPublication()
  },
  { immediate: true },
)

usePublicationDocumentMeta({
  allowIndexing,
  title: pageTitle,
})

async function loadPublication() {
  const currentToken = ++loadToken
  isLoading.value = true
  errorMessage.value = ''

  try {
    if (publicationMode.value === 'single') {
      await loadSinglePublication(currentToken)
      return
    }

    await loadSitePublication(currentToken)
  }
  catch (error) {
    if (currentToken !== loadToken) {
      return
    }

    singleDocument.value = null
    siteRender.value = null
    hydratedBody.value = []
    errorMessage.value = error instanceof Error ? error.message : '公开文档不存在或已下架'
  }
  finally {
    if (currentToken === loadToken) {
      isLoading.value = false
    }
  }
}

async function loadSinglePublication(currentToken: number) {
  if (!singleDocumentId.value) {
    throw new Error('公开文档不存在或已下架')
  }

  const response = await getSinglePublicDocument(singleDocumentId.value)
  const body = await hydrateSinglePublicationBody(response)

  if (currentToken !== loadToken) {
    return
  }

  singleDocument.value = response.document
  siteRender.value = null
  hydratedBody.value = body
}

async function loadSitePublication(currentToken: number) {
  if (!siteId.value) {
    throw new Error('公开站点不存在或已下架')
  }

  const response = await getPublicationSiteRender(siteId.value, siteDocumentId.value)
  const body = response.currentPage
    ? await hydrateSitePublicationBody(response)
    : []

  if (currentToken !== loadToken) {
    return
  }

  siteRender.value = response
  singleDocument.value = null
  hydratedBody.value = body
}

async function hydrateSinglePublicationBody(
  response: PublicationSingleDocumentResponse,
): Promise<TiptapJsonContent> {
  const bodyWithLinks = rewritePublicationInternalLinks(response.document.body, response.internalLinks)
  const assetIds = Array.from(new Set([...response.assetIds, ...collectDocumentAssetIds(bodyWithLinks)]))

  if (!assetIds.length) {
    return bodyWithLinks
  }

  const resolvedAssets = await resolveSinglePublicationAssets(response.document.documentId, { assetIds })
  return hydrateDocumentAssetAttributes(
    bodyWithLinks,
    Object.fromEntries(resolvedAssets.assets.map(asset => [asset.id, asset])),
  )
}

async function hydrateSitePublicationBody(
  response: PublicationSiteRenderResponse,
): Promise<TiptapJsonContent> {
  if (!response.currentPage) {
    return []
  }

  const bodyWithLinks = rewritePublicationInternalLinks(response.currentPage.body, response.internalLinks)
  const assetIds = collectDocumentAssetIds(bodyWithLinks)

  if (!assetIds.length) {
    return bodyWithLinks
  }

  const resolvedAssets = await resolveDocumentPublicationAssets(
    response.site.id,
    response.currentPage.documentId,
    { assetIds },
  )

  return hydrateDocumentAssetAttributes(
    bodyWithLinks,
    Object.fromEntries(resolvedAssets.assets.map(asset => [asset.id, asset])),
  )
}
</script>

<template>
  <section class="publication-view" :class="`publication-view--${publicationMode}`">
    <div v-if="isLoading" class="publication-view__loading mx-auto mt-16 w-[min(52rem,calc(100%-2rem))]">
      <ElSkeleton :rows="8" animated />
    </div>

    <ElResult
      v-else-if="errorMessage"
      icon="warning"
      title="无法查看文档"
      :sub-title="errorMessage"
      class="publication-view__result mx-auto mt-16 w-[min(52rem,calc(100%-2rem))]"
    />

    <template v-else-if="publicationMode === 'single' && activeDocument">
      <PublicationSingleDocumentPage
        :document="activeDocument"
        :body="hydratedBody"
      />
    </template>

    <template v-else-if="siteRender">
      <PublicationTopNav
        :site="siteRender.site"
        :nav-items="resolvedNavItems"
      />

      <PublicationSiteDocumentPage
        v-if="siteRender.currentPage"
        :document="siteRender.currentPage"
        :body="hydratedBody"
        :outline="siteRender.outline"
        :sidebar-groups="siteRender.sidebarGroups"
        :site-id="siteRender.site.id"
      />

      <PublicationHomePage
        v-else
        :site="siteRender.site"
        :home="siteRender.home"
      />
    </template>
  </section>
</template>

<style scoped lang="scss">
.publication-view {
  min-height: 100vh;
  background: var(--brand-bg-surface);
  color: var(--brand-text-primary);
}

.publication-view--site {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--brand-fill-blank) 42%, transparent) 0, transparent 18rem),
    var(--brand-bg-surface);
}
</style>
