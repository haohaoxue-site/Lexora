import type { LocalConversationTimelineItem, LocalMessage } from '../../electron/shared/localChatApi'
import type { ChatAgentTurn } from './chatStreamingMessage'
import { isVisibleChatMessage } from './chatMessageContent'

export interface ChatTimelineMessageRow {
  key: string
  kind: 'message'
  message: LocalMessage
}

export interface ChatTimelineCompactionRow {
  compaction: Extract<LocalConversationTimelineItem, { kind: 'compaction' }>
  key: string
  kind: 'compaction'
}

export interface ChatTimelineAgentTurnRow {
  key: string
  kind: 'agent-turn'
  turn: ChatAgentTurn
}

export type ChatTimelineRow
  = | ChatTimelineCompactionRow
    | ChatTimelineMessageRow
    | ChatTimelineAgentTurnRow

export function projectChatTimelineRows(
  items: ReadonlyArray<LocalConversationTimelineItem>,
  turns: ReadonlyArray<ChatAgentTurn>,
): ChatTimelineRow[] {
  const turnsByTrigger = new Map<string, ChatAgentTurn[]>()
  const processMessageIds = new Set<string>()
  for (const turn of turns) {
    for (const node of turn.nodes) {
      if (node.kind === 'text')
        processMessageIds.add(node.messageId)
    }
    if (!shouldShowAgentTurn(turn))
      continue
    const candidates = turnsByTrigger.get(turn.triggeringMessageId) ?? []
    candidates.push(turn)
    turnsByTrigger.set(turn.triggeringMessageId, candidates)
  }

  return items.flatMap((item): ChatTimelineRow[] => {
    if (item.kind === 'compaction') {
      return [{
        compaction: item,
        key: `compaction:${item.id}`,
        kind: 'compaction',
      }]
    }
    if (!isVisibleChatMessage(item) || processMessageIds.has(item.id))
      return []
    return [
      { key: `message:${item.id}`, kind: 'message', message: item },
      ...(turnsByTrigger.get(item.id) ?? []).map(turn => ({
        key: `agent-turn:${turn.runId}`,
        kind: 'agent-turn' as const,
        turn,
      })),
    ]
  })
}

function shouldShowAgentTurn(turn: ChatAgentTurn): boolean {
  return turn.nodes.length > 0
    || turn.status === 'queued'
    || turn.status === 'running'
    || turn.status === 'failed'
    || turn.status === 'cancelled'
}
