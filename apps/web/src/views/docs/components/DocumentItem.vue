<script setup lang="ts">
import type { DocumentItemEmits, DocumentItemProps } from '../typing'
import { useDocumentItem } from '../composables/useDocumentItem'

const props = defineProps<DocumentItemProps>()
const emits = defineEmits<DocumentItemEmits>()
const {
  canManageDocument,
  canShareDocument,
  canMoveToTeam,
  getActionsStateClass,
  getExpandIconName,
  getItemStateClass,
  handleMenuCommand,
  isExpanded,
  openDocument,
  toggleItem,
} = useDocumentItem(props, {
  onDeleteDocument: documentId => emits('deleteDocument', documentId),
  onMoveDocumentToTeam: documentId => emits('moveDocumentToTeam', documentId),
  onOpen: documentId => emits('open', documentId),
  onShareDocument: documentId => emits('shareDocument', documentId),
  onToggle: documentId => emits('toggle', documentId),
})
</script>

<template>
  <div
    class="document-tree-item"
    :style="{ paddingLeft: `${props.depth * 18}px` }"
    role="treeitem"
    :aria-level="props.depth + 1"
    :aria-expanded="props.item.hasChildren ? isExpanded : undefined"
    :aria-current="props.activeDocumentId === props.item.id ? 'page' : undefined"
  >
    <div
      class="document-tree-item-surface"
      :class="[getItemStateClass(), { 'is-expandable': props.item.hasChildren }]"
    >
      <ElButton
        v-if="props.item.hasChildren"
        text
        class="document-tree-item__icon-button"
        :class="getItemStateClass()"
        :aria-expanded="isExpanded"
        @click.stop="toggleItem"
      >
        <SvgIcon category="ui" :icon="getExpandIconName()" size="13px" />
      </ElButton>

      <div v-else class="h-5 w-5 shrink-0" />

      <button
        type="button"
        class="document-tree-item__open-button"
        :class="getItemStateClass()"
        @click="openDocument"
      >
        <span class="document-tree-item__title" :class="getItemStateClass()">
          {{ props.item.title }}
        </span>
      </button>

      <div
        v-if="canManageDocument"
        class="document-tree-item__actions"
        :class="getActionsStateClass()"
        @click.stop
      >
        <ElButton
          text
          class="document-tree-item__icon-button"
          :class="getItemStateClass()"
          :disabled="props.isActionPending"
          title="新建子文档"
          @click.stop="emits('createChild', props.item.id)"
        >
          <SvgIcon category="ui" icon="plus" size="14px" />
        </ElButton>

        <ElDropdown trigger="click" @command="handleMenuCommand">
          <ElButton
            text
            class="document-tree-item__icon-button"
            data-testid="document-tree-item-menu-trigger"
            :class="getItemStateClass()"
            :disabled="props.isActionPending"
            title="更多操作"
            @click.stop
          >
            <SvgIcon category="ui" icon="more" size="14px" />
          </ElButton>

          <template #dropdown>
            <ElDropdownMenu class="document-tree-item__menu">
              <ElDropdownItem
                v-if="canMoveToTeam"
                command="move-to-team"
                class="document-tree-item__menu-item document-tree-item__menu-item--move-to-team"
              >
                移到团队
              </ElDropdownItem>

              <ElDropdownItem
                v-if="canShareDocument"
                command="share"
                class="document-tree-item__menu-item document-tree-item__menu-item--share"
              >
                分享
              </ElDropdownItem>

              <ElDropdownItem
                command="delete"
                class="document-tree-item__menu-item document-tree-item__menu-item--delete !text-danger"
              >
                移到回收站
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
      </div>
    </div>

    <div v-if="props.item.hasChildren && isExpanded" role="group" class="mt-1 space-y-0.5">
      <DocumentItem
        v-for="child in props.item.children"
        :key="child.id"
        :item="child"
        :collection-id="props.collectionId"
        :current-workspace-type="props.currentWorkspaceType"
        :depth="props.depth + 1"
        :active-document-id="props.activeDocumentId"
        :expanded-document-ids="props.expandedDocumentIds"
        :is-action-pending="props.isActionPending"
        :can-share-document="props.canShareDocument"
        @open="emits('open', $event)"
        @toggle="emits('toggle', $event)"
        @create-child="emits('createChild', $event)"
        @move-document-to-team="emits('moveDocumentToTeam', $event)"
        @share-document="emits('shareDocument', $event)"
        @delete-document="emits('deleteDocument', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.document-tree-item {
  .document-tree-item-surface {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.375rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease;

    &:focus-within {
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      background: var(--brand-fill-lighter);
    }

    &.active {
      color: var(--brand-primary);
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
      box-shadow:
        0 1px 2px 0 color-mix(in srgb, var(--brand-primary) 6%, transparent),
        0 1px 2px 0 color-mix(in srgb, var(--brand-text-primary) 5%, transparent);

      :deep(.el-button) {
        --el-button-border-color: transparent;
        --el-button-hover-bg-color: transparent;
        --el-button-hover-text-color: var(--brand-primary);
        --el-button-active-bg-color: transparent;
        --el-button-active-text-color: var(--brand-primary);
        --el-button-outline-color: transparent;
        --el-button-hover-border-color: transparent;
        --el-button-active-border-color: transparent;
        box-shadow: none;
      }
    }

    &.idle {
      &:hover {
        background: var(--brand-fill-lighter);
      }
    }

    .document-tree-item__icon-button {
      --el-button-text-color: var(--brand-text-secondary);
      --el-button-border-color: transparent;
      --el-button-hover-border-color: transparent;
      --el-button-active-border-color: transparent;
      --el-button-hover-text-color: var(--brand-primary);
      --el-button-active-text-color: var(--brand-primary);
      --el-button-hover-bg-color: var(--brand-bg-surface-raised);
      --el-button-active-bg-color: var(--brand-bg-surface-raised);
      margin-left: 0;
      min-width: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
      padding: 0;
      border-radius: 0.375rem;
      color: var(--brand-text-secondary);
      box-shadow: none;

      &:disabled {
        opacity: 0.3;
      }

      &.active {
        --el-button-hover-bg-color: transparent;
        --el-button-active-bg-color: transparent;
        color: var(--brand-primary);
      }

      &.idle {
        &:hover {
          color: var(--brand-primary);
          background: var(--brand-bg-surface-raised);
        }
      }
    }

    .document-tree-item__open-button {
      display: flex;
      align-items: center;
      flex: 1 1 0%;
      min-width: 0;
      padding: 0;
      border: none;
      background: transparent;
      text-align: left;
      cursor: pointer;

      &:focus-visible {
        outline: none;
      }
    }

    .document-tree-item__title {
      display: block;
      flex: 1 1 0%;
      min-width: 0;
      overflow: hidden;
      font-size: 13px;
      line-height: 1.25rem;
      text-overflow: ellipsis;
      white-space: nowrap;

      &.active {
        color: var(--brand-primary);
        font-weight: 500;
      }

      &.idle {
        color: var(--brand-text-secondary);
      }
    }

    .document-tree-item__actions {
      display: flex;
      align-items: center;
      gap: 1px;
      margin-left: auto;
      transition: opacity 0.2s ease;

      &.visible {
        opacity: 1;
      }

      &.hidden {
        pointer-events: none;
        opacity: 0;
      }
    }

    &:hover .document-tree-item__actions.hidden,
    &:focus-within .document-tree-item__actions.hidden {
      pointer-events: auto;
      opacity: 1;
    }
  }
}
</style>
