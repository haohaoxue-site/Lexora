<script setup lang="ts">
import type {
  DocumentHistoryPanelEmits,
  DocumentHistoryPanelProps,
} from '../typing'
import { useDocumentHistoryPanel } from '../composables/useDocumentHistoryPanel'

const props = defineProps<DocumentHistoryPanelProps>()
const emits = defineEmits<DocumentHistoryPanelEmits>()
const {
  hasDocument,
  historySections,
  isGroupExpanded,
  selectEntry,
  toggleGroup,
  isEntrySelected,
  resolveEntryDetail,
} = useDocumentHistoryPanel({
  document: () => props.document,
  snapshots: () => props.snapshots,
  selectedSnapshotId: () => props.selectedSnapshotId,
  onSelect: snapshotId => emits('select', snapshotId),
})
</script>

<template>
  <aside class="document-history-panel">
    <div class="document-history-panel__header">
      <div class="document-history-panel__title">
        历史记录
      </div>
    </div>

    <div v-if="!hasDocument" class="document-history-panel__empty">
      选择文档后可查看历史记录
    </div>

    <div v-else-if="props.isLoading" class="document-history-panel__empty">
      正在加载历史记录...
    </div>

    <div v-else-if="!historySections.length" class="document-history-panel__empty">
      暂无历史记录
    </div>

    <div v-else class="document-history-panel__content">
      <section
        v-for="section in historySections"
        :key="section.id"
        class="document-history-panel__section"
      >
        <div class="document-history-panel__section-label">
          {{ section.label }}
        </div>

        <div class="document-history-panel__section-groups">
          <div
            v-for="group in section.groups"
            :key="group.id"
            class="document-history-panel__group"
          >
            <button
              v-if="group.collapsible"
              type="button"
              class="document-history-panel__group-header"
              @click="toggleGroup(group.id)"
            >
              <span
                class="document-history-panel__group-caret"
                :class="{ 'is-expanded': isGroupExpanded(group) }"
              >
                ▸
              </span>
              <span class="document-history-panel__group-label">
                {{ group.label }}
              </span>
              <span class="document-history-panel__group-count">
                {{ group.entries.length }} 条
              </span>
            </button>

            <div
              v-if="!group.collapsible || isGroupExpanded(group)"
              class="document-history-panel__group-entries"
            >
              <article
                v-for="entry in group.entries"
                :key="entry.snapshotId"
                class="document-history-panel__item"
                :class="{ 'is-selected': isEntrySelected(entry) }"
              >
                <button
                  type="button"
                  class="document-history-panel__item-button"
                  @click="selectEntry(entry.snapshotId)"
                >
                  <div class="document-history-panel__item-top">
                    <div class="document-history-panel__item-time">
                      {{ entry.timeLabel }}
                    </div>
                    <span v-if="entry.isCurrentContent" class="document-history-panel__item-status">
                      当前内容
                    </span>
                  </div>

                  <div
                    v-if="resolveEntryDetail(entry)"
                    class="document-history-panel__item-detail"
                  >
                    {{ resolveEntryDetail(entry) }}
                  </div>

                  <div class="document-history-panel__item-user">
                    <span class="document-history-panel__item-user-dot" />
                    <span>{{ entry.userDisplayName }}</span>
                  </div>
                </button>
              </article>
            </div>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.document-history-panel {
  display: flex;
  flex-direction: column;
  width: min(100%, 20rem);
  min-width: 18rem;
  border-left: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--brand-bg-surface) 94%, var(--brand-primary) 6%) 0%,
      var(--brand-bg-surface) 100%
    );

  .document-history-panel__header {
    padding: 1.125rem 1rem 0.875rem;
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  }

  .document-history-panel__title {
    color: var(--brand-text-primary);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .document-history-panel__empty {
    padding: 1rem;
    color: var(--brand-text-secondary);
    font-size: 13px;
    line-height: 1.6;
  }

  .document-history-panel__content {
    flex: 1 1 0%;
    overflow-y: auto;
    padding: 1rem 0.875rem 1.25rem;
  }

  .document-history-panel__section + .document-history-panel__section {
    margin-top: 1rem;
  }

  .document-history-panel__section-label {
    margin-bottom: 0.5rem;
    color: color-mix(in srgb, var(--brand-text-secondary) 80%, transparent);
    font-size: 12px;
    font-weight: 600;
  }

  .document-history-panel__section-groups {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .document-history-panel__group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .document-history-panel__group-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0.125rem 0;
    border: 0;
    background: transparent;
    color: var(--brand-text-secondary);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .document-history-panel__group-caret {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 0.75rem;
    color: color-mix(in srgb, var(--brand-primary) 78%, transparent);
    transition: transform 0.16s ease;

    &.is-expanded {
      transform: rotate(90deg);
    }
  }

  .document-history-panel__group-label {
    min-width: 0;
    font-weight: 600;
  }

  .document-history-panel__group-count {
    margin-left: auto;
    color: color-mix(in srgb, var(--brand-text-secondary) 72%, transparent);
  }

  .document-history-panel__group-entries {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .document-history-panel__item {
    position: relative;
    padding-left: 0.625rem;

    &::before {
      content: '';
      position: absolute;
      top: 0.625rem;
      bottom: 0.625rem;
      left: 0;
      width: 2px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--brand-border-base) 68%, transparent);
      transition: background-color 0.16s ease;
    }

    &.is-selected::before {
      background: color-mix(in srgb, var(--brand-primary) 82%, transparent);
    }
  }

  .document-history-panel__item-button {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    width: 100%;
    padding: 0.75rem 0.875rem;
    border: 0;
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--brand-bg-surface) 90%, white 10%);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      box-shadow 0.16s ease;

    &:hover {
      background: color-mix(in srgb, var(--brand-bg-surface) 84%, white 16%);
    }
  }

  .document-history-panel__item.is-selected .document-history-panel__item-button {
    background: color-mix(in srgb, var(--brand-primary) 12%, white 88%);
    box-shadow: 0 10px 28px color-mix(in srgb, var(--brand-primary) 10%, transparent);
  }

  .document-history-panel__item-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .document-history-panel__item-time {
    color: color-mix(in srgb, var(--brand-primary) 84%, transparent);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .document-history-panel__item-status {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-primary) 12%, white 88%);
    color: var(--brand-primary);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .document-history-panel__item-detail {
    color: var(--brand-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  .document-history-panel__item-user {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: color-mix(in srgb, var(--brand-text-secondary) 84%, transparent);
    font-size: 12px;
  }

  .document-history-panel__item-user-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-primary) 62%, transparent);
  }
}

@media (max-width: 1180px) {
  .document-history-panel {
    width: 100%;
    min-width: 0;
    border-left: 0;
    border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  }
}
</style>
