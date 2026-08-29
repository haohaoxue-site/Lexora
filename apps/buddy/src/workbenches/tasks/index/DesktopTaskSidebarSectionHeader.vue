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
  <div class="desktop-task-sidebar__section-heading">
    <button
      class="desktop-task-sidebar__section-toggle"
      type="button"
      :aria-expanded="expanded"
      @click="emit('toggle')"
    >
      <NIcon :component="expanded ? ChevronDown20Regular : ChevronRight20Regular" />
      <span class="desktop-task-sidebar__section-label-text">{{ label }}</span>
    </button>
    <div class="desktop-task-sidebar__section-actions">
      <button
        v-if="showAdd"
        class="desktop-task-sidebar__section-add"
        type="button"
        @click="emit('add')"
      >
        <NIcon :component="Add16Regular" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.desktop-task-sidebar__section-heading {
  display: flex;
  height: var(--buddy-task-sidebar-section-header-size, 2rem);
  min-width: 0;
  flex: none;
  align-items: center;
  border-radius: 4px;
  color: var(--buddy-text-secondary);
  margin: 0 var(--buddy-task-sidebar-scrollbar-gutter, 0.5rem);
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &:hover {
    background: var(--buddy-nav-hover);
  }

  &:hover,
  &:focus-within {
    color: var(--buddy-nav-foreground);
  }
}

button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.desktop-task-sidebar__section-toggle {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.375rem;
  text-align: left;

  .n-icon {
    flex: none;
    font-size: 14px;
  }

  &:focus-visible {
    outline: 1px solid var(--buddy-focus-ring);
    outline-offset: -1px;
  }
}

.desktop-task-sidebar__section-label-text {
  overflow: hidden;
  font-size: var(--buddy-task-sidebar-section-font-size, var(--buddy-sidebar-section-font-size));
  font-weight: var(--buddy-sidebar-section-font-weight);
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-task-sidebar__section-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--buddy-task-sidebar-action-gap, 0.125rem);
  opacity: 0;
  padding-right: 0.125rem;
  pointer-events: none;
}

.desktop-task-sidebar__section-heading:hover .desktop-task-sidebar__section-actions,
.desktop-task-sidebar__section-heading:has(:focus-visible) .desktop-task-sidebar__section-actions {
  opacity: 1;
  pointer-events: auto;
}

.desktop-task-sidebar__section-add {
  display: grid;
  width: var(--buddy-task-sidebar-action-size, 1.75rem);
  height: var(--buddy-task-sidebar-action-size, 1.75rem);
  place-items: center;
  border-radius: var(--buddy-icon-button-radius);
  color: var(--buddy-text-secondary);

  .n-icon {
    font-size: 16px;
  }

  &:hover {
    background: var(--buddy-nav-hover);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}
</style>
