import type {
  LocalConversationBranch,
  LocalMessage,
} from '@buddy-electron/shared/localChatApi'
import type { ChatTranscriptRow } from './chatTranscriptProjection'

export interface ChatMessageBranchNavigator {
  activeBranchId: string
  count: number
  index: number
  nextBranchId: string | null
  previousBranchId: string | null
}

interface BranchGroup {
  baseBranchId: string | null
  branchIds: string[]
  forkedFromMessageId: string | null
}

export function projectChatMessageBranchNavigators(
  rows: ReadonlyArray<ChatTranscriptRow>,
  branches: ReadonlyArray<LocalConversationBranch>,
  activeBranchId: string,
): ReadonlyMap<string, ChatMessageBranchNavigator> {
  const branchById = new Map(branches.map(branch => [branch.id, branch]))
  const activePath = collectActiveBranchPath(activeBranchId, branchById)
  if (!activePath.length)
    return new Map()

  const messages = rows.flatMap(row => row.kind === 'message' ? [row.message] : [])
  const activePathIds = new Set(activePath.map(branch => branch.id))
  const navigators = new Map<string, ChatMessageBranchNavigator>()

  for (const group of collectBranchGroups(branches, messages)) {
    if (group.branchIds.length < 2)
      continue
    const activeGroupBranchId = resolveActiveGroupBranchId(group, activePath, activePathIds)
    if (!activeGroupBranchId)
      continue
    const messageId = resolveNavigatorMessageId(group, activeGroupBranchId, messages)
    if (!messageId)
      continue
    const index = group.branchIds.indexOf(activeGroupBranchId)
    if (index < 0)
      continue
    navigators.set(messageId, {
      activeBranchId: activeGroupBranchId,
      count: group.branchIds.length,
      index: index + 1,
      nextBranchId: group.branchIds[index + 1] ?? null,
      previousBranchId: group.branchIds[index - 1] ?? null,
    })
  }

  return navigators
}

function collectActiveBranchPath(
  activeBranchId: string,
  branchById: ReadonlyMap<string, LocalConversationBranch>,
): LocalConversationBranch[] {
  const path: LocalConversationBranch[] = []
  const visited = new Set<string>()
  let branch = branchById.get(activeBranchId)
  while (branch && !visited.has(branch.id)) {
    visited.add(branch.id)
    path.unshift(branch)
    branch = branch.parentBranchId ? branchById.get(branch.parentBranchId) : undefined
  }
  return path
}

function collectBranchGroups(
  branches: ReadonlyArray<LocalConversationBranch>,
  messages: ReadonlyArray<LocalMessage>,
): BranchGroup[] {
  const ordered = [...branches].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  )
  const rootBranches = ordered.filter(branch =>
    branch.parentBranchId === null && branch.forkedFromMessageId === null,
  )
  const groups = new Map<string, BranchGroup>()
  if (rootBranches.length) {
    groups.set('root', {
      baseBranchId: null,
      branchIds: rootBranches.map(branch => branch.id),
      forkedFromMessageId: null,
    })
  }

  const messageBranchById = new Map(messages.map(message => [message.id, message.branchId]))
  for (const branch of ordered) {
    if (!branch.parentBranchId || !branch.forkedFromMessageId)
      continue
    const key = branch.forkedFromMessageId
    const group = groups.get(key) ?? {
      baseBranchId: messageBranchById.get(branch.forkedFromMessageId)
        ?? branch.parentBranchId,
      branchIds: [messageBranchById.get(branch.forkedFromMessageId)
        ?? branch.parentBranchId],
      forkedFromMessageId: branch.forkedFromMessageId,
    }
    if (!group.branchIds.includes(branch.id))
      group.branchIds.push(branch.id)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function resolveActiveGroupBranchId(
  group: BranchGroup,
  activePath: ReadonlyArray<LocalConversationBranch>,
  activePathIds: ReadonlySet<string>,
): string | null {
  if (![...group.branchIds].some(branchId => activePathIds.has(branchId)))
    return null
  return activePath.findLast(branch => group.branchIds.includes(branch.id))?.id ?? null
}

function resolveNavigatorMessageId(
  group: BranchGroup,
  activeGroupBranchId: string,
  messages: ReadonlyArray<LocalMessage>,
): string | null {
  if (group.baseBranchId === null)
    return messages.find(message => message.branchId === activeGroupBranchId)?.id ?? null
  if (activeGroupBranchId !== group.baseBranchId)
    return messages.find(message => message.branchId === activeGroupBranchId)?.id ?? null
  const forkIndex = messages.findIndex(message => message.id === group.forkedFromMessageId)
  return forkIndex >= 0 ? messages[forkIndex + 1]?.id ?? null : null
}
