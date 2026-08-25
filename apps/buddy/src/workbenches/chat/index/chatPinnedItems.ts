import type { DesktopChatPinnedItem } from '@buddy-electron/shared/desktopApi'
import type { LocalConversationSummary, LocalProject } from '@buddy-electron/shared/localChatApi'

export type ChatIndexRow
  = | {
    key: string
    kind: 'project'
    pinKey?: string
    pinnedTopLevel?: boolean
    project: LocalProject
  }
  | {
    conversation: LocalConversationSummary
    key: string
    kind: 'conversation'
    pinKey?: string
    pinnedTopLevel?: boolean
    projectConversation?: boolean
  }

export interface ChatIndexProjection {
  pinnedItems: DesktopChatPinnedItem[]
  pinnedRows: ChatIndexRow[]
  projectRows: ChatIndexRow[]
  taskConversations: LocalConversationSummary[]
}

export type DesktopChatPinnedDropPosition = 'after' | 'before'

export function resolveChatIndexProjection(input: {
  conversations: ReadonlyArray<LocalConversationSummary>
  expandedProjectIds: ReadonlySet<string>
  pinnedItems: ReadonlyArray<DesktopChatPinnedItem>
  projects: ReadonlyArray<LocalProject>
}): ChatIndexProjection {
  const activeProjects = input.projects.filter(project => project.revokedAt === null)
  const projectsById = new Map(activeProjects.map(project => [project.id, project]))
  const globalConversations = input.conversations.filter(conversation => conversation.projectId === null)
  const globalConversationsById = new Map(globalConversations.map(conversation => [conversation.id, conversation]))
  const conversationsByProject = new Map<string, LocalConversationSummary[]>()

  for (const conversation of input.conversations) {
    if (!conversation.projectId)
      continue
    const conversations = conversationsByProject.get(conversation.projectId) ?? []
    conversations.push(conversation)
    conversationsByProject.set(conversation.projectId, conversations)
  }

  const pinnedItems = resolveVisiblePinnedItems({
    conversationsById: globalConversationsById,
    items: input.pinnedItems,
    projectsById,
  })
  const pinnedProjectIds = new Set(pinnedItems
    .filter(item => item.kind === 'project')
    .map(item => item.id))
  const pinnedConversationIds = new Set(pinnedItems
    .filter(item => item.kind === 'conversation')
    .map(item => item.id))

  return {
    pinnedItems,
    pinnedRows: pinnedItems.flatMap((item) => {
      const pinKey = getDesktopChatPinnedItemKey(item)
      if (item.kind === 'conversation') {
        return [{
          conversation: globalConversationsById.get(item.id)!,
          key: `pinned:${pinKey}`,
          kind: 'conversation' as const,
          pinKey,
          pinnedTopLevel: true,
        }]
      }

      const project = projectsById.get(item.id)!
      const rows: ChatIndexRow[] = [{
        key: `pinned:${pinKey}`,
        kind: 'project',
        pinKey,
        pinnedTopLevel: true,
        project,
      }]
      if (!input.expandedProjectIds.has(project.id))
        return rows
      return rows.concat((conversationsByProject.get(project.id) ?? []).map(conversation => ({
        conversation,
        key: `pinned:${pinKey}:conversation:${conversation.id}`,
        kind: 'conversation' as const,
        pinKey,
        projectConversation: true,
      })))
    }),
    projectRows: activeProjects
      .filter(project => !pinnedProjectIds.has(project.id))
      .flatMap(project => createProjectRows(
        project,
        conversationsByProject.get(project.id) ?? [],
        input.expandedProjectIds.has(project.id),
      )),
    taskConversations: globalConversations.filter(conversation => !pinnedConversationIds.has(conversation.id)),
  }
}

export function prependDesktopChatPinnedItem(
  items: ReadonlyArray<DesktopChatPinnedItem>,
  item: DesktopChatPinnedItem,
): DesktopChatPinnedItem[] {
  const key = getDesktopChatPinnedItemKey(item)
  return items.some(candidate => getDesktopChatPinnedItemKey(candidate) === key)
    ? [...items]
    : [item, ...items]
}

export function removeDesktopChatPinnedItem(
  items: ReadonlyArray<DesktopChatPinnedItem>,
  key: string,
): DesktopChatPinnedItem[] {
  return items.filter(item => getDesktopChatPinnedItemKey(item) !== key)
}

export function reorderDesktopChatPinnedItems(
  items: ReadonlyArray<DesktopChatPinnedItem>,
  sourceKey: string,
  targetKey: string,
  position: DesktopChatPinnedDropPosition,
): DesktopChatPinnedItem[] {
  const sourceIndex = items.findIndex(item => getDesktopChatPinnedItemKey(item) === sourceKey)
  const targetIndex = items.findIndex(item => getDesktopChatPinnedItemKey(item) === targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
    return [...items]

  const next = [...items]
  const [source] = next.splice(sourceIndex, 1)
  const nextTargetIndex = next.findIndex(item => getDesktopChatPinnedItemKey(item) === targetKey)
  if (nextTargetIndex < 0)
    return [...items]
  next.splice(position === 'after' ? nextTargetIndex + 1 : nextTargetIndex, 0, source)
  return next
}

export function getDesktopChatPinnedItemKey(item: DesktopChatPinnedItem): string {
  return `${item.kind}:${item.id}`
}

function createProjectRows(
  project: LocalProject,
  conversations: ReadonlyArray<LocalConversationSummary>,
  expanded: boolean,
): ChatIndexRow[] {
  const rows: ChatIndexRow[] = [{
    key: `project:${project.id}`,
    kind: 'project',
    project,
  }]
  if (!expanded)
    return rows
  return rows.concat(conversations.map(conversation => ({
    conversation,
    key: `project:${project.id}:conversation:${conversation.id}`,
    kind: 'conversation' as const,
    projectConversation: true,
  })))
}

function resolveVisiblePinnedItems(input: {
  conversationsById: ReadonlyMap<string, LocalConversationSummary>
  items: ReadonlyArray<DesktopChatPinnedItem>
  projectsById: ReadonlyMap<string, LocalProject>
}): DesktopChatPinnedItem[] {
  const keys = new Set<string>()
  return input.items.filter((item) => {
    const key = getDesktopChatPinnedItemKey(item)
    if (keys.has(key))
      return false
    const exists = item.kind === 'project'
      ? input.projectsById.has(item.id)
      : input.conversationsById.has(item.id)
    if (exists)
      keys.add(key)
    return exists
  })
}
