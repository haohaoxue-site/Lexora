<script setup lang="ts">
import type {
  DesktopChatSidebarSection as ChatSidebarSection,
  DesktopChatSidebarSectionOrder,
} from '@buddy-electron/shared/desktopApi'
import type { LocalConversationSummary, LocalProject } from '@buddy-electron/shared/localChatApi'
import type { DropdownOption } from 'naive-ui'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ChatProjectInput } from '@/workbenches/chat/state/useChatProjects'
import {
  Add16Regular,
  Delete20Regular,
  Edit20Regular,
  Folder20Regular,
  FolderOpen20Regular,
  MoreHorizontal20Regular,
  PanelLeft20Regular,
} from '@vicons/fluent'
import { NAlert, NButton, NDropdown, NIcon, NInput, NModal } from 'naive-ui'
import { computed, h, toRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import {
  DESKTOP_CHAT_SIDEBAR_ROW_HEIGHT,
  DESKTOP_CHAT_SIDEBAR_ROW_SIZE,
  DESKTOP_CHAT_SIDEBAR_SECTION_HEADER_SIZE,
} from '@/workbenches/chat/index/chatSidebarLayout'
import DesktopChatConversationRow from '@/workbenches/chat/index/DesktopChatConversationRow.vue'
import DesktopChatSidebarSection from '@/workbenches/chat/index/DesktopChatSidebarSection.vue'
import DesktopProjectDialog from '@/workbenches/chat/index/DesktopProjectDialog.vue'
import { useChatIndexController } from '@/workbenches/chat/index/useChatIndexController'

const props = defineProps<{
  activeConversationId: string | null
  appSidebarCollapsed: boolean
  conversations: ReadonlyArray<LocalConversationSummary>
  language: BuddyLocale
  projects: ReadonlyArray<LocalProject>
  sectionOrder: ReadonlyArray<ChatSidebarSection>
}>()
const emit = defineEmits<{
  createProject: [input: ChatProjectInput]
  deleteProject: [projectId: string]
  deleteConversation: [conversationId: string]
  newGlobal: []
  newProject: [projectId: string]
  openConversation: [conversationId: string]
  renameConversation: [conversationId: string, title: string]
  reorderSections: [order: DesktopChatSidebarSectionOrder]
  toggleAppSidebar: []
  updateProject: [input: ChatProjectInput & { projectId: string }]
}>()

const { t } = useBuddyI18n(() => props.language)
const sidebarLayoutStyle = {
  '--buddy-chat-sidebar-row-height': `${DESKTOP_CHAT_SIDEBAR_ROW_HEIGHT}px`,
  '--buddy-chat-sidebar-row-size': `${DESKTOP_CHAT_SIDEBAR_ROW_SIZE}px`,
  '--buddy-chat-sidebar-section-header-size': `${DESKTOP_CHAT_SIDEBAR_SECTION_HEADER_SIZE}px`,
}
const projectMenuOptions = computed<DropdownOption[]>(() => [
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
const {
  confirmConversationDelete,
  confirmConversationRename,
  confirmProjectDelete,
  conversationDeleteTarget,
  conversationRenameTarget,
  conversationTitleDraft,
  getConversationTitle,
  getSectionIndex,
  globalConversations,
  isProjectExpanded,
  moveSection,
  openProjectCreator,
  projectDeleteTarget,
  projectDialogOpen,
  projectEditTarget,
  projectRows,
  projectsSectionExpanded,
  recentSectionExpanded,
  relativeTimeNow,
  requestConversationDelete,
  requestConversationRename,
  saveProject,
  selectProjectMenuAction,
  toggleProject,
} = useChatIndexController({
  conversations: toRef(props, 'conversations'),
  getUntitledLabel: () => t('desktop.chat.untitled'),
  onCreateProject: input => emit('createProject', input),
  onDeleteConversation: conversationId => emit('deleteConversation', conversationId),
  onDeleteProject: projectId => emit('deleteProject', projectId),
  onRenameConversation: (conversationId, title) => emit('renameConversation', conversationId, title),
  onReorderSections: order => emit('reorderSections', order),
  onUpdateProject: input => emit('updateProject', input),
  projects: toRef(props, 'projects'),
  sectionOrder: toRef(props, 'sectionOrder'),
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
        <template v-for="section in sectionOrder" :key="section">
          <DesktopChatSidebarSection
            v-if="section === 'recent'"
            v-model:expanded="recentSectionExpanded"
            :can-move-down="getSectionIndex('recent') < sectionOrder.length - 1"
            :can-move-up="getSectionIndex('recent') > 0"
            :fill-remaining="getSectionIndex('recent') === sectionOrder.length - 1"
            :items="globalConversations"
            key-field="id"
            :label="t('desktop.chat.recentSection')"
            :language="language"
            section="recent"
            @move="moveSection('recent', $event)"
          >
            <template #default="{ item: conversation }">
              <DesktopChatConversationRow
                :active="conversation.id === activeConversationId"
                :activity="conversation.activity"
                :language="language"
                :now="relativeTimeNow"
                :title="getConversationTitle(conversation)"
                :updated-at="conversation.updatedAt"
                @delete="requestConversationDelete(conversation)"
                @open="emit('openConversation', conversation.id)"
                @rename="requestConversationRename(conversation)"
              />
            </template>
          </DesktopChatSidebarSection>

          <DesktopChatSidebarSection
            v-else-if="section === 'projects'"
            v-model:expanded="projectsSectionExpanded"
            :can-move-down="getSectionIndex('projects') < sectionOrder.length - 1"
            :can-move-up="getSectionIndex('projects') > 0"
            :fill-remaining="getSectionIndex('projects') === sectionOrder.length - 1"
            :items="projectRows"
            key-field="key"
            :label="t('desktop.chat.projectsSection')"
            :language="language"
            section="projects"
            show-add
            @add="openProjectCreator"
            @move="moveSection('projects', $event)"
          >
            <template #default="{ item }">
              <div v-if="item.kind === 'project'" class="desktop-chat-sidebar__project-item">
                <div class="desktop-chat-sidebar__project-row">
                  <button
                    class="desktop-chat-sidebar__project-name"
                    type="button"
                    :aria-expanded="isProjectExpanded(item.project.id)"
                    @click="toggleProject(item.project.id)"
                  >
                    <NIcon :component="isProjectExpanded(item.project.id) ? FolderOpen20Regular : Folder20Regular" />
                    <span>{{ item.project.name }}</span>
                  </button>
                  <div class="desktop-chat-sidebar__project-actions">
                    <button
                      class="desktop-chat-sidebar__project-new"
                      type="button"
                      @click="emit('newProject', item.project.id)"
                    >
                      <NIcon :component="Add16Regular" />
                    </button>
                    <NDropdown
                      trigger="click"
                      :options="projectMenuOptions"
                      @select="selectProjectMenuAction(item.project, $event)"
                    >
                      <button
                        class="desktop-chat-sidebar__project-more"
                        type="button"
                      >
                        <NIcon :component="MoreHorizontal20Regular" />
                      </button>
                    </NDropdown>
                  </div>
                </div>
              </div>
              <DesktopChatConversationRow
                v-else
                :active="item.conversation.id === activeConversationId"
                :activity="item.conversation.activity"
                :language="language"
                :now="relativeTimeNow"
                project-conversation
                :title="getConversationTitle(item.conversation)"
                :updated-at="item.conversation.updatedAt"
                @delete="requestConversationDelete(item.conversation)"
                @open="emit('openConversation', item.conversation.id)"
                @rename="requestConversationRename(item.conversation)"
              />
            </template>
          </DesktopChatSidebarSection>
        </template>
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
  --buddy-chat-sidebar-section-half-gap: 0.35rem;
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

.desktop-chat-sidebar__project-row {
  display: flex;
  height: 100%;
  min-width: 0;
  align-items: center;
  border-radius: var(--buddy-chat-sidebar-state-radius);

  &:hover,
  &:focus-within {
    background: var(--buddy-fill-base);
  }
}

.desktop-chat-sidebar__project-name,
.desktop-chat-sidebar__project-new,
.desktop-chat-sidebar__project-more {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.desktop-chat-sidebar__project-name {
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

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:focus-visible {
    border-radius: 6px;
    outline: 2px solid var(--buddy-accent-primary);
    outline-offset: -2px;
  }
}

.desktop-chat-sidebar__project-new,
.desktop-chat-sidebar__project-more {
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

.desktop-chat-sidebar__project-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--buddy-chat-sidebar-action-gap);
  opacity: 0;
  padding-right: var(--buddy-chat-sidebar-action-inset);
  pointer-events: none;
}

.desktop-chat-sidebar__project-row:hover .desktop-chat-sidebar__project-actions,
.desktop-chat-sidebar__project-row:has(:focus-visible) .desktop-chat-sidebar__project-actions {
  opacity: 1;
  pointer-events: auto;
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
