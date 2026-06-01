<script setup lang="ts">
import type { PublicationSiteDocumentPageProps } from './typing'
import PublicationDocumentContent from '../../components/document-content'
import PublicationPageOutline from '../../components/page-outline'
import PublicationSidebarTree from '../../components/sidebar-tree'

const props = defineProps<PublicationSiteDocumentPageProps>()
</script>

<template>
  <div class="publication-site-document-page grid min-h-[calc(100vh-4rem)] grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)_minmax(11rem,14rem)] max-[1120px]:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] max-[860px]:grid-cols-1">
    <aside class="publication-site-document-page__sidebar sticky top-16 h-[calc(100vh-4rem)] self-start overflow-auto max-[860px]:hidden">
      <PublicationSidebarTree
        :groups="props.sidebarGroups"
        :site-id="props.siteId"
        :active-document-id="props.document.documentId"
      />
    </aside>

    <main class="publication-site-document-page__main flex min-w-0 justify-center">
      <PublicationDocumentContent
        :document="props.document"
        :body="props.body"
        layout="site"
      />
    </main>

    <aside class="publication-site-document-page__outline sticky top-16 h-[calc(100vh-4rem)] self-start overflow-auto max-[1120px]:hidden">
      <PublicationPageOutline :items="props.outline" />
    </aside>
  </div>
</template>

<style scoped lang="scss">
.publication-site-document-page__sidebar {
  padding: 1.4rem 1.15rem 2.5rem max(1.25rem, calc((100vw - 82rem) / 2));
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 64%, transparent);
  background: color-mix(in srgb, var(--brand-fill-blank) 34%, transparent);
}

.publication-site-document-page__outline {
  padding: 3.5rem max(1rem, calc((100vw - 82rem) / 2)) 2rem 1.5rem;
  border-left: 1px solid color-mix(in srgb, var(--brand-border-base) 64%, transparent);
}
</style>
