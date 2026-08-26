<script setup lang="ts">
import type { LocalProject } from '@buddy-electron/shared/localChatApi'
import type { InputInst } from 'naive-ui'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { TaskProjectInput } from '@/workbenches/tasks/state/useTaskProjects'
import {
  Checkmark16Regular,
  ChevronDown16Regular,
  Folder16Regular,
  FolderAdd16Regular,
  Search16Regular,
} from '@vicons/fluent'
import { NButton, NIcon, NInput, NPopover } from 'naive-ui'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/ui/DesktopIcon.vue'
import DesktopProjectDialog from '@/workbenches/tasks/index/DesktopProjectDialog.vue'

const props = defineProps<{
  activeProject: LocalProject | null
  language: BuddyLocale
  projects: ReadonlyArray<LocalProject>
  selectDirectory: () => Promise<string | null>
}>()

const emit = defineEmits<{
  createProject: [input: TaskProjectInput]
  selectProject: [projectId: string | null]
}>()

const { t } = useBuddyI18n(() => props.language)
const panelOpen = shallowRef(false)
const projectDialogOpen = shallowRef(false)
const query = shallowRef('')
const searchInput = useTemplateRef<InputInst>('searchInput')
const activeProjects = computed(() => props.projects.filter(project => project.revokedAt === null))
const visibleProjects = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  if (!normalizedQuery)
    return activeProjects.value
  return activeProjects.value.filter(project => (
    project.name.toLocaleLowerCase().includes(normalizedQuery)
  ))
})
const triggerLabel = computed(() => props.activeProject?.name ?? t('desktop.tasks.projectSelect'))

watch(panelOpen, async (open) => {
  if (!open)
    return
  query.value = ''
  await nextTick()
  searchInput.value?.focus()
})

function selectProject(projectId: string) {
  panelOpen.value = false
  if (projectId !== props.activeProject?.id)
    emit('selectProject', projectId)
}

function clearProject() {
  panelOpen.value = false
  emit('selectProject', null)
}

function openProjectCreator() {
  panelOpen.value = false
  projectDialogOpen.value = true
}
</script>

<template>
  <NPopover
    class="buddy-raw-popover"
    raw
    :show="panelOpen"
    :show-arrow="false"
    placement="top-start"
    to=".buddy-app"
    trigger="click"
    @update:show="panelOpen = $event"
  >
    <template #trigger>
      <NButton
        class="desktop-task-project-selector__trigger"
        quaternary
        size="small"
        aria-haspopup="dialog"
        :aria-expanded="panelOpen"
      >
        <NIcon class="desktop-task-project-selector__icon" :component="Folder16Regular" :size="16" />
        <span>{{ triggerLabel }}</span>
        <NIcon
          class="desktop-task-project-selector__chevron"
          :class="{ 'is-open': panelOpen }"
          :component="ChevronDown16Regular"
          :size="16"
        />
      </NButton>
    </template>

    <section
      class="desktop-task-project-selector__panel"
      role="dialog"
      :aria-label="t('desktop.tasks.projectSelect')"
    >
      <div class="desktop-task-project-selector__search">
        <NInput
          ref="searchInput"
          v-model:value="query"
          clearable
          size="small"
          :placeholder="t('desktop.tasks.projectSearch')"
        >
          <template #prefix>
            <NIcon class="desktop-task-project-selector__icon" :component="Search16Regular" :size="16" />
          </template>
        </NInput>
      </div>

      <div class="desktop-task-project-selector__projects" role="listbox">
        <button
          v-for="project in visibleProjects"
          :key="project.id"
          class="desktop-task-project-selector__project"
          :class="{ 'is-selected': activeProject?.id === project.id }"
          type="button"
          role="option"
          :aria-selected="activeProject?.id === project.id"
          @click="selectProject(project.id)"
        >
          <NIcon class="desktop-task-project-selector__icon" :component="Folder16Regular" :size="16" />
          <span>{{ project.name }}</span>
          <NIcon
            v-if="activeProject?.id === project.id"
            class="desktop-task-project-selector__icon"
            :component="Checkmark16Regular"
            :size="16"
          />
        </button>
        <span v-if="!visibleProjects.length" class="desktop-task-project-selector__empty">
          {{ t('desktop.tasks.projectSearchEmpty') }}
        </span>
      </div>

      <div class="desktop-task-project-selector__divider" role="separator" />
      <button
        class="desktop-task-project-selector__action desktop-task-project-selector__create"
        type="button"
        @click="openProjectCreator"
      >
        <NIcon class="desktop-task-project-selector__icon" :component="FolderAdd16Regular" :size="16" />
        <span>{{ t('desktop.tasks.createProjectTitle') }}</span>
      </button>

      <template v-if="activeProject">
        <div class="desktop-task-project-selector__divider" role="separator" />
        <button
          class="desktop-task-project-selector__action desktop-task-project-selector__clear"
          type="button"
          @click="clearProject"
        >
          <DesktopIcon class="desktop-task-project-selector__icon" name="projectNone" />
          <span>{{ t('desktop.tasks.projectNone') }}</span>
        </button>
      </template>
    </section>
  </NPopover>

  <DesktopProjectDialog
    v-model:show="projectDialogOpen"
    :language="language"
    :project="null"
    :select-directory="selectDirectory"
    @save="emit('createProject', $event)"
  />
</template>

<style scoped lang="scss">
.desktop-task-project-selector__trigger {
  max-width: min(14rem, 28vw);
  min-width: 0;
  height: var(--buddy-composer-control-height);
  border-radius: var(--buddy-composer-control-radius);
  background-color: transparent;
  color: var(--buddy-text-secondary);
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &.n-button:not(.n-button--disabled):hover,
  &.n-button:not(.n-button--disabled):focus-visible {
    background-color: var(--buddy-accent-surface-subtle);
    color: var(--buddy-text-strong);
  }

  &.n-button:not(.n-button--disabled)[aria-expanded='true'] {
    background-color: var(--buddy-accent-surface);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }

  :deep(.n-button__content) {
    min-width: 0;
    gap: 0.3rem;
  }

  span {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-task-project-selector__chevron {
  flex: none;
  font-size: 14px;
  transition: transform 120ms ease;

  &.is-open {
    transform: rotate(180deg);
  }
}

.desktop-task-project-selector__panel {
  width: min(12rem, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--buddy-menu-radius);
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-overlay);
  color: var(--buddy-text-strong);
  padding: 6px;
}

.desktop-task-project-selector__search {
  padding-bottom: 5px;
}

.desktop-task-project-selector__search :deep(.n-input) {
  border-radius: var(--buddy-radius-micro);
}

.desktop-task-project-selector__projects {
  display: grid;
  max-height: calc(var(--buddy-menu-row-height) * 5 + var(--buddy-menu-row-gap) * 4);
  align-content: start;
  gap: var(--buddy-menu-row-gap);
  overflow-y: auto;
  scrollbar-color: var(--buddy-border-strong) transparent;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    width: 0.35rem;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--buddy-border-strong);
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-button {
    display: none;
  }
}

.desktop-task-project-selector__project,
.desktop-task-project-selector__action {
  display: grid;
  width: 100%;
  min-width: 0;
  height: var(--buddy-menu-row-height);
  grid-template-columns: var(--buddy-menu-icon-size) minmax(0, 1fr) var(--buddy-menu-icon-size);
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: var(--buddy-menu-item-radius);
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  font-size: var(--buddy-sidebar-project-font-size);
  padding: 0 7px;
  text-align: left;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  > span {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    background: var(--buddy-nav-hover);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    background: var(--buddy-nav-hover);
    color: var(--buddy-text-strong);
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.desktop-task-project-selector__project.is-selected {
  background: var(--buddy-nav-selected);
  color: var(--buddy-nav-foreground);
  font-weight: 600;
}

.desktop-task-project-selector__project.is-selected:hover {
  background: var(--buddy-nav-pressed);
  color: var(--buddy-nav-foreground);
}

.desktop-task-project-selector__project.is-selected:focus-visible {
  background: var(--buddy-nav-selected);
  color: var(--buddy-nav-foreground);
}

.desktop-task-project-selector__action {
  grid-template-columns: var(--buddy-menu-icon-size) minmax(0, 1fr);
}

.desktop-task-project-selector__icon {
  width: var(--buddy-menu-icon-size);
  height: var(--buddy-menu-icon-size);
  font-size: var(--buddy-menu-icon-size);
}

.desktop-task-project-selector__divider {
  height: 1px;
  background: var(--buddy-border-subtle);
  margin: 5px 6px;
}

.desktop-task-project-selector__empty {
  display: grid;
  min-height: var(--buddy-menu-row-height);
  place-items: center;
  color: var(--buddy-text-muted);
  font-size: 0.72rem;
}
</style>
