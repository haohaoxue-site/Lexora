import type {
  LocalArtifact,
  LocalChangeSetSummary,
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
  LocalRunOutput,
} from '@buddy-electron/shared/localChatApi'
import type {
  ChatAgentTurn,
  ChatRecoveryNotice,
} from './chatStreamingMessage'
import { projectConversationCompactionState } from './chatConversationTimeline'
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
  streaming?: true
  turnChanges?: LocalChangeSetSummary
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
  ownsResultActions?: true
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

export type ChatTranscriptRow
  = | ChatTranscriptActivityRow
    | ChatTranscriptAgentTurnRow
    | ChatTranscriptCompactionRow
    | ChatTranscriptMessageRow
    | ChatTranscriptRecoveryNoticeRow

export interface ChatTranscriptProjection {
  rows: ReadonlyArray<ChatTranscriptRow>
}

export function projectChatTranscript(input: {
  changeSets?: ReadonlyArray<LocalChangeSetSummary>
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
  const streamingLocalMessage = streamingMessage
    ? projectStreamingLocalMessage(
        streamingMessage.id,
        streamingMessage.text,
        input.runEvents,
        input.runs,
      )
    : null
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
    input.changeSets ?? [],
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
  if (streamingLocalMessage) {
    rows.push({
      isAgentTurnResult: agentTurnRunIds.has(streamingLocalMessage.runId ?? ''),
      key: `message:${streamingLocalMessage.id}`,
      kind: 'message',
      message: streamingLocalMessage,
      streaming: true,
      turnOutputs: null,
    })
  }
  if (activeAgentTurn) {
    rows.push({
      key: `activity:${activeAgentTurn.runId}`,
      kind: 'activity',
      turn: activeAgentTurn,
    })
  }

  return { rows }
}

function projectStreamingLocalMessage(
  messageId: string,
  text: string,
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): LocalMessage | null {
  const sourceEvent = [...events].reverse().find(event => (
    readMessageId(event.payload) === messageId
  ))
  if (!sourceEvent)
    return null
  const run = runs.find(item => item.id === sourceEvent.runId)
  if (!run)
    return null
  const startedAt = events.find(event => (
    event.runId === run.id
    && event.type === 'message.started'
    && readMessageId(event.payload) === messageId
  ))?.createdAt ?? sourceEvent.createdAt
  return {
    attachments: [],
    branchId: run.branchId,
    content: { text },
    conversationId: run.conversationId,
    createdAt: startedAt,
    id: messageId,
    role: 'assistant',
    runId: run.id,
  }
}

function readMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return null
  const messageId = (payload as Record<string, unknown>).messageId
  return typeof messageId === 'string' ? messageId : null
}

export function projectPersistedChatTranscriptRows(
  items: ReadonlyArray<LocalConversationTimelineItem>,
  turns: ReadonlyArray<ChatAgentTurn>,
  outputs: ReadonlyArray<LocalRunOutput> = [],
  changeSets: ReadonlyArray<LocalChangeSetSummary> = [],
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
  const changesByRunId = new Map(changeSets
    .filter(changeSet => changeSet.fileCount > 0)
    .map(changeSet => [changeSet.runId, changeSet]))
  const renderedResultRunIds = new Set(items.flatMap((item) => {
    if (
      item.kind !== 'message'
      || !item.runId
      || !isFinalTurnMessage(item, turnsByRunId)
      || (
        !isVisibleChatMessage(item)
        && !outputsByRunId.has(item.runId)
        && !changesByRunId.has(item.runId)
      )
    ) {
      return []
    }
    return [item.runId]
  }))
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
      if (projectConversationCompactionState(item.status, item.errorCode) === 'not_needed')
        continue
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
    const turnChanges = isFinalTurnMessage(item, turnsByRunId) && item.runId
      ? changesByRunId.get(item.runId) ?? null
      : null
    if (!isVisibleChatMessage(item) && turnOutputs === null && turnChanges === null)
      continue
    const row: ChatTranscriptMessageRow = {
      isAgentTurnResult,
      key: `message:${item.id}`,
      kind: 'message',
      message: item,
      turnOutputs,
    }
    if (turnChanges)
      row.turnChanges = turnChanges
    rows.push(row)
    rows.push(...(turnsByTrigger.get(item.id) ?? []).map((turn) => {
      const ownsResultActions = (
        turn.status === 'failed'
        || turn.status === 'cancelled'
      ) && !renderedResultRunIds.has(turn.runId)
      return {
        ...(ownsResultActions ? { ownsResultActions: true as const } : {}),
        key: `agent-turn:${turn.runId}`,
        kind: 'agent-turn' as const,
        turn,
      }
    }))
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
      if (artifactIds.has(artifact.artifactId)) {
        artifacts[artifacts.findIndex(item => item.artifactId === artifact.artifactId)] = artifact
      }
      else {
        artifactIds.add(artifact.artifactId)
        artifacts.push(artifact)
      }
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
