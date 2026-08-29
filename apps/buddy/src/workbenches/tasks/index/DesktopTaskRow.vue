<script setup lang="ts">
import type { LocalConversationSummary } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { DesktopTaskPinnedDropPosition } from '@/workbenches/tasks/index/taskPinnedItems'
import {
  ApprovalsApp20Regular,
  Delete20Regular,
  Edit20Regular,
  MoreHorizontal20Regular,
  Pin20Regular,
  PinOff20Regular,
  SpinnerIos20Regular,
} from '@vicons/fluent'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { NDropdown, NIcon } from 'naive-ui'
import { computed, h } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopOverflowingLabel from '@/workbenches/tasks/index/DesktopOverflowingLabel.vue'
import 'dayjs/locale/zh-cn'

const props = defineProps<{
  active: boolean
  activity: LocalConversationSummary['activity']
  dragging?: boolean
  dropPosition?: DesktopTaskPinnedDropPosition
  language: BuddyLocale
  now: number
  occurredAt: string
  pinMode?: 'pin' | 'unpin'
  projectTask?: boolean
  reorderable?: boolean
  reorderTarget?: boolean
  title: string
}>()

const emit = defineEmits<{
  delete: []
  dragEnd: []
  dragOver: [position: DesktopTaskPinnedDropPosition]
  dragStart: []
  drop: [position: DesktopTaskPinnedDropPosition]
  open: []
  pin: []
  rename: []
}>()

dayjs.extend(relativeTime)

const { t } = useBuddyI18n(() => props.language)
const relativeTimeLabel = computed(() => {
  const label = dayjs(props.occurredAt)
    .locale(props.language === 'zh-CN' ? 'zh-cn' : 'en')
    .from(props.now)
  return props.language === 'zh-CN' ? label.replaceAll(' ', '') : label
})
const activityIcon = computed(() => props.activity === 'awaiting_approval'
  ? ApprovalsApp20Regular
  : SpinnerIos20Regular)
const activityLabel = computed(() => props.activity === 'awaiting_approval'
  ? t('activity.approval')
  : t('run.status.running'))
const pinLabel = computed(() => props.pinMode === 'pin'
  ? t('desktop.tasks.pin')
  : t('desktop.tasks.unpin'))
const actions = computed(() => [
  { icon: () => hIcon(Edit20Regular), key: 'rename', label: t('desktop.tasks.renameTask') },
  { icon: () => hIcon(Delete20Regular), key: 'delete', label: t('desktop.tasks.deleteTask') },
])

function hIcon(component: typeof Edit20Regular) {
  return h(NIcon, { component })
}

function handleAction(action: string | number) {
  if (action === 'rename')
    emit('rename')
  if (action === 'delete')
    emit('delete')
}

function handleDragStart(event: DragEvent) {
  if (!props.reorderable) {
    event.preventDefault()
    return
  }
  event.dataTransfer?.setData('text/plain', 'desktop-task-pinned-item')
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

function resolveDropPosition(event: DragEvent): DesktopTaskPinnedDropPosition {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
}
</script>

<template>
  <div
    class="desktop-task-row"
    :class="{
      'is-active': active,
      'is-dragging': dragging,
      'is-drop-after': dropPosition === 'after',
      'is-drop-before': dropPosition === 'before',
      'is-project-task': projectTask,
      'is-reorderable': reorderable,
    }"
    :draggable="reorderable"
    @dragend="emit('dragEnd')"
    @dragover="handleDragOver"
    @dragstart="handleDragStart"
    @drop="handleDrop"
  >
    <div
      class="desktop-task-row__surface"
      :class="{ 'is-active': active, 'is-project': projectTask }"
    >
      <button
        class="desktop-task-sidebar__task"
        :class="{ 'is-active': active }"
        type="button"
        @click="emit('open')"
      >
        <DesktopOverflowingLabel :paused="dragging" :text="title" />
      </button>
      <div class="desktop-task-row__trailing">
        <time
          v-if="activity === 'idle'"
          class="desktop-task-row__relative-time"
          :datetime="occurredAt"
        >{{ relativeTimeLabel }}</time>
        <span
          v-else
          class="desktop-task-row__activity"
          :class="{
            'is-awaiting-approval': activity === 'awaiting_approval',
            'is-running': activity === 'running',
          }"
          role="status"
          :aria-label="activityLabel"
        >
          <NIcon :component="activityIcon" />
        </span>
        <div class="desktop-task-row__actions">
          <NDropdown trigger="click" :options="actions" @select="handleAction">
            <button
              class="desktop-task-sidebar__more"
              type="button"
              :aria-label="t('desktop.tasks.moreActions')"
            >
              <NIcon :component="MoreHorizontal20Regular" />
            </button>
          </NDropdown>
          <button
            v-if="pinMode"
            class="desktop-task-sidebar__more desktop-task-sidebar__pin"
            type="button"
            :aria-label="pinLabel"
            @click="emit('pin')"
          >
            <NIcon :component="pinMode === 'pin' ? Pin20Regular : PinOff20Regular" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.desktop-task-row {
  position: relative;
  height: var(--buddy-task-sidebar-row-size, 2.5rem);
  min-width: 0;
  padding-right: var(--buddy-task-sidebar-scrollbar-gutter, 0);
  padding-bottom: calc(var(--buddy-task-sidebar-row-size, 2.5rem) - var(--buddy-task-sidebar-row-height, 2.25rem));
  padding-left: var(--buddy-task-sidebar-scrollbar-gutter, 0);

  &.is-project-task {
    padding-left: 2.25rem;
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
    right: var(--buddy-task-sidebar-scrollbar-gutter, 0);
    left: var(--buddy-task-sidebar-scrollbar-gutter, 0);
    height: 2px;
    background: var(--buddy-accent-solid);
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

.desktop-task-row__surface {
  position: relative;
  display: flex;
  height: 100%;
  min-width: 0;
  align-items: center;
  border-radius: var(--buddy-task-sidebar-state-radius, 8px);
  color: var(--buddy-text-primary);
  transition: background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &:hover,
  &:focus-within {
    background: var(--buddy-nav-hover);
  }

  &.is-active {
    background: var(--buddy-nav-selected);
  }

  &.is-active:hover {
    background: var(--buddy-nav-pressed);
  }

  &.is-project {
    padding-left: 0.5rem;
  }

}

button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.desktop-task-sidebar__task {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  color: var(--buddy-text-primary);
  font-size: var(--buddy-task-sidebar-item-font-size, var(--buddy-sidebar-item-font-size));
  font-weight: var(--buddy-sidebar-item-font-weight);
  line-height: 20px;
  padding: 0 0.625rem;
  text-align: left;

  .desktop-overflow-label {
    flex: 1;
  }

  &.is-active {
    color: var(--buddy-nav-foreground);
    font-weight: var(--buddy-sidebar-item-active-font-weight);
  }

  &:focus-visible {
    border-radius: 6px;
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.desktop-task-sidebar__more {
  display: grid;
  width: var(--buddy-task-sidebar-action-size, 1.75rem);
  height: var(--buddy-task-sidebar-action-size, 1.75rem);
  flex: none;
  place-items: center;
  border-radius: var(--buddy-icon-button-radius);
  color: var(--buddy-text-muted);
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

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

.desktop-task-row__trailing {
  display: grid;
  width: 4rem;
  flex: none;
  align-items: center;
  padding-right: var(--buddy-task-sidebar-action-inset, 0.25rem);
}

.desktop-task-row__relative-time,
.desktop-task-row__activity,
.desktop-task-row__actions {
  grid-area: 1 / 1;
  justify-self: end;
}

.desktop-task-sidebar__pin {
  color: var(--buddy-text-muted);
}

.desktop-task-row__activity {
  display: grid;
  width: var(--buddy-task-sidebar-action-size, 1.75rem);
  height: var(--buddy-task-sidebar-action-size, 1.75rem);
  place-items: center;
  pointer-events: none;

  .n-icon {
    font-size: 16px;
  }

  &.is-running {
    color: var(--buddy-text-muted);

    .n-icon {
      animation: desktop-task-row-spin 1s linear infinite;
    }
  }

  &.is-awaiting-approval {
    color: var(--buddy-status-warning-text);
  }
}

.desktop-task-row__relative-time {
  color: var(--buddy-text-muted);
  font-size: 0.75rem;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
}

.desktop-task-row__actions {
  display: flex;
  align-items: center;
  gap: var(--buddy-task-sidebar-action-gap, 0.125rem);
  opacity: 0;
  pointer-events: none;
}

.desktop-task-row:hover .desktop-task-row__relative-time,
.desktop-task-row:has(:focus-visible) .desktop-task-row__relative-time,
.desktop-task-row:hover .desktop-task-row__activity,
.desktop-task-row:has(:focus-visible) .desktop-task-row__activity {
  opacity: 0;
}

.desktop-task-row:hover .desktop-task-row__actions,
.desktop-task-row:has(:focus-visible) .desktop-task-row__actions {
  opacity: 1;
  pointer-events: auto;
}

@keyframes desktop-task-row-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-task-row__activity.is-running .n-icon {
    animation: none;
  }
}
</style>
