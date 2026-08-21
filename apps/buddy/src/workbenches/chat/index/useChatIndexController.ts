import type {
  DesktopChatSidebarSection,
  DesktopChatSidebarSectionOrder,
} from '@buddy-electron/shared/desktopApi'
import type {
  LocalConversation,
  LocalConversationSummary,
  LocalProject,
} from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import type { ChatProjectInput } from '@/workbenches/chat/state/useChatProjects'
import { useIntervalFn } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'

export type ChatIndexRow
  = | { key: string, kind: 'project', project: LocalProject }
    | { conversation: LocalConversationSummary, key: string, kind: 'conversation' }

interface UseChatIndexControllerOptions {
  conversations: Readonly<Ref<ReadonlyArray<LocalConversationSummary>>>
  getUntitledLabel: () => string
  onCreateProject: (input: ChatProjectInput) => void
  onDeleteConversation: (conversationId: string) => void
  onDeleteProject: (projectId: string) => void
  onRenameConversation: (conversationId: string, title: string) => void
  onReorderSections: (order: DesktopChatSidebarSectionOrder) => void
  onUpdateProject: (input: ChatProjectInput & { projectId: string }) => void
  projects: Readonly<Ref<ReadonlyArray<LocalProject>>>
  sectionOrder: Readonly<Ref<ReadonlyArray<DesktopChatSidebarSection>>>
}

export function useChatIndexController(options: UseChatIndexControllerOptions) {
  const expandedProjectIds = shallowRef<ReadonlySet<string>>(new Set())
  const conversationRenameTarget = shallowRef<LocalConversation | null>(null)
  const conversationDeleteTarget = shallowRef<LocalConversation | null>(null)
  const conversationTitleDraft = shallowRef('')
  const recentSectionExpanded = shallowRef(true)
  const projectsSectionExpanded = shallowRef(true)
  const relativeTimeNow = shallowRef(Date.now())
  const projectDialogOpen = shallowRef(false)
  const projectEditTarget = shallowRef<LocalProject | null>(null)
  const projectDeleteTarget = shallowRef<LocalProject | null>(null)
  const activeProjects = computed(() => options.projects.value.filter(
    project => project.revokedAt === null,
  ))
  const globalConversations = computed(() => options.conversations.value.filter(
    conversation => conversation.projectId === null,
  ))
  const projectRows = computed<ChatIndexRow[]>(() => {
    const conversationsByProject = new Map<string, LocalConversationSummary[]>()
    for (const conversation of options.conversations.value) {
      if (!conversation.projectId)
        continue
      const conversations = conversationsByProject.get(conversation.projectId) ?? []
      conversations.push(conversation)
      conversationsByProject.set(conversation.projectId, conversations)
    }

    return activeProjects.value.flatMap((project) => {
      const rows: ChatIndexRow[] = [{
        key: `project:${project.id}`,
        kind: 'project',
        project,
      }]
      if (!isProjectExpanded(project.id))
        return rows
      return rows.concat((conversationsByProject.get(project.id) ?? []).map(conversation => ({
        conversation,
        key: `conversation:${conversation.id}`,
        kind: 'conversation' as const,
      })))
    })
  })

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

  function moveSection(section: DesktopChatSidebarSection, direction: 'up' | 'down') {
    const currentIndex = options.sectionOrder.value.indexOf(section)
    const nextIndex = currentIndex + (direction === 'up' ? -1 : 1)
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= options.sectionOrder.value.length)
      return
    const next = [...options.sectionOrder.value]
    ;[next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]]
    options.onReorderSections(next)
  }

  function getSectionIndex(section: DesktopChatSidebarSection) {
    return options.sectionOrder.value.indexOf(section)
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
  }
}
