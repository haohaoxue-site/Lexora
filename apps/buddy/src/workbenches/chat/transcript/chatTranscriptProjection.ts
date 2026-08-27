import type {
  LocalArtifact,
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
  LocalRunOutput,
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
  isAgentTurnResult: boolean
  key: string
  kind: 'message'
  message: LocalMessage
  turnOutputs: ChatTranscriptTurnOutputs | null
}

export interface ChatTranscriptTurnOutputs {
  artifacts: ReadonlyArray<LocalArtifact>
  runId: string
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
  rows: ReadonlyArray<ChatTranscriptRow>
}

export function projectChatTranscript(input: {
  outputs: ReadonlyArray<LocalRunOutput>
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
  for (const row of projectPersistedChatTranscriptRows(
    input.timelineItems,
    agentTurns,
    input.outputs,
  )) {
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

  return {
    hasActiveProcessIdentity: activeAgentTurn !== undefined,
    rows,
  }
}

export function projectPersistedChatTranscriptRows(
  items: ReadonlyArray<LocalConversationTimelineItem>,
  turns: ReadonlyArray<ChatAgentTurn>,
  outputs: ReadonlyArray<LocalRunOutput> = [],
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
  const turnsByRunId = new Map(turns.map(turn => [turn.runId, turn]))
  const visibleTurnsByRunId = new Map(
    turns.filter(shouldShowAgentTurn).map(turn => [turn.runId, turn]),
  )
  const outputsByRunId = projectTurnOutputs(outputs)
  const processMessageIds = new Set<string>()
  for (const turn of turns) {
    for (const node of turn.nodes) {
      if (node.kind === 'text' && node.messageId !== turn.finalMessageId)
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
    if (processMessageIds.has(item.id))
      continue
    const isAgentTurnResult = isFinalTurnMessage(item, visibleTurnsByRunId)
    const turnOutputs = isFinalTurnMessage(item, turnsByRunId) && item.runId
      ? outputsByRunId.get(item.runId) ?? null
      : null
    if (!isVisibleChatMessage(item) && turnOutputs === null)
      continue
    rows.push({
      isAgentTurnResult,
      key: `message:${item.id}`,
      kind: 'message',
      message: item,
      turnOutputs,
    })
    rows.push(...(turnsByTrigger.get(item.id) ?? []).map(turn => ({
      key: `agent-turn:${turn.runId}`,
      kind: 'agent-turn' as const,
      turn,
    })))
  }
  return rows
}

function isFinalTurnMessage(
  message: LocalMessage,
  turnsByRunId: ReadonlyMap<string, ChatAgentTurn>,
): boolean {
  if (message.role !== 'assistant' || !message.runId)
    return false
  const turn = turnsByRunId.get(message.runId)
  if (!turn)
    return false
  return turn.finalMessageId === message.id
}

function projectTurnOutputs(
  outputs: ReadonlyArray<LocalRunOutput>,
): ReadonlyMap<string, ChatTranscriptTurnOutputs> {
  const artifactsByRunId = new Map<string, LocalArtifact[]>()
  const artifactIdsByRunId = new Map<string, Set<string>>()
  for (const output of outputs) {
    const artifacts = artifactsByRunId.get(output.runId) ?? []
    const artifactIds = artifactIdsByRunId.get(output.runId) ?? new Set<string>()
    for (const artifact of output.artifacts) {
      if (artifactIds.has(artifact.artifactId))
        continue
      artifactIds.add(artifact.artifactId)
      artifacts.push(artifact)
    }
    artifactsByRunId.set(output.runId, artifacts)
    artifactIdsByRunId.set(output.runId, artifactIds)
  }
  return new Map([...artifactsByRunId].map(([runId, artifacts]) => [
    runId,
    { artifacts, runId },
  ]))
}

function shouldShowAgentTurn(turn: ChatAgentTurn): boolean {
  return turn.nodes.length > 0
    || turn.status === 'queued'
    || turn.status === 'running'
    || turn.status === 'failed'
    || turn.status === 'cancelled'
}
