<script setup lang="ts">
import { Add16Regular, ChevronDown20Regular, ChevronRight20Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'

defineProps<{
  expanded: boolean
  label: string
  showAdd?: boolean
}>()
const emit = defineEmits<{
  add: []
  toggle: []
}>()
</script>

<template>
  <div class="desktop-chat-sidebar__section-heading">
    <button
      class="desktop-chat-sidebar__section-toggle"
      type="button"
      :aria-expanded="expanded"
      @click="emit('toggle')"
    >
      <NIcon :component="expanded ? ChevronDown20Regular : ChevronRight20Regular" />
      <span class="desktop-chat-sidebar__section-label-text">{{ label }}</span>
    </button>
    <div class="desktop-chat-sidebar__section-actions">
      <button
        v-if="showAdd"
        class="desktop-chat-sidebar__section-add"
        type="button"
        @click="emit('add')"
      >
        <NIcon :component="Add16Regular" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.desktop-chat-sidebar__section-heading {
  display: flex;
  height: var(--buddy-chat-sidebar-section-header-size, 2rem);
  min-width: 0;
  flex: none;
  align-items: center;
  border-radius: var(--buddy-chat-sidebar-state-radius, 8px);
  color: var(--buddy-text-secondary);
  margin-right: var(--buddy-chat-sidebar-scrollbar-gutter, 0);

  &:hover {
    color: var(--buddy-text-primary);
  }
}

button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.desktop-chat-sidebar__section-toggle {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.5rem;
  text-align: left;

  .n-icon {
    flex: none;
    font-size: 14px;
  }

  &:focus-visible {
    border-radius: 4px;
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }
}

.desktop-chat-sidebar__section-label-text {
  overflow: hidden;
  font-size: var(--buddy-sidebar-section-font-size);
  font-weight: var(--buddy-sidebar-section-font-weight);
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-chat-sidebar__section-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--buddy-chat-sidebar-action-gap, 0.125rem);
  opacity: 0;
  padding-right: var(--buddy-chat-sidebar-action-inset, 0.25rem);
  pointer-events: none;
}

.desktop-chat-sidebar__section-heading:hover .desktop-chat-sidebar__section-actions,
.desktop-chat-sidebar__section-heading:has(:focus-visible) .desktop-chat-sidebar__section-actions {
  opacity: 1;
  pointer-events: auto;
}

.desktop-chat-sidebar__section-add {
  display: grid;
  width: var(--buddy-chat-sidebar-action-size, 1.75rem);
  height: var(--buddy-chat-sidebar-action-size, 1.75rem);
  place-items: center;
  border-radius: var(--buddy-icon-button-radius);
  color: var(--buddy-text-secondary);

  .n-icon {
    font-size: 16px;
  }

  &:hover {
    background: var(--buddy-nav-active-bg);
    color: var(--buddy-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }
}
</style>
