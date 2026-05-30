import type {
  AgentChatContextMessage,
  AgentChatContextSnapshot,
} from '@haohaoxue/samepage-contracts'

export interface ApplyChatReplyContextSnapshotsOptions {
  triggerUserMessageId: string | null | undefined
  contextSnapshots: AgentChatContextSnapshot[] | null | undefined
}

export function applyChatReplyContextSnapshotsToMessages(
  messages: AgentChatContextMessage[],
  options: ApplyChatReplyContextSnapshotsOptions,
): AgentChatContextMessage[] {
  if (!options.triggerUserMessageId || !options.contextSnapshots?.length) {
    return messages
  }

  const snapshots = [...options.contextSnapshots]
    .filter(snapshot => snapshot.content.length > 0)
    .sort((first, second) => first.order - second.order || first.id.localeCompare(second.id))

  if (snapshots.length === 0) {
    return messages
  }

  let applied = false
  const contextText = formatChatReplyContextSnapshots(snapshots)
  const nextMessages = messages.map((message) => {
    if (message.id !== options.triggerUserMessageId || message.role !== 'user') {
      return message
    }

    applied = true
    return {
      ...message,
      content: `${contextText}\n\n[用户正文]\n${message.content}`,
    }
  })

  return applied ? nextMessages : messages
}

function formatChatReplyContextSnapshots(snapshots: AgentChatContextSnapshot[]): string {
  return [
    '[SamePage 上下文开始]',
    ...snapshots.flatMap((snapshot, index) => formatChatReplyContextSnapshot(snapshot, index)),
    '[SamePage 上下文结束]',
  ].join('\n')
}

function formatChatReplyContextSnapshot(snapshot: AgentChatContextSnapshot, index: number): string[] {
  return [
    `[${index + 1}] ${snapshot.type}: ${snapshot.title}`,
    `documentId: ${snapshot.documentId}`,
    `scope: ${snapshot.scope.kind}`,
    `sourceAttachmentIds: ${snapshot.sourceAttachmentIds.join(', ')}`,
    '内容:',
    snapshot.content,
  ]
}
