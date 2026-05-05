<script setup lang="ts">
import type {
  DocumentContextActionsEmits,
} from '../typing'
import { useDocumentContextActions } from '../composables/useDocumentContextActions'

const props = defineProps<{
  canDeleteDocument: boolean
  canMoveToTeam: boolean
}>()
const emits = defineEmits<DocumentContextActionsEmits>()
const { handleCommand, handleVisibleChange } = useDocumentContextActions(props, {
  onOpenHistory: () => emits('openHistory'),
  onMoveDocumentToTeam: () => emits('moveDocumentToTeam'),
  onDeleteDocument: () => emits('deleteDocument'),
})
</script>

<template>
  <ElDropdown
    trigger="click"
    placement="bottom-end"
    :offset="10"
    @command="handleCommand"
    @visible-change="handleVisibleChange"
  >
    <ElButton text circle>
      <SvgIcon category="ui" icon="more-diamond" />
    </ElButton>

    <template #dropdown>
      <ElDropdownMenu class="document-context-menu">
        <ElDropdownItem command="history" class="document-context-menu__item">
          <span class="document-context-menu__item-main">
            <span class="document-context-menu__icon">
              <SvgIcon category="ui" icon="history" size="14px" />
            </span>
            <span class="document-context-menu__label">历史记录</span>
          </span>
        </ElDropdownItem>

        <ElDropdownItem
          v-if="props.canMoveToTeam"
          command="move-to-team"
          class="document-context-menu__item"
        >
          <span class="document-context-menu__item-main">
            <span class="document-context-menu__icon">
              <SvgIcon category="ui" icon="user-group" size="14px" />
            </span>
            <span class="document-context-menu__label">移到团队</span>
          </span>
        </ElDropdownItem>

        <ElDropdownItem
          v-if="props.canDeleteDocument"
          command="delete"
          divided
          class="document-context-menu__item is-danger"
        >
          <span class="document-context-menu__item-main">
            <span class="document-context-menu__icon">
              <SvgIcon category="ui" icon="trash-can" size="14px" />
            </span>
            <span class="document-context-menu__label">移到回收站</span>
          </span>
        </ElDropdownItem>
      </ElDropdownMenu>
    </template>
  </ElDropdown>
</template>

<style scoped lang="scss">
.document-context-menu {
  width: 160px;

  :deep(.document-context-menu__item) {
    margin: 1px 3px;
    height: 32px;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    color: var(--brand-text-primary);
    border-radius: 4px;
    font-size: 14px;

    &:not(.is-disabled):hover,
    &:not(.is-disabled):focus-visible {
      background: rgba(31, 35, 41, 0.08);
    }

    &.is-danger {
      &:not(.is-disabled):hover,
      &:not(.is-disabled):focus-visible {
        background: color-mix(in srgb, var(--brand-error) 18%, white);
        color: var(--brand-error);
      }
    }
  }

  &__item-main {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 8px;
  }
}
</style>
