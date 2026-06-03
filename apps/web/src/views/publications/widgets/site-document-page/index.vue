<script setup lang="ts">
import type { PublicationSiteDocumentPageProps } from './typing'
import PublicationDocumentContent from '../../components/document-content'
import PublicationPageOutline from '../../components/page-outline'
import PublicationSidebarTree from '../../components/sidebar-tree'

const props = defineProps<PublicationSiteDocumentPageProps>()
</script>

<template>
  <div class="publication-site-document-page">
    <aside class="publication-site-document-page__sidebar">
      <PublicationSidebarTree
        :groups="props.sidebarGroups"
        :site-id="props.siteId"
        :active-document-id="props.document.documentId"
      />
    </aside>

    <main class="publication-site-document-page__content">
      <div class="publication-site-document-page__content-container">
        <PublicationDocumentContent
          :document="props.document"
          :body="props.body"
          layout="site"
        />
      </div>
    </main>

    <aside class="publication-site-document-page__aside">
      <div class="publication-site-document-page__aside-curtain" />
      <div class="publication-site-document-page__aside-container">
        <PublicationPageOutline :items="props.outline" />
      </div>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.publication-site-document-page {
  display: grid;
  min-height: calc(100vh - var(--publication-nav-height));
  min-width: 0;
  width: 100%;
  grid-template-columns: minmax(0, 1fr);
}

.publication-site-document-page__sidebar {
  box-sizing: border-box;
  position: sticky;
  top: var(--publication-nav-height);
  display: none;
  height: calc(100vh - var(--publication-nav-height));
  min-width: 0;
  align-self: start;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 2rem 2rem 6rem;
  border-right: 1px solid var(--publication-c-gutter);
  background: var(--publication-c-bg-alt);
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.publication-site-document-page__content {
  min-width: 0;
  padding: 2rem 1.5rem 6rem;
}

.publication-site-document-page__content-container {
  width: min(100%, 43rem);
  margin: 0 auto;
}

.publication-site-document-page__aside {
  box-sizing: border-box;
  position: sticky;
  top: var(--publication-nav-height);
  display: none;
  height: calc(100vh - var(--publication-nav-height));
  min-width: 0;
  align-self: start;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 3rem 2rem 2rem;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.publication-site-document-page__aside-curtain {
  position: fixed;
  bottom: 0;
  z-index: 10;
  display: none;
  width: 14rem;
  height: 2rem;
  background: linear-gradient(transparent, var(--publication-c-bg) 70%);
  pointer-events: none;
}

.publication-site-document-page__aside-container {
  min-height: calc(100vh - var(--publication-nav-height) - 3rem);
  padding-bottom: 2rem;
}

@media (min-width: 640px) {
  .publication-site-document-page__content {
    padding: 3rem 2rem 8rem;
  }
}

@media (min-width: 960px) {
  .publication-site-document-page {
    max-width: var(--publication-layout-max-width);
    margin: 0 auto;
    grid-template-columns: var(--publication-sidebar-width) minmax(0, 1fr);
  }

  .publication-site-document-page__sidebar {
    display: block;
  }

  .publication-site-document-page__content {
    padding: 3rem 2rem 8rem;
  }
}

@media (min-width: 1280px) {
  .publication-site-document-page {
    grid-template-columns: var(--publication-sidebar-width) minmax(0, 1fr) var(--publication-aside-width);
  }

  .publication-site-document-page__aside,
  .publication-site-document-page__aside-curtain {
    display: block;
  }
}
</style>
