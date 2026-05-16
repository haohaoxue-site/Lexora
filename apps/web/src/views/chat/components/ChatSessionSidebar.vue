<script setup lang="ts">
import { useChatSessions } from '../composables/useChatSessions'
import { useChatSessionSidebar } from '../composables/useChatSessionSidebar'

const emit = defineEmits<{
  collapse: []
}>()
const { sessions } = useChatSessions()
const {
  confirmBatchDelete,
  enterSelectionMode,
  exitSelectionMode,
  getSessionItemStateClass,
  handleSessionAction,
  handleSessionClick,
  hasSelectedSessions,
  isBatchDeleting,
  isSelectionMode,
  isSessionSelected,
  selectedCount,
} = useChatSessionSidebar()
</script>

<template>
  <aside class="chat-session-sidebar">
    <div class="chat-session-sidebar__header">
      <template v-if="isSelectionMode">
        <span class="chat-session-sidebar__selection-count">已选 {{ selectedCount }} 项</span>
        <div class="chat-session-sidebar__header-actions">
          <ElButton
            text
            size="small"
            class="chat-session-sidebar__header-text-btn chat-session-sidebar__header-text-btn--delete"
            :disabled="!hasSelectedSessions"
            :loading="isBatchDeleting"
            @click="confirmBatchDelete"
          >
            删除
          </ElButton>
          <ElButton
            text
            size="small"
            class="chat-session-sidebar__header-text-btn"
            :disabled="isBatchDeleting"
            @click="exitSelectionMode"
          >
            取消
          </ElButton>
        </div>
      </template>

      <template v-else>
        <span class="chat-session-sidebar__header-title">对话列表</span>
        <div class="chat-session-sidebar__header-actions">
          <ElButton
            text
            circle
            size="small"
            class="chat-session-sidebar__header-icon-btn"
            title="多选"
            @click="enterSelectionMode"
          >
            <SvgIcon category="ui" icon="select-multiple" size="0.95rem" />
          </ElButton>
          <ElButton
            text
            circle
            size="small"
            class="chat-session-sidebar__header-icon-btn"
            title="收起对话列表"
            @click="emit('collapse')"
          >
            <SvgIcon category="ui" icon="pin-off" size="0.95rem" />
          </ElButton>
        </div>
      </template>
    </div>

    <div class="chat-session-sidebar__scroller">
      <div v-if="sessions.length === 0" class="chat-session-sidebar__empty">
        暂无对话
      </div>

      <ul v-else class="chat-session-sidebar__list">
        <li
          v-for="session in sessions"
          :key="session.id"
          class="chat-session-sidebar__item"
          :class="getSessionItemStateClass(session.id)"
        >
          <button
            type="button"
            class="chat-session-sidebar__item-main"
            @click="handleSessionClick(session.id)"
          >
            <ElCheckbox
              v-if="isSelectionMode"
              :model-value="isSessionSelected(session.id)"
              class="chat-session-sidebar__checkbox"
              @click.stop
              @change="() => handleSessionClick(session.id)"
            />
            <SvgIcon v-else category="ui" icon="chat" size="1rem" class="shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ session.title }}</span>
          </button>

          <ElDropdown
            v-if="!isSelectionMode"
            trigger="click"
            placement="bottom-end"
            @command="command => handleSessionAction(session, command)"
          >
            <ElButton
              text
              circle
              size="small"
              class="chat-session-sidebar__actions-btn"
            >
              <SvgIcon category="ui" icon="more" size="0.875rem" />
            </ElButton>

            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem command="rename">
                  重命名
                </ElDropdownItem>
                <ElDropdownItem
                  command="delete"
                  divided
                  class="chat-session-sidebar__menu-item chat-session-sidebar__menu-item--delete"
                >
                  删除
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.chat-session-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 16rem;
  min-height: 0;
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  background: var(--brand-bg-sidebar);

  .chat-session-sidebar__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 3rem;
    padding: 0.5rem 0.75rem 0.5rem 0.9rem;
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 60%, transparent);
  }

  .chat-session-sidebar__selection-count {
    min-width: 0;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .chat-session-sidebar__header-title {
    min-width: 0;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .chat-session-sidebar__header-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.25rem;
  }

  .chat-session-sidebar__header-icon-btn {
    width: 1.75rem;
    height: 1.75rem;
    color: var(--brand-text-secondary);

    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, var(--brand-primary) 7%, transparent);
      color: var(--brand-primary);
    }
  }

  .chat-session-sidebar__header-text-btn {
    padding: 0 0.35rem;
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;

    &:hover,
    &:focus-visible {
      color: var(--brand-primary);
    }

    &--delete {
      color: var(--brand-error);

      &:hover,
      &:focus-visible {
        color: var(--brand-error);
      }
    }
  }

  .chat-session-sidebar__scroller {
    flex: 1 1 0%;
    min-height: 0;
    padding: 0.5rem;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .chat-session-sidebar__empty {
    padding: 1.5rem 0.75rem;
    color: color-mix(in srgb, var(--brand-text-secondary) 60%, transparent);
    font-size: 0.75rem;
    text-align: center;
  }

  .chat-session-sidebar__list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chat-session-sidebar__item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    border: 1px solid transparent;
    border-radius: 0.75rem;
    font-size: 0.875rem;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease;

    &.active {
      border-color: color-mix(in srgb, var(--brand-primary) 10%, transparent);
      background: color-mix(in srgb, var(--brand-primary) 6%, transparent);
      box-shadow:
        0 1px 2px 0 color-mix(in srgb, var(--brand-primary) 6%, transparent),
        0 1px 2px 0 color-mix(in srgb, var(--brand-text-primary) 5%, transparent);
    }

    &.selected {
      border-color: color-mix(in srgb, var(--brand-primary) 14%, transparent);
      background: color-mix(in srgb, var(--brand-primary) 7%, transparent);
    }

    &.idle {
      &:hover,
      &:focus-within {
        border-color: color-mix(in srgb, var(--brand-border-base) 70%, transparent);
        background: var(--brand-bg-surface-raised);
      }
    }
  }

  .chat-session-sidebar__item-main {
    display: flex;
    flex: 1 1 0%;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.625rem 0 0.625rem 0.3rem;
    border: none;
    background: transparent;
    color: var(--brand-text-primary);
    text-align: left;
    cursor: pointer;
  }

  .chat-session-sidebar__checkbox {
    flex-shrink: 0;
    height: 1rem;
  }

  .chat-session-sidebar__item.active .chat-session-sidebar__item-main {
    color: var(--brand-primary);
  }

  .chat-session-sidebar__actions-btn {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    margin-right: 0.5rem;
    opacity: 0;
    transition: opacity 0.2s ease, color 0.2s ease;
  }

  .chat-session-sidebar__item:hover .chat-session-sidebar__actions-btn,
  .chat-session-sidebar__item:focus-within .chat-session-sidebar__actions-btn,
  .chat-session-sidebar__actions-btn:focus {
    opacity: 1;
  }
}

:global(.el-dropdown-menu__item.chat-session-sidebar__menu-item--delete) {
  color: var(--brand-error);
}

:global(.el-dropdown-menu__item.chat-session-sidebar__menu-item--delete:not(.is-disabled):hover),
:global(.el-dropdown-menu__item.chat-session-sidebar__menu-item--delete:not(.is-disabled):focus) {
  background: var(--el-color-danger-light-9);
  color: var(--brand-error);
}
</style>
