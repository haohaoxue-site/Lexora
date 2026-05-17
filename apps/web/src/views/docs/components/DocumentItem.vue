<script setup lang="ts">
import type { DocumentItem, DocumentTreeCollectionId } from '@haohaoxue/samepage-contracts'
import { computed } from 'vue'
import { useDocumentItem } from '../composables/useDocumentItem'

interface DocumentItemProps {
  item: DocumentItem
  collectionId: DocumentTreeCollectionId
  selectionMode?: boolean
  checked?: boolean
  expanded?: boolean
}

const props = defineProps<DocumentItemProps>()
const {
  actionsStateClass,
  canManageDocument,
  createChild,
  handleMenuCommand,
  isActionPending,
  itemStateClass,
  menuItems,
} = useDocumentItem({
  collectionId: () => props.collectionId,
  item: () => props.item,
})

const treeIconName = computed(() => {
  if (props.item.hasChildren) {
    return props.expanded ? 'document-tree-folder-open' : 'document-tree-folder'
  }

  return props.item.hasContent ? 'document-tree-file' : 'document-tree-file-empty'
})
</script>

<template>
  <div class="document-tree-item">
    <div
      class="document-tree-item-surface"
      :class="[
        itemStateClass,
        {
          'is-expandable': props.item.hasChildren,
          'is-selection-mode': props.selectionMode,
          'selected': props.checked,
        },
      ]"
    >
      <div class="document-tree-item__open-button">
        <SvgIcon
          v-if="!props.selectionMode"
          category="ui"
          :icon="treeIconName"
          class="document-tree-item__node-icon"
        />
        <span class="document-tree-item__title">
          {{ props.item.title }}
        </span>
      </div>

      <div
        v-if="!props.selectionMode"
        class="document-tree-item__actions"
        :class="actionsStateClass"
        @click.stop
      >
        <ElButton
          v-if="canManageDocument"
          text
          class="document-tree-item__icon-button"
          :class="itemStateClass"
          :disabled="isActionPending"
          title="新建子文档"
          @click.stop="createChild"
        >
          <SvgIcon category="ui" icon="plus" size="14px" />
        </ElButton>

        <ElDropdown
          trigger="click"
          popper-class="document-tree-item__menu-popper"
          @command="handleMenuCommand"
        >
          <ElButton
            text
            class="document-tree-item__icon-button"
            data-testid="document-tree-item-menu-trigger"
            :class="itemStateClass"
            :disabled="isActionPending"
            title="更多操作"
            @click.stop
          >
            <SvgIcon category="ui" icon="more" size="14px" />
          </ElButton>

          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem
                v-for="menuItem in menuItems"
                :key="menuItem.command"
                :command="menuItem.command"
                :divided="menuItem.divided"
                class="document-tree-item__menu-item"
                :class="{ 'document-tree-item__menu-item--delete': menuItem.danger }"
              >
                <template #icon>
                  <SvgIcon category="ui" :icon="menuItem.icon" />
                </template>
                {{ menuItem.label }}
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.document-tree-item {
  width: 100%;
  min-width: 0;

  .document-tree-item-surface {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 100%;
    width: 100%;
    min-width: 0;
    padding: 0;
    transition:
      color 0.2s ease,
      opacity 0.2s ease;

    &.active {
      color: var(--brand-primary);

      .document-tree-item__title {
        font-weight: 500;
      }

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
        color: var(--brand-text-primary);
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
      gap: 0.375rem;
      flex: 1 1 0%;
      min-width: 0;
      padding: 0;
      border: none;
      background: transparent;
      text-align: left;
      color: inherit;

      &:focus-visible {
        outline: none;
      }
    }

    .document-tree-item__node-icon {
      flex-shrink: 0;
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

:global(.document-tree-item__menu-popper) {
  --el-dropdown-menuItem-hover-color: var(--brand-text-primary);
  --el-dropdown-menuItem-hover-fill: color-mix(in srgb, var(--brand-fill-lighter) 76%, var(--brand-text-primary) 6%);
}

:global(.document-tree-item__menu-popper .el-dropdown-menu) {
  box-sizing: border-box;
  width: 9.75rem;
  min-width: 0;
  padding: 0.3125rem;
}

:global(.document-tree-item__menu-popper .el-dropdown-menu__item.document-tree-item__menu-item) {
  gap: 0.35rem;
  box-sizing: border-box;
  width: 100%;
  min-height: 1.825rem;
  padding: 0 0.25rem;
  border-radius: 4px;
  font-size: 14px;
}

:global(.document-tree-item__menu-popper .el-dropdown-menu__item.document-tree-item__menu-item .el-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 1.25rem;
  width: 1.25rem;
  height: 1.25rem;
  margin-right: 0;
  color: color-mix(in srgb, var(--brand-text-secondary) 86%, transparent);
}

:global(.document-tree-item__menu-popper .el-dropdown-menu__item--divided) {
  margin: 0.375rem 0;
  border-top-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
}

:global(.document-tree-item__menu-popper .el-dropdown-menu__item:not(.is-disabled):focus:not(:focus-visible):not(:hover)) {
  background-color: transparent;
  color: var(--brand-text-primary);
}

:global(.document-tree-item__menu-popper .el-dropdown-menu__item.document-tree-item__menu-item--delete) {
  color: var(--brand-error);
}

:global(.document-tree-item__menu-popper .el-dropdown-menu__item.document-tree-item__menu-item--delete .el-icon) {
  color: color-mix(in srgb, var(--brand-error) 80%, var(--brand-text-secondary));
}

:global(.document-tree-item__menu-popper .el-dropdown-menu__item.document-tree-item__menu-item--delete:not(.is-disabled):hover),
:global(.document-tree-item__menu-popper .el-dropdown-menu__item.document-tree-item__menu-item--delete:not(.is-disabled):focus) {
  background: color-mix(in srgb, var(--brand-error) 9%, white);
  color: var(--brand-error);
}
</style>
