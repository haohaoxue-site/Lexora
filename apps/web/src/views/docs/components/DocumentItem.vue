<script setup lang="ts">
import type { DocumentItem, DocumentTreeCollectionId } from '@haohaoxue/samepage-contracts'
import { useDocumentItem } from '../composables/useDocumentItem'

interface DocumentItemProps {
  item: DocumentItem
  collectionId: DocumentTreeCollectionId
  depth: number
}

const props = defineProps<DocumentItemProps>()
const {
  canManageDocument,
  canShareDocument,
  createChild,
  getActionsStateClass,
  getExpandIconName,
  getItemStateClass,
  handleMenuCommand,
  isActionPending,
  isActive,
  isExpanded,
  openDocument,
  toggleItem,
} = useDocumentItem({
  collectionId: () => props.collectionId,
  item: () => props.item,
})
</script>

<template>
  <div
    class="document-tree-item"
    :style="{ paddingLeft: `${props.depth * 18}px` }"
    role="treeitem"
    :aria-level="props.depth + 1"
    :aria-expanded="props.item.hasChildren ? isExpanded : undefined"
    :aria-current="isActive ? 'page' : undefined"
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
        class="document-tree-item__actions"
        :class="getActionsStateClass()"
        @click.stop
      >
        <ElButton
          v-if="canManageDocument"
          text
          class="document-tree-item__icon-button"
          :class="getItemStateClass()"
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
            :class="getItemStateClass()"
            :disabled="isActionPending"
            title="更多操作"
            @click.stop
          >
            <SvgIcon category="ui" icon="more" size="14px" />
          </ElButton>

          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem
                command="open-new-tab"
                class="document-tree-item__menu-item"
              >
                <template #icon>
                  <SvgIcon category="ui" icon="document-menu-open-new" />
                </template>
                在新标签页打开
              </ElDropdownItem>

              <ElDropdownItem
                v-if="canShareDocument"
                command="share"
                divided
                class="document-tree-item__menu-item document-tree-item__menu-item--share"
              >
                <template #icon>
                  <SvgIcon category="ui" icon="document-menu-share" />
                </template>
                分享
              </ElDropdownItem>

              <ElDropdownItem
                command="copy-link"
                :divided="!canShareDocument"
                class="document-tree-item__menu-item"
              >
                <template #icon>
                  <SvgIcon category="ui" icon="document-menu-link" />
                </template>
                复制链接
              </ElDropdownItem>

              <ElDropdownItem
                v-if="canManageDocument"
                command="duplicate"
                divided
                class="document-tree-item__menu-item"
              >
                <template #icon>
                  <SvgIcon category="ui" icon="document-menu-copy" />
                </template>
                创建副本
              </ElDropdownItem>

              <ElDropdownItem
                v-if="canManageDocument"
                command="move"
                class="document-tree-item__menu-item"
              >
                <template #icon>
                  <SvgIcon category="ui" icon="document-menu-move" />
                </template>
                移动到
              </ElDropdownItem>

              <ElDropdownItem
                v-if="canManageDocument"
                command="rename"
                divided
                class="document-tree-item__menu-item"
              >
                <template #icon>
                  <SvgIcon category="ui" icon="document-menu-rename" />
                </template>
                重命名
              </ElDropdownItem>

              <ElDropdownItem
                v-if="canManageDocument"
                command="delete"
                divided
                class="document-tree-item__menu-item document-tree-item__menu-item--delete"
              >
                <template #icon>
                  <SvgIcon category="ui" icon="document-menu-delete" />
                </template>
                删除
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
        :depth="props.depth + 1"
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
