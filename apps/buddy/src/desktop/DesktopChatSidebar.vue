<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
import type { DesktopChatSidebarSection } from '../../electron/shared/desktopApi'
import type {
  LocalConversation,
  LocalConversationSummary,
  LocalProject,
} from '../../electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  Add16Regular,
  Delete20Regular,
  Edit20Regular,
  Folder20Regular,
  FolderOpen20Regular,
  MoreHorizontal20Regular,
  PanelLeft20Regular,
} from '@vicons/fluent'
import { NAlert, NButton, NDropdown, NIcon, NInput, NModal, NVirtualList } from 'naive-ui'
import { computed, h, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopChatConversationRow from './DesktopChatConversationRow.vue'
import {
  DESKTOP_CHAT_SIDEBAR_LIST_PADDING_TOP,
  DESKTOP_CHAT_SIDEBAR_ROW_HEIGHT,
  DESKTOP_CHAT_SIDEBAR_ROW_SIZE,
  DESKTOP_CHAT_SIDEBAR_SECTION_HEADER_SIZE,
  resolveDesktopChatSidebarSectionLayout,
} from './desktopChatSidebarLayout'
import DesktopChatSidebarSectionHeader from './DesktopChatSidebarSectionHeader.vue'
import DesktopProjectCreateDialog from './DesktopProjectCreateDialog.vue'

type DesktopChatProjectRow
  = | { key: string, kind: 'project', project: LocalProject }
    | { conversation: LocalConversationSummary, key: string, kind: 'conversation' }

interface ProjectFormInput {
  instructions: string
  memoryScope: 'personal_and_project' | 'project_only'
  name: string
  root: string | null
}

const props = defineProps<{
  activeConversationId: string | null
  appSidebarCollapsed: boolean
  conversations: ReadonlyArray<LocalConversationSummary>
  language: BuddyLocale
  projects: ReadonlyArray<LocalProject>
  sectionOrder: readonly [DesktopChatSidebarSection, DesktopChatSidebarSection]
}>()
const emit = defineEmits<{
  createProject: [input: ProjectFormInput]
  deleteProject: [projectId: string]
  deleteConversation: [conversationId: string]
  newGlobal: []
  newProject: [projectId: string]
  openConversation: [conversationId: string]
  renameConversation: [conversationId: string, title: string]
  reorderSections: [order: [DesktopChatSidebarSection, DesktopChatSidebarSection]]
  toggleAppSidebar: []
  updateProject: [input: ProjectFormInput & { projectId: string }]
}>()

const { t } = useBuddyI18n(() => props.language)
const expandedProjectIds = shallowRef<ReadonlySet<string>>(new Set())
const renameTarget = shallowRef<LocalConversation | null>(null)
const deleteTarget = shallowRef<LocalConversation | null>(null)
const renameTitle = shallowRef('')
const recentExpanded = shallowRef(true)
const projectsExpanded = shallowRef(true)
const relativeTimeNow = shallowRef(Date.now())
const projectDialogOpen = shallowRef(false)
const projectEditTarget = shallowRef<LocalProject | null>(null)
const projectDeleteTarget = shallowRef<LocalProject | null>(null)
const activeProjects = computed(() => props.projects.filter(project => project.revokedAt === null))
const globalConversations = computed(() => props.conversations.filter(
  conversation => conversation.projectId === null,
))
const projectRows = computed<DesktopChatProjectRow[]>(() => {
  const conversationsByProject = new Map<string, LocalConversationSummary[]>()
  for (const conversation of props.conversations) {
    if (!conversation.projectId)
      continue
    const conversations = conversationsByProject.get(conversation.projectId) ?? []
    conversations.push(conversation)
    conversationsByProject.set(conversation.projectId, conversations)
  }

  return activeProjects.value.flatMap((project) => {
    const rows: DesktopChatProjectRow[] = [{
      key: `project:${project.id}`,
      kind: 'project',
      project,
    }]
    if (!projectExpanded(project.id))
      return rows
    return rows.concat((conversationsByProject.get(project.id) ?? []).map(conversation => ({
      conversation,
      key: `conversation:${conversation.id}`,
      kind: 'conversation' as const,
    })))
  })
})
const sectionLayouts = computed(() => ({
  projects: resolveDesktopChatSidebarSectionLayout({
    expanded: projectsExpanded.value,
    position: sectionIndex('projects') === 0 ? 'top' : 'bottom',
    rowCount: projectRows.value.length,
  }),
  recent: resolveDesktopChatSidebarSectionLayout({
    expanded: recentExpanded.value,
    position: sectionIndex('recent') === 0 ? 'top' : 'bottom',
    rowCount: globalConversations.value.length,
  }),
}))
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
let relativeTimeTimer: number | undefined

onMounted(() => {
  relativeTimeNow.value = Date.now()
  relativeTimeTimer = window.setInterval(() => {
    relativeTimeNow.value = Date.now()
  }, 60_000)
})

onBeforeUnmount(() => {
  if (relativeTimeTimer !== undefined)
    window.clearInterval(relativeTimeTimer)
})

watch(
  activeProjects,
  (projects) => {
    expandedProjectIds.value = new Set([
      ...expandedProjectIds.value,
      ...projects.map(project => project.id),
    ])
  },
  { immediate: true },
)

function projectExpanded(projectId: string) {
  return expandedProjectIds.value.has(projectId)
}

function toggleProject(projectId: string) {
  const next = new Set(expandedProjectIds.value)
  if (next.has(projectId))
    next.delete(projectId)
  else
    next.add(projectId)
  expandedProjectIds.value = next
}

function formatConversationTitle(conversation: LocalConversation) {
  return conversation.title?.trim() || t('desktop.chat.untitled')
}

function openRename(conversation: LocalConversation) {
  renameTarget.value = conversation
  renameTitle.value = formatConversationTitle(conversation)
}

function confirmRename() {
  const target = renameTarget.value
  const title = renameTitle.value.trim()
  if (!target || !title)
    return
  emit('renameConversation', target.id, title)
  renameTarget.value = null
}

function confirmDelete() {
  if (!deleteTarget.value)
    return
  emit('deleteConversation', deleteTarget.value.id)
  deleteTarget.value = null
}

function moveSection(section: DesktopChatSidebarSection, direction: 'up' | 'down') {
  const currentIndex = props.sectionOrder.indexOf(section)
  const nextIndex = currentIndex + (direction === 'up' ? -1 : 1)
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= props.sectionOrder.length)
    return
  const next = [...props.sectionOrder] as [DesktopChatSidebarSection, DesktopChatSidebarSection]
  ;[next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]]
  emit('reorderSections', next)
}

function sectionIndex(section: DesktopChatSidebarSection) {
  return props.sectionOrder.indexOf(section)
}

function sectionLayoutStyle(section: DesktopChatSidebarSection) {
  return {
    '--buddy-chat-sidebar-section-natural-size': sectionLayouts.value[section].naturalSize,
  }
}

function openCreateProject() {
  projectEditTarget.value = null
  projectDialogOpen.value = true
}

function handleProjectAction(project: LocalProject, action: string | number) {
  if (action === 'edit') {
    projectEditTarget.value = project
    projectDialogOpen.value = true
    return
  }
  if (action === 'delete')
    projectDeleteTarget.value = project
}

function saveProject(input: ProjectFormInput) {
  const project = projectEditTarget.value
  if (project)
    emit('updateProject', { ...input, projectId: project.id })
  else
    emit('createProject', input)
  projectEditTarget.value = null
}

function confirmProjectDelete() {
  const project = projectDeleteTarget.value
  if (!project || project.activeRunCount > 0)
    return
  emit('deleteProject', project.id)
  projectDeleteTarget.value = null
}
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
          <section
            v-if="section === 'recent'"
            class="desktop-chat-sidebar__section"
            :class="`is-${sectionLayouts.recent.mode}`"
            :style="sectionLayoutStyle('recent')"
          >
            <DesktopChatSidebarSectionHeader
              :can-move-down="sectionIndex('recent') < sectionOrder.length - 1"
              :can-move-up="sectionIndex('recent') > 0"
              :expanded="recentExpanded"
              :label="t('desktop.chat.recentSection')"
              :language="language"
              @move="moveSection('recent', $event)"
              @toggle="recentExpanded = !recentExpanded"
            />
            <NVirtualList
              v-show="recentExpanded"
              class="desktop-chat-sidebar__virtual-list"
              :item-size="DESKTOP_CHAT_SIDEBAR_ROW_SIZE"
              :items="globalConversations"
              key-field="id"
              :padding-top="DESKTOP_CHAT_SIDEBAR_LIST_PADDING_TOP"
            >
              <template #default="{ item: conversation }">
                <DesktopChatConversationRow
                  :active="conversation.id === activeConversationId"
                  :activity="conversation.activity"
                  :language="language"
                  :now="relativeTimeNow"
                  :title="formatConversationTitle(conversation)"
                  :updated-at="conversation.updatedAt"
                  @delete="deleteTarget = conversation"
                  @open="emit('openConversation', conversation.id)"
                  @rename="openRename(conversation)"
                />
              </template>
            </NVirtualList>
          </section>

          <section
            v-else
            class="desktop-chat-sidebar__section desktop-chat-sidebar__projects"
            :class="`is-${sectionLayouts.projects.mode}`"
            :style="sectionLayoutStyle('projects')"
          >
            <DesktopChatSidebarSectionHeader
              :can-move-down="sectionIndex('projects') < sectionOrder.length - 1"
              :can-move-up="sectionIndex('projects') > 0"
              :expanded="projectsExpanded"
              :label="t('desktop.chat.projectsSection')"
              :language="language"
              show-add
              @add="openCreateProject"
              @move="moveSection('projects', $event)"
              @toggle="projectsExpanded = !projectsExpanded"
            />

            <NVirtualList
              v-show="projectsExpanded"
              class="desktop-chat-sidebar__virtual-list"
              :item-size="DESKTOP_CHAT_SIDEBAR_ROW_SIZE"
              :items="projectRows"
              key-field="key"
              :padding-top="DESKTOP_CHAT_SIDEBAR_LIST_PADDING_TOP"
            >
              <template #default="{ item }">
                <div v-if="item.kind === 'project'" class="desktop-chat-sidebar__project-item">
                  <div class="desktop-chat-sidebar__project-row">
                    <button
                      class="desktop-chat-sidebar__project-name"
                      type="button"
                      :aria-expanded="projectExpanded(item.project.id)"
                      @click="toggleProject(item.project.id)"
                    >
                      <NIcon :component="projectExpanded(item.project.id) ? FolderOpen20Regular : Folder20Regular" />
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
                        @select="handleProjectAction(item.project, $event)"
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
                  :title="formatConversationTitle(item.conversation)"
                  :updated-at="item.conversation.updatedAt"
                  @delete="deleteTarget = item.conversation"
                  @open="emit('openConversation', item.conversation.id)"
                  @rename="openRename(item.conversation)"
                />
              </template>
            </NVirtualList>
          </section>
        </template>
      </nav>
    </div>

    <DesktopProjectCreateDialog
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
      :show="renameTarget !== null"
      preset="card"
      class="desktop-chat-sidebar__modal"
      :style="{ width: 'min(28rem, calc(100vw - 2rem))' }"
      :title="t('chat.renameConversation')"
      @update:show="!$event && (renameTarget = null)"
    >
      <NInput v-model:value="renameTitle" maxlength="80" show-count @keyup.enter="confirmRename" />
      <template #footer>
        <div class="desktop-chat-sidebar__modal-actions">
          <NButton @click="renameTarget = null">
            {{ t('common.cancel') }}
          </NButton>
          <NButton type="primary" :disabled="!renameTitle.trim()" @click="confirmRename">
            {{ t('common.save') }}
          </NButton>
        </div>
      </template>
    </NModal>

    <NModal
      :show="deleteTarget !== null"
      preset="dialog"
      type="warning"
      :title="t('chat.deleteConversationConfirmTitle')"
      @update:show="!$event && (deleteTarget = null)"
    >
      {{ t('chat.deleteConversationConfirmMessage', { title: deleteTarget ? formatConversationTitle(deleteTarget) : '' }) }}
      <template #action>
        <NButton @click="deleteTarget = null">
          {{ t('common.cancel') }}
        </NButton>
        <NButton type="error" @click="confirmDelete">
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

.desktop-chat-sidebar__section {
  display: flex;
  min-height: var(--buddy-chat-sidebar-section-header-size);
  flex-direction: column;
  overflow: hidden;

  &.is-content-shrink {
    flex: 0 1 var(--buddy-chat-sidebar-section-natural-size);
  }

  &.is-fill-remaining {
    flex-grow: 1;
    flex-shrink: 0;
    flex-basis: min(
      var(--buddy-chat-sidebar-section-natural-size),
      calc(50% - var(--buddy-chat-sidebar-section-half-gap))
    );
  }

  &.is-collapsed {
    flex: 0 0 var(--buddy-chat-sidebar-section-header-size);
  }
}

.desktop-chat-sidebar__virtual-list {
  height: 100%;
  min-height: 0;
  flex: 1;
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
