import type {
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
} from '@buddy-electron/shared/localChatApi'
import type {
  ChatAgentTurn,
  ChatRecoveryNotice,
  StreamingAssistantMessage,
} from './chatStreamingMessage'
import { isVisibleChatMessage } from './chatMessageContent'
import {
  projectChatAgentTurns,
  projectChatRecoveryNotices,
  projectStreamingAssistantMessage,
} from './chatStreamingMessage'

export interface ChatTranscriptMessageRow {
  key: string
  kind: 'message'
  message: LocalMessage
}

export interface ChatTranscriptCompactionRow {
  compaction: Extract<LocalConversationTimelineItem, { kind: 'compaction' }>
  key: string
  kind: 'compaction'
}

export interface ChatTranscriptAgentTurnRow {
  key: string
  kind: 'agent-turn'
  turn: ChatAgentTurn
}

export interface ChatTranscriptActivityRow {
  key: string
  kind: 'activity'
  turn: ChatAgentTurn
}

export interface ChatTranscriptRecoveryNoticeRow {
  key: string
  kind: 'recovery-notice'
  notice: ChatRecoveryNotice
}

export interface ChatTranscriptStreamingRow {
  key: string
  kind: 'streaming'
  message: StreamingAssistantMessage
}

export type ChatTranscriptRow
  = | ChatTranscriptActivityRow
    | ChatTranscriptAgentTurnRow
    | ChatTranscriptCompactionRow
    | ChatTranscriptMessageRow
    | ChatTranscriptRecoveryNoticeRow
    | ChatTranscriptStreamingRow

export interface ChatTranscriptProjection {
  hasActiveProcessIdentity: boolean
  processIdentityMessageIds: ReadonlySet<string>
  processIdentityRunIds: ReadonlySet<string>
  rows: ReadonlyArray<ChatTranscriptRow>
}

export function projectChatTranscript(input: {
  runEvents: ReadonlyArray<LocalRunEvent>
  runs: ReadonlyArray<LocalRun>
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>
}): ChatTranscriptProjection {
  const messages = input.timelineItems.filter(
    (item): item is Extract<LocalConversationTimelineItem, { kind: 'message' }> =>
      item.kind === 'message',
  )
  const agentTurns = projectChatAgentTurns(input.runEvents, input.runs)
  const recoveryNotices = projectChatRecoveryNotices(
    input.timelineItems,
    input.runEvents,
    input.runs,
  )
  const streamingMessage = projectStreamingAssistantMessage(
    messages,
    input.runEvents,
    input.runs,
  )
  const triggeringMessageIdByRunId = new Map(
    input.runs.map(run => [run.id, run.triggeringMessageId]),
  )
  const noticesByMessageId = new Map<string, ChatTranscriptRecoveryNoticeRow[]>()
  const noticesByRunId = new Map<string, ChatTranscriptRecoveryNoticeRow[]>()
  for (const notice of recoveryNotices) {
    const messageId = triggeringMessageIdByRunId.get(notice.runId)
    if (!messageId)
      continue
    const row: ChatTranscriptRecoveryNoticeRow = {
      key: `recovery-notice:${notice.runId}:${notice.sequence}`,
      kind: 'recovery-notice',
      notice,
    }
    const messageRows = noticesByMessageId.get(messageId) ?? []
    messageRows.push(row)
    noticesByMessageId.set(messageId, messageRows)
    const runRows = noticesByRunId.get(notice.runId) ?? []
    runRows.push(row)
    noticesByRunId.set(notice.runId, runRows)
  }

  const agentTurnRunIds = new Set(agentTurns.map(turn => turn.runId))
  const rows: ChatTranscriptRow[] = []
  for (const row of projectPersistedChatTranscriptRows(input.timelineItems, agentTurns)) {
    rows.push(row)
    if (row.kind === 'agent-turn') {
      rows.push(...(noticesByRunId.get(row.turn.runId) ?? []))
      continue
    }
    if (row.kind === 'message') {
      rows.push(...(noticesByMessageId.get(row.message.id) ?? []).filter(
        notice => !agentTurnRunIds.has(notice.notice.runId),
      ))
    }
  }
  const activeAgentTurn = [...rows].reverse().find(
    (row): row is ChatTranscriptAgentTurnRow => row.kind === 'agent-turn'
      && (row.turn.status === 'queued' || row.turn.status === 'running'),
  )?.turn
  if (streamingMessage) {
    rows.push({
      key: `streaming:${streamingMessage.id}`,
      kind: 'streaming',
      message: streamingMessage,
    })
  }
  if (activeAgentTurn) {
    rows.push({
      key: `activity:${activeAgentTurn.runId}`,
      kind: 'activity',
      turn: activeAgentTurn,
    })
  }

  const processIdentityMessageIds = new Set(rows.flatMap(row => (
    row.kind === 'agent-turn' && row.turn.finalMessageId
      ? [row.turn.finalMessageId]
      : []
  )))
  const processIdentityRunIds = new Set(rows.flatMap(row => (
    row.kind === 'agent-turn' ? [row.turn.runId] : []
  )))

  return {
    hasActiveProcessIdentity: activeAgentTurn !== undefined,
    processIdentityMessageIds,
    processIdentityRunIds,
    rows,
  }
}

export function shouldShowAssistantIdentity(
  message: LocalMessage,
  projection: ChatTranscriptProjection,
): boolean {
  if (message.role !== 'assistant')
    return false
  return !projection.processIdentityMessageIds.has(message.id)
    && (!message.runId || !projection.processIdentityRunIds.has(message.runId))
}

export function projectPersistedChatTranscriptRows(
  items: ReadonlyArray<LocalConversationTimelineItem>,
  turns: ReadonlyArray<ChatAgentTurn>,
): Array<
  ChatTranscriptAgentTurnRow
  | ChatTranscriptCompactionRow
  | ChatTranscriptMessageRow
> {
  const rows: Array<
    ChatTranscriptAgentTurnRow
    | ChatTranscriptCompactionRow
    | ChatTranscriptMessageRow
  > = []
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

  for (const item of items) {
    if (item.kind === 'compaction') {
      rows.push({
        compaction: item,
        key: `compaction:${item.id}`,
        kind: 'compaction',
      })
      continue
    }
    if (!isVisibleChatMessage(item) || processMessageIds.has(item.id))
      continue
    rows.push({ key: `message:${item.id}`, kind: 'message', message: item })
    rows.push(...(turnsByTrigger.get(item.id) ?? []).map(turn => ({
      key: `agent-turn:${turn.runId}`,
      kind: 'agent-turn' as const,
      turn,
    })))
  }
  return rows
}

function shouldShowAgentTurn(turn: ChatAgentTurn): boolean {
  return turn.nodes.length > 0
    || turn.status === 'queued'
    || turn.status === 'running'
    || turn.status === 'failed'
    || turn.status === 'cancelled'
}
