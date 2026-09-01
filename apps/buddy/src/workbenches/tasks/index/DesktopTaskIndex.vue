<script setup lang="ts">
import type { DesktopTaskPinnedItem } from '@buddy-electron/shared/desktopApi'
import type { LocalConversationSummary, LocalSpace } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { TaskSpaceInput } from '@/workbenches/tasks/state/useTaskSpaces'
import { Add16Regular } from '@vicons/fluent'
import { NAlert, NButton, NIcon, NInput, NModal } from 'naive-ui'
import { toRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopWorkspaceSidebarIdentity from '@/layouts/DesktopWorkspaceSidebarIdentity.vue'
import DesktopSpaceDialog from '@/workbenches/tasks/index/DesktopSpaceDialog.vue'
import DesktopTaskRow from '@/workbenches/tasks/index/DesktopTaskRow.vue'
import DesktopTaskSidebarSection from '@/workbenches/tasks/index/DesktopTaskSidebarSection.vue'
import DesktopTaskSpaceRow from '@/workbenches/tasks/index/DesktopTaskSpaceRow.vue'
import {
  DESKTOP_TASK_SIDEBAR_ROW_HEIGHT,
  DESKTOP_TASK_SIDEBAR_ROW_SIZE,
  DESKTOP_TASK_SIDEBAR_SECTION_HEADER_SIZE,
  DESKTOP_TASK_SIDEBAR_SECTION_PRIORITIES,
} from '@/workbenches/tasks/index/taskSidebarLayout'
import { useTaskIndexController } from '@/workbenches/tasks/index/useTaskIndexController'

const props = defineProps<{
  activeConversationId: string | null
  appSidebarCollapsed: boolean
  language: BuddyLocale
  pinnedItems: ReadonlyArray<DesktopTaskPinnedItem>
  spaces: ReadonlyArray<LocalSpace>
  selectSpaceDirectory: () => Promise<string | null>
  tasks: ReadonlyArray<LocalConversationSummary>
}>()
const emit = defineEmits<{
  createSpace: [input: TaskSpaceInput]
  deleteSpace: [spaceId: string]
  deleteTask: [conversationId: string]
  newTask: [spaceId: string | null]
  openTask: [conversationId: string]
  renameTask: [conversationId: string, title: string]
  toggleAppSidebar: []
  updatePinnedItems: [items: DesktopTaskPinnedItem[]]
  updateSpace: [input: TaskSpaceInput & { spaceId: string }]
}>()

const { t } = useBuddyI18n(() => props.language)
const sidebarLayoutStyle = {
  '--buddy-task-sidebar-row-height': `${DESKTOP_TASK_SIDEBAR_ROW_HEIGHT}px`,
  '--buddy-task-sidebar-row-size': `${DESKTOP_TASK_SIDEBAR_ROW_SIZE}px`,
  '--buddy-task-sidebar-section-header-size': `${DESKTOP_TASK_SIDEBAR_SECTION_HEADER_SIZE}px`,
}
const {
  beginPinnedDrag,
  confirmTaskDelete,
  confirmTaskRename,
  confirmSpaceDelete,
  draggedPinnedItemKey,
  dropPinnedItem,
  endPinnedDrag,
  enterPinnedDropTarget,
  getTaskTitle,
  getPinnedDropPosition,
  isSpaceExpanded,
  openSpaceCreator,
  pinTask,
  pinSpace,
  pinnedItems: visiblePinnedItems,
  pinnedRows,
  pinnedSectionExpanded,
  spaceDeleteTarget,
  spaceDialogOpen,
  spaceEditTarget,
  spaceRows,
  spacesSectionExpanded,
  relativeTimeNow,
  requestTaskDelete,
  requestTaskRename,
  saveSpace,
  selectSpaceMenuAction,
  globalTasks,
  taskDeleteTarget,
  taskRenameTarget,
  taskTitleDraft,
  tasksSectionExpanded,
  toggleSpace,
  unpinItem,
} = useTaskIndexController({
  getUntitledLabel: () => t('desktop.tasks.untitled'),
  onCreateSpace: input => emit('createSpace', input),
  onDeleteTask: conversationId => emit('deleteTask', conversationId),
  onDeleteSpace: spaceId => emit('deleteSpace', spaceId),
  onNewTask: spaceId => emit('newTask', spaceId),
  onRenameTask: (conversationId, title) => emit('renameTask', conversationId, title),
  onUpdatePinnedItems: items => emit('updatePinnedItems', items),
  onUpdateSpace: input => emit('updateSpace', input),
  pinnedItems: toRef(props, 'pinnedItems'),
  spaces: toRef(props, 'spaces'),
  tasks: toRef(props, 'tasks'),
})
</script>

<template>
  <aside class="desktop-task-sidebar">
    <header class="desktop-task-sidebar__header">
      <DesktopWorkspaceSidebarIdentity
        :label="t('desktop.navigation.tasks')"
        :visible="appSidebarCollapsed"
        @restore="emit('toggleAppSidebar')"
      />
      <button
        class="desktop-task-sidebar__new-trigger"
        type="button"
        :aria-label="t('desktop.tasks.newTask')"
        @click="emit('newTask', null)"
      >
        <NIcon :component="Add16Regular" />
      </button>
    </header>

    <div class="desktop-task-sidebar__content">
      <nav :style="sidebarLayoutStyle">
        <DesktopTaskSidebarSection
          v-if="visiblePinnedItems.length > 0"
          v-model:expanded="pinnedSectionExpanded"
          :items="pinnedRows"
          key-field="key"
          :label="t('desktop.tasks.pinnedSection')"
          :priority="DESKTOP_TASK_SIDEBAR_SECTION_PRIORITIES.pinned"
          section="pinned"
        >
          <template #default="{ item }">
            <div v-if="item.kind === 'space'" class="desktop-task-sidebar__space-item">
              <DesktopTaskSpaceRow
                :dragging="draggedPinnedItemKey === item.pinKey"
                :drop-position="item.pinnedTopLevel ? getPinnedDropPosition(item.pinKey) : undefined"
                :expanded="isSpaceExpanded(item.space.id)"
                :language="language"
                pin-mode="unpin"
                :space="item.space"
                :reorderable="item.pinnedTopLevel"
                reorder-target
                @drag-end="endPinnedDrag"
                @drag-over="enterPinnedDropTarget(item.pinKey!, $event)"
                @drag-start="beginPinnedDrag(item.pinKey!)"
                @drop="dropPinnedItem(item.pinKey!, $event)"
                @menu="selectSpaceMenuAction(item.space, $event)"
                @pin="unpinItem(item.pinKey!)"
                @toggle="toggleSpace(item.space.id)"
              />
            </div>
            <DesktopTaskRow
              v-else
              :active="item.task.id === activeConversationId"
              :activity="item.task.activity"
              :dragging="item.pinnedTopLevel && draggedPinnedItemKey === item.pinKey"
              :drop-position="item.pinnedTopLevel ? getPinnedDropPosition(item.pinKey) : undefined"
              :language="language"
              :now="relativeTimeNow"
              :occurred-at="item.task.automationOccurrence?.scheduledFor ?? item.task.updatedAt"
              :pin-mode="item.pinnedTopLevel ? 'unpin' : undefined"
              :space-task="item.spaceTask"
              :reorderable="item.pinnedTopLevel"
              :reorder-target="item.pinnedTopLevel"
              :title="getTaskTitle(item.task)"
              @delete="requestTaskDelete(item.task)"
              @drag-end="endPinnedDrag"
              @drag-over="enterPinnedDropTarget(item.pinKey!, $event)"
              @drag-start="beginPinnedDrag(item.pinKey!)"
              @drop="dropPinnedItem(item.pinKey!, $event)"
              @open="emit('openTask', item.task.id)"
              @pin="unpinItem(item.pinKey!)"
              @rename="requestTaskRename(item.task)"
            />
          </template>
        </DesktopTaskSidebarSection>

        <DesktopTaskSidebarSection
          v-model:expanded="spacesSectionExpanded"
          :items="spaceRows"
          key-field="key"
          :label="t('desktop.tasks.spacesSection')"
          :priority="DESKTOP_TASK_SIDEBAR_SECTION_PRIORITIES.spaces"
          section="spaces"
          show-add
          @add="openSpaceCreator"
        >
          <template #default="{ item }">
            <div v-if="item.kind === 'space'" class="desktop-task-sidebar__space-item">
              <DesktopTaskSpaceRow
                :expanded="isSpaceExpanded(item.space.id)"
                :language="language"
                pin-mode="pin"
                :space="item.space"
                @menu="selectSpaceMenuAction(item.space, $event)"
                @pin="pinSpace(item.space.id)"
                @toggle="toggleSpace(item.space.id)"
              />
            </div>
            <DesktopTaskRow
              v-else
              :active="item.task.id === activeConversationId"
              :activity="item.task.activity"
              :language="language"
              :now="relativeTimeNow"
              :occurred-at="item.task.automationOccurrence?.scheduledFor ?? item.task.updatedAt"
              :space-task="item.spaceTask"
              :title="getTaskTitle(item.task)"
              @delete="requestTaskDelete(item.task)"
              @open="emit('openTask', item.task.id)"
              @rename="requestTaskRename(item.task)"
            />
          </template>
        </DesktopTaskSidebarSection>

        <DesktopTaskSidebarSection
          v-model:expanded="tasksSectionExpanded"
          :items="globalTasks"
          key-field="id"
          :label="t('desktop.tasks.tasksSection')"
          :priority="DESKTOP_TASK_SIDEBAR_SECTION_PRIORITIES.tasks"
          section="tasks"
        >
          <template #default="{ item: task }">
            <DesktopTaskRow
              :active="task.id === activeConversationId"
              :activity="task.activity"
              :language="language"
              :now="relativeTimeNow"
              :occurred-at="task.automationOccurrence?.scheduledFor ?? task.updatedAt"
              pin-mode="pin"
              :title="getTaskTitle(task)"
              @delete="requestTaskDelete(task)"
              @open="emit('openTask', task.id)"
              @pin="pinTask(task.id)"
              @rename="requestTaskRename(task)"
            />
          </template>
        </DesktopTaskSidebarSection>
      </nav>
    </div>

    <DesktopSpaceDialog
      v-model:show="spaceDialogOpen"
      :language="language"
      :space="spaceEditTarget"
      :select-directory="selectSpaceDirectory"
      @save="saveSpace"
    />

    <NModal
      :show="spaceDeleteTarget !== null"
      preset="card"
      class="desktop-task-sidebar__modal"
      :title="t('desktop.tasks.deleteSpaceTitle')"
      @update:show="!$event && (spaceDeleteTarget = null)"
    >
      <div class="desktop-task-sidebar__delete-space-content">
        <p>
          {{ t('desktop.tasks.deleteSpaceMessage', { name: spaceDeleteTarget?.name ?? '' }) }}
        </p>
        <NAlert
          v-if="spaceDeleteTarget && spaceDeleteTarget.activeRunCount > 0"
          :show-icon="false"
          type="warning"
        >
          {{ t('desktop.tasks.deleteSpaceActiveRunWarning', { count: spaceDeleteTarget.activeRunCount }) }}
        </NAlert>
        <p v-else class="desktop-task-sidebar__delete-space-retention">
          {{ t('desktop.tasks.deleteSpaceRetention') }}
        </p>
      </div>
      <template #footer>
        <div class="desktop-task-sidebar__modal-actions">
          <NButton @click="spaceDeleteTarget = null">
            {{ spaceDeleteTarget && spaceDeleteTarget.activeRunCount > 0 ? t('common.close') : t('common.cancel') }}
          </NButton>
          <NButton
            v-if="spaceDeleteTarget && spaceDeleteTarget.activeRunCount === 0"
            type="error"
            @click="confirmSpaceDelete"
          >
            {{ t('common.delete') }}
          </NButton>
        </div>
      </template>
    </NModal>

    <NModal
      :show="taskRenameTarget !== null"
      preset="card"
      class="desktop-task-sidebar__modal"
      :style="{ width: 'min(28rem, calc(100vw - 2rem))' }"
      :title="t('desktop.tasks.renameTask')"
      @update:show="!$event && (taskRenameTarget = null)"
    >
      <NInput
        v-model:value="taskTitleDraft"
        maxlength="80"
        show-count
        @keyup.enter="confirmTaskRename"
      />
      <template #footer>
        <div class="desktop-task-sidebar__modal-actions">
          <NButton @click="taskRenameTarget = null">
            {{ t('common.cancel') }}
          </NButton>
          <NButton
            type="primary"
            :disabled="!taskTitleDraft.trim()"
            @click="confirmTaskRename"
          >
            {{ t('common.save') }}
          </NButton>
        </div>
      </template>
    </NModal>

    <NModal
      :show="taskDeleteTarget !== null"
      preset="dialog"
      type="warning"
      :title="t('desktop.tasks.deleteTaskConfirmTitle')"
      @update:show="!$event && (taskDeleteTarget = null)"
    >
      {{ t('desktop.tasks.deleteTaskConfirmMessage', { title: taskDeleteTarget ? getTaskTitle(taskDeleteTarget) : '' }) }}
      <template #action>
        <NButton @click="taskDeleteTarget = null">
          {{ t('common.cancel') }}
        </NButton>
        <NButton type="error" @click="confirmTaskDelete">
          {{ t('common.delete') }}
        </NButton>
      </template>
    </NModal>
  </aside>
</template>

<style scoped lang="scss">
.desktop-task-sidebar {
  display: flex;
  width: var(--buddy-workspace-sidebar-width);
  height: 100%;
  min-height: 0;
  flex: none;
  flex-direction: column;
  border-right: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-workspace-sidebar);
}

.desktop-task-sidebar__header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0 0.75rem 0 0.8rem;
}

.desktop-task-sidebar__new-trigger {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-icon-button-radius);
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
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

.desktop-task-sidebar__content {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  padding: 0.5rem 0;
}

.desktop-task-sidebar nav {
  --buddy-task-sidebar-section-gap: 0.25rem;
  --buddy-task-sidebar-section-font-size: 13px;
  --buddy-task-sidebar-item-font-size: 13px;
  --buddy-task-sidebar-action-gap: 0.125rem;
  --buddy-task-sidebar-action-inset: 0.4rem;
  --buddy-task-sidebar-action-size: 1.75rem;
  --buddy-task-sidebar-scrollbar-gutter: 0.5rem;
  --buddy-task-sidebar-state-radius: 6px;

  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: var(--buddy-task-sidebar-section-gap);
  overflow: hidden;
}

.desktop-task-sidebar__space-item {
  height: var(--buddy-task-sidebar-row-size);
  padding-right: var(--buddy-task-sidebar-scrollbar-gutter);
  padding-bottom: calc(var(--buddy-task-sidebar-row-size) - var(--buddy-task-sidebar-row-height));
  padding-left: var(--buddy-task-sidebar-scrollbar-gutter);
}

.desktop-task-sidebar__modal {
  width: min(28rem, calc(100vw - 2rem));
}

.desktop-task-sidebar__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.desktop-task-sidebar__delete-space-content {
  display: grid;
  gap: 0.85rem;
}

.desktop-task-sidebar__delete-space-content p {
  margin: 0;
  line-height: 1.65;
}

.desktop-task-sidebar__delete-space-retention {
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
}
</style>
