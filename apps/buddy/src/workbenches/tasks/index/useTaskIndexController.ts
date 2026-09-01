import type { DesktopTaskPinnedItem } from '@buddy-electron/shared/desktopApi'
import type {
  LocalConversation,
  LocalConversationSummary,
  LocalSpace,
} from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import type { DesktopTaskPinnedDropPosition } from '@/workbenches/tasks/index/taskPinnedItems'
import type { TaskSpaceInput } from '@/workbenches/tasks/state/useTaskSpaces'
import { useIntervalFn } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import {
  prependDesktopTaskPinnedItem,
  removeDesktopTaskPinnedItem,
  reorderDesktopTaskPinnedItems,
  resolveTaskIndexProjection,
} from '@/workbenches/tasks/index/taskPinnedItems'

export type TaskSpaceMenuAction = 'delete' | 'edit' | 'new-task'

interface UseTaskIndexControllerOptions {
  getUntitledLabel: () => string
  onCreateSpace: (input: TaskSpaceInput) => void
  onDeleteTask: (conversationId: string) => void
  onDeleteSpace: (spaceId: string) => void
  onNewTask: (spaceId: string) => void
  onRenameTask: (conversationId: string, title: string) => void
  onUpdatePinnedItems: (items: DesktopTaskPinnedItem[]) => void
  onUpdateSpace: (input: TaskSpaceInput & { spaceId: string }) => void
  pinnedItems: Readonly<Ref<ReadonlyArray<DesktopTaskPinnedItem>>>
  spaces: Readonly<Ref<ReadonlyArray<LocalSpace>>>
  tasks: Readonly<Ref<ReadonlyArray<LocalConversationSummary>>>
}

interface DesktopTaskPinnedDropTarget {
  key: string
  position: DesktopTaskPinnedDropPosition
}

export function useTaskIndexController(options: UseTaskIndexControllerOptions) {
  const expandedSpaceIds = shallowRef<ReadonlySet<string>>(new Set())
  const taskRenameTarget = shallowRef<LocalConversation | null>(null)
  const taskDeleteTarget = shallowRef<LocalConversation | null>(null)
  const taskTitleDraft = shallowRef('')
  const pinnedSectionExpanded = shallowRef(true)
  const spacesSectionExpanded = shallowRef(true)
  const tasksSectionExpanded = shallowRef(true)
  const relativeTimeNow = shallowRef(Date.now())
  const spaceDialogOpen = shallowRef(false)
  const spaceEditTarget = shallowRef<LocalSpace | null>(null)
  const spaceDeleteTarget = shallowRef<LocalSpace | null>(null)
  const draggedPinnedItemKey = shallowRef<string | null>(null)
  const pinnedDropTarget = shallowRef<DesktopTaskPinnedDropTarget | null>(null)
  const activeSpaces = computed(() => options.spaces.value.filter(
    space => space.revokedAt === null,
  ))
  const projection = computed(() => resolveTaskIndexProjection({
    expandedSpaceIds: expandedSpaceIds.value,
    pinnedItems: options.pinnedItems.value,
    spaces: options.spaces.value,
    tasks: options.tasks.value,
  }))
  const pinnedItems = computed(() => projection.value.pinnedItems)
  const pinnedRows = computed(() => projection.value.pinnedRows)
  const spaceRows = computed(() => projection.value.spaceRows)
  const globalTasks = computed(() => projection.value.globalTasks)

  useIntervalFn(() => {
    relativeTimeNow.value = Date.now()
  }, 60_000, {
    immediateCallback: true,
  })

  watch(
    activeSpaces,
    (spaces) => {
      expandedSpaceIds.value = new Set([
        ...expandedSpaceIds.value,
        ...spaces.map(space => space.id),
      ])
    },
    { immediate: true },
  )

  function isSpaceExpanded(spaceId: string) {
    return expandedSpaceIds.value.has(spaceId)
  }

  function toggleSpace(spaceId: string) {
    const next = new Set(expandedSpaceIds.value)
    if (next.has(spaceId))
      next.delete(spaceId)
    else
      next.add(spaceId)
    expandedSpaceIds.value = next
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

  function pinSpace(spaceId: string) {
    options.onUpdatePinnedItems(prependDesktopTaskPinnedItem(
      pinnedItems.value,
      { id: spaceId, kind: 'space' },
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

  function openSpaceCreator() {
    spaceEditTarget.value = null
    spaceDialogOpen.value = true
  }

  function selectSpaceMenuAction(space: LocalSpace, action: TaskSpaceMenuAction) {
    if (action === 'new-task') {
      options.onNewTask(space.id)
      return
    }
    if (action === 'edit') {
      spaceEditTarget.value = space
      spaceDialogOpen.value = true
      return
    }
    if (action === 'delete')
      spaceDeleteTarget.value = space
  }

  function saveSpace(input: TaskSpaceInput) {
    const space = spaceEditTarget.value
    if (space)
      options.onUpdateSpace({ ...input, spaceId: space.id })
    else
      options.onCreateSpace(input)
    spaceEditTarget.value = null
  }

  function confirmSpaceDelete() {
    const space = spaceDeleteTarget.value
    if (!space || space.activeRunCount > 0)
      return
    options.onDeleteSpace(space.id)
    spaceDeleteTarget.value = null
  }

  return {
    confirmTaskDelete,
    confirmTaskRename,
    confirmSpaceDelete,
    beginPinnedDrag,
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
    pinnedItems,
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
  }
}
