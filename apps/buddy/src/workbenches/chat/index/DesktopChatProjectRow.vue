<script setup lang="ts">
import type { LocalProject } from '@buddy-electron/shared/localChatApi'
import type { DropdownOption } from 'naive-ui'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { DesktopChatPinnedDropPosition } from '@/workbenches/chat/index/chatPinnedItems'
import {
  Add16Regular,
  Delete20Regular,
  Edit20Regular,
  Folder20Regular,
  FolderOpen20Regular,
  MoreHorizontal20Regular,
  Pin20Regular,
  PinOff20Regular,
} from '@vicons/fluent'
import { NDropdown, NIcon } from 'naive-ui'
import { computed, h } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopOverflowingLabel from '@/workbenches/chat/index/DesktopOverflowingLabel.vue'

const props = defineProps<{
  dragging?: boolean
  dropPosition?: DesktopChatPinnedDropPosition
  expanded: boolean
  language: BuddyLocale
  pinMode: 'pin' | 'unpin'
  project: LocalProject
  reorderable?: boolean
  reorderTarget?: boolean
}>()
const emit = defineEmits<{
  dragEnd: []
  dragOver: [position: DesktopChatPinnedDropPosition]
  dragStart: []
  drop: [position: DesktopChatPinnedDropPosition]
  menu: [action: string | number]
  newConversation: []
  pin: []
  toggle: []
}>()
const { t } = useBuddyI18n(() => props.language)
const menuOptions = computed<DropdownOption[]>(() => [
  {
    icon: () => h(NIcon, { component: Edit20Regular }),
    key: 'edit',
    label: t('common.edit'),
  },
  {
    icon: () => h(NIcon, { component: Delete20Regular }),
    key: 'delete',
    label: t('common.delete'),
  },
])
const pinLabel = computed(() => props.pinMode === 'pin'
  ? t('desktop.chat.pin')
  : t('desktop.chat.unpin'))

function handleDragStart(event: DragEvent) {
  if (!props.reorderable) {
    event.preventDefault()
    return
  }
  event.dataTransfer?.setData('text/plain', 'desktop-chat-pinned-item')
  if (event.dataTransfer)
    event.dataTransfer.effectAllowed = 'move'
  emit('dragStart')
}

function handleDragOver(event: DragEvent) {
  if (!props.reorderTarget)
    return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
  emit('dragOver', resolveDropPosition(event))
}

function handleDrop(event: DragEvent) {
  if (!props.reorderTarget)
    return
  event.preventDefault()
  emit('drop', resolveDropPosition(event))
}

function resolveDropPosition(event: DragEvent): DesktopChatPinnedDropPosition {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
}
</script>

<template>
  <div
    class="desktop-chat-project-row"
    :class="{
      'is-dragging': dragging,
      'is-drop-after': dropPosition === 'after',
      'is-drop-before': dropPosition === 'before',
      'is-reorderable': reorderable,
    }"
    :draggable="reorderable"
    @dragend="emit('dragEnd')"
    @dragover="handleDragOver"
    @dragstart="handleDragStart"
    @drop="handleDrop"
  >
    <button
      class="desktop-chat-project-row__name"
      type="button"
      :aria-expanded="expanded"
      @click="emit('toggle')"
    >
      <NIcon :component="expanded ? FolderOpen20Regular : Folder20Regular" />
      <DesktopOverflowingLabel :paused="dragging" :text="project.name" />
    </button>
    <div class="desktop-chat-project-row__actions">
      <button
        class="desktop-chat-project-row__action"
        type="button"
        @click="emit('newConversation')"
      >
        <NIcon :component="Add16Regular" />
      </button>
      <NDropdown
        trigger="click"
        :options="menuOptions"
        @select="emit('menu', $event)"
      >
        <button class="desktop-chat-project-row__action" type="button">
          <NIcon :component="MoreHorizontal20Regular" />
        </button>
      </NDropdown>
      <button
        class="desktop-chat-project-row__action desktop-chat-project-row__pin"
        type="button"
        :aria-label="pinLabel"
        @click="emit('pin')"
      >
        <NIcon :component="pinMode === 'pin' ? Pin20Regular : PinOff20Regular" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.desktop-chat-project-row {
  position: relative;
  display: flex;
  height: var(--buddy-chat-sidebar-row-height);
  min-width: 0;
  align-items: center;
  border-radius: var(--buddy-chat-sidebar-state-radius);

  &:hover,
  &:focus-within {
    background: var(--buddy-fill-base);
  }

  &.is-reorderable {
    cursor: grab;
  }

  &.is-dragging {
    opacity: 0.48;
  }

  &.is-drop-before::before,
  &.is-drop-after::after {
    position: absolute;
    z-index: 1;
    right: 0;
    left: 0;
    height: 2px;
    background: var(--buddy-accent-primary);
    content: '';
    pointer-events: none;
  }

  &.is-drop-before::before {
    top: 0;
  }

  &.is-drop-after::after {
    bottom: 0;
  }
}

button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.desktop-chat-project-row__name {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  color: var(--buddy-text-regular);
  font-size: var(--buddy-sidebar-project-font-size);
  font-weight: var(--buddy-sidebar-project-font-weight);
  line-height: 20px;
  padding: 0.46rem 0.5rem;
  text-align: left;

  .n-icon {
    flex: none;
  }

  .desktop-overflow-label {
    flex: 1;
  }

  &:focus-visible {
    border-radius: 6px;
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }
}

.desktop-chat-project-row__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--buddy-chat-sidebar-action-gap);
  opacity: 0;
  padding-right: var(--buddy-chat-sidebar-action-inset);
  pointer-events: none;
}

.desktop-chat-project-row:hover .desktop-chat-project-row__actions,
.desktop-chat-project-row:has(:focus-visible) .desktop-chat-project-row__actions {
  opacity: 1;
  pointer-events: auto;
}

.desktop-chat-project-row__action {
  display: grid;
  width: var(--buddy-chat-sidebar-action-size);
  height: var(--buddy-chat-sidebar-action-size);
  flex: none;
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

.desktop-chat-project-row__pin {
  color: var(--buddy-text-placeholder);
}
</style>
