<script setup lang="ts">
import type {
  ChatSessionSidebarEmits,
  ChatSessionSidebarProps,
} from '../typing'
import { useChatSessionSidebar } from '../composables/useChatSessionSidebar'

const props = defineProps<ChatSessionSidebarProps>()
const emits = defineEmits<ChatSessionSidebarEmits>()
const { confirmDelete, getSessionItemStateClass } = useChatSessionSidebar(
  props,
  sessionId => emits('delete', sessionId),
)
</script>

<template>
  <aside class="chat-session-sidebar">
    <div class="chat-session-sidebar__header">
      <span class="chat-session-sidebar__header-title">对话列表</span>
      <ElButton text circle size="small" class="chat-session-sidebar__create-btn" @click="emits('create')">
        <SvgIcon category="ui" icon="plus" size="1rem" />
      </ElButton>
    </div>

    <div class="overflow-y-auto p-2">
      <div v-if="props.sessions.length === 0" class="chat-session-sidebar__empty">
        暂无对话
      </div>

      <ul v-else class="chat-session-sidebar__list">
        <li
          v-for="session in props.sessions"
          :key="session.id"
          class="chat-session-sidebar__item"
          :class="getSessionItemStateClass(session.id)"
        >
          <button
            type="button"
            class="chat-session-sidebar__item-main"
            @click="emits('select', session.id)"
          >
            <SvgIcon category="ui" icon="chat" size="1rem" class="shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ session.title }}</span>
          </button>

          <ElButton
            text
            circle
            size="small"
            class="chat-session-sidebar__delete-btn"
            @click="confirmDelete(session)"
          >
            <SvgIcon category="ui" icon="trash" size="0.875rem" />
          </ElButton>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.chat-session-sidebar {
  flex-shrink: 0;
  width: 16rem;
  border-right: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
  background: var(--brand-bg-sidebar);

  .chat-session-sidebar__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 60%, transparent);
  }

  .chat-session-sidebar__header-title {
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 500;
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
    flex: 1 1 auto;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.625rem 0 0.625rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--brand-text-primary);
    text-align: left;
    cursor: pointer;
  }

  .chat-session-sidebar__item.active .chat-session-sidebar__item-main {
    color: var(--brand-primary);
  }

  .chat-session-sidebar__delete-btn {
    width: 1.25rem;
    height: 1.25rem;
    margin-right: 0.5rem;
    opacity: 0;
    transition: opacity 0.2s ease, color 0.2s ease;

    &:hover {
      color: var(--brand-error);
    }
  }

  .chat-session-sidebar__item:hover .chat-session-sidebar__delete-btn,
  .chat-session-sidebar__item:focus-within .chat-session-sidebar__delete-btn,
  .chat-session-sidebar__delete-btn:focus {
    opacity: 1;
  }
}
</style>
