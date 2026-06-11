<script setup lang="ts">
import type { ChatSessionSidebarEmits } from './typing'
import { useChatSessions } from '../../composables/useChatSessions'
import { useChatSessionSidebar } from '../../composables/useChatSessionSidebar'

const emit = defineEmits<ChatSessionSidebarEmits>()
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
  <aside class="chat-session-sidebar flex min-h-0 w-[var(--panel-chat-session-width)] shrink-0 flex-col">
    <div class="chat-session-sidebar__header flex min-h-11 items-center justify-between border-b px-3 py-2">
      <template v-if="isSelectionMode">
        <span class="chat-session-sidebar__selection-count min-w-0 whitespace-nowrap text-sm font-medium text-main">已选 {{ selectedCount }} 项</span>
        <div class="flex shrink-0 items-center gap-1">
          <ElButton
            text
            size="small"
            class="chat-session-sidebar__header-text-btn h-7 rounded-lg px-2 text-[0.8125rem] text-secondary"
            :class="{ 'chat-session-sidebar__header-text-btn--delete': hasSelectedSessions }"
            :disabled="!hasSelectedSessions"
            :loading="isBatchDeleting"
            @click="confirmBatchDelete"
          >
            删除
          </ElButton>
          <ElButton
            text
            size="small"
            class="chat-session-sidebar__header-text-btn h-7 rounded-lg px-2 text-[0.8125rem] text-secondary"
            :disabled="isBatchDeleting"
            @click="exitSelectionMode"
          >
            取消
          </ElButton>
        </div>
      </template>

      <template v-else>
        <span class="chat-session-sidebar__header-title min-w-0 whitespace-nowrap text-sm font-medium text-main">对话列表</span>
        <div class="flex shrink-0 items-center gap-1">
          <ElButton
            text
            size="small"
            class="chat-session-sidebar__header-icon-btn h-7 w-7 rounded-lg p-0 text-secondary"
            title="多选"
            @click="enterSelectionMode"
          >
            <SvgIcon category="ui" icon="select-multiple" size="0.95rem" />
          </ElButton>
          <ElButton
            text
            size="small"
            class="chat-session-sidebar__header-icon-btn h-7 w-7 rounded-lg p-0 text-secondary"
            title="收起对话列表"
            @click="emit('collapse')"
          >
            <SvgIcon category="ui" icon="pin-off" size="0.95rem" />
          </ElButton>
        </div>
      </template>
    </div>

    <div class="chat-session-sidebar__scroller min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2">
      <div v-if="sessions.length === 0" class="px-3 py-6 text-center text-xs text-secondary-a60">
        暂无对话
      </div>

      <ul v-else class="m-0 grid list-none gap-1 p-0">
        <li
          v-for="session in sessions"
          :key="session.id"
          class="chat-session-sidebar__item flex min-w-0 items-center gap-2 rounded-lg border border-transparent text-sm"
          :class="getSessionItemStateClass(session.id)"
        >
          <button
            type="button"
            class="chat-session-sidebar__item-main flex min-w-0 flex-1 items-center gap-2 border-none bg-transparent py-2 pl-2 text-left text-main"
            @click="handleSessionClick(session.id)"
          >
            <ElCheckbox
              v-if="isSelectionMode"
              :model-value="isSessionSelected(session.id)"
              class="shrink-0 h-4"
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
            popper-class="chat-session-sidebar__more-popper"
            @command="command => handleSessionAction(session, command)"
          >
            <ElButton
              text
              size="small"
              class="chat-session-sidebar__actions-btn mr-1.5 h-6 w-6 shrink-0 rounded-lg p-0 opacity-0"
            >
              <SvgIcon category="ui" icon="more" size="0.875rem" />
            </ElButton>

            <template #dropdown>
              <ElDropdownMenu class="chat-session-sidebar__menu box-border min-w-0 w-[8.5rem] p-1">
                <ElDropdownItem command="rename" class="chat-session-sidebar__menu-item min-h-8 px-2 text-main">
                  重命名
                </ElDropdownItem>
                <ElDropdownItem
                  command="delete"
                  divided
                  class="chat-session-sidebar__menu-item chat-session-sidebar__menu-item--delete min-h-8 px-2"
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
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 74%, transparent);
  background: var(--brand-bg-sidebar);

  .chat-session-sidebar__header-text-btn,
  .chat-session-sidebar__header-icon-btn {
    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, var(--brand-primary) 7%, transparent);
      color: var(--brand-primary);
    }
  }

  .chat-session-sidebar__header-text-btn {
    &--delete {
      color: var(--brand-error);

      &:hover,
      &:focus-visible {
        color: var(--brand-error);
      }
    }
  }

  .chat-session-sidebar__item {
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      color 0.2s ease,
      box-shadow 0.2s ease;

    &.active {
      border-color: color-mix(in srgb, var(--brand-primary) 20%, transparent);
      background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
      box-shadow:
        0 1px 2px 0 color-mix(in srgb, var(--brand-primary) 6%, transparent),
        0 1px 2px 0 color-mix(in srgb, var(--brand-text-primary) 5%, transparent);
    }

    &.selected {
      border-color: color-mix(in srgb, var(--brand-primary) 18%, transparent);
      background: color-mix(in srgb, var(--brand-primary) 7%, transparent);
    }

    &.idle {
      &:hover,
      &:focus-within {
        border-color: color-mix(in srgb, var(--brand-border-base) 70%, transparent);
        background: color-mix(in srgb, var(--brand-bg-surface) 94%, transparent);
      }
    }
  }

  .chat-session-sidebar__item-main {
    cursor: pointer;
  }

  .chat-session-sidebar__item.active .chat-session-sidebar__item-main {
    color: var(--brand-primary);
  }

  .chat-session-sidebar__item.active .chat-session-sidebar__actions-btn {
    color: color-mix(in srgb, var(--brand-primary) 76%, transparent);

    &:hover,
    &:focus-visible {
      color: var(--brand-primary);
      background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
    }
  }

  .chat-session-sidebar__actions-btn {
    transition:
      opacity 0.2s ease,
      color 0.2s ease,
      background-color 0.2s ease;
  }

  .chat-session-sidebar__item:hover .chat-session-sidebar__actions-btn,
  .chat-session-sidebar__item:focus-within .chat-session-sidebar__actions-btn,
  .chat-session-sidebar__actions-btn:focus {
    opacity: 1;
  }
}

:global(.chat-session-sidebar__more-popper .el-popper__arrow) {
  display: none;
}

:global(.chat-session-sidebar__menu-item:not(.is-disabled):hover),
:global(.chat-session-sidebar__menu-item:not(.is-disabled):focus) {
  background: color-mix(in srgb, var(--brand-fill-light) 72%, transparent);
  color: var(--brand-text-primary);
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
