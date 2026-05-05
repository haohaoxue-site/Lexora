<script setup lang="ts">
import SharedDocumentAccessPage from './components/SharedDocumentAccessPage.vue'
import SharedDocumentReaderPage from './components/SharedDocumentReaderPage.vue'
import { useSharedDocs } from './composables/useSharedDocs'

const {
  surfaceState,
  access,
  document,
  activeBlockId,
  errorMessage,
  isActionPending,
  acceptShare,
  declineShare,
  reload,
} = useSharedDocs()
</script>

<template>
  <section class="shared-docs-view">
    <SharedDocumentReaderPage
      v-if="surfaceState === 'reader' && access && document"
      :document="document"
      :active-block-id="activeBlockId"
      :access="access"
      :is-action-pending="isActionPending"
      @accept="acceptShare"
      @decline="declineShare"
    />

    <SharedDocumentAccessPage
      v-else-if="surfaceState === 'confirm' && access"
      :access="access"
      :is-action-pending="isActionPending"
      @accept="acceptShare"
      @decline="declineShare"
    />

    <div v-else-if="surfaceState === 'loading'" class="shared-docs-view__loading">
      <ElSkeleton :rows="6" animated class="shared-docs-view__skeleton" />
    </div>

    <div v-else class="shared-docs-view__fallback">
      <ElEmpty :description="errorMessage || '暂时无法打开这篇分享文档。'">
        <template #image>
          <div class="shared-docs-view__fallback-icon">
            <SvgIcon category="ui" icon="info" size="1.6rem" />
          </div>
        </template>

        <ElButton type="primary" @click="reload">
          重新加载
        </ElButton>
      </ElEmpty>
    </div>
  </section>
</template>

<style scoped lang="scss">
.shared-docs-view {
  display: flex;
  flex: 1 1 0%;
  min-height: 100vh;
  background: var(--brand-bg-base);

  .shared-docs-view__loading,
  .shared-docs-view__fallback {
    display: flex;
    flex: 1 1 0%;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .shared-docs-view__skeleton {
    width: min(100%, 42rem);
    padding: 1.25rem;
    border-radius: 1rem;
    background: color-mix(in srgb, white 88%, var(--brand-bg-surface));
  }

  .shared-docs-view__fallback-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
    color: var(--brand-primary);
  }
}
</style>
