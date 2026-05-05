<script setup lang="ts">
import type {
  DocumentSectionPanelEmits,
  DocumentSectionPanelProps,
} from '../typing'
import { DOCUMENT_COLLECTION } from '@haohaoxue/samepage-contracts'
import { useDocumentSectionPanel } from '../composables/useDocumentSectionPanel'
import DocumentItem from './DocumentItem.vue'
import DocumentToolbar from './DocumentToolbar.vue'

const props = defineProps<DocumentSectionPanelProps>()
const emit = defineEmits<DocumentSectionPanelEmits>()
defineSlots<{
  headerAction?: (props: { group: DocumentSectionPanelProps['group'] }) => unknown
}>()
const { chevronIconName, displayLabel, toggleSection } = useDocumentSectionPanel(
  props,
  collectionId => emit('toggleCollapse', collectionId),
)
</script>

<template>
  <section class="document-tree-section">
    <div class="document-tree-section__header">
      <button
        type="button"
        class="document-tree-section__header-button"
        :aria-expanded="!props.isCollapsed"
        :aria-controls="`document-tree-section-group-${props.group.id}`"
        @click="toggleSection"
      >
        <span class="text-xs font-medium tracking-[0.08em]">{{ displayLabel }}</span>
        <SvgIcon
          category="ui"
          :icon="chevronIconName"
          size="0.875rem"
          class="document-tree-section__chevron"
        />
      </button>

      <div
        v-if="$slots.headerAction || (props.group.id !== DOCUMENT_COLLECTION.COLLABORATION && props.canCreateRoot !== false)"
        class="document-tree-section__header-actions"
      >
        <div v-if="$slots.headerAction" class="document-tree-section__header-extra" @click.stop>
          <slot name="headerAction" :group="props.group" />
        </div>

        <div
          v-if="props.group.id !== DOCUMENT_COLLECTION.COLLABORATION && props.canCreateRoot !== false"
          class="document-tree-section__toolbar"
          @click.stop
        >
          <DocumentToolbar
            :collection-id="props.group.id"
            :is-busy="props.isActionPending"
            @create-root="emit('createRoot', $event)"
          />
        </div>
      </div>
    </div>

    <div
      v-if="!props.isCollapsed && props.group.nodes.length"
      :id="`document-tree-section-group-${props.group.id}`"
      role="group"
      class="space-y-0.5"
    >
      <DocumentItem
        v-for="document in props.group.nodes"
        :key="document.id"
        :item="document"
        :collection-id="props.group.id"
        :current-workspace-type="props.currentWorkspaceType"
        :depth="0"
        :active-document-id="props.activeDocumentId"
        :expanded-document-ids="props.expandedDocumentIds"
        :is-action-pending="props.isActionPending"
        :can-share-document="props.canShareDocument"
        @open="emit('open', $event)"
        @toggle="emit('toggle', $event)"
        @create-child="emit('createChild', $event)"
        @move-document-to-team="emit('moveDocumentToTeam', $event)"
        @share-document="emit('shareDocument', $event)"
        @delete-document="emit('deleteDocument', $event)"
      />
    </div>

    <ElEmpty
      v-else-if="!props.isCollapsed"
      :image-size="48"
      :description="props.group.id === DOCUMENT_COLLECTION.COLLABORATION ? '还没有别人共享给你的文档' : '暂无文档'"
    />
  </section>
</template>

<style scoped lang="scss">
.document-tree-section {
  > .document-tree-section__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-block: 0.25rem;
    padding-inline: 0.5rem;
    border-radius: 0.5rem;
    .document-tree-section__header-button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.25rem;
      min-width: 0;
      width: 100%;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--brand-text-secondary);
      flex: 1;
      cursor: pointer;
      transition:
        background-color 0.2s ease,
        color 0.2s ease;

      &:hover {
        background: var(--brand-fill-light);
      }

      &:focus-visible {
        outline: none;
      }
    }

    .document-tree-section__toolbar {
      flex-shrink: 0;
      cursor: default;
    }

    .document-tree-section__header-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .document-tree-section__header-extra {
      display: inline-flex;
      align-items: center;
    }

    .document-tree-section__chevron {
      font-size: 0.875rem;
      opacity: 0;
      transform: translateX(-0.125rem);
      transition:
        opacity 0.2s ease,
        transform 0.2s ease;
    }

    &:hover .document-tree-section__chevron,
    &:focus-within .document-tree-section__chevron {
      opacity: 1;
      transform: translateX(0);
    }

    &:hover .document-tree-section__header-button,
    &:focus-within .document-tree-section__header-button {
      color: var(--brand-text-secondary);
    }
  }
}
</style>
