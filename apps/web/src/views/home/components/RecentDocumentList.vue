<script setup lang="ts">
import type { RecentDocumentListProps } from '../typing'
import { useRecentDocumentList } from '../composables/useRecentDocumentList'

defineProps<RecentDocumentListProps>()
const { formatDocumentLocation, formatDocumentUpdatedAt } = useRecentDocumentList()
</script>

<template>
  <ElCard shadow="never" body-class="recent-document-list__body" class="recent-document-list">
    <div class="recent-document-list__header">
      <div>
        <h3 class="recent-document-list__title">
          最近文档
        </h3>
      </div>
      <ElTag effect="plain" round size="small">
        {{ documents.length }} 篇文档
      </ElTag>
    </div>

    <div v-if="documents.length" class="recent-document-list__list">
      <RouterLink
        v-for="document in documents"
        :key="document.id"
        :to="document.link"
        class="recent-document-list__item"
      >
        <div class="recent-document-list__icon-shell">
          <SvgIcon category="ui" icon="doc-card" size="1.5rem" class="recent-document-list__icon" />
        </div>

        <div class="recent-document-list__copy">
          <div class="recent-document-list__item-header">
            <h4 class="recent-document-list__item-title">
              {{ document.title }}
            </h4>
            <span class="recent-document-list__updated-at">
              更新于 {{ formatDocumentUpdatedAt(document.updatedAt) }}
            </span>
          </div>
          <div class="recent-document-list__source">
            <SvgIcon category="ui" icon="folder-chip" size="0.875rem" class="recent-document-list__source-icon" />
            <p class="recent-document-list__source-text">
              {{ formatDocumentLocation(document.collection, document.ancestorTitles) }}
            </p>
          </div>
        </div>
      </RouterLink>
    </div>

    <ElEmpty v-else description="暂无内容" />
  </ElCard>
</template>

<style scoped lang="scss">
.recent-document-list {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  border-radius: 1.75rem;
  box-shadow: 0 1px 2px 0 color-mix(in srgb, var(--brand-text-primary) 5%, transparent);

  :deep(.recent-document-list__body) {
    padding: 1.5rem;
  }

  .recent-document-list__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .recent-document-list__title {
    color: var(--brand-text-primary);
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.75rem;
  }

  .recent-document-list__list {
    display: grid;
    gap: 0.75rem;
  }

  .recent-document-list__item {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
    border-radius: 1rem;
    color: var(--brand-text-primary);
    text-decoration: none;
    background: var(--brand-bg-surface-raised);
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease;

    &:hover {
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      background: var(--brand-bg-surface);
    }
  }

  .recent-document-list__icon-shell {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 1rem;
    color: var(--brand-primary);
    background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  }

  .recent-document-list__icon {
    display: block;
  }

  .recent-document-list__copy {
    flex: 1 1 0%;
    min-width: 0;
  }

  .recent-document-list__item-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .recent-document-list__item-title {
    flex: 1 1 0%;
    min-width: 0;
    overflow: hidden;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-document-list__updated-at {
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
  }

  .recent-document-list__source {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.375rem;
    min-width: 0;
    color: color-mix(in srgb, var(--brand-text-secondary) 90%, var(--brand-primary) 10%);
  }

  .recent-document-list__source-icon {
    flex-shrink: 0;
    display: block;
  }

  .recent-document-list__source-text {
    min-width: 0;
    overflow: hidden;
    font-size: 0.75rem;
    line-height: 1.5;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
