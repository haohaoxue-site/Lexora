import type { DesktopTaskPinnedItem } from '@buddy-electron/shared/desktopApi'
import type {
  LocalConversation,
  LocalConversationSummary,
  LocalProject,
} from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import type { DesktopTaskPinnedDropPosition } from '@/workbenches/tasks/index/taskPinnedItems'
import type { TaskProjectInput } from '@/workbenches/tasks/state/useTaskProjects'
import { useIntervalFn } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import {
  prependDesktopTaskPinnedItem,
  removeDesktopTaskPinnedItem,
  reorderDesktopTaskPinnedItems,
  resolveTaskIndexProjection,
} from '@/workbenches/tasks/index/taskPinnedItems'

export type TaskProjectMenuAction = 'delete' | 'edit' | 'new-task'

interface UseTaskIndexControllerOptions {
  getUntitledLabel: () => string
  onCreateProject: (input: TaskProjectInput) => void
  onDeleteTask: (conversationId: string) => void
  onDeleteProject: (projectId: string) => void
  onNewTask: (projectId: string) => void
  onRenameTask: (conversationId: string, title: string) => void
  onUpdatePinnedItems: (items: DesktopTaskPinnedItem[]) => void
  onUpdateProject: (input: TaskProjectInput & { projectId: string }) => void
  pinnedItems: Readonly<Ref<ReadonlyArray<DesktopTaskPinnedItem>>>
  projects: Readonly<Ref<ReadonlyArray<LocalProject>>>
  tasks: Readonly<Ref<ReadonlyArray<LocalConversationSummary>>>
}

interface DesktopTaskPinnedDropTarget {
  key: string
  position: DesktopTaskPinnedDropPosition
}

export function useTaskIndexController(options: UseTaskIndexControllerOptions) {
  const expandedProjectIds = shallowRef<ReadonlySet<string>>(new Set())
  const taskRenameTarget = shallowRef<LocalConversation | null>(null)
  const taskDeleteTarget = shallowRef<LocalConversation | null>(null)
  const taskTitleDraft = shallowRef('')
  const pinnedSectionExpanded = shallowRef(true)
  const projectsSectionExpanded = shallowRef(true)
  const tasksSectionExpanded = shallowRef(true)
  const relativeTimeNow = shallowRef(Date.now())
  const projectDialogOpen = shallowRef(false)
  const projectEditTarget = shallowRef<LocalProject | null>(null)
  const projectDeleteTarget = shallowRef<LocalProject | null>(null)
  const draggedPinnedItemKey = shallowRef<string | null>(null)
  const pinnedDropTarget = shallowRef<DesktopTaskPinnedDropTarget | null>(null)
  const activeProjects = computed(() => options.projects.value.filter(
    project => project.revokedAt === null,
  ))
  const projection = computed(() => resolveTaskIndexProjection({
    expandedProjectIds: expandedProjectIds.value,
    pinnedItems: options.pinnedItems.value,
    projects: options.projects.value,
    tasks: options.tasks.value,
  }))
  const pinnedItems = computed(() => projection.value.pinnedItems)
  const pinnedRows = computed(() => projection.value.pinnedRows)
  const projectRows = computed(() => projection.value.projectRows)
  const globalTasks = computed(() => projection.value.globalTasks)

  useIntervalFn(() => {
    relativeTimeNow.value = Date.now()
  }, 60_000, {
    immediateCallback: true,
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

  function isProjectExpanded(projectId: string) {
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

  function getTaskTitle(conversation: LocalConversation) {
    return conversation.title?.trim() || options.getUntitledLabel()
  }

  function requestTaskRename(conversation: LocalConversation) {
    taskRenameTarget.value = conversation
    taskTitleDraft.value = getTaskTitle(conversation)
  }

  function requestTaskDelete(conversation: LocalConversation) {
    taskDeleteTarget.value = conversation
  }

  function confirmTaskRename() {
    const target = taskRenameTarget.value
    const title = taskTitleDraft.value.trim()
    if (!target || !title)
      return
    options.onRenameTask(target.id, title)
    taskRenameTarget.value = null
  }

  function confirmTaskDelete() {
    if (!taskDeleteTarget.value)
      return
    options.onDeleteTask(taskDeleteTarget.value.id)
    taskDeleteTarget.value = null
  }

  function pinProject(projectId: string) {
    options.onUpdatePinnedItems(prependDesktopTaskPinnedItem(
      pinnedItems.value,
      { id: projectId, kind: 'project' },
    ))
  }

  function pinTask(conversationId: string) {
    options.onUpdatePinnedItems(prependDesktopTaskPinnedItem(
      pinnedItems.value,
      { id: conversationId, kind: 'conversation' },
    ))
  }

  function unpinItem(pinKey: string) {
    options.onUpdatePinnedItems(removeDesktopTaskPinnedItem(pinnedItems.value, pinKey))
  }

  function beginPinnedDrag(pinKey: string) {
    draggedPinnedItemKey.value = pinKey
    pinnedDropTarget.value = null
  }

  function enterPinnedDropTarget(pinKey: string, position: DesktopTaskPinnedDropPosition) {
    if (draggedPinnedItemKey.value && draggedPinnedItemKey.value !== pinKey)
      pinnedDropTarget.value = { key: pinKey, position }
  }

  function getPinnedDropPosition(pinKey: string | undefined) {
    return pinKey && pinnedDropTarget.value?.key === pinKey
      ? pinnedDropTarget.value.position
      : undefined
  }

  function dropPinnedItem(pinKey: string, position: DesktopTaskPinnedDropPosition) {
    if (!draggedPinnedItemKey.value)
      return
    options.onUpdatePinnedItems(reorderDesktopTaskPinnedItems(
      pinnedItems.value,
      draggedPinnedItemKey.value,
      pinKey,
      position,
    ))
    endPinnedDrag()
  }

  function endPinnedDrag() {
    draggedPinnedItemKey.value = null
    pinnedDropTarget.value = null
  }

  function openProjectCreator() {
    projectEditTarget.value = null
    projectDialogOpen.value = true
  }

  function selectProjectMenuAction(project: LocalProject, action: TaskProjectMenuAction) {
    if (action === 'new-task') {
      options.onNewTask(project.id)
      return
    }
    if (action === 'edit') {
      projectEditTarget.value = project
      projectDialogOpen.value = true
      return
    }
    if (action === 'delete')
      projectDeleteTarget.value = project
  }

  function saveProject(input: TaskProjectInput) {
    const project = projectEditTarget.value
    if (project)
      options.onUpdateProject({ ...input, projectId: project.id })
    else
      options.onCreateProject(input)
    projectEditTarget.value = null
  }

  function confirmProjectDelete() {
    const project = projectDeleteTarget.value
    if (!project || project.activeRunCount > 0)
      return
    options.onDeleteProject(project.id)
    projectDeleteTarget.value = null
  }

  return {
    confirmTaskDelete,
    confirmTaskRename,
    confirmProjectDelete,
    beginPinnedDrag,
    draggedPinnedItemKey,
    dropPinnedItem,
    endPinnedDrag,
    enterPinnedDropTarget,
    getTaskTitle,
    getPinnedDropPosition,
    isProjectExpanded,
    openProjectCreator,
    pinTask,
    pinProject,
    pinnedItems,
    pinnedRows,
    pinnedSectionExpanded,
    projectDeleteTarget,
    projectDialogOpen,
    projectEditTarget,
    projectRows,
    projectsSectionExpanded,
    relativeTimeNow,
    requestTaskDelete,
    requestTaskRename,
    saveProject,
    selectProjectMenuAction,
    globalTasks,
    taskDeleteTarget,
    taskRenameTarget,
    taskTitleDraft,
    tasksSectionExpanded,
    toggleProject,
    unpinItem,
  }
}
