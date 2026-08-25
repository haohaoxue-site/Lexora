import type { DesktopChatPinnedItem } from '@buddy-electron/shared/desktopApi'
import type {
  LocalConversation,
  LocalConversationSummary,
  LocalProject,
} from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import type { DesktopChatPinnedDropPosition } from '@/workbenches/chat/index/chatPinnedItems'
import type { ChatProjectInput } from '@/workbenches/chat/state/useChatProjects'
import { useIntervalFn } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import {
  prependDesktopChatPinnedItem,
  removeDesktopChatPinnedItem,
  reorderDesktopChatPinnedItems,
  resolveChatIndexProjection,
} from '@/workbenches/chat/index/chatPinnedItems'

interface UseChatIndexControllerOptions {
  conversations: Readonly<Ref<ReadonlyArray<LocalConversationSummary>>>
  getUntitledLabel: () => string
  onCreateProject: (input: ChatProjectInput) => void
  onDeleteConversation: (conversationId: string) => void
  onDeleteProject: (projectId: string) => void
  onRenameConversation: (conversationId: string, title: string) => void
  onUpdatePinnedItems: (items: DesktopChatPinnedItem[]) => void
  onUpdateProject: (input: ChatProjectInput & { projectId: string }) => void
  pinnedItems: Readonly<Ref<ReadonlyArray<DesktopChatPinnedItem>>>
  projects: Readonly<Ref<ReadonlyArray<LocalProject>>>
}

interface DesktopChatPinnedDropTarget {
  key: string
  position: DesktopChatPinnedDropPosition
}

export function useChatIndexController(options: UseChatIndexControllerOptions) {
  const expandedProjectIds = shallowRef<ReadonlySet<string>>(new Set())
  const conversationRenameTarget = shallowRef<LocalConversation | null>(null)
  const conversationDeleteTarget = shallowRef<LocalConversation | null>(null)
  const conversationTitleDraft = shallowRef('')
  const pinnedSectionExpanded = shallowRef(true)
  const projectsSectionExpanded = shallowRef(true)
  const tasksSectionExpanded = shallowRef(true)
  const relativeTimeNow = shallowRef(Date.now())
  const projectDialogOpen = shallowRef(false)
  const projectEditTarget = shallowRef<LocalProject | null>(null)
  const projectDeleteTarget = shallowRef<LocalProject | null>(null)
  const draggedPinnedItemKey = shallowRef<string | null>(null)
  const pinnedDropTarget = shallowRef<DesktopChatPinnedDropTarget | null>(null)
  const activeProjects = computed(() => options.projects.value.filter(
    project => project.revokedAt === null,
  ))
  const projection = computed(() => resolveChatIndexProjection({
    conversations: options.conversations.value,
    expandedProjectIds: expandedProjectIds.value,
    pinnedItems: options.pinnedItems.value,
    projects: options.projects.value,
  }))
  const pinnedItems = computed(() => projection.value.pinnedItems)
  const pinnedRows = computed(() => projection.value.pinnedRows)
  const projectRows = computed(() => projection.value.projectRows)
  const taskConversations = computed(() => projection.value.taskConversations)

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

  function getConversationTitle(conversation: LocalConversation) {
    return conversation.title?.trim() || options.getUntitledLabel()
  }

  function requestConversationRename(conversation: LocalConversation) {
    conversationRenameTarget.value = conversation
    conversationTitleDraft.value = getConversationTitle(conversation)
  }

  function requestConversationDelete(conversation: LocalConversation) {
    conversationDeleteTarget.value = conversation
  }

  function confirmConversationRename() {
    const target = conversationRenameTarget.value
    const title = conversationTitleDraft.value.trim()
    if (!target || !title)
      return
    options.onRenameConversation(target.id, title)
    conversationRenameTarget.value = null
  }

  function confirmConversationDelete() {
    if (!conversationDeleteTarget.value)
      return
    options.onDeleteConversation(conversationDeleteTarget.value.id)
    conversationDeleteTarget.value = null
  }

  function pinProject(projectId: string) {
    options.onUpdatePinnedItems(prependDesktopChatPinnedItem(
      pinnedItems.value,
      { id: projectId, kind: 'project' },
    ))
  }

  function pinConversation(conversationId: string) {
    options.onUpdatePinnedItems(prependDesktopChatPinnedItem(
      pinnedItems.value,
      { id: conversationId, kind: 'conversation' },
    ))
  }

  function unpinItem(pinKey: string) {
    options.onUpdatePinnedItems(removeDesktopChatPinnedItem(pinnedItems.value, pinKey))
  }

  function beginPinnedDrag(pinKey: string) {
    draggedPinnedItemKey.value = pinKey
    pinnedDropTarget.value = null
  }

  function enterPinnedDropTarget(pinKey: string, position: DesktopChatPinnedDropPosition) {
    if (draggedPinnedItemKey.value && draggedPinnedItemKey.value !== pinKey)
      pinnedDropTarget.value = { key: pinKey, position }
  }

  function getPinnedDropPosition(pinKey: string | undefined) {
    return pinKey && pinnedDropTarget.value?.key === pinKey
      ? pinnedDropTarget.value.position
      : undefined
  }

  function dropPinnedItem(pinKey: string, position: DesktopChatPinnedDropPosition) {
    if (!draggedPinnedItemKey.value)
      return
    options.onUpdatePinnedItems(reorderDesktopChatPinnedItems(
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

  function selectProjectMenuAction(project: LocalProject, action: string | number) {
    if (action === 'edit') {
      projectEditTarget.value = project
      projectDialogOpen.value = true
      return
    }
    if (action === 'delete')
      projectDeleteTarget.value = project
  }

  function saveProject(input: ChatProjectInput) {
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
    confirmConversationDelete,
    confirmConversationRename,
    confirmProjectDelete,
    conversationDeleteTarget,
    conversationRenameTarget,
    conversationTitleDraft,
    beginPinnedDrag,
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
    pinnedItems,
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
  }
}
