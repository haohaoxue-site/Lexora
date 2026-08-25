<script setup lang="ts">
import type { DesktopChatPinnedItem } from '@buddy-electron/shared/desktopApi'
import type { LocalConversationSummary, LocalProject } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ChatProjectInput } from '@/workbenches/chat/state/useChatProjects'
import { Add16Regular, PanelLeft20Regular } from '@vicons/fluent'
import { NAlert, NButton, NIcon, NInput, NModal } from 'naive-ui'
import { toRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import {
  DESKTOP_CHAT_SIDEBAR_ROW_HEIGHT,
  DESKTOP_CHAT_SIDEBAR_ROW_SIZE,
  DESKTOP_CHAT_SIDEBAR_SECTION_HEADER_SIZE,
  DESKTOP_CHAT_SIDEBAR_SECTION_PRIORITIES,
} from '@/workbenches/chat/index/chatSidebarLayout'
import DesktopChatConversationRow from '@/workbenches/chat/index/DesktopChatConversationRow.vue'
import DesktopChatProjectRow from '@/workbenches/chat/index/DesktopChatProjectRow.vue'
import DesktopChatSidebarSection from '@/workbenches/chat/index/DesktopChatSidebarSection.vue'
import DesktopProjectDialog from '@/workbenches/chat/index/DesktopProjectDialog.vue'
import { useChatIndexController } from '@/workbenches/chat/index/useChatIndexController'

const props = defineProps<{
  activeConversationId: string | null
  appSidebarCollapsed: boolean
  conversations: ReadonlyArray<LocalConversationSummary>
  language: BuddyLocale
  pinnedItems: ReadonlyArray<DesktopChatPinnedItem>
  projects: ReadonlyArray<LocalProject>
}>()
const emit = defineEmits<{
  createProject: [input: ChatProjectInput]
  deleteProject: [projectId: string]
  deleteConversation: [conversationId: string]
  newGlobal: []
  newProject: [projectId: string]
  openConversation: [conversationId: string]
  renameConversation: [conversationId: string, title: string]
  toggleAppSidebar: []
  updatePinnedItems: [items: DesktopChatPinnedItem[]]
  updateProject: [input: ChatProjectInput & { projectId: string }]
}>()

const { t } = useBuddyI18n(() => props.language)
const sidebarLayoutStyle = {
  '--buddy-chat-sidebar-row-height': `${DESKTOP_CHAT_SIDEBAR_ROW_HEIGHT}px`,
  '--buddy-chat-sidebar-row-size': `${DESKTOP_CHAT_SIDEBAR_ROW_SIZE}px`,
  '--buddy-chat-sidebar-section-header-size': `${DESKTOP_CHAT_SIDEBAR_SECTION_HEADER_SIZE}px`,
}
const {
  beginPinnedDrag,
  confirmConversationDelete,
  confirmConversationRename,
  confirmProjectDelete,
  conversationDeleteTarget,
  conversationRenameTarget,
  conversationTitleDraft,
  draggedPinnedItemKey,
  dropPinnedItem,
  endPinnedDrag,
  enterPinnedDropTarget,
  getConversationTitle,
  getPinnedDropPosition,
  isProjectExpanded,
  openProjectCreator,
  pinConversation,
  pinProject,
  pinnedItems: visiblePinnedItems,
  pinnedRows,
  pinnedSectionExpanded,
  projectDeleteTarget,
  projectDialogOpen,
  projectEditTarget,
  projectRows,
  projectsSectionExpanded,
  relativeTimeNow,
  requestConversationDelete,
  requestConversationRename,
  saveProject,
  selectProjectMenuAction,
  taskConversations,
  tasksSectionExpanded,
  toggleProject,
  unpinItem,
} = useChatIndexController({
  conversations: toRef(props, 'conversations'),
  getUntitledLabel: () => t('desktop.chat.untitled'),
  onCreateProject: input => emit('createProject', input),
  onDeleteConversation: conversationId => emit('deleteConversation', conversationId),
  onDeleteProject: projectId => emit('deleteProject', projectId),
  onRenameConversation: (conversationId, title) => emit('renameConversation', conversationId, title),
  onUpdatePinnedItems: items => emit('updatePinnedItems', items),
  onUpdateProject: input => emit('updateProject', input),
  pinnedItems: toRef(props, 'pinnedItems'),
  projects: toRef(props, 'projects'),
})
</script>

<template>
  <aside class="desktop-chat-sidebar">
    <header class="desktop-chat-sidebar__header">
      <div class="desktop-chat-sidebar__header-title">
        <NButton
          v-if="appSidebarCollapsed"
          class="buddy-icon-button desktop-chat-sidebar__expand-trigger"
          quaternary
          @click="emit('toggleAppSidebar')"
        >
          <template #icon>
            <NIcon :component="PanelLeft20Regular" />
          </template>
        </NButton>
        <strong>{{ t('desktop.navigation.chat') }}</strong>
      </div>
      <button
        class="desktop-chat-sidebar__new-trigger"
        type="button"
        @click="emit('newGlobal')"
      >
        <NIcon :component="Add16Regular" />
      </button>
    </header>

    <div class="desktop-chat-sidebar__content">
      <nav :style="sidebarLayoutStyle">
        <DesktopChatSidebarSection
          v-if="visiblePinnedItems.length > 0"
          v-model:expanded="pinnedSectionExpanded"
          :items="pinnedRows"
          key-field="key"
          :label="t('desktop.chat.pinnedSection')"
          :priority="DESKTOP_CHAT_SIDEBAR_SECTION_PRIORITIES.pinned"
          section="pinned"
        >
          <template #default="{ item }">
            <div v-if="item.kind === 'project'" class="desktop-chat-sidebar__project-item">
              <DesktopChatProjectRow
                :dragging="draggedPinnedItemKey === item.pinKey"
                :drop-position="item.pinnedTopLevel ? getPinnedDropPosition(item.pinKey) : undefined"
                :expanded="isProjectExpanded(item.project.id)"
                :language="language"
                pin-mode="unpin"
                :project="item.project"
                :reorderable="item.pinnedTopLevel"
                reorder-target
                @drag-end="endPinnedDrag"
                @drag-over="enterPinnedDropTarget(item.pinKey!, $event)"
                @drag-start="beginPinnedDrag(item.pinKey!)"
                @drop="dropPinnedItem(item.pinKey!, $event)"
                @menu="selectProjectMenuAction(item.project, $event)"
                @new-conversation="emit('newProject', item.project.id)"
                @pin="unpinItem(item.pinKey!)"
                @toggle="toggleProject(item.project.id)"
              />
            </div>
            <DesktopChatConversationRow
              v-else
              :active="item.conversation.id === activeConversationId"
              :activity="item.conversation.activity"
              :dragging="item.pinnedTopLevel && draggedPinnedItemKey === item.pinKey"
              :drop-position="item.pinnedTopLevel ? getPinnedDropPosition(item.pinKey) : undefined"
              :language="language"
              :now="relativeTimeNow"
              :occurred-at="item.conversation.automationOccurrence?.scheduledFor ?? item.conversation.updatedAt"
              :pin-mode="item.pinnedTopLevel ? 'unpin' : undefined"
              :project-conversation="item.projectConversation"
              :reorderable="item.pinnedTopLevel"
              :reorder-target="item.pinnedTopLevel"
              :title="getConversationTitle(item.conversation)"
              @delete="requestConversationDelete(item.conversation)"
              @drag-end="endPinnedDrag"
              @drag-over="enterPinnedDropTarget(item.pinKey!, $event)"
              @drag-start="beginPinnedDrag(item.pinKey!)"
              @drop="dropPinnedItem(item.pinKey!, $event)"
              @open="emit('openConversation', item.conversation.id)"
              @pin="unpinItem(item.pinKey!)"
              @rename="requestConversationRename(item.conversation)"
            />
          </template>
        </DesktopChatSidebarSection>

        <DesktopChatSidebarSection
          v-model:expanded="projectsSectionExpanded"
          :items="projectRows"
          key-field="key"
          :label="t('desktop.chat.projectsSection')"
          :priority="DESKTOP_CHAT_SIDEBAR_SECTION_PRIORITIES.projects"
          section="projects"
          show-add
          @add="openProjectCreator"
        >
          <template #default="{ item }">
            <div v-if="item.kind === 'project'" class="desktop-chat-sidebar__project-item">
              <DesktopChatProjectRow
                :expanded="isProjectExpanded(item.project.id)"
                :language="language"
                pin-mode="pin"
                :project="item.project"
                @menu="selectProjectMenuAction(item.project, $event)"
                @new-conversation="emit('newProject', item.project.id)"
                @pin="pinProject(item.project.id)"
                @toggle="toggleProject(item.project.id)"
              />
            </div>
            <DesktopChatConversationRow
              v-else
              :active="item.conversation.id === activeConversationId"
              :activity="item.conversation.activity"
              :language="language"
              :now="relativeTimeNow"
              :occurred-at="item.conversation.automationOccurrence?.scheduledFor ?? item.conversation.updatedAt"
              project-conversation
              :title="getConversationTitle(item.conversation)"
              @delete="requestConversationDelete(item.conversation)"
              @open="emit('openConversation', item.conversation.id)"
              @rename="requestConversationRename(item.conversation)"
            />
          </template>
        </DesktopChatSidebarSection>

        <DesktopChatSidebarSection
          v-model:expanded="tasksSectionExpanded"
          :items="taskConversations"
          key-field="id"
          :label="t('desktop.chat.tasksSection')"
          :priority="DESKTOP_CHAT_SIDEBAR_SECTION_PRIORITIES.tasks"
          section="tasks"
        >
          <template #default="{ item: conversation }">
            <DesktopChatConversationRow
              :active="conversation.id === activeConversationId"
              :activity="conversation.activity"
              :language="language"
              :now="relativeTimeNow"
              :occurred-at="conversation.automationOccurrence?.scheduledFor ?? conversation.updatedAt"
              pin-mode="pin"
              :title="getConversationTitle(conversation)"
              @delete="requestConversationDelete(conversation)"
              @open="emit('openConversation', conversation.id)"
              @pin="pinConversation(conversation.id)"
              @rename="requestConversationRename(conversation)"
            />
          </template>
        </DesktopChatSidebarSection>
      </nav>
    </div>

    <DesktopProjectDialog
      v-model:show="projectDialogOpen"
      :language="language"
      :project="projectEditTarget"
      @save="saveProject"
    />

    <NModal
      :show="projectDeleteTarget !== null"
      preset="card"
      class="desktop-chat-sidebar__modal"
      :title="t('desktop.chat.deleteProjectTitle')"
      @update:show="!$event && (projectDeleteTarget = null)"
    >
      <div class="desktop-chat-sidebar__delete-project-content">
        <p>
          {{ t('desktop.chat.deleteProjectMessage', { name: projectDeleteTarget?.name ?? '' }) }}
        </p>
        <NAlert
          v-if="projectDeleteTarget && projectDeleteTarget.activeRunCount > 0"
          :show-icon="false"
          type="warning"
        >
          {{ t('desktop.chat.deleteProjectActiveRunWarning', { count: projectDeleteTarget.activeRunCount }) }}
        </NAlert>
        <p v-else class="desktop-chat-sidebar__delete-project-retention">
          {{ t('desktop.chat.deleteProjectRetention') }}
        </p>
      </div>
      <template #footer>
        <div class="desktop-chat-sidebar__modal-actions">
          <NButton @click="projectDeleteTarget = null">
            {{ projectDeleteTarget && projectDeleteTarget.activeRunCount > 0 ? t('common.close') : t('common.cancel') }}
          </NButton>
          <NButton
            v-if="projectDeleteTarget && projectDeleteTarget.activeRunCount === 0"
            type="error"
            @click="confirmProjectDelete"
          >
            {{ t('common.delete') }}
          </NButton>
        </div>
      </template>
    </NModal>

    <NModal
      :show="conversationRenameTarget !== null"
      preset="card"
      class="desktop-chat-sidebar__modal"
      :style="{ width: 'min(28rem, calc(100vw - 2rem))' }"
      :title="t('chat.renameConversation')"
      @update:show="!$event && (conversationRenameTarget = null)"
    >
      <NInput
        v-model:value="conversationTitleDraft"
        maxlength="80"
        show-count
        @keyup.enter="confirmConversationRename"
      />
      <template #footer>
        <div class="desktop-chat-sidebar__modal-actions">
          <NButton @click="conversationRenameTarget = null">
            {{ t('common.cancel') }}
          </NButton>
          <NButton
            type="primary"
            :disabled="!conversationTitleDraft.trim()"
            @click="confirmConversationRename"
          >
            {{ t('common.save') }}
          </NButton>
        </div>
      </template>
    </NModal>

    <NModal
      :show="conversationDeleteTarget !== null"
      preset="dialog"
      type="warning"
      :title="t('chat.deleteConversationConfirmTitle')"
      @update:show="!$event && (conversationDeleteTarget = null)"
    >
      {{ t('chat.deleteConversationConfirmMessage', { title: conversationDeleteTarget ? getConversationTitle(conversationDeleteTarget) : '' }) }}
      <template #action>
        <NButton @click="conversationDeleteTarget = null">
          {{ t('common.cancel') }}
        </NButton>
        <NButton type="error" @click="confirmConversationDelete">
          {{ t('common.delete') }}
        </NButton>
      </template>
    </NModal>
  </aside>
</template>

<style scoped lang="scss">
.desktop-chat-sidebar {
  display: flex;
  width: var(--buddy-workspace-sidebar-width);
  height: 100%;
  min-height: 0;
  flex: none;
  flex-direction: column;
  border-right: 1px solid var(--buddy-border-light);
  background: var(--buddy-bg-workspace-sidebar);
}

.desktop-chat-sidebar__header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-bottom: 1px solid var(--buddy-border-light);
  padding: 0 0.75rem 0 0.8rem;
}

.desktop-chat-sidebar__header-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.35rem;

  strong {
    overflow: hidden;
    font-size: var(--buddy-sidebar-header-font-size);
    font-weight: var(--buddy-sidebar-header-font-weight);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-chat-sidebar__new-trigger {
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

  .n-icon {
    font-size: 16px;
  }

  &:hover {
    background: var(--buddy-fill-base);
    color: var(--buddy-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }
}

.desktop-chat-sidebar__content {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  padding: 0.8rem 0 0.85rem 0.75rem;
}

.desktop-chat-sidebar nav {
  --buddy-chat-sidebar-section-gap: 0.7rem;
  --buddy-chat-sidebar-action-gap: 0.125rem;
  --buddy-chat-sidebar-action-inset: 0.25rem;
  --buddy-chat-sidebar-action-size: 1.75rem;
  --buddy-chat-sidebar-scrollbar-gutter: 0.75rem;
  --buddy-chat-sidebar-state-radius: 8px;

  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: var(--buddy-chat-sidebar-section-gap);
  overflow: hidden;
}

.desktop-chat-sidebar__project-item {
  height: var(--buddy-chat-sidebar-row-size);
  padding-right: var(--buddy-chat-sidebar-scrollbar-gutter);
  padding-bottom: calc(var(--buddy-chat-sidebar-row-size) - var(--buddy-chat-sidebar-row-height));
}

.desktop-chat-sidebar__modal {
  width: min(28rem, calc(100vw - 2rem));
}

.desktop-chat-sidebar__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.desktop-chat-sidebar__delete-project-content {
  display: grid;
  gap: 0.85rem;
}

.desktop-chat-sidebar__delete-project-content p {
  margin: 0;
  line-height: 1.65;
}

.desktop-chat-sidebar__delete-project-retention {
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
}
</style>
